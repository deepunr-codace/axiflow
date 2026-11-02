import crypto from 'node:crypto';
import { get, all, insert, update } from './db.js';
import { nowISO, addMinutes, BASE_URL } from './util.js';

/**
 * Outbound sync to the external CRM. Every change is written to crm_outbox first (durable),
 * then POSTed to CRM_WEBHOOK_URL with an HMAC signature; failures retry with backoff.
 * Without CRM_WEBHOOK_URL events are recorded as "skipped" so you can still inspect them.
 */
const URL_ = () => process.env.CRM_WEBHOOK_URL;
const SECRET = () => process.env.CRM_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';

export const crmConfigured = () => !!URL_();

export function leadSnapshot(lead) {
  const pitch = lead.pitch_json ? JSON.parse(lead.pitch_json) : null;
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
      proposal_pdf: (() => { const p = get(`SELECT token FROM proposals WHERE lead_id = :id ORDER BY id DESC LIMIT 1`, { id: lead.id }); return p ? `${BASE_URL}/pdf/proposal/${p.token}.pdf` : null; })(),
      design: lead.design_version ? `${BASE_URL}/d/${lead.token}` : null,
      booking: `${BASE_URL}/book/${lead.token}`,
    },
    updated_at: lead.updated_at,
  };
}

export function crmEvent(leadId, event, detail = {}) {
  const lead = get(`SELECT * FROM leads WHERE id = :leadId`, { leadId });
  if (!lead) return;
  const payload = { event, at: nowISO(), detail, lead: leadSnapshot(lead) };
  insert('crm_outbox', {
    lead_id: leadId, event, payload: JSON.stringify(payload),
    status: crmConfigured() ? 'pending' : 'skipped', next_attempt_at: nowISO(), created_at: nowISO(),
  });
  if (crmConfigured()) setImmediate(() => flushOutbox().catch(() => {}));
}

let flushing = false;
export async function flushOutbox() {
  if (!crmConfigured() || flushing) return;
  flushing = true;
  try {
    const rows = all(`SELECT * FROM crm_outbox WHERE status = 'pending' AND next_attempt_at <= :now ORDER BY id LIMIT 50`, { now: nowISO() });
    for (const r of rows) {
      const sig = crypto.createHmac('sha256', SECRET()).update(r.payload).digest('hex');
      try {
        const res = await fetch(URL_(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-webstream-event': r.event, 'x-webstream-signature': `sha256=${sig}`, 'x-webstream-token': SECRET() },
          body: r.payload,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        update('crm_outbox', r.id, { status: 'sent', sent_at: nowISO(), attempts: r.attempts + 1 });
      } catch (e) {
        const attempts = r.attempts + 1;
        update('crm_outbox', r.id, {
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
