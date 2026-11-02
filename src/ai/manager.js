import { all, get } from '../db.js';
import { getSettings } from '../settings.js';
import { runJson, aiEnabled, obj, str, arr } from './claude.js';
import { managerSystem, leadContext } from './playbook.js';

const history = (leadId) => ({
  messages: all(`SELECT direction, channel, body, created_at FROM messages WHERE lead_id = :leadId ORDER BY id DESC LIMIT 12`, { leadId }),
  tasks: all(`SELECT title, outcome, done FROM tasks WHERE lead_id = :leadId AND kind = 'call' ORDER BY id DESC LIMIT 6`, { leadId }),
});

/** Runs the AI path, falling back to rules on any failure. Returns [result, source]. */
async function withFallback(aiFn, ruleFn) {
  if (aiEnabled()) {
    try { return [await aiFn(), 'ai']; } catch (e) { return [ruleFn(), `fallback (${e.message})`]; }
  }
  return [ruleFn(), 'rules'];
}

// ------------------------------------------------------------- write messages

const MESSAGE_SCHEMA = obj({
  subject: str('email subject'),
  email_body: str('plain-text email body. No greeting line (we add "Hi <name>,") and no signature (we add it)'),
  whatsapp_text: str('WhatsApp message, max ~60 words, no markdown, no greeting (we prefix "Hi <name>,")'),
});

/**
 * Writes a personalised outreach message. `goal` describes the purpose
 * (e.g. "follow-up 1 after the intro", or a marketing touch theme).
 * Returns { subject, email_body, whatsapp_text } or null when AI is off (callers use templates).
 */
export async function composeMessage(lead, goal, { links = {} } = {}) {
  if (!aiEnabled()) return null;
  const s = getSettings();
  try {
    const m = await runJson({
      purpose: 'compose', leadId: lead.id, effort: s.ai.effort_writing, schema: MESSAGE_SCHEMA,
      system: managerSystem('write the next outreach message to a lead'),
      prompt: `Write the next message for this lead. Goal: ${goal}

${leadContext(lead, history(lead.id))}

Links you can use (insert the placeholder text exactly, at most one link per message): ${Object.keys(links).map((k) => `{{${k}}}`).join(', ') || 'none'}.
Do not repeat earlier messages. Be specific to this business. Give one clear, low-friction next step.`,
    });
    const fill = (t) => String(t || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => links[k] ?? '');
    return { subject: fill(m.subject), email_body: fill(m.email_body), whatsapp_text: fill(m.whatsapp_text) };
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- read replies

const REPLY_SCHEMA = obj({
  intent: { type: 'string', enum: ['accept_proposal', 'interested', 'meeting_request', 'question', 'objection_price', 'objection_timing', 'objection_trust', 'not_interested', 'stop', 'other'] },
  summary: str('one line: what the lead said'),
  suggested_reply: str('reply we should send, short, in the channel style, no greeting line and no signature (we add both); empty if no reply is needed'),
  call_talking_points: arr(str()),
});

export function classifyReplyRules(text, stage = null) {
  const t = String(text || '').toLowerCase();
  if (stage === 'proposal_sent' && !t.includes('?') && !/\b(not|no|don'?t|cannot|can'?t)\b/.test(t)
    && /\b(yes|go ahead|accept(ed)?|confirm(ed)?|approved?|let'?s (do|start|go)|proceed|deal|ok go)\b/.test(t)) return 'accept_proposal';
  if (/\b(stop|unsubscribe|opt[\s-]?out|remove me|don'?t (contact|message))\b/.test(t)) return 'stop';
  if (/\b(not interested|no thanks|no thank you|not now|not required|no need)\b/.test(t)) return 'not_interested';
  if (/\b(call|meet|meeting|appointment|schedule)\b/.test(t)) return 'meeting_request';
  if (/\b(price|pricing|cost|quote|charges|rate|expensive|budget)\b/.test(t)) return 'objection_price';
  if (/\?/.test(t)) return 'question';
  if (/\b(yes|interested|sure|ok|okay|go ahead|details|tell me more|demo)\b/.test(t)) return 'interested';
  return 'other';
}

export async function analyzeReply(lead, text) {
  const s = getSettings();
  const [r, source] = await withFallback(
    () => runJson({
      purpose: 'reply_analysis', leadId: lead.id, effort: s.ai.effort_light, schema: REPLY_SCHEMA,
      system: managerSystem('understand a reply from a lead and draft our response'),
      prompt: `The lead just replied:
<untrusted>${text}</untrusted>

${leadContext(lead, history(lead.id))}

Classify the intent. Use "accept_proposal" only if the stage is proposal_sent and they clearly agree to go ahead with the proposal (a question or a conditional yes is not acceptance). If a reply is useful, draft it: answer questions honestly using only agency facts, handle objections calmly, and steer toward a short call using the placeholder {{booking_link}}.`,
    }),
    () => ({ intent: classifyReplyRules(text, lead.stage), summary: String(text).slice(0, 120), suggested_reply: '', call_talking_points: [] }),
  );
  return { ...r, source };
}

// ----------------------------------------------------------- plan next action

const PLAN_SCHEMA = obj({
  type: { type: 'string', enum: ['call', 'message', 'close'] },
  in_hours: { type: 'integer', description: 'when to do it, hours from now' },
  goal: str('what this touch should achieve'),
  talking_points: arr(str()),
  reason: str(),
});

/** Rule-based follow-up cadence (used without AI). */
function rulePlan(lead, after) {
  const q = getSettings().sequence;
  if (after === 'intro') return { type: 'message', in_hours: q.follow_up_1_days * 24, goal: 'Gentle follow-up on the brochure', talking_points: [], reason: 'default cadence' };
  if (after === 'follow_up_1') {
    return lead.phone_valid
      ? { type: 'call', in_hours: q.follow_up_2_days * 24, goal: 'Quick call to ask if they saw the plan and book a meeting', talking_points: [], reason: 'phone available: calls convert better than a third message' }
      : { type: 'message', in_hours: q.follow_up_2_days * 24, goal: 'Last follow-up message', talking_points: [], reason: 'no phone' };
  }
  if (after === 'no_answer') return { type: 'message', in_hours: 24, goal: 'Message after a missed call', talking_points: [], reason: 'call not answered' };
  return { type: 'close', in_hours: q.close_after_days * 24, goal: 'Move to long-term nurture if still silent', talking_points: [], reason: 'sequence finished' };
}

/**
 * Decides the next follow-up (call / message / close) and when.
 * `after` = 'intro' | 'follow_up_1' | 'follow_up_2' | 'no_answer'.
 * The result is validated against what is actually possible for this lead.
 */
export async function planNextAction(lead, after) {
  const s = getSettings();
  let [plan, source] = await withFallback(
    () => runJson({
      purpose: 'plan_next', leadId: lead.id, effort: s.ai.effort_light, schema: PLAN_SCHEMA,
      system: managerSystem('decide the best next follow-up for a lead in the outreach sequence'),
      prompt: `We just completed: ${after}. Decide the single best next action and its timing to convert this lead.

${leadContext(lead, history(lead.id))}

Options: "call" (a person on our team phones them; only if they have a valid phone), "message" (WhatsApp/email follow-up; only if they gave permission), "close" (stop active outreach and move them to long-term nurture marketing).
Rules: at most 3 follow-ups after the intro in total; space touches 1-7 days apart; prefer a call when there has been silence after two messages and a phone is available; business hours only.`,
    }),
    () => rulePlan(lead, after),
  );
  const canMessage = (lead.wa_opt_in && lead.phone_valid) || (lead.email_opt_in && lead.email_valid);
  if (plan.type === 'call' && !lead.phone_valid) plan = { ...plan, type: canMessage ? 'message' : 'close', reason: `${plan.reason} (no valid phone)` };
  if (plan.type === 'message' && !canMessage) plan = { ...plan, type: lead.phone_valid ? 'call' : 'close', reason: `${plan.reason} (no message permission)` };
  plan.in_hours = Math.min(14 * 24, Math.max(4, Number(plan.in_hours) || 72));
  return { ...plan, source };
}

// -------------------------------------------------------------- daily briefing

export function pipelineSnapshot() {
  const by = Object.fromEntries(all(`SELECT stage, COUNT(*) n FROM leads GROUP BY stage`).map((r) => [r.stage, r.n]));
  const pipes = Object.fromEntries(all(`SELECT COALESCE(pipe,'conversion') pipe, COUNT(*) n FROM leads WHERE stage NOT IN ('completed','closed_no_reply','not_interested','lost','do_not_contact') GROUP BY pipe`).map((r) => [r.pipe, r.n]));
  const callsDue = all(`SELECT t.title, t.due_at, l.company FROM tasks t JOIN leads l ON l.id = t.lead_id WHERE t.kind = 'call' AND t.done = 0 ORDER BY COALESCE(t.due_at, t.created_at) LIMIT 15`);
  const replies = all(`SELECT l.id, l.company, m.body FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.direction = 'in' AND m.created_at >= datetime('now','-2 days') ORDER BY m.id DESC LIMIT 10`);
  const hot = all(`SELECT company, stage, score FROM leads WHERE stage IN ('replied','meeting_booked','proposal_sent') ORDER BY score DESC LIMIT 10`);
  const money = get(`SELECT (SELECT COALESCE(SUM(total),0) FROM proposals WHERE status='sent') open_value, (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='pending') outstanding`);
  return { by_stage: by, pipes, calls_due: callsDue, recent_replies: replies, hot_deals: hot, money };
}

function ruleBriefing(snap) {
  const lines = ['Today at a glance'];
  lines.push(`- Pipes: conversion ${snap.pipes.conversion || 0}, nurture ${snap.pipes.nurture || 0}, re-engage ${snap.pipes.reengage || 0}.`);
  if (snap.by_stage.brochure_ready) lines.push(`- ${snap.by_stage.brochure_ready} pitch(es) waiting for your approval. Approve them first: they are interested leads.`);
  if (snap.calls_due.length) lines.push(`- ${snap.calls_due.length} call(s) to make: ${snap.calls_due.slice(0, 5).map((c) => c.company).join(', ')}.`);
  if (snap.recent_replies.length) lines.push(`- ${snap.recent_replies.length} recent reply(ies) from: ${[...new Set(snap.recent_replies.map((r) => r.company))].join(', ')}.`);
  if (snap.hot_deals.length) lines.push(`- Hot deals: ${snap.hot_deals.map((d) => `${d.company} (${d.stage})`).join(', ')}.`);
  if (snap.money.outstanding) lines.push(`- Outstanding invoices: ${snap.money.outstanding}. Chase payments.`);
  return lines.join('\n');
}

export async function dailyBriefing() {
  const s = getSettings();
  const snap = pipelineSnapshot();
  const [b, source] = await withFallback(
    async () => (await runJson({
      purpose: 'briefing', effort: s.ai.effort_writing,
      schema: obj({ briefing: str('the briefing, plain text, short bullet lines starting with "- "') }),
      system: managerSystem('write the morning briefing for the team'),
      prompt: `Here is the live pipeline snapshot:
<untrusted>${JSON.stringify(snap)}</untrusted>

Write a short morning briefing (max ~12 lines): the 3 most important things to do today, which leads to call first and why, risks (stalled deals, unpaid invoices), and one marketing suggestion to improve conversion. Be concrete and use company names.`,
    })).briefing,
    () => ruleBriefing(snap),
  );
  return { content: b, source };
}
