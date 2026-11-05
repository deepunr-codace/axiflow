import { all, update } from './db.js';
import { getSettings } from './settings.js';
import { nowISO, BASE_URL } from './util.js';
import { logEvent, addActivity } from './pipeline/log.js';

/*
 * Claude mode (owner, 2026-11-05): the three tools (pitch script, brochure, proposal) write their documents with
 * Claude Code on GitHub instead of the in-app AI. AxiFlow sends the job (prompt, schema, lead data) as a
 * repository_dispatch event; .github/workflows/claude-generate.yml runs Claude Code headless in the repo
 * (claude-worker/), which writes and validates the result and POSTs it to /webhooks/claude-result.
 * The doc stays "working" until then; the result goes through the same post-processing and layout as the
 * in-app path, then the usual CRM writes (announce) and follow-ups run.
 * No in-app fallback (owner's choice): a missing answer is retried, then the doc shows an error to retry by hand.
 */
const EVENT = 'axiflow-generate';

/** What is still needed before Claude mode can be switched on. */
export function claudeMissing() {
  const s = getSettings();
  const m = [];
  if (!process.env.GITHUB_DISPATCH_TOKEN) m.push('GITHUB_DISPATCH_TOKEN (GitHub token that may start the workflow)');
  if (!process.env.CLAUDE_WORKER_SECRET) m.push('CLAUDE_WORKER_SECRET (shared secret for the result callback)');
  if (!/^[\w.-]+\/[\w.-]+$/.test(s.claude?.github_repo || '')) m.push('the GitHub repo (Tool settings → Claude)');
  if (!/^https:/.test(BASE_URL)) m.push('an https BASE_URL (GitHub must reach the callback; the live site has one)');
  return m;
}
export const claudeOn = (s = getSettings()) => !!s.claude?.mode && !claudeMissing().length;

async function dispatch(doc, claude) {
  const s = getSettings();
  const repo = s.claude.github_repo;
  const r = await fetch(`${(process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '')}/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'AxiFlow' },
    body: JSON.stringify({ event_type: EVENT, client_payload: { doc_id: doc.id, token: doc.token, kind: claude.job.kind, job: claude.job, callback: `${BASE_URL}/webhooks/claude-result` } }),
    signal: AbortSignal.timeout(20000),
  });
  if (r.status !== 204) throw new Error(`GitHub dispatch failed (${r.status}): ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return `https://github.com/${repo}/actions/workflows/claude-generate.yml`;
}

/**
 * Sends a document's job to Claude Code. ctx = what the post-processing needs later (audit, brief, design…).
 * Records the attempt on the doc (input.claude); a failed dispatch is retried by retryStale().
 */
export async function dispatchJob(doc, job, ctx = {}, { attempt = 1 } = {}) {
  const claude = { waiting: true, job, ctx, attempts: attempt, dispatched_at: nowISO(), last_error: null, run_url: null };
  try { claude.run_url = await dispatch(doc, claude); } catch (e) { claude.last_error = e.message; }
  await saveClaude(doc.id, { ...doc.input, claude });
  await logEvent(doc.lead_id ?? null, 'claude', job.kind, claude.last_error ? 'error' : 'ok', claude.last_error || `doc #${doc.id} sent to Claude Code (try ${attempt})`);
  return claude;
}
const saveClaude = (id, input) => update('docs', id, { input_json: input, updated_at: nowISO() });

/** POST /webhooks/claude-result body → the finished document. Returns an HTTP-ish { status, error? }. */
export async function acceptResult(body) {
  const tools = await import('./tools.js');
  const doc = await tools.getDoc(Number(body?.doc_id));
  if (!doc || !body?.token || body.token !== doc.token) return { status: 404, error: 'Unknown document' };
  const c = doc.input?.claude;
  if (doc.status !== 'working' || !c?.waiting) return { status: 409, error: 'This document is not waiting for Claude' };
  if (body.run_url) c.run_url = String(body.run_url).slice(0, 300);
  if (body.error || !body.output) return retry(doc, String(body.error || 'Claude returned no result').slice(0, 300));
  try {
    const { content, source } = await postProcess(doc, body.output);
    const input = { ...doc.input, claude: { ...c, waiting: false, job: undefined, done: nowISO(), last_error: null } };
    await saveClaude(doc.id, input);
    await tools.completeDoc(doc.id, { content, source });
    await afterReady(await tools.getDoc(doc.id));
    return { status: 200 };
  } catch (e) {
    return retry(doc, `Claude's result could not be used: ${e.message}`.slice(0, 300));
  }
}

/** The same post-processing as the in-app path, per kind. */
async function postProcess(doc, output) {
  const { kind, ctx } = { kind: doc.input.claude.job.kind, ctx: doc.input.claude.ctx || {} };
  if (kind === 'script') return { content: (await import('./ai/script.js')).postScript(output, doc.input, ctx.audit || null), source: 'claude' };
  if (kind === 'proposal') return { content: (await import('./ai/proposal-doc.js')).postProposal(output, doc.input, doc.items || []), source: 'claude' };
  if (kind === 'brochure') return { content: (await import('./ai/brochure.js')).postBrochure(output, doc.input, doc.input.services || []), source: 'claude' };
  if (kind === 'deck') {
    const r = (await import('./ai/brochure-deck.js')).postDeck(output, ctx.brief);
    return { content: { deck: { design: ctx.design, data: r.data, concept: r.concept, issues: r.issues, removed: r.removed, engine: 'claude_code' } }, source: 'claude' };
  }
  throw new Error(`unknown job kind ${kind}`);
}

/** A failed answer: send the job again right away while tries are left, else give up with a visible error. */
async function retry(doc, why) {
  const s = getSettings();
  const c = doc.input.claude;
  if ((c.attempts || 1) >= (s.claude?.max_attempts || 3)) {
    await giveUp(doc, why);
    return { status: 200, error: why };
  }
  await dispatchJob(doc, c.job, c.ctx, { attempt: (c.attempts || 1) + 1 });
  return { status: 200, error: why };
}
async function giveUp(doc, why) {
  const c = doc.input.claude;
  await update('docs', doc.id, { status: 'error', error: `Claude did not finish it (${c.attempts || 1} tries): ${why}`.slice(0, 500), input_json: { ...doc.input, claude: { ...c, waiting: false, last_error: why } }, updated_at: nowISO() });
  await logEvent(doc.lead_id ?? null, 'claude', c.job?.kind || doc.kind, 'error', `doc #${doc.id}: ${why}`);
}

/** Cron / every request: re-send jobs Claude has not answered in time; give up after the last try. */
let lastSweep = 0;
export async function retryStale({ force = false } = {}) {
  if (!force && Date.now() - lastSweep < 60000) return 0;
  lastSweep = Date.now();
  const s = getSettings();
  const limit = (s.claude?.timeout_minutes || 20) * 60000;
  let n = 0;
  const tools = await import('./tools.js');
  for (const { id } of await all(`SELECT id FROM docs WHERE status = 'working' AND input_json LIKE '%"waiting":true%'`)) {
    const doc = await tools.getDoc(id);
    const c = doc?.input?.claude;
    if (!c?.waiting) continue;
    const late = Date.now() - new Date(c.dispatched_at).getTime() > limit;
    if (!late && !c.last_error) continue; // still within its time and the dispatch worked
    if (c.last_error && !late && Date.now() - new Date(c.dispatched_at).getTime() < 120000) continue; // a failed dispatch: wait 2 min before trying again
    if ((c.attempts || 1) >= (s.claude?.max_attempts || 3)) await giveUp(doc, c.last_error || `no answer within ${s.claude?.timeout_minutes || 20} minutes`);
    else await dispatchJob(doc, c.job, c.ctx, { attempt: (c.attempts || 1) + 1 });
    n++;
  }
  return n;
}

/** Follow-ups the automatic callers run right after an in-app document; for Claude they run when the result arrives. */
async function afterReady(doc) {
  if (!doc?.lead_id || doc.input?.auto !== true) return;
  const tools = await import('./tools.js');
  try {
    if (doc.kind === 'script') {
      await tools.useScriptForLead(doc.id); // pitch point + script note → CRM (outbox)
      await logEvent(doc.lead_id, 'tools', 'pitch_script', 'ok', `#${doc.id} written by Claude Code`);
    } else if (doc.kind === 'brochure') {
      await addActivity(doc.lead_id, 'system', 'Designed brochure ready (Claude Code); the intro will attach it');
    } else if (doc.kind === 'proposal') {
      const engine = await import('./pipeline/engine.js');
      await engine.proposalDocReady(doc.lead_id, doc, 'written by Claude Code');
    }
  } catch (e) { await logEvent(doc.lead_id, 'claude', 'after_ready', 'error', e.message); }
}

/** For the UI: is this doc waiting for Claude, and how far along. */
export const claudeState = (input) => {
  const c = input?.claude;
  if (!c) return null;
  return { waiting: !!c.waiting, attempts: c.attempts || 1, run_url: c.run_url || null, last_error: c.last_error || null, done: c.done || null };
};
