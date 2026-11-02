import { get, all, run, insert, update, transaction } from '../db.js';
import { background } from '../background.js';
import { getSettings } from '../settings.js';
import { STAGE_IDS, TERMINAL, PRE_REPLY } from '../stages.js';
import { nowISO, addDays, addMinutes, isDue, token, money, formatInTz, zonedToUtc, normalizeEmail, normalizePhone, normalizeUrl, titleCase, truthy, BASE_URL } from '../util.js';
import { auditWebsite, recommendPackage } from './enrich.js';
import { scoreLead } from './scoring.js';
import { buildBrochure } from './brochure.js';
import { sendToLead, inSendWindow } from './messenger.js';
import { logEvent, addActivity, addTask } from './log.js';
import { crmEvent } from '../crm-sync.js';
import { aiEnabled } from '../ai/claude.js';
import { researchLead, fallbackResearch, buildPitch, fallbackPitch, buildDesign, fallbackDesign } from '../ai/pitchmaker.js';
import { composeMessage, analyzeReply, planNextAction, classifyReplyRules } from '../ai/manager.js';
import { writeProposal } from '../ai/proposal.js';
import { brochureUrl, brochureAttachment, proposalUrl, proposalAttachment } from '../pdf/docs.js';

export const getLead = async (id) => await get(`SELECT * FROM leads WHERE id = :id`, { id });
const addHours = (iso, h) => addMinutes(iso, h * 60);
const CONVERSION_SEQ = new Set(['contacted', 'follow_up_1', 'follow_up_2']);

export async function setStage(lead, stage, reason = '', extra = {}) {
  if (!STAGE_IDS.has(stage)) throw new Error(`Unknown stage ${stage}`);
  if (lead.stage === stage && !Object.keys(extra).length) return lead;
  await update('leads', lead.id, { stage, stage_changed_at: nowISO(), updated_at: nowISO(), ...extra });
  if (lead.stage !== stage) {
    await addActivity(lead.id, 'stage', `Stage: ${lead.stage} → ${stage}`, reason || null);
    await logEvent(lead.id, 'pipeline', 'stage', 'ok', `${lead.stage} → ${stage}${reason ? ` (${reason})` : ''}`);
    await crmEvent(lead.id, 'lead.stage_changed', { from: lead.stage, to: stage, reason });
  }
  return await getLead(lead.id);
}

/**
 * Calls are made by the telecaller in the team CRM. We keep an internal call task (so an
 * unanswered request times out) and push a "lead.call_requested" event with the script.
 */
export async function requestCall(leadId, { goal, notes = '', dueAt }) {
  const lead = await getLead(leadId);
  const pitch = lead.pitch_json ? JSON.parse(lead.pitch_json) : null;
  await insert('tasks', { lead_id: leadId, kind: 'call', title: `📞 Call ${lead.company}: ${goal}`.slice(0, 160), notes, due_at: dueAt, created_at: nowISO() });
  await crmEvent(leadId, 'lead.call_requested', {
    due_at: dueAt, goal, notes,
    script: pitch?.telecaller_script || '', call_script: pitch?.call_script || [], objections: pitch?.objections || [],
    report_outcome_to: `${BASE_URL}/api/crm/leads/${lead.external_id || ':external_id'}/call`,
  });
}

/** Call result reported by the CRM (telecaller). Matches the open call request, if any. */
export async function logCrmCall(leadId, outcome, opts = {}) {
  const open = await get(`SELECT id FROM tasks WHERE lead_id = :leadId AND kind = 'call' AND done = 0 ORDER BY id LIMIT 1`, { leadId });
  const lead = await getLead(leadId);
  const taskId = open?.id ?? await insert('tasks', { lead_id: leadId, kind: 'call', title: `📞 Call ${lead.company} (from CRM)`, created_at: nowISO() });
  return logCallOutcome(taskId, outcome, opts);
}

/** Records the next follow-up (call or message) on the lead, requests calls from the CRM, syncs the CRM. */
export async function scheduleNext(leadId, plan) {
  const at = addHours(nowISO(), plan.in_hours);
  const note = [plan.goal, ...(plan.talking_points || []).map((t) => `• ${t}`)].filter(Boolean).join('\n');
  await update('leads', leadId, { next_action_type: plan.type, next_action_at: at, next_action_note: note, updated_at: nowISO() });
  const lead = await getLead(leadId);
  if (plan.type === 'call') {
    await requestCall(leadId, { goal: plan.goal || 'follow-up', notes: note, dueAt: at });
  }
  await addActivity(leadId, 'system', `Next action: ${plan.type} on ${formatInTz(at, getSettings().schedule.timezone)}`, `${note}${plan.reason ? `\nWhy: ${plan.reason}` : ''}${plan.source ? `\n(${plan.source})` : ''}`);
  await logEvent(leadId, 'manager', 'next_action', 'ok', `${plan.type} in ${plan.in_hours}h: ${plan.goal || ''} [${plan.source || 'rules'}]`);
  await crmEvent(leadId, 'lead.next_action', { type: plan.type, at, note });
}

// ---------------------------------------------------------------- intake

/** Maps loose input (form/API/CSV/CRM) to clean lead columns. */
export function normalizeLeadInput(input, settings = getSettings()) {
  const e = normalizeEmail(input.email);
  const p = normalizePhone(input.phone ?? input.mobile ?? input.whatsapp, settings.sending.default_country_code);
  const interested = String(input.interested ?? 'unknown').toLowerCase();
  const out = {
    company: titleCase(input.company || input.company_name || input.business || input.contact_name || input.name || 'Unknown company'),
    contact_name: titleCase(input.contact_name || input.name || ''),
    email: e.email, email_valid: e.valid,
    phone: p.phone, phone_valid: p.valid,
    website: normalizeUrl(input.website || input.url),
    industry: input.industry || null,
    city: input.city || null,
    country: input.country || null,
    source: input.source || 'manual',
    service: input.service || null,
    budget: input.budget ? Number(String(input.budget).replace(/[^\d.]/g, '')) || null : null,
    notes: input.notes || input.message || null,
    pitch: input.pitch || null,
    tags: input.tags || null,
    owner: input.owner || null,
    interested: ['yes', 'no'].includes(interested) ? interested : truthy(interested) ? 'yes' : /^(not|false|0)/.test(interested) ? 'no' : 'unknown',
    wa_opt_in: truthy(input.wa_opt_in),
    email_opt_in: truthy(input.email_opt_in),
    consent_source: input.consent_source || null,
    do_not_contact: truthy(input.do_not_contact),
  };
  if (input.external_id) out.external_id = String(input.external_id);
  if ((out.wa_opt_in || out.email_opt_in) && !input.consent_at) out.consent_at = nowISO();
  return out;
}

export async function findDuplicate({ email, phone, external_id }) {
  if (external_id) {
    const byExt = await get(`SELECT * FROM leads WHERE external_id = :external_id`, { external_id });
    if (byExt) return byExt;
  }
  if (!email && !phone) return null;
  return await get(`SELECT * FROM leads WHERE (email IS NOT NULL AND email = :email) OR (phone IS NOT NULL AND phone = :phone) ORDER BY id LIMIT 1`,
    { email: email || null, phone: phone || null });
}

/**
 * Re-routes a lead when its interest changes (from the CRM, a call, or a reply).
 * yes → conversion pipe (pitch maker); no → re-engage marketing pipe.
 */
export async function applyInterestChange(id, interested, reason = 'interest changed') {
  const lead = await getLead(id);
  if (!lead || lead.do_not_contact || lead.interested === interested) {
    if (lead && lead.interested !== interested) await update('leads', id, { interested });
    return;
  }
  await update('leads', id, { interested, updated_at: nowISO() });
  const fresh = await getLead(id);
  if (interested === 'yes' && ['new', 'nurture', 'reengage', 'closed_no_reply', 'not_interested', 'needs_manual'].includes(lead.stage)) {
    await setStage(fresh, 'qualified', reason, { pipe: 'conversion', next_action_at: null, next_action_type: null, next_action_note: null });
    queueAdvance(id);
  } else if (interested === 'no' && (['qualified', 'brochure_ready', 'brochure_approved', 'nurture', 'needs_manual'].includes(lead.stage) || CONVERSION_SEQ.has(lead.stage))) {
    await enterMarketing(fresh, 'reengage', { reason });
  }
}

/** Creates a lead (or merges/updates a duplicate or CRM record) and starts the pipeline in the background. */
export async function createLead(input, { source, autoRun = true } = {}) {
  const settings = getSettings();
  const data = normalizeLeadInput({ ...input, source: source || input.source }, settings);
  const dup = await findDuplicate(data);
  if (dup) {
    const patch = {};
    for (const k of ['contact_name', 'email', 'phone', 'website', 'industry', 'city', 'service', 'budget', 'external_id']) if (!dup[k] && data[k]) patch[k] = data[k];
    if (patch.email) patch.email_valid = data.email_valid;
    if (patch.phone) patch.phone_valid = data.phone_valid;
    if (data.wa_opt_in && !dup.wa_opt_in) patch.wa_opt_in = 1;
    if (data.email_opt_in && !dup.email_opt_in) patch.email_opt_in = 1;
    if (data.do_not_contact && !dup.do_not_contact) patch.do_not_contact = 1;
    if (Object.keys(patch).length) await update('leads', dup.id, { ...patch, updated_at: nowISO() });
    await addActivity(dup.id, 'system', `Update merged from ${data.source}`, data.notes);
    await logEvent(dup.id, 'intake', 'dedupe', 'skipped', `merged into #${dup.id}`);
    if (patch.do_not_contact) await setStage(await getLead(dup.id), 'do_not_contact', 'flagged by CRM', { next_action_at: null });
    else if (data.interested !== 'unknown' && data.interested !== dup.interested) await applyInterestChange(dup.id, data.interested, `${data.source}: interested=${data.interested}`);
    return { id: dup.id, duplicate: true };
  }
  const now = nowISO();
  const id = await insert('leads', { ...data, token: token(), stage: 'new', stage_changed_at: now, created_at: now, updated_at: now });
  await addActivity(id, 'system', `Lead created via ${data.source}`, data.notes);
  await logEvent(id, 'intake', 'create', 'ok', `${data.company} (${data.source})`);
  await crmEvent(id, 'lead.created', { source: data.source });
  if (autoRun) queueAdvance(id);
  return { id, duplicate: false };
}

// ------------------------------------------------------------- state machine

const running = new Set();
export function queueAdvance(id, opts) {
  background(() => advance(id, opts).catch((e) => logEvent(id, 'pipeline', 'advance', 'error', e.stack || e.message)), 'advance');
}

/** Runs automatic steps for a lead until it reaches a waiting state. */
export async function advance(id, { force = false } = {}) {
  if (running.has(id)) return await getLead(id);
  running.add(id);
  try {
    for (let i = 0; i < 10; i++) {
      const lead = await getLead(id);
      if (!lead || TERMINAL.has(lead.stage)) return lead;
      const changed = await step(lead, { force });
      if (!changed) return await getLead(id);
    }
    return await getLead(id);
  } finally {
    running.delete(id);
  }
}

async function step(lead, { force }) {
  const s = getSettings();
  const auto = s.automation;
  const seq = s.sequence;
  const canSendCold = force || inSendWindow(s);

  switch (lead.stage) {
    case 'new': {
      if (lead.do_not_contact) { await setStage(lead, 'do_not_contact', 'flagged at intake'); return true; }
      const audit = await auditWebsite(lead.website);
      const recommended = recommendPackage(lead, audit, s.packages);
      const { score, reasons } = scoreLead(lead, audit, s.packages);
      await update('leads', lead.id, { audit_json: audit, recommended_package: recommended, score, score_reasons: reasons, updated_at: nowISO() });
      await logEvent(lead.id, 'enrich', 'website_audit', audit.unreachable ? 'error' : 'ok', `${audit.issues} finding(s)${audit.load_ms ? `, ${audit.load_ms}ms` : ''}`);
      await logEvent(lead.id, 'enrich', 'score', 'ok', `${score}: ${reasons.join('; ')}`);
      await addActivity(lead.id, 'system', `Enriched: score ${score}, recommend "${recommended}"`, audit.findings.map((f) => `• [${f.severity}] ${f.text}`).join('\n'));
      const fresh = await getLead(lead.id);
      // Routing: only interested leads enter the pitch maker. The rest go to the marketing pipes.
      if (lead.interested === 'yes') { await setStage(fresh, 'qualified', `interested, score ${score}`, { pipe: 'conversion' }); return true; }
      if (lead.interested === 'no') return await enterMarketing(fresh, 'reengage', { reason: 'marked not interested' });
      return await enterMarketing(fresh, 'nurture', { reason: 'interest not confirmed yet' });
    }
    case 'qualified':
      await setStage(lead, 'researching', 'pitch maker started');
      return true;
    case 'researching': {
      await runPitchMaker(lead.id);
      if (auto.auto_approve_brochure) await approveBrochure(lead.id, 'auto');
      else {
        await setStage(await getLead(lead.id), 'brochure_ready', 'pitch, design & brochure ready for approval');
        await addTask(lead.id, `Review & approve pitch for ${lead.company}`);
      }
      return true;
    }
    case 'brochure_approved': {
      if (!canSendCold) return false;
      const pitch = lead.pitch_json ? JSON.parse(lead.pitch_json) : null;
      const vars = { brochure_link: brochureUrl(lead), booking_link: `${BASE_URL}/book/${lead.token}` };
      const fill = (t) => String(t || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
      const content = pitch?.email?.body ? {
        subject: pitch.email.subject, email_body: fill(pitch.email.body), raw_email: true,
        whatsapp_text: fill(pitch.whatsapp_intro), raw_whatsapp: true,
      } : null;
      const r = await sendToLead(lead.id, 'intro', {}, { cold: true, content, attachment: brochureAttachment(lead) });
      if (r.ok) {
        await setStage(await getLead(lead.id), 'contacted', `intro via ${r.channel}`);
        await scheduleNext(lead.id, await planNextAction(await getLead(lead.id), 'intro'));
        return false;
      }
      if (r.reason === 'dnc') await setStage(lead, 'do_not_contact', 'do-not-contact');
      else if (r.reason === 'no_channel') {
        await setStage(lead, 'needs_manual', 'no WhatsApp/email permission');
        if (lead.phone_valid) await scheduleNext(lead.id, { type: 'call', in_hours: 2, goal: 'Interested lead without messaging permission: call, pitch, and ask for WhatsApp/email consent', talking_points: pitch?.call_script || [], source: 'rules' });
        else await addTask(lead.id, `Find contact details for ${lead.company} (no permitted channel, no phone)`);
      }
      return false;
    }
    case 'contacted':
    case 'follow_up_1':
    case 'follow_up_2':
      return conversionFollowUp(lead, { canSendCold, seq });
    case 'nurture':
    case 'reengage':
      if ((lead.next_action_at && !isDue(lead.next_action_at)) || !canSendCold) return false;
      return runTouch(lead);
    case 'meeting_booked': {
      const m = await get(`SELECT * FROM meetings WHERE lead_id = :id AND status = 'scheduled' ORDER BY start_at DESC LIMIT 1`, { id: lead.id });
      if (!m || !auto.auto_proposal_after_meeting) return false;
      if (!isDue(addMinutes(m.start_at, m.duration_min || 30))) return false;
      await update('meetings', m.id, { status: 'done' });
      await createAndSendProposal(lead.id);
      return false;
    }
    case 'proposal_sent': {
      if (!isDue(lead.next_action_at)) return false;
      const p = await get(`SELECT * FROM proposals WHERE lead_id = :id AND status = 'sent' ORDER BY id DESC LIMIT 1`, { id: lead.id });
      if (p) await sendToLead(lead.id, 'proposal_reminder', { proposal_link: proposalUrl(p), amount: money(p.total, getSettings().billing.currency) }, { attachment: proposalAttachment(lead, p) });
      await update('leads', lead.id, { next_action_at: null, next_action_type: null });
      await scheduleNext(lead.id, { type: 'call', in_hours: 24, goal: 'Call about the proposal: answer questions, handle objections, ask for the go-ahead', talking_points: [], source: 'rules' });
      return false;
    }
    case 'won':
    case 'delivered': {
      if (!isDue(lead.next_action_at)) return false;
      const inv = await get(`SELECT * FROM invoices WHERE lead_id = :id AND status = 'pending' ORDER BY id DESC LIMIT 1`, { id: lead.id });
      if (inv) await sendToLead(lead.id, 'payment_reminder', invoiceVars(inv));
      await update('leads', lead.id, { next_action_at: inv ? addDays(nowISO(), seq.invoice_reminder_days) : null, next_action_type: inv ? 'message' : null });
      return false;
    }
    default:
      return false;
  }
}

const NEXT_FOLLOW = { contacted: 'follow_up_1', follow_up_1: 'follow_up_2', follow_up_2: null };

/** Conversion pipe follow-ups: the manager decides call vs message and timing after every touch. */
async function conversionFollowUp(lead, { canSendCold }) {
  const type = lead.next_action_type || 'message';
  if (type === 'call') {
    // Give the team a day to log the call. If nothing is logged, treat it as unanswered.
    if (!isDue(addHours(lead.next_action_at, 24))) return false;
    for (const t of await all(`SELECT id FROM tasks WHERE lead_id = :id AND kind = 'call' AND done = 0`, { id: lead.id })) {
      await update('tasks', t.id, { done: 1, done_at: nowISO(), outcome: 'not_logged' });
    }
    await addActivity(lead.id, 'system', 'Scheduled call had no outcome logged; treating it as unanswered');
    return afterTouch(lead, 'no_answer');
  }
  if (!isDue(lead.next_action_at)) return false;
  const nextStage = NEXT_FOLLOW[lead.stage];
  if (type === 'close') {
    return await enterMarketing(lead, 'nurture', { startIndex: 1, reason: 'no reply to the conversion sequence: moving to long-term nurture' });
  }
  if (!canSendCold) return false;
  // At follow_up_2 one last message is allowed (e.g. after a missed call), then we close.
  const key = nextStage || 'follow_up_2';
  const content = await composeMessage(lead, `${nextStage ? nextStage.replace(/_/g, ' ') : 'final follow-up'}: follow up on the personalised plan and homepage concept we sent. Remind them of the single most relevant benefit and invite a short call.`,
    { links: { brochure_link: brochureUrl(lead), booking_link: `${BASE_URL}/book/${lead.token}` } });
  const r = await sendToLead(lead.id, key, {}, { cold: true, content });
  if (r.ok) {
    if (nextStage) await setStage(await getLead(lead.id), nextStage, `via ${r.channel}`);
    await scheduleNext(lead.id, key === 'follow_up_2'
      ? { type: 'close', in_hours: getSettings().sequence.close_after_days * 24, goal: 'Move to long-term nurture if still silent', reason: 'third touch done', source: 'rules' }
      : await planNextAction(await getLead(lead.id), nextStage));
  } else if (r.reason === 'no_channel' && lead.phone_valid) {
    await scheduleNext(lead.id, { type: 'call', in_hours: 2, goal: 'Follow up by phone (message channel unavailable)', source: 'rules' });
  } else if (r.reason !== 'cap') {
    await setStage(lead, 'needs_manual', `follow-up failed: ${r.reason}`);
  }
  return false;
}

/** After a call attempt or message in the conversion sequence: move the touch counter and plan the next action. */
async function afterTouch(lead, after) {
  const next = NEXT_FOLLOW[lead.stage];
  if (CONVERSION_SEQ.has(lead.stage) && next) await setStage(lead, next, `touch: ${after}`);
  const fresh = await getLead(lead.id);
  if (CONVERSION_SEQ.has(lead.stage) && !next) {
    await scheduleNext(lead.id, { type: 'close', in_hours: 24, goal: 'Move to long-term nurture', reason: 'all follow-ups used', source: 'rules' });
  } else {
    await scheduleNext(lead.id, await planNextAction(fresh, after));
  }
  return false;
}

// ---------------------------------------------------------- marketing pipes

/** Puts a lead into the nurture or re-engage marketing pipe. Returns true if a touch is due now. */
export async function enterMarketing(lead, pipe, { startIndex = 0, reason = '' } = {}) {
  const touches = getSettings().marketing[pipe] || [];
  const canMessage = (lead.wa_opt_in && lead.phone_valid) || (lead.email_opt_in && lead.email_valid);
  if (pipe === 'reengage' && !canMessage) {
    await setStage(lead, 'not_interested', `${reason}; no messaging permission for re-engage marketing`, { pipe: 'reengage', interested: 'no', next_action_at: null, next_action_type: null });
    return false;
  }
  const t = touches[startIndex];
  if (!t) {
    await setStage(lead, pipe === 'nurture' ? 'closed_no_reply' : 'not_interested', `${reason}; no touches configured`, { pipe, next_action_at: null });
    return false;
  }
  const gap = startIndex === 0 ? t.after_days : t.after_days - touches[startIndex - 1].after_days;
  const at = addDays(nowISO(), gap);
  await setStage(lead, pipe, reason, {
    pipe, touch_index: startIndex, next_action_type: 'message', next_action_at: at, next_action_note: t.theme,
    ...(pipe === 'reengage' ? { interested: 'no' } : {}),
  });
  await crmEvent(lead.id, 'lead.next_action', { type: 'message', at, note: t.theme, pipe });
  return gap <= 0;
}

/** Sends the current marketing touch and schedules the next one. */
async function runTouch(lead) {
  const s = getSettings();
  const pipe = lead.stage;
  const touches = s.marketing[pipe] || [];
  const idx = lead.touch_index || 0;
  const t = touches[idx];
  if (!t) {
    await setStage(lead, pipe === 'nurture' ? 'closed_no_reply' : 'not_interested', `${pipe} pipe finished without a reply`, { next_action_at: null, next_action_type: null });
    return false;
  }
  const content = await composeMessage(lead,
    `Marketing ${pipe} touch ${idx + 1} of ${touches.length}. Theme: ${t.theme}. ${pipe === 'reengage'
      ? 'This lead said they were not interested before: be light, genuinely useful and zero-pressure. No hard sell.'
      : 'This lead has not said whether they are interested: build trust, give value, and invite a reply.'}`,
    { links: { booking_link: `${BASE_URL}/book/${lead.token}` } });
  const key = pipe === 'nurture' ? 'nurture_touch' : 'reengage_touch';
  const extra = { touch_subject: `A quick idea for ${lead.company}`, touch_body: t.fallback };
  const r = await sendToLead(lead.id, key, extra, { cold: true, content });
  if (r.reason === 'cap') return false;
  if (!r.ok) {
    if (r.reason === 'no_channel' && pipe === 'nurture' && lead.phone_valid) {
      await requestCall(lead.id, { goal: t.theme, notes: `Warm-up call (no messaging permission). Ask if they are interested in a website.\nTheme: ${t.theme}`, dueAt: nowISO() });
    } else if (r.reason === 'no_channel' || r.reason === 'dnc') {
      await setStage(lead, r.reason === 'dnc' ? 'do_not_contact' : 'closed_no_reply', `${pipe}: no way to contact`, { next_action_at: null });
      return false;
    }
  }
  const next = touches[idx + 1];
  const at = next ? addDays(nowISO(), next.after_days - t.after_days) : addDays(nowISO(), 7);
  await update('leads', lead.id, { touch_index: idx + 1, next_action_type: 'message', next_action_at: at, next_action_note: next ? next.theme : `End of ${pipe} pipe`, updated_at: nowISO() });
  await logEvent(lead.id, 'marketing', `${pipe}_touch_${idx + 1}`, r.ok ? 'ok' : 'skipped', r.ok ? `${r.channel}${content ? ' ai' : ''}` : r.reason);
  await crmEvent(lead.id, 'lead.next_action', { type: 'message', at, note: next?.theme || 'end', pipe });
  return false;
}

// ------------------------------------------------------------- pitch maker

/**
 * Pitch maker: web research → pitch → homepage design concept → brochure.
 * Uses Claude when available; otherwise rule-based fallbacks so the pipe never stalls.
 */
export async function runPitchMaker(id, { design = true } = {}) {
  const s = getSettings();
  const lead = await getLead(id);
  const audit = lead.audit_json ? JSON.parse(lead.audit_json) : null;
  const useAi = aiEnabled();

  let research;
  try {
    research = useAi ? await researchLead(lead, audit) : fallbackResearch(lead, audit);
  } catch (e) {
    await logEvent(id, 'pitch_maker', 'research', 'error', e.message);
    research = fallbackResearch(lead, audit);
  }
  const scorePatch = {};
  if (research.source === 'ai' && Number.isFinite(research.fit_score)) {
    scorePatch.score = Math.round((lead.score + Math.max(0, Math.min(100, research.fit_score))) / 2);
  }
  await update('leads', id, { research_json: research, ...scorePatch, updated_at: nowISO() });
  await addActivity(id, 'system', `Web research done (${research.source}, ${research.sources?.length || 0} sources)`, research.business_summary);
  await logEvent(id, 'pitch_maker', 'research', 'ok', `${research.source}, ${research.sources?.length || 0} sources, fit ${research.fit_score}`);

  let pitch;
  try {
    pitch = useAi ? await buildPitch(await getLead(id), research) : fallbackPitch(await getLead(id), audit);
  } catch (e) {
    await logEvent(id, 'pitch_maker', 'pitch', 'error', e.message);
    pitch = fallbackPitch(await getLead(id), audit);
  }
  await update('leads', id, { pitch_json: pitch, pitch_source: pitch.source, recommended_package: pitch.recommended_package, updated_at: nowISO() });
  await logEvent(id, 'pitch_maker', 'pitch', 'ok', `${pitch.source}: ${pitch.headline}`);

  if (design) await runDesign(id, research, pitch);
  await generateBrochure(id);
  await addActivity(id, 'system', `Pitch ready (${pitch.source}): ${pitch.headline}`, `Hook: ${pitch.hook}\nPackage: ${pitch.recommended_package}. ${pitch.package_reason}`);
  await crmEvent(id, 'lead.pitch_ready', { headline: pitch.headline, package: pitch.recommended_package, source: pitch.source });
}

export async function runDesign(id, research = null, pitch = null) {
  const s = getSettings();
  const lead = await getLead(id);
  research ??= lead.research_json ? JSON.parse(lead.research_json) : fallbackResearch(lead, null);
  pitch ??= lead.pitch_json ? JSON.parse(lead.pitch_json) : fallbackPitch(lead, null);
  let html, source = 'template';
  if (aiEnabled() && s.ai.design_enabled) {
    try { html = await buildDesign(lead, research, pitch); source = 'ai'; } catch (e) { await logEvent(id, 'pitch_maker', 'design', 'error', e.message); }
  }
  html ??= fallbackDesign(lead, pitch);
  await update('leads', id, { design_html: html, design_version: (lead.design_version || 0) + 1, updated_at: nowISO() });
  await logEvent(id, 'pitch_maker', 'design', 'ok', `${source} v${(lead.design_version || 0) + 1}, ${Math.round(html.length / 1024)}KB`);
  await addActivity(id, 'system', `Homepage design concept v${(lead.design_version || 0) + 1} created (${source})`);
}

// ----------------------------------------------------------------- brochure

export async function generateBrochure(id) {
  const s = getSettings();
  const lead = await getLead(id);
  const audit = lead.audit_json ? JSON.parse(lead.audit_json) : null;
  const pitch = lead.pitch_json ? JSON.parse(lead.pitch_json) : null;
  const html = buildBrochure(lead, audit, s, pitch);
  await update('leads', id, { brochure_html: html, brochure_version: (lead.brochure_version || 0) + 1, brochure_status: 'ready', updated_at: nowISO() });
  await logEvent(id, 'brochure', 'generate', 'ok', `v${(lead.brochure_version || 0) + 1}`);
}

export async function approveBrochure(id, by = 'admin') {
  const lead = await getLead(id);
  if (!lead.brochure_html) await generateBrochure(id);
  await update('leads', id, { brochure_status: 'approved', approved_by: by, approved_at: nowISO() });
  await completeTasks(id, 'Review & approve');
  await setStage(await getLead(id), 'brochure_approved', `approved by ${by}`);
  await logEvent(id, 'brochure', 'approve', 'ok', by);
}

export async function regenerateBrochure(id) {
  const lead = await getLead(id);
  await generateBrochure(id);
  if (lead.stage === 'brochure_approved') await setStage(lead, 'brochure_ready', 'regenerated, needs re-approval');
  await update('leads', id, { brochure_status: 'ready', approved_at: null, approved_by: null });
}

export async function rescore(id) {
  const s = getSettings();
  const lead = await getLead(id);
  const audit = lead.audit_json ? JSON.parse(lead.audit_json) : null;
  const { score, reasons } = scoreLead(lead, audit, s.packages);
  await update('leads', id, { score, score_reasons: reasons });
  return score;
}

async function completeTasks(id, prefix) {
  for (const t of await all(`SELECT id, title FROM tasks WHERE lead_id = :id AND done = 0`, { id })) {
    if (t.title.startsWith(prefix)) await update('tasks', t.id, { done: 1, done_at: nowISO() });
  }
}

// ------------------------------------------------------------------ inbound

export const classifyReply = classifyReplyRules;

export async function findLeadByContact({ email, phone }) {
  const e = email ? normalizeEmail(email).email : null;
  const p = phone ? normalizePhone(phone, getSettings().sending.default_country_code).phone : null;
  return await findDuplicate({ email: e, phone: p });
}

/** Handles a reply from a lead (WhatsApp/email webhook or "simulate reply"). The manager reads it and acts. */
export async function handleInbound(leadId, channel, text, { subject = null, providerId = null } = {}) {
  const lead = await getLead(leadId);
  if (!lead) return null;
  await insert('messages', { lead_id: leadId, direction: 'in', channel, subject, body: text, status: 'received', provider_id: providerId, created_at: nowISO() });
  await update('leads', leadId, { last_inbound_at: nowISO(), last_inbound_channel: channel, updated_at: nowISO() });
  const a = await analyzeReply(await getLead(leadId), text);
  await addActivity(leadId, 'message_in', `${channel === 'email' ? 'Email' : 'WhatsApp'} reply: ${a.intent} (${a.source})`, `${text}${a.summary ? `\n\nManager: ${a.summary}` : ''}`);
  await logEvent(leadId, 'inbound', 'analyze', 'ok', `${channel}: ${a.intent} [${a.source}]`);
  await crmEvent(leadId, 'lead.reply', { channel, intent: a.intent, summary: a.summary });
  const s = getSettings();
  const fresh = await getLead(leadId);

  if (a.intent === 'accept_proposal' && fresh.stage === 'proposal_sent') {
    await decideProposal(leadId, 'accepted', { by: `${channel} reply` });
    return a.intent;
  }
  if (a.intent === 'stop') {
    await setStage(fresh, 'do_not_contact', 'opted out by reply', { do_not_contact: 1, wa_opt_in: 0, email_opt_in: 0, next_action_at: null, next_action_type: null });
    return a.intent;
  }
  if (a.intent === 'not_interested' && PRE_REPLY.has(fresh.stage)) {
    if (fresh.stage === 'reengage') await setStage(fresh, 'not_interested', 'replied not interested again', { next_action_at: null, next_action_type: null });
    else await enterMarketing(fresh, 'reengage', { reason: 'replied not interested' });
    return a.intent;
  }
  if (PRE_REPLY.has(fresh.stage)) {
    const positive = a.intent === 'interested' || a.intent === 'meeting_request';
    await setStage(fresh, 'replied', `${a.intent} reply`, {
      interested: positive ? 'yes' : fresh.interested, pipe: positive ? 'conversion' : fresh.pipe, next_action_at: null, next_action_type: null,
    });
    if (positive) {
      if (s.automation.auto_send_booking_link) await sendToLead(leadId, 'booking');
      // Arm the sales team: build the pitch if this lead came from a marketing pipe.
      if (!fresh.pitch_json) background(() => runPitchMaker(leadId).catch((e) => logEvent(leadId, 'pitch_maker', 'run', 'error', e.message)), 'pitch-maker');
    }
  }
  if (a.suggested_reply && !(a.intent === 'interested' && s.automation.auto_send_booking_link && PRE_REPLY.has(fresh.stage))) {
    const booking = `${BASE_URL}/book/${fresh.token}`;
    const draft = a.suggested_reply.replace(/\{\{\s*booking_link\s*\}\}/g, booking);
    if (s.ai.auto_send_ai_replies) await sendDraftText(leadId, draft, channel);
    else await insert('tasks', { lead_id: leadId, kind: 'reply_draft', title: `✉️ Approve reply to ${fresh.company} (${a.intent})`, notes: draft, created_at: nowISO() });
  }
  await scheduleNext(leadId, {
    type: 'call', in_hours: 2, goal: `Respond to their ${a.intent.replace(/_/g, ' ')}: ${a.summary || String(text).slice(0, 80)}`,
    talking_points: a.call_talking_points || [], reason: 'a reply is the best moment to talk', source: a.source,
  });
  return a.intent;
}

/** Sends a personal reply (AI draft or typed by the team) on the channel the lead used. */
export async function sendDraftText(leadId, text, channel = null) {
  const lead = await getLead(leadId);
  return sendToLead(leadId, 'custom', { touch_subject: `Re: ${lead.company}`, touch_body: text },
    { channel: channel || lead.last_inbound_channel || null, content: { subject: `Re: ${lead.company}`, email_body: text, whatsapp_text: text } });
}

export async function sendDraft(taskId, text = null) {
  const t = await get(`SELECT * FROM tasks WHERE id = :taskId`, { taskId });
  if (!t || t.kind !== 'reply_draft') throw new Error('Draft not found');
  const r = await sendDraftText(t.lead_id, text || t.notes);
  if (!r.ok) throw new Error(`Could not send: ${r.reason}`);
  await update('tasks', t.id, { done: 1, done_at: nowISO(), outcome: 'sent', notes: text || t.notes });
  return r;
}

// --------------------------------------------------------------------- calls

export const CALL_OUTCOMES = ['interested', 'meeting_booked', 'callback', 'no_answer', 'not_interested', 'wrong_number'];

/** Logs the result of a call; the manager decides what happens next. */
export async function logCallOutcome(taskId, outcome, { notes = '', callbackAt = null } = {}) {
  if (!CALL_OUTCOMES.includes(outcome)) throw new Error('Unknown outcome');
  const t = await get(`SELECT * FROM tasks WHERE id = :taskId`, { taskId });
  if (!t?.lead_id) throw new Error('Call task not found');
  await update('tasks', t.id, { done: 1, done_at: nowISO(), outcome, notes: [t.notes, notes && `Outcome notes: ${notes}`].filter(Boolean).join('\n') });
  const lead = await getLead(t.lead_id);
  await addActivity(lead.id, 'note', `📞 Call logged: ${outcome.replace(/_/g, ' ')}`, notes || null);
  await logEvent(lead.id, 'calls', 'outcome', 'ok', outcome);
  await crmEvent(lead.id, 'lead.call_logged', { outcome, notes });
  await update('leads', lead.id, { next_action_at: null, next_action_type: null, next_action_note: null, last_contacted_at: nowISO(), last_channel: 'call' });
  const fresh = await getLead(lead.id);

  switch (outcome) {
    case 'interested':
    case 'meeting_booked':
      if (PRE_REPLY.has(fresh.stage)) await setStage(fresh, 'replied', `call: ${outcome}`, { interested: 'yes', pipe: 'conversion' });
      // Interest on a call is not messaging consent: only message leads who opted in or wrote to us first.
      // Otherwise the telecaller asks for consent and the CRM PATCHes wa_opt_in / email_opt_in.
      if (outcome === 'interested' && getSettings().automation.auto_send_booking_link && (fresh.wa_opt_in || fresh.email_opt_in || fresh.last_inbound_at)) {
        await sendToLead(lead.id, 'booking');
      }
      if (!fresh.pitch_json) background(() => runPitchMaker(lead.id).catch((e) => logEvent(lead.id, 'pitch_maker', 'run', 'error', e.message)), 'pitch-maker');
      break;
    case 'callback': {
      const hours = callbackAt ? Math.max(1, (new Date(callbackAt) - Date.now()) / 3600e3) : 24;
      await scheduleNext(lead.id, { type: 'call', in_hours: Math.round(hours), goal: 'Call back as requested', talking_points: [], source: 'team' });
      break;
    }
    case 'not_interested':
      if (fresh.stage === 'reengage') await setStage(fresh, 'not_interested', 'said no on the phone');
      else if (PRE_REPLY.has(fresh.stage)) await enterMarketing(fresh, 'reengage', { reason: 'said not interested on a call' });
      break;
    case 'wrong_number':
      await update('leads', lead.id, { phone_valid: 0 });
    // falls through
    case 'no_answer':
      if (CONVERSION_SEQ.has(fresh.stage) || fresh.stage === 'needs_manual') await afterTouch(await getLead(lead.id), 'no_answer');
      break;
  }
}

// ------------------------------------------------------------------ meetings

export async function availableSlots(settings = getSettings()) {
  const tz = settings.schedule.timezone;
  const taken = new Set((await all(`SELECT start_at FROM meetings WHERE status = 'scheduled'`)).map((m) => m.start_at));
  const out = [];
  const day = new Date();
  for (let d = 1; out.length < settings.meeting.days_ahead * settings.meeting.slots.length && d <= 21; d++) {
    const date = new Date(day.getTime() + d * 86400000);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    if (p.weekday === 'Sun') continue;
    const dateStr = `${p.year}-${p.month}-${p.day}`;
    const daySlots = settings.meeting.slots.map((hhmm) => {
      const iso = zonedToUtc(dateStr, hhmm, tz);
      return { iso, label: formatInTz(iso, tz), taken: taken.has(iso) };
    }).filter((x) => !x.taken);
    if (daySlots.length) out.push({ date: dateStr, label: new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'short' }).format(date), slots: daySlots });
    if (out.length >= settings.meeting.days_ahead) break;
  }
  return out;
}

export async function bookMeeting(leadId, startIso) {
  const s = getSettings();
  const lead = await getLead(leadId);
  if (await get(`SELECT 1 FROM meetings WHERE start_at = :startIso AND status = 'scheduled'`, { startIso })) throw new Error('That slot was just taken. Please pick another.');
  await insert('meetings', { lead_id: leadId, start_at: startIso, duration_min: s.meeting.duration_min, status: 'scheduled', created_at: nowISO() });
  const when = formatInTz(startIso, s.schedule.timezone);
  if (PRE_REPLY.has(lead.stage) || lead.stage === 'replied' || lead.stage === 'meeting_booked') {
    await setStage(lead, 'meeting_booked', when, { interested: 'yes', pipe: 'conversion', next_action_at: null, next_action_type: null });
  } else {
    await addActivity(leadId, 'system', `Meeting booked: ${when}`);
  }
  await addTask(leadId, `Discovery call with ${lead.company}: ${when}`, startIso);
  await sendToLead(leadId, 'meeting_confirmed', { meeting_time: when });
}

// --------------------------------------------------------- proposals/invoices

export const proposalLink = (p) => `${BASE_URL}/p/${p.token}`;
const invoiceLink = (inv) => `${BASE_URL}/pay/${inv.token}`;
const invoiceVars = (inv) => ({ payment_link: invoiceLink(inv), amount: money(inv.amount, getSettings().billing.currency), invoice_number: inv.number });

export function buildProposalItems(lead, s = getSettings()) {
  const audit = lead.audit_json ? JSON.parse(lead.audit_json) : null;
  const pkg = s.packages.find((p) => p.id === lead.recommended_package) || s.packages[0];
  const items = [{ name: pkg.name, detail: pkg.includes.join(', '), qty: 1, price: pkg.price }];
  const seo = s.packages.find((p) => p.id === 'seo');
  const weakSeo = audit?.findings?.some((f) => /meta description|title|heading/i.test(f.text));
  if (seo && pkg.id !== 'seo' && weakSeo) items.push({ name: `${seo.name} (add-on)`, detail: seo.includes.join(', '), qty: 1, price: Math.round(seo.price * 0.6) });
  if (s.care_plan?.monthly) items.push({ name: s.care_plan.name, detail: `${s.care_plan.months} months prepaid`, qty: s.care_plan.months, price: s.care_plan.monthly });
  return items;
}

export async function createAndSendProposal(leadId, items = null) {
  const s = getSettings();
  const lead = await getLead(leadId);
  items = items || buildProposalItems(lead, s);
  const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0);
  const tax = Math.round((subtotal * s.billing.tax_pct) / 100);
  const p = { lead_id: leadId, token: token(), items_json: items, subtotal, tax, total: subtotal + tax, advance_pct: s.billing.advance_pct, status: 'sent', created_at: nowISO() };
  await run(`UPDATE proposals SET status = 'superseded' WHERE lead_id = :leadId AND status = 'sent'`, { leadId });
  // AI Proposal Generator writes the document; prices above are computed in code.
  const { content, source } = await writeProposal(lead, items);
  Object.assign(p, { content_json: content, content_source: source });
  p.id = await insert('proposals', p);
  const saved = await get(`SELECT * FROM proposals WHERE id = :id`, { id: p.id });
  await addActivity(leadId, 'system', `Proposal #${p.id} created (${source}): ${money(p.total, s.billing.currency)}`, content.executive_summary);
  await logEvent(leadId, 'sales', 'proposal', 'ok', `#${p.id} ${p.total} ${source}`);
  await sendToLead(leadId, 'proposal', { proposal_link: proposalUrl(saved), amount: money(p.total, s.billing.currency) }, { attachment: proposalAttachment(lead, saved) });
  await crmEvent(leadId, 'lead.proposal_sent', { proposal_id: p.id, total: p.total, pdf: proposalUrl(saved) });
  await setStage(lead, 'proposal_sent', `#${p.id}`, { next_action_at: addDays(nowISO(), s.sequence.proposal_reminder_days) });
  return p;
}

async function nextInvoiceNumber(s) {
  const n = (await get(`SELECT COUNT(*) n FROM invoices`)).n + 1;
  return `${s.billing.invoice_prefix}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}

async function createInvoice(leadId, proposal, kind, amount) {
  const s = getSettings();
  const inv = { lead_id: leadId, proposal_id: proposal?.id, token: token(), number: await nextInvoiceNumber(s), kind, amount, status: 'pending', created_at: nowISO() };
  inv.id = await insert('invoices', inv);
  await logEvent(leadId, 'billing', 'invoice', 'ok', `${inv.number} ${kind} ${amount}`);
  return inv;
}

export async function acceptProposal(proposalToken) {
  const s = getSettings();
  const p = await get(`SELECT * FROM proposals WHERE token = :proposalToken`, { proposalToken });
  if (!p || p.status !== 'sent') throw new Error('This proposal is no longer open.');
  await update('proposals', p.id, { status: 'accepted', responded_at: nowISO() });
  const lead = await getLead(p.lead_id);
  await completeTasks(lead.id, 'Call');
  const inv = await createInvoice(lead.id, p, 'advance', Math.round((p.total * p.advance_pct) / 100));
  await setStage(lead, 'won', `proposal #${p.id} accepted`, { next_action_at: addDays(nowISO(), s.sequence.invoice_reminder_days) });
  await sendToLead(lead.id, 'payment_request', invoiceVars(inv));
  return inv;
}

/** Accept/decline the lead's open proposal (from a "YES" reply, the CRM, or the admin). */
export async function decideProposal(leadId, decision, { reason = '', by = 'admin' } = {}) {
  const p = await get(`SELECT * FROM proposals WHERE lead_id = :leadId AND status = 'sent' ORDER BY id DESC LIMIT 1`, { leadId });
  if (!p) throw new Error('No open proposal for this lead');
  await addActivity(leadId, 'system', `Proposal #${p.id} ${decision} (${by})`, reason || null);
  if (decision === 'accepted') return acceptProposal(p.token);
  if (decision === 'declined') return await declineProposal(p.token, reason);
  throw new Error('decision must be accepted or declined');
}

export async function declineProposal(proposalToken, reason) {
  const p = await get(`SELECT * FROM proposals WHERE token = :proposalToken`, { proposalToken });
  if (!p || p.status !== 'sent') throw new Error('This proposal is no longer open.');
  await update('proposals', p.id, { status: 'declined', decline_reason: reason, responded_at: nowISO() });
  const lead = await getLead(p.lead_id);
  await setStage(lead, 'lost', `proposal declined: ${reason || 'no reason'}`, { lost_reason: reason || 'declined proposal', next_action_at: null });
  await addTask(lead.id, `Proposal declined by ${lead.company}: follow up personally`);
}

export async function markInvoicePaid(invoiceId, ref = 'manual') {
  const s = getSettings();
  const inv = await get(`SELECT * FROM invoices WHERE id = :invoiceId`, { invoiceId });
  if (!inv) throw new Error('Invoice not found');
  if (inv.status === 'paid') return inv;
  await update('invoices', inv.id, { status: 'paid', paid_at: nowISO(), payment_ref: ref });
  const lead = await getLead(inv.lead_id);
  await addActivity(lead.id, 'system', `Payment received: ${inv.number} ${money(inv.amount, s.billing.currency)}`, ref);
  await logEvent(lead.id, 'billing', 'paid', 'ok', `${inv.number} ref=${ref}`);
  if (inv.kind === 'advance') {
    await setStage(lead, 'onboarding', `advance ${inv.number} paid`, { next_action_at: null });
    await sendToLead(lead.id, 'onboarding');
  } else {
    await setStage(lead, 'completed', `final ${inv.number} paid`, { next_action_at: null });
    await run(`UPDATE projects SET status = 'closed' WHERE lead_id = :id`, { id: lead.id });
    await sendToLead(lead.id, 'thank_you');
  }
  return inv;
}

// ---------------------------------------------------------- project delivery

export async function submitOnboarding(leadId, brief) {
  const s = getSettings();
  const lead = await getLead(leadId);
  if (await get(`SELECT 1 FROM projects WHERE lead_id = :leadId`, { leadId })) throw new Error('Brief already submitted, thank you!');
  const projectId = await transaction(async () => {
    const pid = await insert('projects', { lead_id: leadId, brief_json: brief, status: 'active', created_at: nowISO() });
    for (const [i, name] of s.milestones.entries()) await insert('milestones', { project_id: pid, name, position: i });
    return pid;
  });
  await addActivity(leadId, 'system', 'Project brief received; project created', JSON.stringify(brief, null, 2));
  await logEvent(leadId, 'delivery', 'project', 'ok', `project #${projectId}`);
  await addTask(leadId, `Kick off ${lead.company} project (brief received)`);
  await setStage(lead, 'in_development', 'brief submitted');
  await sendToLead(leadId, 'kickoff');
}

export async function setMilestone(milestoneId, done) {
  const s = getSettings();
  const m = await get(`SELECT m.*, p.lead_id FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.id = :milestoneId`, { milestoneId });
  if (!m) throw new Error('Milestone not found');
  await update('milestones', m.id, { done: done ? 1 : 0, done_at: done ? nowISO() : null });
  if (!done) return;
  const ms = await all(`SELECT * FROM milestones WHERE project_id = :pid`, { pid: m.project_id });
  const doneCount = ms.filter((x) => x.done).length;
  const progress = `${Math.round((doneCount / ms.length) * 100)}%`;
  await logEvent(m.lead_id, 'delivery', 'milestone', 'ok', `${m.name} (${progress})`);
  await sendToLead(m.lead_id, 'milestone_update', { milestone: m.name, progress });
  if (doneCount === ms.length) {
    const lead = await getLead(m.lead_id);
    await update('projects', m.project_id, { status: 'delivered', delivered_at: nowISO() });
    const proposal = await get(`SELECT * FROM proposals WHERE lead_id = :id AND status = 'accepted' ORDER BY id DESC LIMIT 1`, { id: lead.id });
    const paid = (await get(`SELECT COALESCE(SUM(amount),0) s FROM invoices WHERE lead_id = :id AND status = 'paid'`, { id: lead.id })).s;
    const balance = Math.max(0, (proposal?.total || 0) - paid);
    if (balance > 0) {
      const inv = await createInvoice(lead.id, proposal, 'final', balance);
      await setStage(lead, 'delivered', 'all milestones complete', { next_action_at: addDays(nowISO(), s.sequence.invoice_reminder_days) });
      await sendToLead(lead.id, 'final_invoice', invoiceVars(inv));
    } else {
      await setStage(lead, 'completed', 'delivered, nothing outstanding');
      await sendToLead(lead.id, 'thank_you');
    }
  }
}

// ------------------------------------------------------------- manual moves

/** Manual stage change from the CRM (board drag & drop). Triggers the step for the new stage. */
export async function moveStage(id, stage) {
  const lead = await getLead(id);
  if (stage === 'brochure_approved') { await approveBrochure(id, 'admin (board)'); return advance(id); }
  if (stage === 'nurture' || stage === 'reengage') { await enterMarketing(lead, stage, { reason: 'moved manually' }); return advance(id); }
  const extra = {};
  if (stage === 'qualified') Object.assign(extra, { pipe: 'conversion', interested: 'yes' });
  if (CONVERSION_SEQ.has(stage)) Object.assign(extra, { next_action_type: 'message', next_action_at: addDays(nowISO(), getSettings().sequence.follow_up_1_days) });
  if (stage === 'do_not_contact') Object.assign(extra, { do_not_contact: 1, next_action_at: null });
  await setStage(lead, stage, 'moved manually', extra);
  if (stage === 'proposal_sent' && !await get(`SELECT 1 FROM proposals WHERE lead_id = :id AND status = 'sent'`, { id })) await createAndSendProposal(id);
  return advance(id);
}

// --------------------------------------------------------------- daily run

let dailyRunning = false;
export async function runPipeline(trigger = 'manual') {
  if (dailyRunning) return { skipped: 'already running' };
  dailyRunning = true;
  const s = getSettings();
  const runId = await insert('runs', { trigger, started_at: nowISO() });
  const stats = { processed: 0, moved: 0, errors: 0, sent_before: await countOut() };
  try {
    const leads = await all(`SELECT id, stage FROM leads WHERE stage IN ('new','qualified','researching','brochure_approved','contacted','follow_up_1','follow_up_2','nurture','reengage','meeting_booked','proposal_sent','won','delivered') ORDER BY score DESC, id`);
    for (const { id, stage } of leads) {
      try {
        const after = await advance(id);
        stats.processed++;
        if (after && after.stage !== stage) stats.moved++;
      } catch (e) {
        stats.errors++;
        await logEvent(id, 'pipeline', 'run', 'error', e.message);
      }
    }
    stats.sent = await countOut() - stats.sent_before;
    delete stats.sent_before;
    stats.in_window = inSendWindow(s);
    await logEvent(null, 'scheduler', trigger, stats.errors ? 'error' : 'ok', JSON.stringify(stats));
    return stats;
  } finally {
    await update('runs', runId, { finished_at: nowISO(), stats_json: stats });
    dailyRunning = false;
  }
}
const countOut = async () => (await get(`SELECT COUNT(*) n FROM messages WHERE direction='out' AND status IN ('sent','mock')`)).n;
