import express from 'express';
import { get, all, update } from '../db.js';
import { getSettings } from '../settings.js';
import { esc, money, formatInTz } from '../util.js';
import { page, messagePage } from './layout.js';
import { checkSecret, rateLimit } from './auth.js';
import { logEvent, addActivity } from '../pipeline/log.js';
import * as engine from '../pipeline/engine.js';
import { buildBrochureFor, buildProposalFor } from '../pdf/docs.js';
import * as tools from '../tools.js';
import { leadSnapshot } from '../crm-sync.js';
import { applyCrmUpdate, handleTwentyEvent } from '../twenty.js';
import crypto from 'node:crypto';

export const pub = express.Router();
const form = express.urlencoded({ extended: false, limit: '100kb' });
const limiter = rateLimit({ windowMs: 60000, max: 15 });

const leadByToken = async (t) => await get(`SELECT * FROM leads WHERE token = :t`, { t: String(t) });
const notFound = (res) => res.status(404).send(messagePage(getSettings(), 'Link not found', 'This link is invalid or has expired.', false));

// ------------------------------------------------- lead intake (API + public form)

/** POST /api/intake  (header X-API-Key). For website forms, ad platforms, n8n/Zapier, the CRM, etc. */
pub.post('/api/intake', limiter, async (req, res) => {
  if (!checkSecret(req.get('x-api-key'), process.env.INTAKE_API_KEY)) return res.status(401).json({ error: 'Invalid API key' });
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const out = [];
  for (const i of items.slice(0, 500)) out.push(await engine.createLead(i || {}, { source: i?.source || 'api' })); // in order: dedupe sees earlier items
  res.json(Array.isArray(req.body) ? out : out[0]);
});

pub.get('/f', (_req, res) => {
  const s = getSettings();
  const opts = s.packages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  res.send(page({
    title: `Get a free website plan: ${s.agency.name}`, settings: s, noindex: false,
    body: `<div class="card hero"><h1>Get a free, personalised website plan</h1><p class="muted">Tell us about your business. We'll send you a plan with an audit of your current site and a fixed-price recommendation.</p></div>
<form class="card" method="post" action="/f">
<label>Your name *</label><input name="contact_name" required maxlength="100">
<label>Business name *</label><input name="company" required maxlength="150">
<label>Email</label><input name="email" type="email" maxlength="150">
<label>Phone / WhatsApp</label><input name="phone" maxlength="20">
<label>Current website (if any)</label><input name="website" maxlength="200" placeholder="www.yourbusiness.com">
<label>City</label><input name="city" maxlength="80">
<label>Industry</label><input name="industry" maxlength="80" placeholder="Restaurant, clinic, retail…">
<label>What do you need?</label><select name="service"><option value="">Not sure, recommend me</option>${opts}</select>
<label>Budget (${esc(s.billing.currency)})</label><input name="budget" inputmode="numeric" maxlength="12">
<label>Anything else?</label><textarea name="notes" maxlength="2000"></textarea>
<input name="website_url_confirm" style="display:none" tabindex="-1" autocomplete="off">
<label class="check"><input type="checkbox" name="wa_opt_in" value="1" checked> I agree to be contacted on WhatsApp</label>
<label class="check"><input type="checkbox" name="email_opt_in" value="1" checked> I agree to be contacted by email</label>
<button class="btn" type="submit">Send me my plan</button></form>`,
  }));
});

pub.post('/f', limiter, form, async (req, res) => {
  const s = getSettings();
  if (req.body.website_url_confirm) return res.send(messagePage(s, 'Thank you!', 'We will be in touch.')); // honeypot
  if (!req.body.company || !(req.body.email || req.body.phone)) {
    return res.status(400).send(messagePage(s, 'Missing details', 'Please go back and add your business name and an email or phone number.', false));
  }
  await engine.createLead({ ...req.body, interested: 'yes', consent_source: 'web form' }, { source: 'web_form' });
  res.send(messagePage(s, 'Thank you! 🎉', "We're preparing your personalised website plan. You'll receive it shortly on WhatsApp or email."));
});

// ------------------------------------------------------------------ brochure
pub.get('/b/:token', async (req, res) => {
  const lead = await leadByToken(req.params.token);
  if (!lead?.brochure_html) return notFound(res);
  await logEvent(lead.id, 'engagement', 'brochure_view', 'ok', req.get('user-agent')?.slice(0, 120) || '');
  res.send(lead.brochure_html);
});

// ------------------------------------------------------------------ PDFs
/** Brochure + proposal PDFs. Built on request from stored data; the unguessable token is the access key. */
const sendPdf = (res, buf, filename) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
};
/** Share link for documents made with the AI Brochure / Proposal tools. */
pub.get('/pdf/doc/:file', async (req, res) => {
  const d = await get(`SELECT id FROM docs WHERE token = :t`, { t: req.params.file.replace(/\.pdf$/, '') });
  const doc = d && await tools.getDoc(d.id);
  if (!doc || doc.status !== 'ready') return notFound(res);
  sendPdf(res, await tools.docPdf(doc), tools.docFilename(doc));
});

pub.get('/pdf/brochure/:file', async (req, res) => {
  const lead = await leadByToken(req.params.file.replace(/\.pdf$/, ''));
  if (!lead?.brochure_version) return notFound(res);
  await logEvent(lead.id, 'engagement', 'brochure_pdf_view', 'ok', req.get('user-agent')?.slice(0, 120) || '');
  sendPdf(res, await buildBrochureFor(lead), `${lead.company.replace(/[^\w]+/g, '-')}-website-plan.pdf`);
});
pub.get('/pdf/proposal/:file', async (req, res) => {
  const p = await get(`SELECT * FROM proposals WHERE token = :t`, { t: req.params.file.replace(/\.pdf$/, '') });
  if (!p) return notFound(res);
  await logEvent(p.lead_id, 'engagement', 'proposal_pdf_view', 'ok', `#${p.id}`);
  sendPdf(res, await buildProposalFor(p), `proposal-${p.id}.pdf`);
});

// -------------------------------------------------------- design concept
/** AI-generated HTML: served sandboxed (unique origin, no scripts) so it can never touch the CRM session. */
pub.get('/d/:token', async (req, res) => {
  const lead = await leadByToken(req.params.token);
  if (!lead?.design_html) return notFound(res);
  res.setHeader('Content-Security-Policy', "sandbox allow-popups; default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: https:; frame-ancestors 'self'");
  await logEvent(lead.id, 'engagement', 'design_view', 'ok', req.get('user-agent')?.slice(0, 120) || '');
  res.type('html').send(lead.design_html);
});

// ----------------------------------------------------------- CRM endpoints
/** The external CRM pushes updates here (X-API-Key). Changing `interested` re-routes the lead. */
pub.patch('/api/crm/leads/:externalId', limiter, async (req, res) => {
  if (!checkSecret(req.get('x-api-key'), process.env.INTAKE_API_KEY)) return res.status(401).json({ error: 'Invalid API key' });
  const lead = await get(`SELECT * FROM leads WHERE external_id = :e`, { e: req.params.externalId });
  if (!lead) return res.status(404).json({ error: 'Unknown external_id. Create it with POST /api/intake first.' });
  await applyCrmUpdate(lead, req.body || {}, 'CRM');
  res.json({ ok: true, lead: await leadSnapshot(await engine.getLead(lead.id)) });
});

/**
 * Twenty CRM webhook, forwarded by n8n (header X-API-Key). Body: Twenty's { event, data, timestamp }.
 * If TWENTY_WEBHOOK_SECRET is set, Twenty's own signature headers must also be forwarded and valid.
 */
pub.post('/webhooks/twenty', async (req, res) => {
  if (!checkSecret(req.get('x-api-key'), process.env.INTAKE_API_KEY)) return res.status(401).json({ error: 'Invalid API key' });
  if (process.env.TWENTY_WEBHOOK_SECRET) {
    const ts = req.get('x-twenty-webhook-timestamp') || '';
    const expected = crypto.createHmac('sha256', process.env.TWENTY_WEBHOOK_SECRET).update(`${ts}:${JSON.stringify(req.body)}`).digest('hex');
    if (!checkSecret(req.get('x-twenty-webhook-signature'), expected)) return res.status(401).json({ error: 'Invalid Twenty signature' });
  }
  try {
    const out = await handleTwentyEvent(req.body);
    res.json({ ok: true, ...out });
  } catch (e) {
    await logEvent(null, 'twenty', req.body?.event || 'event', 'error', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** The telecaller reports a call result: {outcome, notes?, callback_at?}. The manager plans what's next. */
pub.post('/api/crm/leads/:externalId/call', limiter, async (req, res) => {
  if (!checkSecret(req.get('x-api-key'), process.env.INTAKE_API_KEY)) return res.status(401).json({ error: 'Invalid API key' });
  const lead = await get(`SELECT * FROM leads WHERE external_id = :e`, { e: req.params.externalId });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (!engine.CALL_OUTCOMES.includes(b.outcome)) return res.status(400).json({ error: `outcome must be one of: ${engine.CALL_OUTCOMES.join(', ')}` });
  await engine.logCrmCall(lead.id, b.outcome, { notes: String(b.notes || '').slice(0, 2000), callbackAt: b.callback_at || null });
  res.json({ ok: true, lead: await leadSnapshot(await engine.getLead(lead.id)) });
});

/** The telecaller records the client's decision on the proposal: {decision: accepted|declined, reason?}. */
pub.post('/api/crm/leads/:externalId/proposal', limiter, async (req, res) => {
  if (!checkSecret(req.get('x-api-key'), process.env.INTAKE_API_KEY)) return res.status(401).json({ error: 'Invalid API key' });
  const lead = await get(`SELECT * FROM leads WHERE external_id = :e`, { e: req.params.externalId });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const decision = req.body?.decision;
  if (!['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 'decision must be accepted or declined' });
  try {
    await engine.decideProposal(lead.id, decision, { reason: String(req.body.reason || '').slice(0, 1000), by: 'CRM' });
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  res.json({ ok: true, lead: await leadSnapshot(await engine.getLead(lead.id)) });
});

pub.get('/api/crm/leads/:externalId', limiter, async (req, res) => {
  if (!checkSecret(req.get('x-api-key'), process.env.INTAKE_API_KEY)) return res.status(401).json({ error: 'Invalid API key' });
  const lead = await get(`SELECT * FROM leads WHERE external_id = :e`, { e: req.params.externalId });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(await leadSnapshot(lead));
});

// ------------------------------------------------------------------- booking
pub.get('/book/:token', async (req, res) => {
  const s = getSettings();
  const lead = await leadByToken(req.params.token);
  if (!lead || lead.do_not_contact) return notFound(res);
  const existing = await get(`SELECT * FROM meetings WHERE lead_id = :id AND status = 'scheduled' AND start_at > :now`, { id: lead.id, now: new Date().toISOString() });
  if (existing) return res.send(messagePage(s, "You're booked in", `Your call is on ${formatInTz(existing.start_at, s.schedule.timezone)}. Join: ${s.meeting.meet_link}`));
  const days = await engine.availableSlots(s);
  res.send(page({
    title: 'Book a call', settings: s,
    body: `<div class="card"><h1>Book a free ${s.meeting.duration_min}-minute call</h1><p class="muted">For ${esc(lead.company)}. Times shown in ${esc(s.schedule.timezone)}.</p></div>
<form class="card" method="post">${days.map((d) => `<h2 style="font-size:16px;margin-top:14px">${esc(d.label)}</h2><div class="slots">${d.slots
      .map((sl) => `<label class="slot"><input type="radio" name="start_at" value="${esc(sl.iso)}" required><span>${esc(sl.label.split(', ').pop())}</span></label>`).join('')}</div>`).join('')}
<p style="margin-top:22px"><button class="btn">Confirm booking</button></p></form>`,
  }));
});

pub.post('/book/:token', limiter, form, async (req, res) => {
  const s = getSettings();
  const lead = await leadByToken(req.params.token);
  if (!lead) return notFound(res);
  const valid = (await engine.availableSlots(s)).flatMap((d) => d.slots.map((x) => x.iso));
  if (!valid.includes(req.body.start_at)) return res.status(400).send(messagePage(s, 'Slot unavailable', 'Please go back and choose another time.', false));
  try {
    await engine.bookMeeting(lead.id, req.body.start_at);
    res.send(messagePage(s, 'Booked', `See you on ${formatInTz(req.body.start_at, s.schedule.timezone)}. We've sent you a confirmation.`));
  } catch (e) {
    res.status(409).send(messagePage(s, 'Could not book', e.message, false));
  }
});

// ------------------------------------------------------------------ proposal
pub.get('/p/:token', async (req, res) => {
  const s = getSettings();
  const p = await get(`SELECT * FROM proposals WHERE token = :t`, { t: req.params.token });
  if (!p) return notFound(res);
  const lead = await engine.getLead(p.lead_id);
  const cur = s.billing.currency;
  const items = JSON.parse(p.items_json);
  await logEvent(lead.id, 'engagement', 'proposal_view', 'ok', `#${p.id}`);
  const statusNote = {
    accepted: '<p class="ok"><b><svg class="ic" style="vertical-align:-4px" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".15"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Accepted. Thank you!</b></p>', declined: '<p class="bad"><b>Declined</b></p>', superseded: '<p class="muted">This proposal has been replaced by a newer version.</p>',
  }[p.status] || '';
  res.send(page({
    title: `Proposal for ${lead.company}`, settings: s,
    body: `<div class="card hero"><div class="small muted">Proposal #${p.id} · ${new Date(p.created_at).toLocaleDateString('en-IN')}</div><h1>Proposal for ${esc(lead.company)}</h1><p class="muted">Prepared for ${esc(lead.contact_name || lead.company)} by ${esc(s.agency.name)}</p></div>
<div class="card"><table><tr><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr>
${items.map((i) => `<tr><td><b>${esc(i.name)}</b><div class="small muted">${esc(i.detail || '')}</div></td><td class="r">${i.qty}</td><td class="r">${money(i.qty * i.price, cur)}</td></tr>`).join('')}
<tr><td colspan="2" class="r">Subtotal</td><td class="r">${money(p.subtotal, cur)}</td></tr>
<tr><td colspan="2" class="r">${esc(s.billing.tax_label)} ${s.billing.tax_pct}%</td><td class="r">${money(p.tax, cur)}</td></tr>
<tr><td colspan="2" class="r"><b>Total</b></td><td class="r"><b>${money(p.total, cur)}</b></td></tr></table>
<p class="small muted">Payment: ${p.advance_pct}% advance (${money((p.total * p.advance_pct) / 100, cur)}) to start, balance on delivery. Includes 2 revision rounds.</p></div>
<div class="card">${statusNote || `<h2>Ready to go?</h2>
<form method="post" action="/p/${esc(p.token)}/accept" style="display:inline"><button class="btn">Accept proposal</button></form>
<details style="margin-top:16px"><summary class="muted">Decline</summary><form method="post" action="/p/${esc(p.token)}/decline"><label>Reason (optional)</label><textarea name="reason" maxlength="1000"></textarea><button class="btn ghost" style="margin-top:10px">Decline proposal</button></form></details>`}</div>`,
  }));
});

pub.post('/p/:token/accept', limiter, async (req, res) => {
  const s = getSettings();
  try {
    const inv = await engine.acceptProposal(req.params.token);
    res.redirect(`/pay/${inv.token}`);
  } catch (e) {
    res.status(409).send(messagePage(s, 'Could not accept', e.message, false));
  }
});
pub.post('/p/:token/decline', limiter, form, async (req, res) => {
  const s = getSettings();
  try {
    await engine.declineProposal(req.params.token, String(req.body.reason || '').slice(0, 1000));
    res.send(messagePage(s, 'Thanks for letting us know', 'We appreciate your time. Feel free to reach out any time in the future.'));
  } catch (e) {
    res.status(409).send(messagePage(s, 'Could not decline', e.message, false));
  }
});

// ------------------------------------------------------------------- payment
pub.get('/pay/:token', async (req, res) => {
  const s = getSettings();
  const inv = await get(`SELECT * FROM invoices WHERE token = :t`, { t: req.params.token });
  if (!inv) return notFound(res);
  const lead = await engine.getLead(inv.lead_id);
  res.send(page({
    title: `Invoice ${inv.number}`, settings: s,
    body: `<div class="card"><div class="small muted">Invoice ${esc(inv.number)} · ${inv.kind === 'advance' ? 'Advance payment' : 'Final balance'}</div>
<h1>${money(inv.amount, s.billing.currency)}</h1><p class="muted">Billed to ${esc(lead.company)}</p>
${inv.status === 'paid' ? `<p class="ok"><b><svg class="ic" style="vertical-align:-4px" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".15"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Paid on ${formatInTz(inv.paid_at, s.schedule.timezone)}. Thank you!</b></p>`
      : `<form method="post"><button class="btn">Pay now</button></form>
<p class="small muted">Demo checkout: this button marks the invoice as paid. In production, swap it for a Razorpay/Stripe payment link and point the gateway's webhook at <code>/webhooks/payment</code>.</p>`}</div>`,
  }));
});

pub.post('/pay/:token', limiter, async (req, res) => {
  const inv = await get(`SELECT * FROM invoices WHERE token = :t`, { t: req.params.token });
  if (!inv) return notFound(res);
  await engine.markInvoicePaid(inv.id, 'demo checkout');
  res.redirect(`/pay/${inv.token}`);
});

// ---------------------------------------------------------------- onboarding
pub.get('/onboard/:token', async (req, res) => {
  const s = getSettings();
  const lead = await leadByToken(req.params.token);
  if (!lead || !['onboarding', 'in_development', 'delivered', 'completed'].includes(lead.stage)) return notFound(res);
  if (await get(`SELECT 1 FROM projects WHERE lead_id = :id`, { id: lead.id })) return res.redirect(`/status/${lead.token}`);
  res.send(page({
    title: 'Project brief', settings: s,
    body: `<div class="card"><h1>Project brief: ${esc(lead.company)}</h1><p class="muted">About 5 minutes. This helps us design exactly what you need.</p></div>
<form class="card" method="post">
<label>What is the main goal of the website?</label><select name="goal"><option>Get more enquiries / leads</option><option>Sell products online</option><option>Build credibility / brand</option><option>Bookings & appointments</option><option>Other</option></select>
<label>Pages you need</label><input name="pages" value="Home, About, Services, Gallery, Contact" maxlength="500">
<label>Domain name (existing or desired)</label><input name="domain" maxlength="200" value="${esc(lead.website || '')}">
<label>Brand colours</label><input name="colors" maxlength="200" placeholder="e.g. navy blue and gold">
<label>Logo link (Google Drive / Dropbox)</label><input name="logo_url" maxlength="500">
<label>Websites you like (for style)</label><textarea name="references" maxlength="2000"></textarea>
<label>Content</label><select name="content"><option>I will provide text & photos</option><option>Please write the content for me</option><option>Mix of both</option></select>
<label>Target customers</label><textarea name="audience" maxlength="2000"></textarea>
<label>Anything else we should know?</label><textarea name="extra" maxlength="3000"></textarea>
<button class="btn" style="margin-top:16px">Submit brief</button></form>`,
  }));
});

pub.post('/onboard/:token', limiter, form, async (req, res) => {
  const s = getSettings();
  const lead = await leadByToken(req.params.token);
  if (!lead || lead.stage !== 'onboarding') return notFound(res);
  const brief = Object.fromEntries(['goal', 'pages', 'domain', 'colors', 'logo_url', 'references', 'content', 'audience', 'extra'].map((k) => [k, String(req.body[k] || '').slice(0, 3000)]));
  try {
    await engine.submitOnboarding(lead.id, brief);
    res.redirect(`/status/${lead.token}`);
  } catch (e) {
    res.status(409).send(messagePage(s, 'Already received', e.message));
  }
});

// -------------------------------------------------------------- client portal
pub.get('/status/:token', async (req, res) => {
  const s = getSettings();
  const lead = await leadByToken(req.params.token);
  const project = lead && await get(`SELECT * FROM projects WHERE lead_id = :id ORDER BY id DESC LIMIT 1`, { id: lead.id });
  if (!project) return notFound(res);
  const ms = await all(`SELECT * FROM milestones WHERE project_id = :id ORDER BY position`, { id: project.id });
  const pct = ms.length ? Math.round((ms.filter((m) => m.done).length / ms.length) * 100) : 0;
  const invoices = await all(`SELECT * FROM invoices WHERE lead_id = :id ORDER BY id`, { id: lead.id });
  res.send(page({
    title: `${lead.company}: project status`, settings: s,
    body: `<div class="card"><div class="small muted">Project status</div><h1>${esc(lead.company)}</h1>
<div class="bar"><div style="width:${pct}%"></div></div><p><b>${pct}% complete</b> · <span class="pill">${esc(project.status)}</span></p></div>
<div class="card"><h2>Milestones</h2><ul class="clean">${ms.map((m) => `<li>${m.done ? '<svg class="ic" style="vertical-align:-4px" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".15"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '<svg class="ic" style="vertical-align:-4px" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".45"/></svg>'} ${esc(m.name)}${m.done_at ? ` <span class="small muted">· ${formatInTz(m.done_at, s.schedule.timezone)}</span>` : ''}</li>`).join('')}</ul></div>
<div class="card"><h2>Invoices</h2><ul class="clean">${invoices.map((i) => `<li><a href="/pay/${esc(i.token)}">${esc(i.number)}</a> · ${money(i.amount, s.billing.currency)} · ${i.status === 'paid' ? '<span class="ok">paid</span>' : '<b>pending</b>'}</li>`).join('')}</ul></div>`,
  }));
});

// --------------------------------------------------------------- unsubscribe
pub.get('/u/:token', async (req, res) => {
  const s = getSettings();
  const lead = await leadByToken(req.params.token);
  if (!lead) return notFound(res);
  res.send(page({ title: 'Unsubscribe', settings: s, body: `<form class="card" method="post"><h1>Unsubscribe</h1><p class="muted">Stop all messages from ${esc(s.agency.name)} to ${esc(lead.company)}?</p><button class="btn">Yes, unsubscribe me</button></form>` }));
});
pub.post('/u/:token', limiter, async (req, res) => {
  const lead = await leadByToken(req.params.token);
  if (!lead) return notFound(res);
  await engine.setStage(lead, 'do_not_contact', 'unsubscribed via link', { do_not_contact: 1, wa_opt_in: 0, email_opt_in: 0, next_action_at: null });
  res.send(messagePage(getSettings(), 'Unsubscribed', "You won't hear from us again. Sorry for the bother!"));
});

// ------------------------------------------------------------------ webhooks

/** Meta verification handshake. */
pub.get('/webhooks/whatsapp', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && checkSecret(req.query['hub.verify_token'], process.env.WA_VERIFY_TOKEN)) return res.send(req.query['hub.challenge']);
  res.sendStatus(403);
});

/** Incoming WhatsApp messages (Cloud API format). */
pub.post('/webhooks/whatsapp', async (req, res) => {
  res.sendStatus(200); // ack fast, Meta retries otherwise
  for (const entry of req.body?.entry || []) {
    for (const change of entry.changes || []) {
      for (const msg of change.value?.messages || []) {
        const text = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || `[${msg.type}]`;
        const lead = await engine.findLeadByContact({ phone: '+' + msg.from });
        if (!lead) { await logEvent(null, 'inbound', 'whatsapp', 'skipped', `unknown sender +${msg.from}`); continue; }
        await engine.handleInbound(lead.id, 'whatsapp', text, { providerId: msg.id }).catch(async (e) => await logEvent(lead.id, 'inbound', 'whatsapp', 'error', e.message));
      }
    }
  }
});

/** Generic inbound email: {from, subject, text}. Feed from Gmail via n8n/Apps Script, Mailgun/SendGrid inbound parse, etc. */
pub.post('/webhooks/email', async (req, res) => {
  if (!checkSecret(req.get('x-webhook-secret'), process.env.WEBHOOK_SECRET)) return res.sendStatus(401);
  const from = String(req.body?.from || '').match(/[^\s<>"]+@[^\s<>"]+/)?.[0];
  const lead = from && await engine.findLeadByContact({ email: from });
  if (!lead) { await logEvent(null, 'inbound', 'email', 'skipped', `unknown sender ${from}`); return res.json({ matched: false }); }
  const intent = await engine.handleInbound(lead.id, 'email', String(req.body.text || '').slice(0, 10000), { subject: req.body.subject });
  res.json({ matched: true, lead_id: lead.id, intent });
});

/** Payment gateway webhook: {invoice_number | invoice_token, status:'paid', reference}. */
pub.post('/webhooks/payment', async (req, res) => {
  if (!checkSecret(req.get('x-webhook-secret'), process.env.WEBHOOK_SECRET)) return res.sendStatus(401);
  const b = req.body || {};
  const inv = await get(`SELECT * FROM invoices WHERE token = :t OR number = :n`, { t: b.invoice_token || '-', n: b.invoice_number || '-' });
  if (!inv) return res.status(404).json({ error: 'invoice not found' });
  if (b.status === 'paid') await engine.markInvoicePaid(inv.id, b.reference || 'gateway');
  res.json({ ok: true });
});
