import crypto from 'node:crypto';
import { get, all, insert, update } from './db.js';
import { nowISO, addMinutes, BASE_URL } from './util.js';
import { background } from './background.js';
import { atomicConfigured, readOnly, pushEvent } from './atomic.js';

/**
 * Outbound sync to the external CRM. Every change is written to crm_outbox first (durable),
 * then POSTed to CRM_WEBHOOK_URL with an HMAC signature; failures retry with backoff.
 * Without CRM_WEBHOOK_URL events are recorded as "skipped" so you can still inspect them.
 */
const URL_ = () => process.env.CRM_WEBHOOK_URL;
const SECRET = () => process.env.CRM_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';

export const crmConfigured = () => !!URL_();

export async function leadSnapshot(lead) {
  const pitch = lead.pitch_json ? JSON.parse(lead.pitch_json) : null;
  const lastProposal = await get(`SELECT token FROM proposals WHERE lead_id = :id ORDER BY id DESC LIMIT 1`, { id: lead.id });
  return {
    id: lead.id,
    external_id: lead.external_id,
    company: lead.company,
    contact_name: lead.contact_name,
    email: lead.email,
    phone: lead.phone,
    stage: lead.stage,
    pipe: lead.pipe,
    interested: lead.interested,
    score: lead.score,
    do_not_contact: !!lead.do_not_contact,
    next_action: lead.next_action_at ? { type: lead.next_action_type, at: lead.next_action_at, note: lead.next_action_note } : null,
    last_contacted_at: lead.last_contacted_at,
    last_channel: lead.last_channel,
    last_reply_at: lead.last_inbound_at,
    attempts: lead.attempts,
    recommended_package: lead.recommended_package,
    pitch_headline: pitch?.headline || null,
    telecaller_script: pitch?.telecaller_script || null,
    links: {
      brochure_pdf: lead.brochure_version ? `${BASE_URL}/pdf/brochure/${lead.token}.pdf` : null,
      proposal_pdf: lastProposal ? `${BASE_URL}/pdf/proposal/${lastProposal.token}.pdf` : null,
      design: lead.design_version ? `${BASE_URL}/d/${lead.token}` : null,
      booking: `${BASE_URL}/book/${lead.token}`,
    },
    updated_at: lead.updated_at,
  };
}

export async function crmEvent(leadId, event, detail = {}) {
  const lead = await get(`SELECT * FROM leads WHERE id = :leadId`, { leadId });
  if (!lead) return;
  const payload = JSON.stringify({ event, at: nowISO(), detail, lead: await leadSnapshot(lead) });
  await insert('crm_outbox', {
    lead_id: leadId, event, payload, target: 'webhook',
    status: crmConfigured() ? 'pending' : 'skipped', next_attempt_at: nowISO(), created_at: nowISO(),
  });
  // Atomic CRM (direct writes). In read-only mode the event is only recorded.
  const atomic = atomicConfigured() && lead.crm_deal_id;
  if (atomic) await insert('crm_outbox', { lead_id: leadId, event, payload, target: 'atomic', status: readOnly() ? 'skipped' : 'pending', next_attempt_at: nowISO(), created_at: nowISO() });
  if (crmConfigured() || (atomic && !readOnly())) background(() => flushOutbox(), 'crm-sync');
}

let flushing = false;
export async function flushOutbox() {
  if ((!crmConfigured() && !atomicConfigured()) || flushing) return;
  flushing = true;
  try {
    const rows = await all(`SELECT * FROM crm_outbox WHERE status = 'pending' AND next_attempt_at <= :now ORDER BY id LIMIT 50`, { now: nowISO() });
    for (const r of rows) {
      if (r.target === 'atomic') {
        try {
          const st = await pushEvent(r);
          await update('crm_outbox', r.id, { status: st, sent_at: nowISO(), attempts: r.attempts + 1 });
        } catch (e) {
          const attempts = r.attempts + 1;
          await update('crm_outbox', r.id, { attempts, last_error: e.message, status: attempts >= 8 ? 'failed' : 'pending', next_attempt_at: addMinutes(nowISO(), Math.min(720, 2 ** attempts)) });
        }
        continue;
      }
      if (!crmConfigured()) continue;
      const sig = crypto.createHmac('sha256', SECRET()).update(r.payload).digest('hex');
      try {
        const res = await fetch(URL_(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-webstream-event': r.event, 'x-webstream-signature': `sha256=${sig}`, 'x-webstream-token': SECRET() },
          body: r.payload,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await update('crm_outbox', r.id, { status: 'sent', sent_at: nowISO(), attempts: r.attempts + 1 });
      } catch (e) {
        const attempts = r.attempts + 1;
        await update('crm_outbox', r.id, {
          attempts, last_error: e.message,
          status: attempts >= 8 ? 'failed' : 'pending',
          next_attempt_at: addMinutes(nowISO(), Math.min(720, 2 ** attempts)),
        });
      }
    }
  } finally {
    flushing = false;
  }
}
