import { get, insert, update } from '../db.js';
import { getSettings, getTemplate } from '../settings.js';
import { BASE_URL, firstName, render, money, nowISO, tzParts, zonedToUtc, esc, sleep } from '../util.js';
import { sendEmail, sendWhatsApp } from './channels.js';
import { logEvent, addActivity } from './log.js';
import { crmEvent } from '../crm-sync.js';

const PRIMARY_LINK = {
  intro: 'brochure_link', follow_up_1: 'brochure_link', follow_up_2: 'brochure_link',
  booking: 'booking_link', meeting_confirmed: 'meeting_link', proposal: 'proposal_link', proposal_reminder: 'proposal_link',
  payment_request: 'payment_link', payment_reminder: 'payment_link', final_invoice: 'payment_link',
  onboarding: 'onboarding_link', kickoff: 'status_link', milestone_update: 'status_link', thank_you: 'review_link',
};

/** Templates whose WhatsApp version carries the message text as variable {{2}}. */
const TOUCH_KEYS = new Set(['nurture_touch', 'reengage_touch', 'custom']);
const WRAP_EMAIL = 'Hi {{first_name}},\n\n{{touch_body}}\n\n{{sender_name}}\n{{agency_name}} · {{agency_phone}}';
const WRAP_WA = 'Hi {{first_name}}, {{touch_body}}';

export function buildVars(lead, settings, extra = {}) {
  let audit = null;
  try { audit = lead.audit_json ? JSON.parse(lead.audit_json) : null; } catch { /* ignore */ }
  const pkg = settings.packages.find((p) => p.id === lead.recommended_package) || settings.packages[0];
  const issue = audit?.findings?.find((f) => f.severity !== 'info')?.text || 'there is room to turn more visitors into enquiries';
  return {
    first_name: firstName(lead.contact_name),
    contact_name: lead.contact_name || '',
    company: lead.company,
    agency_name: settings.agency.name,
    sender_name: settings.agency.sender_name,
    agency_phone: settings.agency.phone,
    agency_email: settings.agency.email,
    agency_website: settings.agency.website,
    review_link: settings.agency.review_link,
    meeting_link: settings.meeting.meet_link,
    brochure_link: `${BASE_URL}/pdf/brochure/${lead.token}.pdf`,
    booking_link: `${BASE_URL}/book/${lead.token}`,
    status_link: `${BASE_URL}/status/${lead.token}`,
    onboarding_link: `${BASE_URL}/onboard/${lead.token}`,
    design_link: `${BASE_URL}/d/${lead.token}`,
    unsubscribe_link: `${BASE_URL}/u/${lead.token}`,
    top_issue: issue.charAt(0).toLowerCase() + issue.slice(1),
    package_name: pkg?.name || '',
    package_price: money(pkg?.price, settings.billing.currency),
    ...extra,
  };
}

export function inSendWindow(settings, date = new Date()) {
  const { hhmm, weekday } = tzParts(date, settings.schedule.timezone);
  const s = settings.sending;
  return s.send_days.includes(weekday) && hhmm >= s.window_start && hhmm < s.window_end;
}

async function sentToday(channel, settings) {
  const { date } = tzParts(new Date(), settings.schedule.timezone);
  const since = zonedToUtc(date, '00:00', settings.schedule.timezone);
  return (await get(`SELECT COUNT(*) n FROM messages WHERE direction='out' AND lead_id IS NOT NULL AND channel=:channel AND status IN ('sent','mock') AND created_at >= :since`,
    { channel, since })).n;
}

function usable(lead, channel, cold) {
  if (channel === 'whatsapp') return !!lead.phone_valid && (!cold || !!lead.wa_opt_in);
  if (channel === 'email') return !!lead.email_valid && (!cold || !!lead.email_opt_in);
  return false;
}

function textToHtml(text, unsubscribe) {
  const linked = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
  return `<div style="font:15px/1.6 system-ui,sans-serif;color:#1d2027;max-width:560px">${linked}
<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 10px"><div style="font-size:12px;color:#888">Don't want these emails? <a href="${unsubscribe}">Unsubscribe</a></div></div>`;
}

/**
 * Sends a templated message to a lead on the best permitted channel.
 * cold=true  → outreach: needs opt-in, respects caps.
 * cold=false → transactional (the lead engaged with us): any valid channel, prefers the one they replied on.
 * Returns { ok, channel, status } or { ok:false, reason }.
 */
export async function sendToLead(leadId, key, extra = {}, { cold = false, channel = null, content = null, attachment = null } = {}) {
  const settings = getSettings();
  const lead = await get(`SELECT * FROM leads WHERE id = :leadId`, { leadId });
  const tpl = await getTemplate(key);
  if (!lead || !tpl) return { ok: false, reason: 'missing lead/template' };
  if (lead.do_not_contact) {
    await logEvent(lead.id, 'messenger', key, 'skipped', 'do-not-contact');
    return { ok: false, reason: 'dnc' };
  }

  let order = channel ? [channel] : [...settings.sending.channel_priority];
  if (!cold && lead.last_inbound_channel && !channel) order = [lead.last_inbound_channel, ...order.filter((c) => c !== lead.last_inbound_channel)];
  const candidates = order.filter((c) => usable(lead, c, cold));
  if (!candidates.length) {
    await logEvent(lead.id, 'messenger', key, 'skipped', cold ? 'no permitted channel (opt-in + valid contact required)' : 'no valid email/phone');
    return { ok: false, reason: 'no_channel' };
  }

  const vars = buildVars(lead, settings, extra);
  let lastErr = null;
  let capped = false;
  for (const ch of candidates) {
    if (cold) {
      const cap = ch === 'email' ? settings.sending.daily_cap_email : settings.sending.daily_cap_whatsapp;
      if (await sentToday(ch, settings) >= cap) { capped = true; await logEvent(lead.id, 'messenger', key, 'skipped', `${ch} daily cap (${cap}) reached`); continue; }
    }
    const sessionOpen = ch === 'whatsapp' && lead.last_inbound_channel === 'whatsapp' && lead.last_inbound_at && Date.now() - new Date(lead.last_inbound_at).getTime() < 24 * 3600e3;
    let subject = render(tpl.subject, vars);
    let text = render(ch === 'email' ? tpl.email_body : tpl.wa_body, vars);
    let params = TOUCH_KEYS.has(key) ? [vars.first_name, vars.touch_body] : [vars.first_name, vars.company, vars[PRIMARY_LINK[key]] || vars.brochure_link];
    let aiWritten = false;
    // AI-written content: email always; WhatsApp only inside the 24h session or for
    // marketing touches (whose approved template carries the text as a variable).
    if (content) {
      if (ch === 'email' && content.email_body) {
        subject = content.subject || subject;
        text = content.raw_email ? content.email_body : render(WRAP_EMAIL, { ...vars, touch_body: content.email_body });
        aiWritten = true;
      } else if (ch === 'whatsapp' && content.whatsapp_text && (sessionOpen || TOUCH_KEYS.has(key))) {
        text = content.raw_whatsapp ? content.whatsapp_text : render(WRAP_WA, { ...vars, touch_body: content.whatsapp_text });
        if (TOUCH_KEYS.has(key)) params = [vars.first_name, content.whatsapp_text];
        aiWritten = true;
      }
    }
    const base = { lead_id: lead.id, direction: 'out', channel: ch, template_key: key, subject: ch === 'email' ? subject : null, body: text, attachment: attachment?.url || null, created_at: nowISO() };
    try {
      let r;
      if (ch === 'email') {
        const file = attachment ? { filename: attachment.filename, content: await attachment.build() } : null;
        r = await sendEmail({
          to: lead.email, subject, text: `${text}\n\n--\nUnsubscribe: ${vars.unsubscribe_link}`, html: textToHtml(text, vars.unsubscribe_link),
          replyTo: settings.agency.email, headers: { 'List-Unsubscribe': `<${vars.unsubscribe_link}>` }, attachment: file,
        }, { dryRun: settings.automation.dry_run });
      } else {
        r = await sendWhatsApp({
          to: lead.phone, text, templateName: tpl.wa_template_name, sessionOpen: sessionOpen || (aiWritten && !TOUCH_KEYS.has(key)), params,
          document: attachment ? { link: attachment.url, filename: attachment.filename } : null,
        }, { dryRun: settings.automation.dry_run });
      }
      await insert('messages', { ...base, to_addr: ch === 'email' ? lead.email : lead.phone, status: r.status, provider_id: r.provider_id });
      await update('leads', lead.id, { last_contacted_at: nowISO(), last_channel: ch, attempts: (lead.attempts || 0) + 1, updated_at: nowISO() });
      await addActivity(lead.id, 'message_out', `${ch === 'email' ? 'Email' : 'WhatsApp'} sent: ${tpl.label}${attachment ? ` 📎 ${attachment.filename}` : ''}${aiWritten ? ' ✨ AI-written' : ''}${r.status === 'mock' ? ' (mock)' : ''}`, text);
      await logEvent(lead.id, 'messenger', key, 'ok', `${ch} ${r.status}${aiWritten ? ' ai' : ''} ${r.provider_id || ''}`);
      await crmEvent(lead.id, 'message.sent', { channel: ch, template: key, ai_written: aiWritten, status: r.status });
      if (r.status === 'sent' && settings.sending.throttle_ms) await sleep(settings.sending.throttle_ms);
      return { ok: true, channel: ch, status: r.status };
    } catch (e) {
      lastErr = e;
      await insert('messages', { ...base, to_addr: ch === 'email' ? lead.email : lead.phone, status: 'failed', error: e.message });
      await logEvent(lead.id, 'messenger', key, 'error', `${ch}: ${e.message}`);
      await addActivity(lead.id, 'error', `${ch} send failed: ${tpl.label}`, e.message);
    }
  }
  if (lastErr) return { ok: false, reason: 'error', error: lastErr.message };
  return { ok: false, reason: capped ? 'cap' : 'no_channel' };
}
