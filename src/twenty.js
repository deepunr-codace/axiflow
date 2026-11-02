import { get, update } from './db.js';
import { getSettings } from './settings.js';
import { nowISO } from './util.js';
import { addActivity, logEvent } from './pipeline/log.js';
import * as engine from './pipeline/engine.js';

/*
 * Twenty CRM → our app. n8n forwards Twenty's webhook body ({ event, data, timestamp }) to
 * POST /webhooks/twenty. Field names come from settings.twenty (dot-paths, first match wins).
 * Twenty sends the whole record on every update (including echoes of our own writes), so
 * every action here is idempotent.
 */

const pick = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function first(data, paths) {
  for (const p of paths || []) {
    const v = pick(data, p);
    if (v !== undefined && v !== null && v !== '' && typeof v !== 'object') return p.endsWith('amountMicros') ? Number(v) / 1e6 : v;
  }
  return undefined;
}
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export function mapInterested(v) {
  const x = norm(v);
  if (['yes', 'true', 'interested', 'hot', 'warm'].includes(x)) return 'yes';
  if (['no', 'false', 'not_interested', 'cold', 'dead'].includes(x)) return 'no';
  return x ? 'unknown' : undefined;
}
export function mapOutcome(v) {
  const x = norm(v);
  if (!x) return null;
  const alias = { call_back: 'callback', call_back_later: 'callback', callback_later: 'callback', meeting: 'meeting_booked', booked: 'meeting_booked', not_reachable: 'no_answer', busy: 'no_answer', wrong: 'wrong_number' };
  return alias[x] || x;
}

/** Applies CRM field changes to a lead. Only real changes are written; interest and DNC re-route the lead. */
export async function applyCrmUpdate(lead, b, source = 'CRM') {
  const n = engine.normalizeLeadInput({ ...lead, ...b });
  const same = (x, y) => String(x ?? '') === String(y ?? '') || (typeof y === 'boolean' && Number(x) === Number(y));
  const patch = {};
  for (const k of ['company', 'contact_name', 'email', 'phone', 'website', 'industry', 'city', 'service', 'budget', 'notes', 'owner', 'tags', 'wa_opt_in', 'email_opt_in']) {
    if (k in b && b[k] !== undefined && !same(lead[k], n[k])) patch[k] = n[k];
  }
  if ('email' in patch) patch.email_valid = n.email_valid;
  if ('phone' in patch) patch.phone_valid = n.phone_valid;
  if ((patch.wa_opt_in || patch.email_opt_in) && !lead.consent_at) Object.assign(patch, { consent_at: nowISO(), consent_source: source });
  if (Object.keys(patch).length) {
    await update('leads', lead.id, { ...patch, updated_at: nowISO() });
    await addActivity(lead.id, 'system', `Updated from ${source}: ${Object.keys(patch).filter((k) => !k.endsWith('_valid')).join(', ')}`);
  }
  if (b.do_not_contact && !lead.do_not_contact) {
    await engine.setStage(await engine.getLead(lead.id), 'do_not_contact', `flagged in ${source}`, { do_not_contact: 1, next_action_at: null, next_action_type: null });
  } else if (b.interested && b.interested !== 'unknown' && b.interested !== lead.interested) {
    await engine.applyInterestChange(lead.id, n.interested, `${source}: interested=${n.interested}`);
  }
  return Object.keys(patch);
}

/** Handles one Twenty webhook event. Returns a short summary of what happened. */
export async function handleTwentyEvent(body) {
  const cfg = getSettings().twenty;
  const { event, data } = body || {};
  if (!event || !data?.id) return { ignored: 'missing event or record id' };
  const [object, action] = String(event).split('.');
  if (object !== cfg.object) return { ignored: `object "${object}" (configured: ${cfg.object})` };
  const f = (k) => first(data, cfg.fields[k]);
  const ext = String(data.id);
  let lead = await get(`SELECT * FROM leads WHERE external_id = :ext`, { ext });

  if (action === 'deleted') {
    if (lead && !['completed', 'lost', 'do_not_contact'].includes(lead.stage)) await engine.setStage(lead, 'lost', 'deleted in CRM', { lost_reason: 'deleted in CRM', next_action_at: null });
    return { action: 'deleted', id: lead?.id ?? null };
  }

  let phone = f('phone');
  const cc = f('phone_country');
  if (phone && cc && String(cc).startsWith('+') && !String(phone).startsWith('+')) phone = `${cc}${phone}`;
  const truthyField = (v) => (v === undefined ? undefined : v === true || /^(true|yes|1|y)$/i.test(String(v)));
  const input = {
    external_id: ext, source: 'crm',
    company: f('company'), contact_name: f('contact_name'), email: f('email'), phone, website: f('website'),
    city: f('city'), industry: f('industry'), budget: f('budget'), notes: f('notes'),
    interested: mapInterested(f('interested')),
    wa_opt_in: truthyField(f('wa_opt_in')), email_opt_in: truthyField(f('email_opt_in')), do_not_contact: truthyField(f('do_not_contact')),
  };
  for (const k of Object.keys(input)) if (input[k] === undefined) delete input[k];

  if (!lead) {
    if (!input.company) return { ignored: 'no company name' };
    const r = await engine.createLead({ ...input, interested: input.interested || 'unknown' }, { source: 'crm' });
    await logEvent(r.id, 'twenty', event, 'ok', r.duplicate ? 'merged into existing lead' : 'created');
    return { action: r.duplicate ? 'merged' : 'created', id: r.id };
  }

  const changed = await applyCrmUpdate(lead, input, 'Twenty');
  const out = { action: 'updated', id: lead.id, changed };

  // Telecaller's call result. The key stops the same value being processed twice.
  const outcome = mapOutcome(f('call_outcome'));
  if (!outcome) {
    if (lead.crm_call_key) await update('leads', lead.id, { crm_call_key: null });
  } else {
    const key = [outcome, f('call_notes') || '', f('callback_at') || ''].join('|');
    if (key !== lead.crm_call_key) {
      await update('leads', lead.id, { crm_call_key: key });
      if (engine.CALL_OUTCOMES.includes(outcome)) {
        await engine.logCrmCall(lead.id, outcome, { notes: String(f('call_notes') || ''), callbackAt: f('callback_at') || null });
        out.call = outcome;
      } else {
        await logEvent(lead.id, 'twenty', 'call_outcome', 'error', `unknown outcome "${f('call_outcome')}"`);
      }
    }
  }

  // Proposal decision recorded by the telecaller.
  const decision = norm(f('proposal_decision'));
  if (!decision) {
    if (lead.crm_proposal_key) await update('leads', lead.id, { crm_proposal_key: null });
  } else if (decision !== lead.crm_proposal_key && ['accepted', 'declined'].includes(decision)) {
    await update('leads', lead.id, { crm_proposal_key: decision });
    try {
      await engine.decideProposal(lead.id, decision, { reason: String(f('decline_reason') || ''), by: 'Twenty' });
      out.proposal = decision;
    } catch (e) {
      await logEvent(lead.id, 'twenty', 'proposal_decision', 'skipped', e.message);
    }
  }
  return out;
}
