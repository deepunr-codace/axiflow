import crypto from 'node:crypto';
import { addColumns, get, all, update } from './db.js';
import { getSettings, getState, setState } from './settings.js';
import { nowISO, BASE_URL } from './util.js';
import { addActivity, addTask, logEvent } from './pipeline/log.js';
import { TERMINAL } from './stages.js';

/*
 * Team CRM connector: Atomic CRM (Marmelab) on its own Supabase project.
 *
 *   CRM → AxiFlow (pollCrm, every `atomic.poll_seconds`, plus POST /webhooks/atomic to poll at once)
 *     - every open deal becomes an AxiFlow lead (external_id "atomic:<deal id>"), with the company and
 *       the deal's primary contact; later edits in the CRM update the lead
 *     - a deal-stage move runs the action set for that stage in `atomic.stages`
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

export const ACTIONS = ['interested', 'proposal', 'won', 'lost', 'nurture', 'not_interested', 'ignore'];

const conf = () => ({ url: (process.env.CRM_SUPABASE_URL || '').replace(/\/+$/, ''), key: process.env.CRM_SUPABASE_SECRET_KEY || process.env.CRM_SUPABASE_SERVICE_KEY || '' });
export const atomicKeys = () => !!(conf().url && conf().key);
export const atomicConfigured = () => atomicKeys() && getSettings().atomic?.enabled !== false;
export const crmHost = () => { try { return new URL(conf().url).host; } catch { return null; } };

export const readOnly = () => getSettings().atomic?.read_only !== false;

export async function rest(method, path, body, prefer) {
  const { url, key } = conf();
  // Read-only mode (the default): nothing but GET ever reaches the CRM.
  if (method !== 'GET' && readOnly()) throw new Error('CRM is in read-only mode');
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`CRM ${method} ${path.split('?')[0]}: HTTP ${r.status} ${text.slice(0, 200)}`);
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

function primaryContact(deal, contacts) {
  const list = (deal.contact_ids || []).map((id) => contacts.get(id)).filter(Boolean);
  return list.find((c) => c.is_primary) || list[0] || null;
}

/** Lead fields from a deal, its company and its primary contact. */
export function dealInput(deal, co, ct, s = getSettings().atomic) {
  const name = [ct?.first_name, ct?.last_name].filter(Boolean).join(' ').trim();
  const input = {
    external_id: `atomic:${deal.id}`, source: 'crm',
    company: co?.name || deal.name,
    contact_name: name || undefined,
    email: firstOf(ct?.email_jsonb, 'email') || co?.email || undefined,
    phone: ct?.whatsapp_number || ct?.phone_e164 || firstOf(ct?.phone_jsonb, 'number') || co?.whatsapp_number || co?.phone_number || undefined,
    website: co?.website || undefined,
    city: co?.city || undefined,
    industry: co?.sector || undefined,
    budget: deal.amount || undefined,
    notes: deal.description || co?.description || undefined,
    do_not_contact: ct?.do_not_contact ? true : undefined,
  };
  if (s.deal_means_consent) Object.assign(input, { wa_opt_in: true, email_opt_in: true, consent_source: 'CRM deal opened by the telecaller' });
  for (const k of Object.keys(input)) if (input[k] === undefined || input[k] === null || input[k] === '') delete input[k];
  return input;
}

const actionFor = (stage, s = getSettings().atomic) => (s.stages || {})[stage] || null;
const hashOf = (deal, co, ct) => crypto.createHash('sha1').update(JSON.stringify([
  deal.name, deal.stage, deal.amount, deal.description, deal.contact_ids, deal.archived_at,
  co && [co.name, co.website, co.city, co.sector, co.email, co.phone_number, co.whatsapp_number],
  ct && [ct.first_name, ct.last_name, ct.email_jsonb, ct.phone_jsonb, ct.whatsapp_number, ct.phone_e164, ct.do_not_contact, ct.last_outcome, ct.last_attempt_at],
])).digest('hex').slice(0, 16);

/** Applies one deal (with its company and primary contact) to AxiFlow. Returns what happened. */
export async function syncDeal(deal, co, ct, { engine, twenty }) {
  const s = getSettings().atomic;
  const ext = `atomic:${deal.id}`;
  let lead = await get(`SELECT * FROM leads WHERE external_id = :ext`, { ext });
  const hash = hashOf(deal, co, ct);
  if (lead && lead.crm_sync_hash === hash) return 'unchanged';
  const links = { crm_deal_id: deal.id, crm_company_id: deal.company_id ?? null, crm_contact_id: ct?.id ?? null, crm_sales_id: deal.sales_id ?? co?.sales_id ?? null };
  const input = dealInput(deal, co, ct, s);
  const action = actionFor(deal.stage, s);
  const callKey = ct?.last_outcome ? [ct.last_outcome, ct.last_attempt_at || ''].join('|') : null;

  if (!lead) {
    // Closed or archived deals from before the connection are history: not imported.
    if (deal.archived_at || ['won', 'lost', 'ignore'].includes(action)) return 'skipped';
    const interested = action === 'nurture' ? 'unknown' : action === 'not_interested' ? 'no' : 'yes';
    const r = await engine.createLead({ ...input, interested }, { source: 'crm' });
    await update('leads', r.id, { ...links, crm_stage_key: deal.stage, crm_call_key: callKey, crm_sync_hash: hash });
    await logEvent(r.id, 'atomic', 'deal', 'ok', `${r.duplicate ? 'linked to existing lead' : 'created'} from CRM deal #${deal.id} (${deal.stage})`);
    if (r.duplicate && interested !== 'unknown') await engine.applyInterestChange(r.id, interested, `CRM deal #${deal.id} (${deal.stage})`);
    if (action === 'proposal') await runAction(r.id, 'proposal', deal.stage, engine);
    return r.duplicate ? 'linked' : 'created';
  }

  await twenty.applyCrmUpdate(lead, input, 'the CRM');
  await update('leads', lead.id, { ...links, crm_sync_hash: hash });

  if (deal.stage !== lead.crm_stage_key) {
    await update('leads', lead.id, { crm_stage_key: deal.stage });
    await logEvent(lead.id, 'atomic', 'stage', 'ok', `CRM deal moved to "${deal.stage}"${action ? ` → ${action}` : ' (no action set)'}`);
    if (action) await runAction(lead.id, action, deal.stage, engine);
  }

  // The telecaller's latest call result on the contact.
  if (callKey && callKey !== lead.crm_call_key) {
    await update('leads', lead.id, { crm_call_key: callKey });
    const outcome = twenty.mapOutcome(ct.last_outcome);
    if (engine.CALL_OUTCOMES.includes(outcome)) await engine.logCrmCall(lead.id, outcome, { notes: 'From the CRM', callbackAt: ct.next_attempt_at || null });
    else await logEvent(lead.id, 'atomic', 'call_outcome', 'skipped', `unknown call result "${ct.last_outcome}"`);
  }
  return 'updated';
}

async function runAction(leadId, action, stage, engine) {
  const reason = `CRM deal moved to "${stage}"`;
  const lead = await engine.getLead(leadId);
  if (!lead) return;
  switch (action) {
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
/** Reads the CRM and applies changes. Throttled by `atomic.poll_seconds` unless forced. */
export async function pollCrm({ force = false } = {}) {
  if (!atomicConfigured()) return { skipped: 'CRM not connected' };
  const s = getSettings().atomic;
  const st = await getState('atomic', {});
  if (!force && st.last_poll_at && Date.now() - Date.parse(st.last_poll_at) < (s.poll_seconds || 60) * 1000) return { skipped: 'polled recently' };
  if (polling) return { skipped: 'already running' };
  polling = true;
  const [engine, twenty, tools] = await Promise.all([import('./pipeline/engine.js'), import('./twenty.js'), import('./tools.js')]);
  const out = { at: nowISO(), deals: 0, created: 0, linked: 0, updated: 0, unchanged: 0, skipped: 0, brochures: 0, errors: [] };
  const stages = {};
  try {
    const deals = [];
    for (let from = 0; ; from += 1000) {
      const page = await rest('GET', `deals?select=id,name,company_id,contact_ids,stage,description,amount,sales_id,archived_at,updated_at&order=id.asc&offset=${from}&limit=1000`);
      deals.push(...page);
      if (page.length < 1000) break;
    }
    out.deals = deals.length;
    const [companies, contacts] = await Promise.all([byIds('companies', deals.map((d) => d.company_id)), byIds('contacts', deals.flatMap((d) => d.contact_ids || []))]);
    for (const d of deals) {
      stages[d.stage] = (stages[d.stage] || 0) + 1;
      try {
        const r = await syncDeal(d, companies.get(d.company_id), primaryContact(d, contacts), { engine, twenty });
        out[r] = (out[r] || 0) + 1;
      } catch (e) {
        out.errors.push(`deal #${d.id}: ${e.message}`);
        await logEvent(null, 'atomic', 'deal', 'error', `deal #${d.id}: ${e.message}`);
      }
    }
    if (s.brochures_table && !readOnly()) out.brochures = await answerBrochureRequests(tools).catch((e) => { out.errors.push(`brochures: ${e.message}`); return 0; });
  } catch (e) {
    out.errors.push(e.message);
    await logEvent(null, 'atomic', 'poll', 'error', e.message);
  } finally {
    polling = false;
    await setState('atomic', { ...st, last_poll_at: nowISO(), last_result: { ...out, errors: out.errors.slice(0, 10) }, stages_seen: Object.keys(stages).length || !out.errors.length ? stages : st.stages_seen });
  }
  return out;
}

/** Brochure requests made in the CRM (brochures.status = pending): fill in the lead's brochure link. */
async function answerBrochureRequests(tools) {
  const rows = await rest('GET', `brochures?select=*&status=eq.pending&order=id.asc&limit=20`);
  let done = 0;
  for (const b of rows) {
    const lead = (b.deal_id && await get(`SELECT * FROM leads WHERE crm_deal_id = :id`, { id: b.deal_id }))
      || (b.company_id && await get(`SELECT * FROM leads WHERE crm_company_id = :id ORDER BY id DESC LIMIT 1`, { id: b.company_id }));
    if (!lead) continue; // the deal is not synced yet; try again next time
    if (!lead.brochure_version && !(await tools.latestLeadDoc('brochure', lead.id))) {
      const d = await tools.createDocForLead('brochure', lead.id);
      await logEvent(lead.id, 'atomic', 'brochure_request', d.status === 'ready' ? 'ok' : 'error', d.error || `made #${d.id} for CRM request #${b.id}`);
      if (d.status !== 'ready') continue;
    }
    await rest('PATCH', `brochures?id=eq.${b.id}`, { brochure_url: brochureLink(lead), title: b.title || `${lead.company}: website plan`, status: 'ready', updated_at: nowISO() });
    done++;
  }
  return done;
}

// ------------------------------------------------------------------ AxiFlow → CRM

const brochureLink = (lead) => `${BASE_URL}/pdf/brochure/${lead.token}.pdf`;
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

async function upsertBrochure(lead) {
  const row = { company_id: lead.crm_company_id, contact_id: lead.crm_contact_id, deal_id: lead.crm_deal_id, title: `${lead.company}: website plan`, brochure_url: brochureLink(lead), status: 'ready', updated_at: nowISO() };
  const existing = await rest('GET', `brochures?select=id&deal_id=eq.${lead.crm_deal_id}&order=id.desc&limit=1`);
  if (existing.length) await rest('PATCH', `brochures?id=eq.${existing[0].id}`, row, 'return=minimal');
  else await rest('POST', 'brochures', row, 'return=minimal');
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
  if (!lead?.crm_deal_id || readOnly()) return 'skipped';
  const ws = s.write_stages || {};
  switch (event) {
    case 'lead.script_updated': {
      if (s.pitch_point && detail.pitch_point && lead.crm_company_id) await rest('PATCH', `companies?id=eq.${lead.crm_company_id}`, { pitch_point: detail.pitch_point }, 'return=minimal');
      if (!s.notes) return 'sent';
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
  const linked = await get(`SELECT COUNT(*)::int AS n FROM leads WHERE crm_deal_id IS NOT NULL`);
  const out = await all(`SELECT status, COUNT(*)::int AS n FROM crm_outbox WHERE target = 'atomic' GROUP BY status`);
  return {
    keys: atomicKeys(), enabled: atomicConfigured(), host: crmHost(), read_only: readOnly(),
    last_poll_at: st.last_poll_at || null, last_result: st.last_result || null, stages_seen: st.stages_seen || {},
    linked_leads: linked?.n || 0, outbox: Object.fromEntries(out.map((r) => [r.status, r.n])),
    actions: ACTIONS,
  };
}
