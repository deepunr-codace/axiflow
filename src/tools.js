import { addColumns, get, all, insert, update, run } from './db.js';
import { background } from './background.js';
import { writeScript, VERTICALS, LANGUAGES } from './ai/script.js';
import { scriptPdf } from './pdf/script.js';
import { auditWebsite } from './pipeline/enrich.js';
import { addActivity } from './pipeline/log.js';
import { crmEvent } from './crm-sync.js';
import { getSettings } from './settings.js';
import { nowISO, token, normalizeUrl, BASE_URL } from './util.js';
import { aiEnabled } from './ai/claude.js';
import { researchLead } from './ai/pitchmaker.js';
import { writeBrochure, brochureVars, templateBrochure } from './ai/brochure.js';
import { writeProposalDoc, templateProposal } from './ai/proposal-doc.js';
import { fillTemplate, chatEdit } from './ai/design-ai.js';
import { brochureDesign, proposalDesign } from './design/layouts.js';
import { renderDesignPdf } from './design/render-pdf.js';
import { cleanDesign, cloneDesign, fillTokens } from './design/model.js';
import { getTemplate, defaultTemplate } from './design/templates.js';

/*
 * AI Brochure Generator and AI Proposal Generator.
 * A document = form input + a design (pages of editable elements) made from a template,
 * plus (proposals) the price line items. The editor, the AI assistant and the PDF all use the design.
 */
addColumns('docs', { design_json: 'TEXT', template_id: 'INTEGER', chat_json: 'TEXT' });

const parse = (j, fb = null) => { try { return j ? JSON.parse(j) : fb; } catch { return fb; } };
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

function pseudoLead(input) {
  return {
    id: null, token: '', company: input.company, contact_name: input.contact_name || '',
    industry: input.industry || null, city: input.city || null, website: normalizeUrl(input.website),
    notes: input.notes || null, recommended_package: input.package || null, service: input.package || null,
    stage: 'tool', pipe: 'conversion', interested: 'yes', score: 0, attempts: 0,
    wa_opt_in: 0, email_opt_in: 0, phone_valid: 0, email_valid: 0,
  };
}

const FIELDS = ['company', 'contact_name', 'industry', 'city', 'website', 'package', 'notes', 'research', 'vertical', 'language', 'phone'];
export const KINDS = ['brochure', 'proposal', 'script'];
function cleanInput(raw) {
  const out = {};
  for (const f of FIELDS) out[f] = f === 'research' ? raw.research !== false && raw.research !== 0 && raw.research !== '0' : str(raw[f], f === 'notes' ? 6000 : 300);
  if (!out.company) throw new Error('Business name is required');
  return out;
}

export const listDocs = async (kind) => await all(`SELECT id, kind, token, title, status, source, error, template_id, created_at, updated_at FROM docs WHERE kind = :kind ORDER BY id DESC LIMIT 100`, { kind });

export async function getDoc(id) {
  const d = await get(`SELECT * FROM docs WHERE id = :id`, { id });
  if (!d) return null;
  return { ...d, input: parse(d.input_json, {}), content: parse(d.content_json), items: parse(d.items_json, null), design: parse(d.design_json), chat: parse(d.chat_json, []) };
}

export async function leadPrefill(leadId) {
  const l = await get(`SELECT * FROM leads WHERE id = :leadId`, { leadId });
  if (!l) return null;
  return {
    lead_id: l.id, company: l.company, contact_name: l.contact_name || '', industry: l.industry || '', city: l.city || '',
    website: l.website || '', package: l.recommended_package || l.service || '', notes: l.notes || '', phone: l.phone || '',
  };
}

// ------------------------------------------------------------------ jobs
const running = new Set();
async function startJob(id, fn) {
  if (running.has(id)) return;
  running.add(id);
  await update('docs', id, { status: 'working', error: null, updated_at: nowISO() });
  background(async () => {
    try {
      await fn();
      await update('docs', id, { status: 'ready', updated_at: nowISO() });
    } catch (e) {
      await update('docs', id, { status: 'error', error: String(e.message).slice(0, 500), updated_at: nowISO() });
    } finally {
      running.delete(id);
    }
  }, 'doc-job');
}
/** Restarts generation jobs that never finished. staleMinutes: only jobs idle that long (serverless: the instance may have been stopped). */
export async function resumeDocs({ staleMinutes = 0 } = {}) {
  const before = new Date(Date.now() - staleMinutes * 60000).toISOString();
  for (const d of await all(`SELECT id FROM docs WHERE status = 'working' AND updated_at <= :before`, { before })) await generate(d.id);
  // Documents made before the editor existed: lay out their saved copy with the built-in template (no AI).
  const s = getSettings();
  for (const { id } of await all(`SELECT id FROM docs WHERE status = 'ready' AND design_json IS NULL AND content_json IS NOT NULL`)) {
    try {
      const d = await getDoc(id);
      const design = d.kind === 'brochure' ? brochureDesign(d.content, s) : proposalDesign(d.content, d.items, s, { preparedFor: d.input.company });
      await update('docs', id, { design_json: cleanDesign(design), template_id: (await defaultTemplate(d.kind))?.id ?? null });
    } catch (e) {
      console.error('[tools] could not migrate doc', id, e.message);
    }
  }
}

async function maybeResearch(input) {
  if (!input.research || !aiEnabled()) return null;
  try { return await researchLead(pseudoLead(input), null); } catch { return null; }
}

/** Splits the package price into the configured modules (rounded to ₹1,000; last module takes the rest). */
export function defaultItems(input) {
  const s = getSettings();
  const pkg = s.packages.find((p) => p.id === input.package) || s.packages[0];
  const mods = s.proposal.modules;
  const totalShare = mods.reduce((a, m) => a + m.share, 0);
  let left = pkg.price;
  return mods.map((m, i) => {
    const price = i === mods.length - 1 ? left : Math.round((pkg.price * m.share) / totalShare / 1000) * 1000;
    left -= price;
    return { name: m.name, price };
  });
}

export async function createDoc(kind, raw) {
  if (!KINDS.includes(kind)) throw new Error('Unknown document type');
  const s = getSettings();
  const input = cleanInput(raw);
  if (kind === 'script') {
    if (!VERTICALS.includes(input.vertical)) input.vertical = input.vertical ? 'Other' : '';
    if (!LANGUAGES.includes(input.language)) input.language = LANGUAGES[0];
    const now = nowISO();
    const id = await insert('docs', { kind, token: token(), title: input.company, lead_id: Number(raw.lead_id) || null, template_id: null, input_json: input, status: 'working', created_at: now, updated_at: now });
    await generate(id);
    return id;
  }
  const tpl = (raw.template_id && await getTemplate(Number(raw.template_id))) || await defaultTemplate(kind);
  if (!tpl || tpl.kind !== kind) throw new Error('Template not found');
  if (kind === 'brochure') {
    const ids = s.brochure.services.map((x) => x.id);
    input.services = (Array.isArray(raw.services) ? raw.services : ids).filter((x) => ids.includes(x));
    if (!input.services.length) input.services = ids;
  } else if (!s.packages.some((p) => p.id === input.package)) input.package = s.packages[0].id;
  const now = nowISO();
  const id = await insert('docs', {
    kind, token: token(), title: input.company, lead_id: Number(raw.lead_id) || null, template_id: tpl.id,
    input_json: input, items_json: kind === 'proposal' ? defaultItems(input) : null, status: 'working', created_at: now, updated_at: now,
  });
  await generate(id);
  return id;
}

/** (Re)builds the document's design from its template. Replaces manual edits. */
export async function generate(id) {
  await startJob(id, async () => {
    const doc = await getDoc(id);
    const s = getSettings();
    if (doc.kind === 'script') {
      const [research, audit] = await Promise.all([maybeResearch(doc.input), auditWebsite(normalizeUrl(doc.input.website)).catch(() => null)]);
      const r = await writeScript(doc.input, research, audit);
      await update('docs', id, { content_json: r.content, source: r.source, error: r.error ? `AI failed, used the standard script: ${r.error}`.slice(0, 500) : null, updated_at: nowISO() });
      return;
    }
    const tpl = await getTemplate(doc.template_id) || await defaultTemplate(doc.kind);
    const research = await maybeResearch(doc.input);
    let design, content = null, source;
    if (tpl.mode === 'smart') {
      const r = doc.kind === 'brochure'
        ? await writeBrochure(doc.input, doc.input.services, research)
        : await writeProposalDoc(doc.input, doc.items, research);
      content = r.content;
      source = r.source;
      design = doc.kind === 'brochure' ? brochureDesign(content, s) : proposalDesign(content, doc.items, s, { preparedFor: doc.input.company });
    } else {
      const vars = { ...brochureVars(doc.input), contact_name: doc.input.contact_name || '', agency: s.agency.name };
      const base = fillTokens(cloneDesign(tpl.design), vars, tpl.sample_company);
      const r = await fillTemplate(base, doc.input, { kind: doc.kind, sampleCompany: tpl.sample_company, research });
      design = r.design;
      source = r.source;
    }
    await update('docs', id, { design_json: cleanDesign(design), content_json: content, source, updated_at: nowISO() });
  });
}

// ----------------------------------------------------------- edit & pdf
/** Keeps a script's shape (strings and short lists only) whatever the browser sends. */
function cleanScript(c) {
  const s = (v, n = 2000) => String(v ?? '').slice(0, n);
  const list = (v, n, f) => (Array.isArray(v) ? v.slice(0, n).map(f) : []);
  return {
    pitch_point: s(c.pitch_point, 300), introduction: s(c.introduction),
    opportunities: list(c.opportunities, 8, (o) => ({ title: s(o?.title, 200), detail: s(o?.detail, 800) })).filter((o) => o.title || o.detail),
    pitch_points: list(c.pitch_points, 6, (o) => ({ point: s(o?.point, 200), detail: s(o?.detail, 800) })).filter((o) => o.point || o.detail),
    questions: list(c.questions, 12, (q) => s(q, 400)).filter(Boolean),
    objections: list(c.objections, 8, (o) => ({ objection: s(o?.objection, 300), response: s(o?.response, 800) })).filter((o) => o.objection || o.response),
    booking: { ask: s(c.booking?.ask, 800), if_yes: s(c.booking?.if_yes, 800), if_not_now: s(c.booking?.if_not_now, 800) },
    script: s(c.script, 12000),
  };
}

export async function saveDoc(id, { design, items, title, content }) {
  const doc = await getDoc(id);
  if (!doc) throw new Error('Not found');
  const patch = { updated_at: nowISO() };
  if (content !== undefined) {
    if (doc.kind !== 'script') throw new Error('Only scripts are saved as text');
    patch.content_json = cleanScript(content || {});
  }
  if (design !== undefined) patch.design_json = cleanDesign(design);
  if (title !== undefined) patch.title = str(title, 200) || doc.title;
  if (items !== undefined) {
    if (doc.kind !== 'proposal') throw new Error('Only proposals have line items');
    patch.items_json = (items || []).map((i) => ({ name: str(i.name, 200), price: Math.max(0, Math.round(Number(String(i.price).replace(/[^\d.]/g, '')) || 0)) })).filter((i) => i.name);
    if (!patch.items_json.length) throw new Error('Add at least one line item');
  }
  await update('docs', id, patch);
  return await getDoc(id);
}

/** AI assistant: applies a chat request to the design; returns the reply and the updated document. */
export async function chat(id, message, context = {}) {
  const doc = await getDoc(id);
  if (!doc?.design) throw new Error('Document is not ready yet');
  const msg = str(message, 2000);
  if (!msg) throw new Error('Type a request');
  const r = await chatEdit({ design: doc.design, items: doc.items, history: doc.chat, message: msg, context: { ...context, kind: doc.kind, company: doc.input.company } });
  const chatLog = [...(doc.chat || []), { role: 'user', text: msg, at: nowISO() }, { role: 'assistant', text: r.reply, applied: r.applied, skipped: r.skipped, at: nowISO() }].slice(-60);
  const patch = { chat_json: chatLog, updated_at: nowISO() };
  if (r.applied) { patch.design_json = r.design; if (doc.kind === 'proposal') patch.items_json = r.items; }
  await update('docs', id, patch);
  return { reply: r.reply, applied: r.applied, skipped: r.skipped, doc: await getDoc(id) };
}

export async function deleteDoc(id) {
  await run(`DELETE FROM docs WHERE id = :id`, { id });
}

const slug = (s) => String(s || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'client';
export const docFilename = (d) => `${slug(d.title)}-${d.kind}.pdf`;
export const docShareUrl = (d) => `${BASE_URL}/pdf/doc/${d.token}.pdf`;

export function docPdf(d) {
  const s = getSettings();
  if (d.kind === 'script') {
    if (d.status !== 'ready' || !d.content) throw new Error('Script is not ready yet');
    return scriptPdf(d.content, d.input, s);
  }
  if (d.status !== 'ready' || !d.design) throw new Error('Document is not ready yet');
  return renderDesignPdf(d.design, { title: `${d.title} ${d.kind}`, author: s.agency.name, items: d.items, settings: s });
}

export async function docSummary(d) {
  const s = getSettings();
  const total = (d.items || []).reduce((a, i) => a + i.price, 0);
  const tpl = d.template_id ? await get(`SELECT id, name, mode FROM design_templates WHERE id = :id`, { id: d.template_id }) : null;
  return { ...d, template: tpl, share_url: docShareUrl(d), total, tax_label: s.billing.tax_label, currency: s.billing.currency };
}

/** Preview design for a template card: smart templates render the default copy for a sample client. */
export async function templatePreview(id) {
  const t = await getTemplate(id);
  if (!t) return null;
  if (t.mode !== 'smart') return t.design;
  const s = getSettings();
  const input = { company: 'Your Client', industry: 'Business', package: s.packages[0].id };
  if (t.kind === 'brochure') return brochureDesign(templateBrochureCopy(input), s);
  return proposalDesign(templateProposalCopy(input), defaultItems(input), s, { preparedFor: 'Your Client' });
}
const templateBrochureCopy = (input) => templateBrochure(input, getSettings().brochure.services.map((x) => x.id));
const templateProposalCopy = (input) => templateProposal(input, defaultItems(input));

/** Script → the lead's call script: the CRM gets it with the next sync, so the telecaller sees it there. */
export async function useScriptForLead(id) {
  const d = await getDoc(id);
  if (!d || d.kind !== 'script' || !d.content) throw new Error('Script is not ready yet');
  if (!d.lead_id) throw new Error('This script was not made from a lead');
  const lead = await get(`SELECT id, pitch_json FROM leads WHERE id = :id`, { id: d.lead_id });
  if (!lead) throw new Error('Lead not found');
  const pitch = parse(lead.pitch_json, {}) || {};
  pitch.telecaller_script = d.content.script;
  if (d.content.pitch_point) pitch.headline = pitch.headline || d.content.pitch_point;
  await update('leads', lead.id, { pitch_json: pitch, updated_at: nowISO() });
  await addActivity(lead.id, 'note', 'Call script updated from the Pitch Script Maker', d.content.pitch_point || null);
  await crmEvent(lead.id, 'lead.script_updated', { telecaller_script: d.content.script, pitch_point: d.content.pitch_point });
  return { ok: true };
}
