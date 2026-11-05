import crypto from 'node:crypto';
import { addColumns, get, all, run, update } from './db.js';
import { getSettings, getState, setState } from './settings.js';
import { nowISO, BASE_URL } from './util.js';
import { addActivity, addTask, logEvent } from './pipeline/log.js';
import { TERMINAL } from './stages.js';

/*
 * Team CRM connector: Atomic CRM (Marmelab) on its own Supabase project.
 *
 *   CRM → AxiFlow (pollCrm, every `atomic.poll_seconds`, on app use, plus POST /webhooks/atomic)
 *     - every CRM lead becomes an AxiFlow lead: a company with its main contact (external_id
 *       "atomic:co:<company id>"), or a contact without a company ("atomic:ct:<contact id>"), with its
 *       current deal (the open one, else the latest); later edits in the CRM update the lead
 *     - a lead without a deal runs `atomic.new_lead_action` (default: interested → pitch, script, brochure);
 *       a deal-stage move runs the action set for that stage in `atomic.stages`
 *     - leads whose deal was already won or lost are imported as history (no automation)
 *       (interested → pitch maker, proposal → designed proposal, won, lost, nurture, not_interested, ignore)
 *     - the telecaller's call result on the contact (last_outcome / last_attempt_at) is logged as a call
 *     - brochure requests (CRM table `brochures`, status pending) get the lead's brochure link
 *   AxiFlow → CRM (crm_outbox rows with target 'atomic', see pushEvent)
 *     - call script → deal note + company.pitch_point; brochure → `brochures` row + deal note;
 *       call requests → CRM task on the contact; replies, meetings, proposals, won/lost → deal notes;
 *       proposal sent / won / lost → deal stage and amount (`atomic.write_stages`)
 *
 * Every pull is idempotent: the last stage and call result seen are kept on the lead
 * (crm_stage_key, crm_call_key), so our own writes coming back are not acted on twice.
 * Needs CRM_SUPABASE_URL + CRM_SUPABASE_SECRET_KEY (server only; the key bypasses row security).
 */

addColumns('leads', { crm_deal_id: 'INTEGER', crm_company_id: 'INTEGER', crm_contact_id: 'INTEGER', crm_sales_id: 'INTEGER', crm_stage_key: 'TEXT', crm_sync_hash: 'TEXT' });
addColumns('crm_outbox', { target: "TEXT DEFAULT 'webhook'" });
addColumns('leads', { crm_script_note_id: 'INTEGER', crm_script_note_on: 'TEXT' }); // the one CRM note that holds this lead's call script
addColumns('leads', { crm_removed_at: 'TEXT', crm_brochure_folder: 'TEXT' });
addColumns('leads', { crm_brochure_state: 'TEXT', crm_proposal_state: 'TEXT' });
addColumns('leads', { crm_lead_stage: 'TEXT' }); // last contacts.lead_stage seen (the telecaller's call stage) // last brochure/proposal status seen in or written to the CRM // set when the lead was deleted in the CRM: no more CRM writes for it

export const ACTIONS = ['script', 'interested', 'proposal', 'won', 'lost', 'nurture', 'not_interested', 'ignore'];

const conf = () => ({ url: (process.env.CRM_SUPABASE_URL || '').replace(/\/+$/, ''), key: process.env.CRM_SUPABASE_SECRET_KEY || process.env.CRM_SUPABASE_SERVICE_KEY || '' });
export const atomicKeys = () => !!(conf().url && conf().key);
export const atomicConfigured = () => atomicKeys() && getSettings().atomic?.enabled !== false;
export const crmHost = () => { try { return new URL(conf().url).host; } catch { return null; } };

export const readOnly = () => getSettings().atomic?.read_only !== false;
/**
 * What AxiFlow may write while read-only is on (owner, 2026-11-04): whole tables ("brochures")
 * or single columns ("companies.pitch_point"). Read-only off = everything.
 */
export const writeTables = () => (readOnly() ? getSettings().atomic?.write_tables || [] : ['*']);
export function canWrite(table, cols) {
  const w = writeTables();
  if (w.includes('*') || w.includes(table)) return true;
  return !!cols?.length && cols.every((c) => w.includes(`${table}.${c}`));
}
const BROCHURE_EVENTS = new Set(['lead.brochure_ready', 'lead.pitch_ready']);
const SCRIPT_EVENTS = new Set(['lead.script_ready', 'lead.script_updated']);
const canWriteScript = () => canWrite('contact_notes') || canWrite('deal_notes');
/** Whether an outbox event can be written to the CRM with the current settings. */
export const canPush = (event) => !readOnly()
  || (BROCHURE_EVENTS.has(event) && canWrite('brochures'))
  || (event === 'lead.proposal_ready' && canWrite(getSettings().atomic?.proposals_table || 'proposal'))
  || (SCRIPT_EVENTS.has(event) && (canWriteScript() || canWrite('companies', ['pitch_point'])));
const tableOf = (path) => String(path).split(/[?/]/)[0];

export async function rest(method, path, body, prefer) {
  const { url, key } = conf();
  // Read-only mode (the default): nothing but GET reaches the CRM, except tables in atomic.write_tables.
  const cols = method === 'PATCH' && body && typeof body === 'object' ? Object.keys(body) : null; // inserts need the whole table
  if (method !== 'GET' && !canWrite(tableOf(path), cols)) throw new Error(`CRM is in read-only mode (${tableOf(path)}${cols ? `: ${cols.join(', ')}` : ''})`);
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (!r.ok) { let m = text; try { const j = JSON.parse(text); m = [j.message, j.details, j.hint].filter(Boolean).join(" | "); } catch { /* not JSON */ } throw new Error(`CRM ${method} ${path.split("?")[0]}: HTTP ${r.status} ${m.slice(0, 400)}`); }
  return text ? JSON.parse(text) : null;
}
export const inList = (ids) => `in.(${[...new Set(ids.filter((x) => x != null))].join(',')})`;
async function byIds(table, ids) {
  const out = new Map();
  const list = [...new Set(ids.filter((x) => x != null))];
  for (let i = 0; i < list.length; i += 150) {
    for (const r of await rest('GET', `${table}?select=*&id=${inList(list.slice(i, i + 150))}`)) out.set(r.id, r);
  }
  return out;
}

// ------------------------------------------------------------------ CRM → AxiFlow

export const firstOf = (arr, k) => (Array.isArray(arr) ? arr.map((x) => (typeof x === 'string' ? x : x?.[k])).find(Boolean) : undefined);

const mainContact = (list) => list.find((c) => c.is_primary) || list[0] || null;
const CLOSED_ACTIONS = ['won', 'lost'];
const isClosed = (deal, s) => !!deal && (!!deal.archived_at || CLOSED_ACTIONS.includes(actionFor(deal.stage, s)));
/** The deal that drives a lead: the newest open one, else the newest. */
const currentDeal = (deals, s) => deals.find((d) => !isClosed(d, s)) || deals[0] || null;
export const leadKey = (co, ct) => (co ? `atomic:co:${co.id}` : `atomic:ct:${ct.id}`);

/** Lead fields from a CRM company, its main contact and its current deal (both may be missing). */
export function dealInput(deal, co, ct, s = getSettings().atomic) {
  const name = [ct?.first_name, ct?.last_name].filter(Boolean).join(' ').trim();
  const input = {
    external_id: leadKey(co, ct), source: 'crm',
    company: co?.name || deal?.name || name || 'Unnamed lead',
    contact_name: name || undefined,
    email: firstOf(ct?.email_jsonb, 'email') || co?.email || undefined,
    phone: ct?.whatsapp_number || ct?.phone_e164 || firstOf(ct?.phone_jsonb, 'number') || co?.whatsapp_number || co?.phone_number || undefined,
    website: co?.website || undefined,
    city: co?.city || undefined,
    industry: co?.sector || undefined,
    budget: deal?.amount || undefined,
    notes: deal?.description || co?.description || undefined,
    do_not_contact: ct?.do_not_contact ? true : undefined,
  };
  if (s.deal_means_consent && deal && !isClosed(deal, s)) Object.assign(input, { wa_opt_in: true, email_opt_in: true, consent_source: 'CRM deal opened by the telecaller' });
  for (const k of Object.keys(input)) if (input[k] === undefined || input[k] === null || input[k] === '') delete input[k];
  return input;
}

const actionFor = (stage, s = getSettings().atomic) => (s.stages || {})[stage] || null;
const hashOf = (deal, co, ct) => crypto.createHash('sha1').update(JSON.stringify([
  deal && [deal.id, deal.name, deal.stage, deal.amount, deal.description, deal.archived_at],
  co && [co.name, co.website, co.city, co.sector, co.email, co.phone_number, co.whatsapp_number, co.description],
  ct && [ct.id, ct.first_name, ct.last_name, ct.email_jsonb, ct.phone_jsonb, ct.whatsapp_number, ct.phone_e164, ct.do_not_contact, ct.last_outcome, ct.last_attempt_at, ct.lead_stage],
])).digest('hex').slice(0, 16);

/**
 * Applies one CRM lead (company and/or main contact, with its current deal) to AxiFlow.
 * Returns what happened: created | linked | history | updated | unchanged | deferred.
 */
export async function syncLead(co, ct, deal, { engine, twenty, budget, useCallLogs = false }) {
  const s = getSettings().atomic;
  const ext = leadKey(co, ct);
  const lead = await get(`SELECT * FROM leads WHERE external_id = :ext`, { ext });
  const hash = hashOf(deal, co, ct);
  if (lead && lead.crm_sync_hash === hash) return 'unchanged';
  const links = { crm_deal_id: deal?.id ?? null, crm_company_id: co?.id ?? null, crm_contact_id: ct?.id ?? null, crm_sales_id: deal?.sales_id ?? co?.sales_id ?? ct?.sales_id ?? null };
  const input = dealInput(deal, co, ct, s);
  const stageKey = deal ? deal.stage : '';
  const leadStageAction = ct?.lead_stage ? (s.lead_stages || {})[ct.lead_stage] || null : null;
  const action = deal ? actionFor(deal.stage, s) || leadStageAction : leadStageAction || s.new_lead_action || 'script';
  const callKey = ct?.last_outcome ? [ct.last_outcome, ct.last_attempt_at || ''].join('|') : null;

  if (!lead) {
    if (budget.left <= 0) return 'deferred'; // big imports are spread over several polls
    budget.left--;
    const label = deal ? `CRM deal "${deal.stage}"` : 'CRM lead without a deal';
    if (isClosed(deal, s)) {
      // Won or lost before AxiFlow saw it: keep it as history so the tools can still use it.
      const r = await engine.createLead({ ...input, interested: deal.stage === 'won' || action === 'won' ? 'yes' : 'no' }, { source: 'crm', autoRun: false });
      const stage = action === 'won' && !deal.archived_at ? 'won' : 'lost';
      await update('leads', r.id, { ...links, stage, stage_changed_at: nowISO(), crm_stage_key: stageKey, crm_call_key: callKey, crm_sync_hash: hash });
      await addActivity(r.id, 'system', `Imported from the CRM as ${stage === 'won' ? 'won' : 'closed'} (${label}); no automation`);
      await logEvent(r.id, 'atomic', 'lead', 'ok', `imported as history from ${ext} (${label})`);
      return 'history';
    }
    if (action === 'script' || action === 'ignore') {
      // A new lead: only the call script for the telecaller's first call (pitch point + script note go to the CRM).
      // The brochure comes when the lead turns interested.
      const r = await engine.createLead({ ...input, interested: 'unknown' }, { source: 'crm', autoRun: false });
      await update('leads', r.id, { ...links, crm_stage_key: stageKey, crm_lead_stage: ct?.lead_stage || null, crm_call_key: callKey, crm_sync_hash: hash, ...(r.duplicate ? {} : { stage: 'prepared', stage_changed_at: nowISO() }) });
      await logEvent(r.id, 'atomic', 'lead', 'ok', `${r.duplicate ? 'linked to existing lead' : 'created'} from ${ext} (${label}): call script only`);
      if (!r.duplicate) {
        await addActivity(r.id, 'system', 'New lead from the CRM: writing the call script (the brochure follows when the lead is interested)');
        const { background } = await import('./background.js');
        background(() => prepareScript(r.id), 'crm-script');
      }
      return r.duplicate ? 'linked' : 'created';
    }
    const interested = action === 'nurture' ? 'unknown' : action === 'not_interested' ? 'no' : 'yes';
    const r = await engine.createLead({ ...input, interested }, { source: 'crm' });
    await update('leads', r.id, { ...links, crm_stage_key: stageKey, crm_lead_stage: ct?.lead_stage || null, crm_call_key: callKey, crm_sync_hash: hash });
    await logEvent(r.id, 'atomic', 'lead', 'ok', `${r.duplicate ? 'linked to existing lead' : 'created'} from ${ext} (${label})`);
    if (r.duplicate && interested !== 'unknown') await engine.applyInterestChange(r.id, interested, label);
    if (action === 'proposal') await runAction(r.id, 'proposal', stageKey, engine);
    return r.duplicate ? 'linked' : 'created';
  }

  await twenty.applyCrmUpdate(lead, input, 'the CRM');
  await update('leads', lead.id, { ...links, crm_sync_hash: hash, ...(lead.crm_removed_at ? { crm_removed_at: null } : {}) });
  // A contact or deal added in the CRM later: attach the call script there and link the brochure row to it.
  if ((links.crm_contact_id && links.crm_contact_id !== lead.crm_contact_id) || (links.crm_deal_id && !lead.crm_deal_id)) {
    const { crmEvent } = await import('./crm-sync.js');
    if (await get(`SELECT 1 AS one FROM docs WHERE lead_id = :id AND kind = 'script' AND status = 'ready'`, { id: lead.id })) await crmEvent(lead.id, 'lead.script_ready', { reason: 'contact or deal added in the CRM' });
    if (await get(`SELECT 1 AS one FROM docs WHERE lead_id = :id AND kind = 'brochure' AND status = 'ready'`, { id: lead.id })) await crmEvent(lead.id, 'lead.brochure_ready', { reason: 'contact or deal added in the CRM' });
  }

  if ((ct?.lead_stage || null) !== (lead.crm_lead_stage || null)) {
    await update('leads', lead.id, { crm_lead_stage: ct?.lead_stage || null });
    if (ct?.lead_stage) {
      await logEvent(lead.id, 'atomic', 'lead_stage', 'ok', `CRM call stage is "${ct.lead_stage}"${leadStageAction ? ` → ${leadStageAction}` : ' (no action set)'}`);
      if (leadStageAction) await runAction(lead.id, leadStageAction, ct.lead_stage, engine);
    }
  }
  if (stageKey !== (lead.crm_stage_key || '') || (deal && deal.id !== lead.crm_deal_id)) {
    await update('leads', lead.id, { crm_stage_key: stageKey });
    if (deal) {
      await logEvent(lead.id, 'atomic', 'stage', 'ok', `CRM deal "${deal.name || deal.id}" is "${deal.stage}"${action ? ` → ${action}` : ' (no action set)'}`);
      if (action) await runAction(lead.id, action, deal.stage, engine);
    }
  }

  // The telecaller's latest call result on the contact (only when the CRM has no call_logs table: those are read one by one).
  if (!useCallLogs && callKey && callKey !== lead.crm_call_key) {
    await update('leads', lead.id, { crm_call_key: callKey });
    const outcome = twenty.mapOutcome(ct.last_outcome);
    if (engine.CALL_OUTCOMES.includes(outcome)) await crmCall(engine, lead.id, outcome, { notes: 'From the CRM', callbackAt: ct.next_attempt_at || null });
    else await logEvent(lead.id, 'atomic', 'call_outcome', 'skipped', `unknown call result "${ct.last_outcome}"`);
  }
  return 'updated';
}

/** Writes the call script for a new CRM lead and sends its pitch point + script note to the CRM. */
export async function prepareScript(leadId) {
  const tools = await import('./tools.js');
  try {
    const d = await tools.createDocForLead('script', leadId);
    if (d.status !== 'ready') throw new Error(d.error || 'script not ready');
    await tools.useScriptForLead(d.id); // pitch point + script note → CRM (outbox)
    await logEvent(leadId, 'atomic', 'script', 'ok', `call script #${d.id} ready for the telecaller`);
  } catch (e) { await logEvent(leadId, 'atomic', 'script', 'error', e.message); }
}

/** A telecaller call from the CRM. "Interested" on a lead that only has its call script starts the full pitch. */
async function crmCall(engine, leadId, outcome, opts) {
  const lead = await engine.getLead(leadId);
  if (lead?.stage === 'prepared' && ['interested', 'meeting_booked'].includes(outcome)) {
    await addActivity(leadId, 'call', `Call from the CRM: ${outcome.replace(/_/g, ' ')}`, opts.notes || null);
    await engine.applyInterestChange(leadId, 'yes', `${outcome.replace(/_/g, ' ')} on a call (CRM)`);
    return;
  }
  return engine.logCrmCall(leadId, outcome, opts);
}

async function runAction(leadId, action, stage, engine) {
  const reason = `CRM deal moved to "${stage}"`;
  const lead = await engine.getLead(leadId);
  if (!lead) return;
  switch (action) {
    case 'script': return;
    case 'interested': return engine.applyInterestChange(leadId, 'yes', reason);
    case 'nurture': return engine.applyInterestChange(leadId, 'unknown', reason);
    case 'not_interested': return engine.applyInterestChange(leadId, 'no', reason);
    case 'proposal': {
      if (await get(`SELECT 1 FROM proposals WHERE lead_id = :leadId AND status IN ('sent','accepted')`, { leadId })) return;
      if (await get(`SELECT 1 FROM docs WHERE kind = 'proposal' AND lead_id = :leadId AND status IN ('ready','working')`, { leadId })) return;
      return engine.startProposal(leadId, reason);
    }
    case 'won': {
      if (await get(`SELECT 1 FROM proposals WHERE lead_id = :leadId AND status = 'sent'`, { leadId })) return engine.decideProposal(leadId, 'accepted', { by: 'the CRM' });
      if (['won', 'onboarding', 'in_development', 'delivered', 'completed'].includes(lead.stage)) return;
      await addTask(leadId, `Deal marked won in the CRM: send ${lead.company} the proposal so the advance invoice goes out`);
      return addActivity(leadId, 'system', 'Deal marked won in the CRM (no proposal sent from AxiFlow yet)');
    }
    case 'lost':
      if (TERMINAL.has(lead.stage) || ['won', 'onboarding', 'in_development', 'delivered'].includes(lead.stage)) return;
      return engine.setStage(lead, 'lost', reason, { lost_reason: 'marked lost in the CRM', next_action_at: null, next_action_type: null });
    default: return;
  }
}

let polling = false;
let pollAgain = false; // a CRM change came in while a read was running: read once more afterwards
/** Reads the CRM and applies changes. Throttled by `atomic.poll_seconds` unless forced. */
export async function pollCrm(opts = {}) {
  const out = await pollOnce(opts);
  while (pollAgain) { pollAgain = false; await pollOnce({ force: true }); }
  return out;
}

async function pollOnce({ force = false } = {}) {
  if (!atomicConfigured()) return { skipped: 'CRM not connected' };
  const s = getSettings().atomic;
  const st = await getState('atomic', {});
  if (!force && st.last_poll_at && Date.now() - Date.parse(st.last_poll_at) < (s.poll_seconds || 60) * 1000) return { skipped: 'polled recently' };
  if (polling) { if (force) pollAgain = true; return { skipped: 'already running' }; }
  polling = true;
  const [engine, twenty, tools] = await Promise.all([import('./pipeline/engine.js'), import('./twenty.js'), import('./tools.js')]);
  const out = { at: nowISO(), leads: 0, deals: 0, created: 0, linked: 0, history: 0, updated: 0, unchanged: 0, deferred: 0, errors: [] };
  const stages = {};
  let cursor = st.call_log_cursor ?? null;
  try {
    const readAll = async (path) => {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const page = await rest('GET', `${path}&offset=${from}&limit=1000`);
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    };
    const [companies, contacts, deals] = await Promise.all([
      readAll('companies?select=*&order=id.asc'),
      readAll('contacts?select=*&order=id.asc'),
      readAll('deals?select=id,name,company_id,contact_ids,stage,description,amount,sales_id,archived_at,updated_at&order=updated_at.desc'),
    ]);
    out.deals = deals.length;
    for (const d of deals) stages[d.stage] = (stages[d.stage] || 0) + 1;
    const byCo = new Map();
    const loose = [];
    for (const c of contacts) {
      if (c.company_id == null) { loose.push(c); continue; }
      if (!byCo.has(c.company_id)) byCo.set(c.company_id, []);
      byCo.get(c.company_id).push(c);
    }
    const units = [
      ...companies.map((co) => ({ co, ct: mainContact(byCo.get(co.id) || []), deals: deals.filter((d) => d.company_id === co.id) })),
      ...loose.map((ct) => ({ co: null, ct, deals: deals.filter((d) => d.company_id == null && (d.contact_ids || []).includes(ct.id)) })),
    ];
    out.leads = units.length;
    // Leads deleted in the CRM: stop writing for them and take open ones out of the pipeline.
    if (units.length) {
      const keys = new Set(units.map((u) => leadKey(u.co, u.ct)));
      for (const l of await all(`SELECT * FROM leads WHERE external_id LIKE 'atomic:%' AND crm_removed_at IS NULL`)) {
        if (keys.has(l.external_id) || !/^atomic:(co|ct):\d+$/.test(l.external_id)) continue;
        await update('leads', l.id, { crm_removed_at: nowISO() });
        await logEvent(l.id, 'atomic', 'lead', 'ok', `${l.external_id} is no longer in the CRM (deleted there)`);
        if (!TERMINAL.has(l.stage) && !['won', 'onboarding', 'in_development', 'delivered'].includes(l.stage)) {
          await engine.setStage(l, 'lost', 'removed from the CRM', { lost_reason: 'deleted in the CRM', next_action_at: null, next_action_type: null });
        } else await addActivity(l.id, 'system', 'This lead was deleted in the CRM; AxiFlow no longer writes to the CRM for it');
        await run(`UPDATE crm_outbox SET status = 'skipped', last_error = 'lead deleted in the CRM' WHERE lead_id = :id AND target = 'atomic' AND status = 'pending'`, { id: l.id });
        out.removed = (out.removed || 0) + 1;
      }
    }
    // Call logs: read before the leads so the contact's "latest outcome" is not counted a second time.
    let callLogs = null;
    if (s.call_logs !== false) callLogs = await readAll(`call_logs?select=*&id=gt.${Number(st.call_log_cursor) || 0}&order=id.asc`).catch(() => null);
    const budget = { left: s.import_per_poll || 20 };
    for (const u of units) {
      const ref = u.co ? `company #${u.co.id}` : `contact #${u.ct.id}`;
      try {
        const r = await syncLead(u.co, u.ct, currentDeal(u.deals, s), { engine, twenty, budget, useCallLogs: !!callLogs });
        out[r] = (out[r] || 0) + 1;
      } catch (e) {
        out.errors.push(`${ref}: ${e.message}`);
        await logEvent(null, 'atomic', 'lead', 'error', `${ref}: ${e.message}`);
      }
    }
    if (callLogs) {
      // The cursor only moves forward; after the first successful read it is a number (0 = no calls yet),
      // so a first real call later is acted on, not filed as history.
      const moved = await applyCallLogs(callLogs, contacts, { engine, first: st.call_log_cursor == null }).catch((e) => { out.errors.push(`call logs: ${e.message}`); return null; });
      cursor = Math.max(Number(cursor) || 0, Number(moved) || 0);
    }
    out.calls = callLogs?.length || 0;
    if (s.crm_approval !== false) out.approvals = await applyApprovals({ engine, tools }).catch((e) => { out.errors.push(`approvals: ${e.message}`); return 0; });
    if (s.brochures_table && canWrite('brochures') && publicLinks()) out.brochures = await answerBrochureRequests(tools).catch((e) => { out.errors.push(`brochures: ${e.message}`); return 0; });
  } catch (e) {
    out.errors.push(e.message);
    await logEvent(null, 'atomic', 'poll', 'error', e.message);
  } finally {
    polling = false;
    await setState('atomic', { ...st, call_log_cursor: cursor, last_poll_at: nowISO(), last_result: { ...out, errors: out.errors.slice(0, 10) }, stages_seen: Object.keys(stages).length || !out.errors.length ? stages : st.stages_seen });
  }
  return out;
}

/** The AxiFlow lead for a CRM contact: its own lead, else its company's. */
async function leadForContact(contactId, contacts) {
  const ct = contacts.find((c) => c.id === contactId);
  return (await get(`SELECT * FROM leads WHERE crm_removed_at IS NULL AND (external_id = :ct OR crm_contact_id = :id) ORDER BY id DESC LIMIT 1`, { ct: `atomic:ct:${contactId}`, id: contactId }))
    || (ct?.company_id != null && await get(`SELECT * FROM leads WHERE external_id = :ext AND crm_removed_at IS NULL`, { ext: `atomic:co:${ct.company_id}` }))
    || null;
}

/**
 * Every telecaller call in the CRM (call_logs) becomes a call on the AxiFlow lead, with its notes, and the
 * pipeline reacts to the outcome. The first time, earlier calls are only added to the history (no actions).
 * Returns the new cursor (highest call log id handled).
 */
async function applyCallLogs(rows, contacts, { engine, first }) {
  const twenty = await import('./twenty.js');
  let cursor = null;
  for (const c of rows) {
    const lead = await leadForContact(c.contact_id, contacts);
    if (!lead) {
      // Wait only while the contact's lead is still to be imported (big imports are spread over polls);
      // a deleted contact or a lead removed from the CRM must not hold up later calls.
      const ct = contacts.find((x) => x.id === c.contact_id);
      const known = ct && await get(`SELECT 1 AS one FROM leads WHERE external_id = :a OR external_id = :b OR crm_contact_id = :id`, { a: `atomic:ct:${ct.id}`, b: `atomic:co:${ct.company_id}`, id: ct.id });
      if (!first && ct && !known) break;
      cursor = c.id;
      continue;
    }
    const outcome = twenty.mapOutcome(c.outcome);
    const when = c.created_at ? new Date(c.created_at).toISOString().slice(0, 16).replace('T', ' ') : '';
    if (first) await addActivity(lead.id, 'call', `Call from the CRM (${when}): ${String(c.outcome || '').replace(/_/g, ' ')}`, c.notes || null);
    else if (engine.CALL_OUTCOMES.includes(outcome)) {
      await crmCall(engine, lead.id, outcome, { notes: c.notes || 'From the CRM', callbackAt: c.next_attempt_at || null });
      await logEvent(lead.id, 'atomic', 'call_log', 'ok', `CRM call #${c.id}: ${outcome}`);
    } else await logEvent(lead.id, 'atomic', 'call_log', 'skipped', `CRM call #${c.id}: unknown result "${c.outcome}"`);
    cursor = c.id;
  }
  return cursor;
}

/**
 * Approval in the CRM: brochures / proposal rows set to "approved" approve the pitch / send the proposal;
 * "not_approved" makes a new version (written back as pending). A row seen for the first time is only recorded.
 */
async function applyApprovals({ engine, tools }) {
  const s = getSettings().atomic || {};
  const { background } = await import('./background.js');
  let n = 0;
  const kinds = [
    { table: 'brochures', col: 'crm_brochure_state', kind: 'brochure' },
    { table: s.proposals_table || 'proposal', col: 'crm_proposal_state', kind: 'proposal' },
  ];
  for (const k of kinds) {
    const rows = await rest('GET', `${k.table}?select=id,company_id,contact_id,status&order=id.desc`).catch(() => []);
    const seen = new Set();
    for (const r of rows) {
      const key = r.company_id != null ? `atomic:co:${r.company_id}` : r.contact_id != null ? `atomic:ct:${r.contact_id}` : null;
      if (!key || seen.has(key)) continue; // newest row per lead
      seen.add(key);
      const lead = await get(`SELECT * FROM leads WHERE external_id = :key AND crm_removed_at IS NULL`, { key });
      if (!lead || lead[k.col] === r.status) continue;
      await update('leads', lead.id, { [k.col]: r.status });
      if (lead[k.col] == null) continue; // first sight: remember only
      n++;
      await logEvent(lead.id, 'atomic', `${k.kind}_status`, 'ok', `${k.kind} marked "${r.status}" in the CRM`);
      if (k.kind === 'brochure' && r.status === 'approved') {
        if (lead.stage === 'brochure_ready') await engine.approveBrochure(lead.id, 'the CRM');
        else await addActivity(lead.id, 'system', 'Brochure approved in the CRM');
      } else if (k.kind === 'proposal' && r.status === 'approved') {
        const doc = await tools.latestLeadDoc('proposal', lead.id);
        const sent = doc && await get(`SELECT 1 AS one FROM proposals WHERE doc_id = :id`, { id: doc.id });
        if (doc && !sent) await engine.sendProposalDoc(lead.id, doc.id);
        else await addActivity(lead.id, 'system', 'Proposal approved in the CRM');
      } else if (r.status === 'not_approved') {
        await addActivity(lead.id, 'system', `${k.kind === 'brochure' ? 'Brochure' : 'Proposal'} not approved in the CRM: making a new version`);
        background(() => tools.createDocForLead(k.kind, lead.id).catch((e) => logEvent(lead.id, 'atomic', `${k.kind}_redo`, 'error', e.message)), 'crm-redo');
      }
    }
  }
  return n;
}

/** Brochure requests made in the CRM (a pending row without a link): fill in the lead's brochure link. */
async function answerBrochureRequests(tools) {
  const rows = await rest('GET', `brochures?select=*&status=eq.pending&brochure_url=is.null&order=id.asc&limit=20`);
  let done = 0;
  for (const b of rows) {
    const lead = (b.company_id && await get(`SELECT * FROM leads WHERE external_id = :ext`, { ext: `atomic:co:${b.company_id}` }))
      || (b.contact_id && await get(`SELECT * FROM leads WHERE external_id = :ext OR crm_contact_id = :id ORDER BY id DESC LIMIT 1`, { ext: `atomic:ct:${b.contact_id}`, id: b.contact_id }))
      || (b.deal_id && await get(`SELECT * FROM leads WHERE crm_deal_id = :id ORDER BY id DESC LIMIT 1`, { id: b.deal_id }));
    if (!lead) continue; // the deal is not synced yet; try again next time
    if (!lead.brochure_version && !(await tools.latestLeadDoc('brochure', lead.id))) {
      const d = await tools.createDocForLead('brochure', lead.id);
      await logEvent(lead.id, 'atomic', 'brochure_request', d.status === 'ready' ? 'ok' : 'error', d.error || `made #${d.id} for CRM request #${b.id}`);
      if (d.status !== 'ready') continue;
    }
    let link = brochureLink(lead);
    try { link = (await uploadBrochurePdf(lead)) || link; } catch (e) { await logEvent(lead.id, 'atomic', 'brochure_pdf', 'error', `${e.message}; the row links to AxiFlow instead`); }
    await rest('PATCH', `brochures?id=eq.${b.id}`, { brochure_url: link, title: b.title || `${lead.company}: website plan`, updated_at: nowISO() }); // stays pending until approved in the CRM
    await update('leads', lead.id, { crm_brochure_state: b.status || 'pending' });
    done++;
  }
  return done;
}

// ------------------------------------------------------------------ AxiFlow → CRM

/** The CRM's brochures.status has a check constraint: 'pending' = a request, 'approved' = brochure ready (found 2026-11-04). */
const brochureStatus = () => getSettings().atomic?.brochure_status || 'approved';
const brochureLink = (lead) => `${BASE_URL}/pdf/brochure/${lead.token}.pdf`;
/** Links written to the CRM must open for the telecaller: never a localhost address. */
export const publicLinks = () => /^https:\/\//.test(BASE_URL);
const pdf = (src, title) => ({ src, title, type: 'application/pdf' });

async function note(lead, text, attachments = []) {
  const body = { deal_id: lead.crm_deal_id, text, date: nowISO(), sales_id: lead.crm_sales_id ?? null };
  try {
    await rest('POST', 'deal_notes', attachments.length ? { ...body, attachments } : body, 'return=minimal');
  } catch (e) {
    if (!attachments.length) throw e;
    await rest('POST', 'deal_notes', { ...body, text: `${text}\n\n${attachments.map((a) => `${a.title}: ${a.src}`).join('\n')}` }, 'return=minimal');
  }
}

/** The call script as plain text for a CRM note. */
function scriptText(lead, c, pdfUrl) {
  const out = [`Call script for ${lead.company} (from AxiFlow, ${new Date().toISOString().slice(0, 10)})`];
  if (c.pitch_point) out.push(`Pitch point: ${c.pitch_point}`);
  if (c.script) out.push(`Script (word for word):\n${c.script}`);
  else if (c.introduction) out.push(`Introduction:\n${c.introduction}`);
  if (c.pitch_points?.length) out.push(`Pitching points:\n${c.pitch_points.map((p, i) => `${i + 1}. ${p.point}${p.detail ? `: ${p.detail}` : ''}`).join('\n')}`);
  if (c.questions?.length) out.push(`Questions to ask:\n${c.questions.map((q) => `- ${q}`).join('\n')}`);
  if (c.objections?.length) out.push(`If they say...\n${c.objections.map((o) => `- ${o.objection}: ${o.response}`).join('\n')}`);
  const b = c.booking || {};
  if (b.ask || b.if_yes || b.if_not_now) out.push(['Booking the meeting:', b.ask, b.if_yes && `If yes: ${b.if_yes}`, b.if_not_now && `If not now: ${b.if_not_now}`].filter(Boolean).join('\n'));
  if (pdfUrl) out.push(`PDF: ${pdfUrl}`);
  return out.join('\n\n').slice(0, 20000);
}

/** One CRM note per lead holds its latest call script: on the main contact, else on the deal. */
async function upsertScriptNote(lead) {
  const tools = await import('./tools.js');
  const doc = await tools.latestLeadDoc('script', lead.id);
  if (!doc?.content) return 'skipped';
  if (!publicLinks()) throw new Error('script notes need a public https BASE_URL'); // the live site writes it
  const on = lead.crm_contact_id && canWrite('contact_notes') ? 'contact' : lead.crm_deal_id && canWrite('deal_notes') ? 'deal' : null;
  if (!on) return 'skipped';
  const table = on === 'contact' ? 'contact_notes' : 'deal_notes';
  const pdfUrl = doc.token ? `${BASE_URL}/pdf/doc/${doc.token}.pdf` : null;
  const body = { text: scriptText(lead, doc.content, pdfUrl), date: nowISO(), ...(pdfUrl ? { attachments: [pdf(pdfUrl, `${lead.company} - call script.pdf`)] } : {}) };
  if (lead.crm_script_note_id && lead.crm_script_note_on === on) {
    const r = await rest('PATCH', `${table}?id=eq.${lead.crm_script_note_id}`, body, 'return=representation');
    if (r?.length) { await logEvent(lead.id, 'atomic', 'script_note', 'ok', `updated the call script note in the CRM (${on})`); return 'sent'; }
  }
  const row = { ...body, ...(on === 'contact' ? { contact_id: lead.crm_contact_id } : { deal_id: lead.crm_deal_id }), sales_id: lead.crm_sales_id ?? null };
  const r = await rest('POST', table, row, 'return=representation');
  await update('leads', lead.id, { crm_script_note_id: r?.[0]?.id ?? null, crm_script_note_on: on });
  await logEvent(lead.id, 'atomic', 'script_note', 'ok', `added the call script as a CRM ${on} note`);
  return 'sent';
}

/**
 * Uploads the lead's current brochure PDF to the CRM storage bucket (`atomic.brochure_bucket`, public)
 * under a fixed name per lead, so a new version replaces the old file. Returns the public link.
 */
async function uploadBrochurePdf(lead) {
  const { buildBrochureFor } = await import('./pdf/docs.js');
  return uploadPdf(lead, getSettings().atomic?.brochure_bucket, () => buildBrochureFor(lead), 'website-plan');
}

/** Uploads a PDF for a lead to a CRM bucket: <uuid per lead>/<company>-<name>.pdf, replacing an older version. */
async function uploadPdf(lead, bucket, build, name) {
  if (!bucket || !canWrite(`storage.${bucket}`)) return null;
  const pdfBuf = await build();
  const slug = String(lead.company || 'lead').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'lead';
  // Folder = a unique id per lead (owner, 2026-11-04), kept on the lead so new versions replace the old file.
  let folder = lead.crm_brochure_folder;
  if (!folder) { folder = crypto.randomUUID(); await update('leads', lead.id, { crm_brochure_folder: folder }); lead.crm_brochure_folder = folder; }
  const path = `${folder}/${slug}-${name}.pdf`;
  const { url, key } = conf();
  const r = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/pdf', 'x-upsert': 'true', 'cache-control': 'max-age=60' },
    body: pdfBuf,
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`CRM storage upload: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  await logEvent(lead.id, 'atomic', `${name}_pdf`, 'ok', `uploaded ${(pdfBuf.length / 1024).toFixed(0)} KB to the CRM bucket "${bucket}" (${path})`);
  // The plain public link of the file (owner wants exactly the bucket URL); cache-control 60 s above
  // lets a replaced version show within a minute.
  return `${url}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * The lead's proposal PDF goes to the CRM bucket `atomic.proposal_bucket` and one row per lead in the CRM
 * table `atomic.proposals_table` (`proposal`, link column `porposal_url` as spelled in the CRM).
 */
async function upsertProposal(lead, docId) {
  const s = getSettings().atomic || {};
  if (!publicLinks()) throw new Error('proposal links need a public https BASE_URL'); // the live site writes it
  const tools = await import('./tools.js');
  const doc = (docId && await tools.getDoc(docId)) || await tools.latestLeadDoc('proposal', lead.id);
  if (!doc || doc.status !== 'ready' || doc.lead_id !== lead.id) return 'skipped';
  let link = doc.token ? `${BASE_URL}/pdf/doc/${doc.token}.pdf` : null;
  try { link = (await uploadPdf(lead, s.proposal_bucket, () => tools.docPdf(doc), 'website-proposal')) || link; } catch (e) { await logEvent(lead.id, 'atomic', 'proposal_pdf', 'error', `${e.message}; the row links to AxiFlow instead`); }
  if (!link) return 'skipped';
  const table = s.proposals_table || 'proposal', col = s.proposal_url_column || 'porposal_url';
  const row = { company_id: lead.crm_company_id ?? null, contact_id: lead.crm_contact_id ?? null, deal_id: lead.crm_deal_id ?? null, title: `${lead.company}: website proposal`, [col]: link, updated_at: nowISO() };
  const where = lead.crm_company_id ? `company_id=eq.${lead.crm_company_id}` : lead.crm_contact_id ? `contact_id=eq.${lead.crm_contact_id}` : null;
  if (!where) return 'skipped';
  const existing = await rest('GET', `${table}?select=id,status&${where}&order=id.desc&limit=1`);
  const write = async (body) => (existing.length ? rest('PATCH', `${table}?id=eq.${existing[0].id}`, body, 'return=minimal') : rest('POST', table, body, 'return=minimal'));
  const status = !existing.length || existing[0].status === 'not_approved' ? s.proposal_status || 'pending' : existing[0].status;
  try { await write({ ...row, status }); }
  catch (e) {
    if (!/23514|check constraint/i.test(e.message)) throw e;
    await write(row); // the CRM does not accept that status value: keep its own default
  }
  await update('leads', lead.id, { crm_proposal_state: status }); // our own write: not acted on when read back
  await logEvent(lead.id, 'atomic', 'proposal', 'ok', `${existing.length ? 'updated' : 'added'} the proposal in the CRM ${table} table`);
  return 'sent';
}

/** One brochures row per CRM lead: created the first time, then kept up to date. */
async function upsertBrochure(lead) {
  // Throwing keeps the outbox row pending, so the live site (public BASE_URL) writes it instead.
  if (!publicLinks()) throw new Error('brochure links need a public https BASE_URL');
  let link = brochureLink(lead);
  try { link = (await uploadBrochurePdf(lead)) || link; } catch (e) { await logEvent(lead.id, 'atomic', 'brochure_pdf', 'error', `${e.message}; the row links to AxiFlow instead`); }
  const row = { company_id: lead.crm_company_id ?? null, contact_id: lead.crm_contact_id ?? null, deal_id: lead.crm_deal_id ?? null, title: `${lead.company}: website plan`, brochure_url: link, updated_at: nowISO() };
  const where = lead.crm_company_id ? `company_id=eq.${lead.crm_company_id}` : lead.crm_contact_id ? `contact_id=eq.${lead.crm_contact_id}` : null;
  if (!where) return 'skipped';
  const existing = await rest('GET', `brochures?select=id,status&${where}&order=id.desc&limit=1`);
  // Approval happens in the CRM: a new row waits as pending; an approved row keeps its status when the file is
  // replaced; a rejected (not_approved) one goes back to pending with the new version.
  const status = !existing.length || existing[0].status === 'not_approved' ? brochureStatus() : existing[0].status;
  if (existing.length) await rest('PATCH', `brochures?id=eq.${existing[0].id}`, { ...row, status }, 'return=minimal');
  else await rest('POST', 'brochures', { ...row, status }, 'return=minimal');
  await update('leads', lead.id, { crm_brochure_state: status }); // our own write: not acted on when read back
  await logEvent(lead.id, 'atomic', 'brochure', 'ok', `${existing.length ? 'updated' : 'added'} the brochure in the CRM brochures table`);
  return 'sent';
}

async function setDeal(lead, patch) {
  if (patch.stage) await update('leads', lead.id, { crm_stage_key: patch.stage }); // our own write: not acted on when it comes back
  await rest('PATCH', `deals?id=eq.${lead.crm_deal_id}`, { ...patch, updated_at: nowISO() }, 'return=minimal');
}

/** Writes one outbox event to the CRM. Returns 'sent' or 'skipped'. Throws to retry later. */
export async function pushEvent(row) {
  const s = getSettings().atomic;
  const { event, detail = {} } = JSON.parse(row.payload);
  const lead = await get(`SELECT * FROM leads WHERE id = :id`, { id: row.lead_id });
  if (!lead || !String(lead.external_id || '').startsWith('atomic:') || lead.crm_removed_at || !canPush(event)) return 'skipped';
  const ws = s.write_stages || {};
  // Every brochure made for a CRM lead goes to the CRM's brochures table (allowed even while read-only).
  if (BROCHURE_EVENTS.has(event)) {
    if (!s.brochures_table) return 'skipped';
    if (event === 'lead.pitch_ready' && !lead.brochure_version) return 'skipped';
    const st = await upsertBrochure(lead);
    if (event === 'lead.brochure_ready' && s.notes && lead.crm_deal_id && canWrite('deal_notes')) await note(lead, `Brochure ready for ${lead.company}. Send it to the client from the link below (it always shows the latest version).`, [pdf(brochureLink(lead), `${lead.company} - website plan.pdf`)]);
    return st;
  }
  // Call scripts: one CRM note per lead (on the main contact, else the deal), kept up to date.
  if (event === 'lead.script_ready') return await upsertScriptNote(lead);
  if (event === 'lead.proposal_ready') return await upsertProposal(lead, detail.doc_id);
  if (!lead.crm_deal_id && !['lead.call_requested', 'lead.script_updated'].includes(event)) return 'skipped'; // notes and deal changes need a deal
  switch (event) {
    case 'lead.script_updated': {
      if (s.pitch_point && detail.pitch_point && lead.crm_company_id) {
        await rest('PATCH', `companies?id=eq.${lead.crm_company_id}`, { pitch_point: String(detail.pitch_point).slice(0, 1000) }, 'return=minimal');
        await logEvent(lead.id, 'atomic', 'pitch_point', 'ok', 'wrote the pitch point to the CRM company');
      }
      if (canWriteScript()) { await upsertScriptNote(lead); return 'sent'; }
      if (!s.notes || !lead.crm_deal_id || !canWrite('deal_notes')) return 'sent';
      await note(lead, `Call script from AxiFlow\n\n${detail.pitch_point ? `Pitch point: ${detail.pitch_point}\n\n` : ''}${detail.telecaller_script || ''}`.trim());
      return 'sent';
    }
    case 'lead.pitch_ready':
      if (s.brochures_table && lead.brochure_version) await upsertBrochure(lead);
      return 'sent';
    case 'lead.brochure_ready':
      if (s.brochures_table) await upsertBrochure(lead);
      if (s.notes) await note(lead, `Brochure ready for ${lead.company}. Send it to the client from the link below (it always shows the latest version).`, [pdf(brochureLink(lead), `${lead.company} - website plan.pdf`)]);
      return 'sent';
    case 'lead.call_requested': {
      if (!s.call_tasks || !lead.crm_contact_id) return 'skipped';
      const text = [`AxiFlow: call ${lead.company} (${detail.goal || 'follow-up'})`, detail.notes, detail.script ? `Script:\n${detail.script}` : ''].filter(Boolean).join('\n\n').slice(0, 4000);
      await rest('POST', 'tasks', { contact_id: lead.crm_contact_id, type: 'Call', text, due_date: detail.due_at || nowISO(), sales_id: lead.crm_sales_id ?? null }, 'return=minimal');
      return 'sent';
    }
    case 'lead.reply':
      if (!s.notes) return 'skipped';
      await note(lead, `Client replied on ${detail.channel || 'a message'}${detail.intent ? ` (${String(detail.intent).replace(/_/g, ' ')})` : ''}: ${detail.summary || ''}`.trim());
      return 'sent';
    case 'lead.proposal_sent': {
      const patch = {};
      if (detail.total) patch.amount = Math.round(detail.total);
      if (ws.proposal_sent) patch.stage = ws.proposal_sent;
      if (Object.keys(patch).length) await setDeal(lead, patch);
      if (s.notes) await note(lead, `Proposal sent to the client: ${detail.total ? `total ${getSettings().billing.currency} ${Math.round(detail.total).toLocaleString('en-IN')}` : ''}`.trim(), detail.pdf ? [pdf(detail.pdf, `${lead.company} - proposal.pdf`)] : []);
      return 'sent';
    }
    case 'lead.stage_changed': {
      const to = detail.to;
      const write = to !== 'proposal_sent' && ws[to]; // proposal_sent is set with the amount by lead.proposal_sent
      if (write) await setDeal(lead, { stage: write });
      const say = { meeting_booked: 'Meeting booked', won: 'Proposal accepted: advance invoice sent', lost: `Lost${detail.reason ? `: ${detail.reason}` : ''}`, onboarding: 'Advance paid: onboarding started', in_development: 'Project in development', delivered: 'Project delivered: final invoice sent', completed: 'Project completed' }[to];
      if (say && s.notes) await note(lead, `AxiFlow: ${say}`);
      return write || say ? 'sent' : 'skipped';
    }
    default:
      return 'skipped';
  }
}

/** Status for the Settings page. */
export async function atomicStatus() {
  const st = await getState('atomic', {});
  const linked = await get(`SELECT COUNT(*)::int AS n FROM leads WHERE external_id LIKE 'atomic:%'`);
  const out = await all(`SELECT status, COUNT(*)::int AS n FROM crm_outbox WHERE target = 'atomic' GROUP BY status`);
  return {
    keys: atomicKeys(), enabled: atomicConfigured(), host: crmHost(), read_only: readOnly(),
    last_poll_at: st.last_poll_at || null, last_result: st.last_result || null, stages_seen: st.stages_seen || {},
    linked_leads: linked?.n || 0, outbox: Object.fromEntries(out.map((r) => [r.status, r.n])),
    actions: ACTIONS,
  };
}

let lastKick = 0;
/** Reads the CRM in the background when the app is used (throttled by `atomic.poll_seconds`). */
export function pollSoon(background) {
  if (!atomicConfigured()) return;
  const every = (getSettings().atomic?.poll_seconds || 60) * 1000;
  if (Date.now() - lastKick < every) return;
  lastKick = Date.now();
  background(async () => { await pollCrm().catch(() => {}); await (await import('./crm-sync.js')).flushOutbox().catch(() => {}); }, 'crm-poll');
}
