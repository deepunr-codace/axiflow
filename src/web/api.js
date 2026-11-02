import express from 'express';
import { get, all, run, insert, update } from '../db.js';
import { getSettings, saveSettings, getTemplates } from '../settings.js';
import { STAGES, STAGE_IDS, SERVICES, SOURCES, PIPES } from '../stages.js';
import { BASE_URL, nowISO, addDays, parseCSV, toCSV } from '../util.js';
import { channelStatus } from '../pipeline/channels.js';
import { auditWebsite, recommendPackage } from '../pipeline/enrich.js';
import { logEvent, addActivity, addTask } from '../pipeline/log.js';
import * as engine from '../pipeline/engine.js';
import { schedulerInfo, refreshBriefing } from '../scheduler.js';
import { aiStatus } from '../ai/claude.js';
import { planNextAction } from '../ai/manager.js';
import { crmConfigured, flushOutbox } from '../crm-sync.js';
import { login, logout, requireAuth, isAuthed } from './auth.js';
import { seedDemo } from '../seed.js';
import * as tools from '../tools.js';
import { VERTICALS, LANGUAGES } from '../ai/script.js';
import * as plans from '../plans.js';
import * as templates from '../design/templates.js';
import { ICONS } from '../design/icons.js';
import { PRICING } from '../design/render-pdf.js';
import { saveDataUrl, srcPath } from '../design/model.js';
import { readUpload } from '../storage.js';

export const api = express.Router();

api.post('/login', login);
api.post('/logout', logout);
api.get('/me', (req, res) => res.json({ authed: isAuthed(req) }));
api.use(requireAuth);

const LIST_COLS = `id, token, company, contact_name, email, phone, website, industry, city, source, service, budget, stage, score, interested,
  wa_opt_in, email_opt_in, do_not_contact, owner, tags, recommended_package, last_contacted_at, last_channel, next_action_at, attempts, created_at, updated_at,
  pipe, external_id, next_action_type, next_action_note, touch_index, pitch_source`;

api.get('/meta', async (_req, res) => {
  const s = getSettings();
  res.json({
    stages: STAGES, services: SERVICES, sources: SOURCES, pipes: PIPES, base_url: BASE_URL, ai: await aiStatus(), crm_sync: crmConfigured(),
    call_outcomes: engine.CALL_OUTCOMES,
    channels: channelStatus(s), scheduler: await schedulerInfo(),
    intake_key_set: !!process.env.INTAKE_API_KEY, agency: s.agency.name, currency: s.billing.currency,
    packages: s.packages.map((p) => ({ id: p.id, name: p.name, price: p.price })),
  });
});

// ------------------------------------------------------------------ dashboard
api.get('/dashboard', async (_req, res) => {
  const one = async (sql, p) => await get(sql, p);
  const byStage = Object.fromEntries((await all(`SELECT stage, COUNT(*) n FROM leads GROUP BY stage`)).map((r) => [r.stage, r.n]));
  const total = (await one(`SELECT COUNT(*) n FROM leads`)).n;
  const contacted = (await one(`SELECT COUNT(DISTINCT lead_id) n FROM messages WHERE direction='out' AND template_key='intro' AND status IN ('sent','mock')`)).n;
  const replied = (await one(`SELECT COUNT(DISTINCT lead_id) n FROM messages WHERE direction='in'`)).n;
  const meetings = (await one(`SELECT COUNT(DISTINCT lead_id) n FROM meetings`)).n;
  const won = (await one(`SELECT COUNT(*) n FROM leads WHERE stage IN ('won','onboarding','in_development','delivered','completed')`)).n;
  const money = {
    open_proposals: (await one(`SELECT COALESCE(SUM(total),0) v FROM proposals WHERE status='sent'`)).v,
    contracted: (await one(`SELECT COALESCE(SUM(total),0) v FROM proposals WHERE status='accepted'`)).v,
    collected: (await one(`SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='paid'`)).v,
    outstanding: (await one(`SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='pending'`)).v,
  };
  const since = addDays(nowISO(), -13).slice(0, 10);
  const daily = await all(`SELECT substr(created_at,1,10) d, COUNT(*) n FROM leads WHERE substr(created_at,1,10) >= :since GROUP BY d`, { since });
  const dailyMsgs = await all(`SELECT substr(created_at,1,10) d, COUNT(*) n FROM messages WHERE direction='out' AND substr(created_at,1,10) >= :since GROUP BY d`, { since });
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(nowISO(), -i).slice(0, 10);
    days.push({ d, leads: daily.find((x) => x.d === d)?.n || 0, messages: dailyMsgs.find((x) => x.d === d)?.n || 0 });
  }
  res.json({
    total, contacted, replied, meetings, won, money, by_stage: byStage, days,
    reply_rate: contacted ? Math.round((replied / contacted) * 100) : 0,
    win_rate: total ? Math.round((won / total) * 100) : 0,
    channels: await all(`SELECT channel, status, COUNT(*) n FROM messages WHERE direction='out' GROUP BY channel, status`),
    sources: await all(`SELECT COALESCE(source,'?') source, COUNT(*) n, SUM(CASE WHEN stage IN ('won','onboarding','in_development','delivered','completed') THEN 1 ELSE 0 END) won FROM leads GROUP BY source ORDER BY n DESC`),
    approvals: byStage.brochure_ready || 0,
    open_tasks: (await one(`SELECT COUNT(*) n FROM tasks WHERE done=0`)).n,
    upcoming_meetings: await all(`SELECT m.*, l.company FROM meetings m JOIN leads l ON l.id=m.lead_id WHERE m.status='scheduled' ORDER BY m.start_at LIMIT 5`),
    recent: await all(`SELECT e.*, l.company FROM events e LEFT JOIN leads l ON l.id=e.lead_id ORDER BY e.id DESC LIMIT 12`),
    last_run: await get(`SELECT * FROM runs ORDER BY id DESC LIMIT 1`),
    pipes: Object.fromEntries((await all(`SELECT COALESCE(pipe,'conversion') pipe, COUNT(*) n FROM leads WHERE stage NOT IN ('completed','closed_no_reply','not_interested','lost','do_not_contact') GROUP BY pipe`)).map((r) => [r.pipe, r.n])),
    calls_due: (await one(`SELECT COUNT(*) n FROM tasks WHERE kind='call' AND done=0`)).n,
    drafts: (await one(`SELECT COUNT(*) n FROM tasks WHERE kind='reply_draft' AND done=0`)).n,
    briefing: await get(`SELECT * FROM briefings ORDER BY id DESC LIMIT 1`),
    ai: await aiStatus(),
    scheduler: await schedulerInfo(),
  });
});

// ---------------------------------------------------------------------- leads
api.get('/leads', async (req, res) => {
  const where = [];
  const p = {};
  if (req.query.stage) { where.push('stage = :stage'); p.stage = req.query.stage; }
  if (req.query.source) { where.push('source = :source'); p.source = req.query.source; }
  if (req.query.q) {
    where.push(`(company ILIKE :q OR contact_name ILIKE :q OR email ILIKE :q OR phone ILIKE :q OR city ILIKE :q OR tags ILIKE :q)`);
    p.q = `%${req.query.q}%`;
  }
  const sort = { score: 'score DESC', created: 'id DESC', updated: 'updated_at DESC', company: 'LOWER(company)' }[req.query.sort] || 'id DESC';
  res.json(await all(`SELECT ${LIST_COLS} FROM leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} LIMIT 1000`, p));
});

api.post('/leads', async (req, res) => {
  if (!req.body?.company && !req.body?.contact_name) return res.status(400).json({ error: 'Company or contact name is required' });
  res.json(await engine.createLead(req.body, { source: req.body.source || 'manual' }));
});

api.get('/leads/export.csv', async (_req, res) => {
  const rows = await all(`SELECT ${LIST_COLS} FROM leads ORDER BY id`);
  res.type('text/csv').attachment('leads.csv').send(toCSV(rows, LIST_COLS.split(',').map((c) => c.trim())));
});

api.post('/leads/import', express.text({ type: '*/*', limit: '5mb' }), async (req, res) => {
  const rows = parseCSV(String(req.body || ''));
  const result = { created: 0, duplicates: 0, skipped: 0 };
  for (const r of rows) {
    if (!r.company && !r.company_name && !r.name && !r.contact_name) { result.skipped++; continue; }
    const out = await engine.createLead(r, { source: r.source || 'csv' });
    out.duplicate ? result.duplicates++ : result.created++;
  }
  res.json(result);
});

api.get('/leads/:id', async (req, res) => {
  const id = Number(req.params.id);
  const lead = await engine.getLead(id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  delete lead.brochure_html;
  delete lead.design_html;
  const project = await get(`SELECT * FROM projects WHERE lead_id = :id ORDER BY id DESC LIMIT 1`, { id });
  res.json({
    lead,
    activities: await all(`SELECT * FROM activities WHERE lead_id = :id ORDER BY id DESC LIMIT 200`, { id }),
    messages: await all(`SELECT * FROM messages WHERE lead_id = :id ORDER BY id DESC LIMIT 200`, { id }),
    tasks: await all(`SELECT * FROM tasks WHERE lead_id = :id ORDER BY done, id DESC`, { id }),
    meetings: await all(`SELECT * FROM meetings WHERE lead_id = :id ORDER BY start_at DESC`, { id }),
    proposals: await all(`SELECT * FROM proposals WHERE lead_id = :id ORDER BY id DESC`, { id }),
    invoices: await all(`SELECT * FROM invoices WHERE lead_id = :id ORDER BY id DESC`, { id }),
    project,
    milestones: project ? await all(`SELECT * FROM milestones WHERE project_id = :pid ORDER BY position`, { pid: project.id }) : [],
    events: await all(`SELECT * FROM events WHERE lead_id = :id ORDER BY id DESC LIMIT 100`, { id }),
  });
});

const EDITABLE = ['external_id', 'company', 'contact_name', 'email', 'phone', 'website', 'industry', 'city', 'country', 'source', 'service', 'budget', 'notes',
  'pitch', 'tags', 'owner', 'interested', 'wa_opt_in', 'email_opt_in', 'consent_source', 'do_not_contact', 'recommended_package'];

api.patch('/leads/:id', async (req, res) => {
  const id = Number(req.params.id);
  const lead = await engine.getLead(id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => EDITABLE.includes(k)));
  const norm = engine.normalizeLeadInput({ ...lead, ...patch });
  const data = {};
  for (const k of Object.keys(patch)) data[k] = k === 'recommended_package' ? patch[k] : norm[k];
  if ('email' in patch) data.email_valid = norm.email_valid;
  if ('phone' in patch) data.phone_valid = norm.phone_valid;
  if ((patch.wa_opt_in || patch.email_opt_in) && !lead.consent_at) data.consent_at = nowISO();
  const interestChanged = 'interested' in data && data.interested !== lead.interested;
  if (interestChanged) delete data.interested;
  await update('leads', id, { ...data, updated_at: nowISO() });
  await addActivity(id, 'system', `Edited: ${Object.keys(data).join(', ')}${interestChanged ? ', interested' : ''}`);
  if (interestChanged) await engine.applyInterestChange(id, norm.interested, 'interest changed in CRM');
  await engine.rescore(id);
  if (data.do_not_contact && lead.stage !== 'do_not_contact') await engine.setStage(await engine.getLead(id), 'do_not_contact', 'flagged in CRM');
  res.json({ ok: true });
});

api.delete('/leads/:id', async (req, res) => {
  await run(`DELETE FROM leads WHERE id = :id`, { id: Number(req.params.id) });
  await logEvent(null, 'crm', 'delete', 'ok', `lead #${req.params.id}`);
  res.json({ ok: true });
});

api.post('/leads/:id/stage', async (req, res) => {
  if (!STAGE_IDS.has(req.body.stage)) return res.status(400).json({ error: 'Unknown stage' });
  await engine.moveStage(Number(req.params.id), req.body.stage);
  res.json({ ok: true });
});

api.post('/leads/:id/actions/:action', async (req, res) => {
  const id = Number(req.params.id);
  const lead = await engine.getLead(id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  switch (req.params.action) {
    case 'approve': await engine.approveBrochure(id, 'admin'); await engine.advance(id); break;
    case 'regenerate': await engine.regenerateBrochure(id); break;
    case 'disqualify': await engine.setStage(lead, 'lost', b.reason || 'disqualified', { lost_reason: b.reason || 'disqualified', next_action_at: null }); break;
    case 'send_now': await engine.advance(id, { force: true }); break;
    case 'run': await engine.advance(id); break;
    case 'reply': await engine.handleInbound(id, b.channel || 'whatsapp', b.text || 'Yes, interested'); break;
    case 'proposal': await engine.createAndSendProposal(id); break;
    case 'mark_paid': await engine.markInvoicePaid(Number(b.invoice_id), 'manual (CRM)'); break;
    case 'book': await engine.bookMeeting(id, b.start_at); break;
    case 'rescore': await engine.rescore(id); break;
    case 'reaudit': {
      const audit = await auditWebsite(lead.website);
      await update('leads', id, { audit_json: audit, recommended_package: recommendPackage(lead, audit, getSettings().packages) });
      await engine.rescore(id);
      await addActivity(id, 'system', `Website re-audited: ${audit.issues} finding(s)`);
      break;
    }
    case 'repitch': await engine.runPitchMaker(id); break;
    case 'redesign': await engine.runDesign(id); await engine.generateBrochure(id); break;
    case 'proposal_decision': await engine.decideProposal(id, b.decision, { reason: b.reason, by: 'admin' }); break;
    case 'test_crm_call': await engine.logCrmCall(id, b.outcome, { notes: b.notes }); break;
    case 'pitch_note': await update('leads', id, { pitch: String(b.pitch || '').slice(0, 2000) }); await engine.generateBrochure(id); break;
    case 'call_outcome': await engine.logCallOutcome(Number(b.task_id), b.outcome, { notes: b.notes, callbackAt: b.callback_at }); break;
    case 'log_call': {
      const taskId = await insert('tasks', { lead_id: id, kind: 'call', title: `📞 Call ${lead.company}`, created_at: nowISO() });
      await engine.logCallOutcome(taskId, b.outcome, { notes: b.notes, callbackAt: b.callback_at });
      break;
    }
    case 'send_draft': await engine.sendDraft(Number(b.task_id), b.text); break;
    case 'send_message': {
      const r = await engine.sendDraftText(id, String(b.text || ''), b.channel || null);
      if (!r.ok) throw new Error(`Not sent: ${r.reason}`);
      break;
    }
    case 'plan_next': await engine.scheduleNext(id, await planNextAction(lead, 'manual request')); break;
    case 'note': await addActivity(id, 'note', 'Note', b.body); break;
    case 'task': await addTask(id, b.title, b.due_at || null); break;
    case 'reopen':
      await update('leads', id, { do_not_contact: 0 });
      await engine.setStage(await engine.getLead(id), 'new', 'reopened');
      await engine.advance(id);
      break;
    default: return res.status(400).json({ error: 'Unknown action' });
  }
  res.json({ ok: true, lead: { stage: (await engine.getLead(id))?.stage } });
});

// ------------------------------------------------------- tasks / messages / log
api.get('/tasks', async (req, res) => {
  res.json(await all(`SELECT t.*, l.company FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id
    ${req.query.all ? '' : 'WHERE t.done = 0'} ORDER BY t.done, COALESCE(t.due_at, t.created_at) LIMIT 500`));
});
api.post('/tasks', async (req, res) => res.json({ id: await insert('tasks', { lead_id: req.body.lead_id || null, title: req.body.title, due_at: req.body.due_at || null, created_at: nowISO() }) }));
api.patch('/tasks/:id', async (req, res) => {
  await update('tasks', Number(req.params.id), { done: req.body.done ? 1 : 0, done_at: req.body.done ? nowISO() : null });
  res.json({ ok: true });
});

api.get('/messages', async (req, res) => {
  const p = {};
  const where = [];
  if (req.query.direction) { where.push('m.direction = :direction'); p.direction = req.query.direction; }
  if (req.query.channel) { where.push('m.channel = :channel'); p.channel = req.query.channel; }
  res.json(await all(`SELECT m.*, l.company FROM messages m LEFT JOIN leads l ON l.id = m.lead_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.id DESC LIMIT 300`, p));
});

api.get('/events', async (req, res) => {
  const p = {};
  const where = [];
  if (req.query.status) { where.push('e.status = :status'); p.status = req.query.status; }
  if (req.query.workflow) { where.push('e.workflow = :workflow'); p.workflow = req.query.workflow; }
  res.json(await all(`SELECT e.*, l.company FROM events e LEFT JOIN leads l ON l.id = e.lead_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT 500`, p));
});
api.get('/events.csv', async (_req, res) => {
  const rows = await all(`SELECT e.*, l.company FROM events e LEFT JOIN leads l ON l.id = e.lead_id ORDER BY e.id`);
  res.type('text/csv').attachment('automation-log.csv').send(toCSV(rows, ['id', 'created_at', 'lead_id', 'company', 'workflow', 'step', 'status', 'detail']));
});

api.get('/runs', async (_req, res) => res.json(await all(`SELECT * FROM runs ORDER BY id DESC LIMIT 50`)));
api.post('/run', async (_req, res) => res.json(await engine.runPipeline('manual')));

api.get('/projects', async (_req, res) => {
  const projects = await all(`SELECT p.*, l.company, l.stage, l.token FROM projects p JOIN leads l ON l.id = p.lead_id ORDER BY p.id DESC`);
  for (const p of projects) p.milestones = await all(`SELECT * FROM milestones WHERE project_id = :id ORDER BY position`, { id: p.id });
  res.json(projects);
});
api.patch('/milestones/:id', async (req, res) => {
  await engine.setMilestone(Number(req.params.id), !!req.body.done);
  res.json({ ok: true });
});

api.get('/invoices', async (_req, res) => res.json(await all(`SELECT i.*, l.company FROM invoices i JOIN leads l ON l.id = i.lead_id ORDER BY i.id DESC`)));

api.get('/slots', async (_req, res) => res.json(await engine.availableSlots()));

// -------------------------------------------------------------------- manager
api.get('/manager', async (_req, res) => {
  const now = nowISO();
  res.json({
    briefing: await get(`SELECT * FROM briefings ORDER BY id DESC LIMIT 1`),
    calls: await all(`SELECT t.*, l.company, l.phone, l.contact_name, l.stage FROM tasks t JOIN leads l ON l.id = t.lead_id WHERE t.kind = 'call' AND t.done = 0 ORDER BY COALESCE(t.due_at, t.created_at)`),
    drafts: await all(`SELECT t.*, l.company, l.last_inbound_channel FROM tasks t JOIN leads l ON l.id = t.lead_id WHERE t.kind = 'reply_draft' AND t.done = 0 ORDER BY t.id DESC`),
    approvals: await all(`SELECT id, company, contact_name, score, pitch_source FROM leads WHERE stage = 'brochure_ready' ORDER BY score DESC`),
    replies: await all(`SELECT m.lead_id, m.channel, m.body, m.created_at, l.company, l.stage FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.direction = 'in' ORDER BY m.id DESC LIMIT 10`),
    upcoming: await all(`SELECT id, company, stage, pipe, next_action_type, next_action_at, next_action_note FROM leads WHERE next_action_at IS NOT NULL AND stage NOT IN ('completed','closed_no_reply','not_interested','lost','do_not_contact') ORDER BY next_action_at LIMIT 25`),
    researching: await all(`SELECT id, company FROM leads WHERE stage = 'researching'`),
    hot: await all(`SELECT id, company, contact_name, stage FROM leads WHERE stage IN ('replied','meeting_booked','proposal_sent','won') ORDER BY CASE stage WHEN 'replied' THEN 0 WHEN 'proposal_sent' THEN 1 WHEN 'meeting_booked' THEN 2 ELSE 3 END, updated_at DESC`),
    ai: await aiStatus(),
    now,
  });
});
api.post('/manager/briefing', async (_req, res) => res.json(await refreshBriefing()));
api.get('/ai/calls', async (_req, res) => res.json(await all(`SELECT a.*, l.company FROM ai_calls a LEFT JOIN leads l ON l.id = a.lead_id ORDER BY a.id DESC LIMIT 200`)));
api.get('/crm/outbox', async (_req, res) => res.json(await all(`SELECT id, lead_id, event, status, attempts, last_error, created_at, sent_at FROM crm_outbox ORDER BY id DESC LIMIT 200`)));
api.post('/crm/flush', async (_req, res) => { await flushOutbox(); res.json({ ok: true }); });

// --------------------------------------------------------- templates/settings
api.get('/templates', async (_req, res) => res.json(await getTemplates()));
api.put('/templates/:key', async (req, res) => {
  const b = req.body || {};
  await run(`UPDATE templates SET subject=:subject, email_body=:email_body, wa_body=:wa_body, wa_template_name=:wa_template_name WHERE key=:key`,
    { key: req.params.key, subject: b.subject, email_body: b.email_body, wa_body: b.wa_body, wa_template_name: b.wa_template_name });
  res.json({ ok: true });
});

api.get('/settings', async (_req, res) => res.json({
  settings: getSettings(),
  env: {
    base_url: BASE_URL,
    webhooks: {
      intake: `${BASE_URL}/api/intake`, whatsapp: `${BASE_URL}/webhooks/whatsapp`, email: `${BASE_URL}/webhooks/email`,
      payment: `${BASE_URL}/webhooks/payment`, public_form: `${BASE_URL}/f`, crm_update: `${BASE_URL}/api/crm/leads/:external_id`,
    },
    intake_key_set: !!process.env.INTAKE_API_KEY, webhook_secret_set: !!process.env.WEBHOOK_SECRET,
    crm_webhook: crmConfigured(), ai: await aiStatus(),
    channels: channelStatus(getSettings()),
  },
}));
api.put('/settings', async (req, res) => res.json(await saveSettings(req.body || {})));

api.post('/demo/seed', async (_req, res) => res.json(await seedDemo()));

// ------------------------------------------------- AI Brochure / Proposal tools
api.get('/tools/options', async (req, res) => {
  const s = getSettings();
  const kind = tools.KINDS.includes(req.query.kind) ? req.query.kind : 'brochure';
  res.json({
    verticals: VERTICALS, languages: LANGUAGES,
    packages: s.packages.map((p) => ({ id: p.id, name: p.name, price: p.price })),
    services: s.brochure.services.map((x) => ({ id: x.id, name: x.name })),
    leads: await all(`SELECT id, company, contact_name, city FROM leads ORDER BY updated_at DESC LIMIT 200`),
    templates: kind === 'script' ? [] : await templates.listTemplates(kind),
    ai: await aiStatus(),
  });
});
api.get('/tools/prefill/:leadId', async (req, res) => res.json(await tools.leadPrefill(Number(req.params.leadId)) || {}));
api.get('/tools/docs', async (req, res) => res.json(await tools.listDocs(tools.KINDS.includes(req.query.kind) ? req.query.kind : 'brochure')));
api.post('/tools/docs/:id/use-for-lead', async (req, res) => res.json(await tools.useScriptForLead(Number(req.params.id))));
api.post('/tools/:kind', async (req, res) => res.json({ id: await tools.createDoc(req.params.kind, req.body || {}) }));
api.get('/tools/docs/:id', async (req, res) => {
  const d = await tools.getDoc(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(await tools.docSummary(d));
});
api.put('/tools/docs/:id', async (req, res) => res.json(await tools.docSummary(await tools.saveDoc(Number(req.params.id), req.body || {}))));
api.post('/tools/docs/:id/regenerate', async (req, res) => {
  const d = await tools.getDoc(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Not found' });
  await tools.generate(d.id);
  res.json({ ok: true });
});
api.post('/tools/docs/:id/chat', async (req, res) => {
  const r = await tools.chat(Number(req.params.id), req.body?.message, { page: Number(req.body?.page) || 1, selected: req.body?.selected || null });
  res.json({ reply: r.reply, applied: r.applied, skipped: r.skipped, doc: await tools.docSummary(r.doc) });
});
api.post('/tools/docs/:id/save-template', async (req, res) => {
  const d = await tools.getDoc(Number(req.params.id));
  if (!d?.design) return res.status(404).json({ error: 'Not found' });
  res.json({ id: await templates.saveAsTemplate({ kind: d.kind, name: req.body?.name, design: d.design, company: d.input.company }) });
});
api.delete('/tools/docs/:id', async (req, res) => { await tools.deleteDoc(Number(req.params.id)); res.json({ ok: true }); });
api.get('/tools/docs/:id/pdf', async (req, res) => {
  const d = await tools.getDoc(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Not found' });
  const buf = await tools.docPdf(d);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${tools.docFilename(d)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

// --------------------------------------------------------- design templates
api.get('/design/meta', (_req, res) => {
  const s = getSettings();
  res.json({ icons: ICONS, pricing: PRICING, currency: s.billing.currency, tax_label: s.billing.tax_label });
});
api.get('/design/templates', async (req, res) => res.json(await templates.listTemplates(req.query.kind === 'proposal' ? 'proposal' : 'brochure')));
api.get('/design/templates/:id/preview', async (req, res) => {
  const d = await tools.templatePreview(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(req.query.all ? d : { pages: d.pages.slice(0, 1) });
});
api.post('/design/templates/:id/default', async (req, res) => { await templates.setDefault(Number(req.params.id)); res.json({ ok: true }); });
api.put('/design/templates/:id', async (req, res) => { await templates.renameTemplate(Number(req.params.id), req.body?.name); res.json({ ok: true }); });
api.delete('/design/templates/:id', async (req, res) => { await templates.deleteTemplate(Number(req.params.id)); res.json({ ok: true }); });
// Page images are uploaded one by one first (Vercel caps request bodies at 4.5 MB), so this body is small.
api.post('/design/templates/import', express.json({ limit: '4mb' }), async (req, res) => res.json({ id: await templates.importTemplate(req.body || {}) }));

// Images used in designs: upload (data URL) and serve (assets/ + data/uploads/).
api.post('/design/images', express.json({ limit: '4.4mb' }), async (req, res) => res.json({ src: await saveDataUrl(req.body?.image, 'images') }));
api.get('/design/file', async (req, res) => {
  const src = String(req.query.src || '');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  if (src.startsWith('upload:')) {
    const buf = await readUpload(src.slice(7));
    if (!buf) return res.status(404).end();
    res.type(/\.png$/i.test(src) ? 'png' : 'jpeg');
    return res.send(buf);
  }
  const p = srcPath(src);
  if (!p) return res.status(404).end();
  res.sendFile(p);
});

// ------------------------------------------------------------ revenue plans
const planId = (req) => Number(req.params.id);
const withStatus = async (p) => (p ? { plan: p, status: await plans.planStatus(p) } : null);
api.get('/plans', async (_req, res) => res.json({ plans: await plans.listPlans(), today: plans.today() }));
api.get('/plans/presets', (_req, res) => res.json({ presets: plans.presets(), today: plans.today() }));
api.get('/plans/active', async (_req, res) => res.json(await plans.activePlan()));
api.post('/plans/calc', (req, res) => {
  const b = req.body || {};
  if (!b.start_date || !b.end_date || Date.parse(b.end_date) < Date.parse(b.start_date)) throw new Error('Pick a valid date range');
  const t = plans.buildTargets(b);
  res.json({ ...t, weeks_range: plans.weeksOf(b.start_date, b.end_date, b.work_days?.length ? b.work_days.map(Number) : [1, 2, 3, 4, 5, 6]) });
});
api.post('/plans', async (req, res) => res.json(await withStatus(await plans.createPlan(req.body || {}))));
api.get('/plans/:id', async (req, res) => {
  const p = await plans.getPlan(planId(req));
  if (!p) return res.status(404).json({ error: 'Plan not found' });
  res.json({ ...await withStatus(p), entries: await all(`SELECT * FROM plan_entries WHERE plan_id = :id ORDER BY date DESC, id DESC LIMIT 200`, { id: p.id }) });
});
api.put('/plans/:id', async (req, res) => res.json(await withStatus(await plans.updatePlan(planId(req), req.body || {}))));
api.post('/plans/:id/status', async (req, res) => res.json(await withStatus(await plans.setStatus(planId(req), String(req.body?.status || '')))));
api.post('/plans/:id/duplicate', async (req, res) => res.json(await withStatus(await plans.duplicatePlan(planId(req)))));
api.delete('/plans/:id', async (req, res) => { await plans.deletePlan(planId(req)); res.json({ ok: true }); });
api.post('/plans/:id/entries', async (req, res) => res.json({ id: await plans.addEntry(planId(req), req.body || {}) }));
api.delete('/plans/:id/entries/:entry', async (req, res) => { await plans.deleteEntry(planId(req), Number(req.params.entry)); res.json({ ok: true }); });

api.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(400).json({ error: err.message });
});
