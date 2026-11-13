import { get, insert, run } from '../db.js';
import { getSettings, getState, saveSettings, setState } from '../settings.js';
import { nowISO, tzParts } from '../util.js';
import { dataUri } from './assets.js';
import { proposalHtml, SIZE as PROPOSAL_SIZE } from './proposal-codeace.js';
import { brochureHtml, ideaPlan, SIZE as BROCHURE_SIZE } from './brochure-codeace.js';
import { NIRAPARA_PROPOSAL, NIRAPARA_ITEMS } from './samples/nirapara-proposal.js';
import { NIRAPARA_BROCHURE } from './samples/nirapara-brochure.js';
import { brochurePsHtml, pagePlan as psPagePlan, ideaPlan as psIdeaPlan, SIZE as PS_SIZE, PHOTOS as PS_PHOTOS } from './brochure-ps.js';
import { NIRAPARA_BROCHURE_PS, NIRAPARA_PS_INPUT } from './samples/nirapara-brochure-ps.js';
const PS = 'builtin-html-brochure-ps';
import { applyEdits, cleanEdits, hasEdits } from './edits.js';
import { WEBSITE_CHECK_RULE } from '../pipeline/enrich.js';
import { brochureSeoHtml, SIZE as SEO_SIZE, PHOTOS as SEO_PHOTOS } from './brochure-seo.js';
import { SEO_BROCHURE } from './samples/codeace-seo-brochure.js';
export const SEO = 'builtin-html-brochure-seo';
// the designed brochure (brochure fix guide 2026-11-13, phases 2-4): Claude composes the pages from the CodeAce design
// system (src/brochure/); a template like the others, so the page view, design mode, PDF and CRM delivery all apply
import { designedHtml, SIZE as DESIGNED_SIZE, sanitizePage } from '../brochure/render.js';
import { DESIGNED, checkOutput } from '../brochure/writer.js';
import { DESIGNED_SAMPLE } from './samples/designed-sample.js';
export { DESIGNED };
export { cleanEdits, hasEdits };
// HTML files imported as templates (owner, 2026-11-13): kept as uploaded, Claude rewrites their text blocks (imported.js)
import { IMPORTED, importedHtml, importedTemplate, templateData, sanitizeImportedData, acceptImported, importedIssues } from './imported.js';
export { IMPORTED };

/*
 * HTML document templates (owner, 2026-11-11: "i generated brochure and proposal from claude web. can u convert this
 * exactly to our system. next generations should use this as default. but it should be same as exactly without any
 * difference"). The two designs are code templates (brochure-codeace.js, proposal-codeace.js) that keep the reference
 * HTML and CSS as they are; a document stores only its content (content.html = { template, data, split }) and is
 * printed by Chromium (chrome.js). Template rows have mode 'html'; documents made with them have no design_json, so
 * the Canva-style editor is replaced by a form beside the live pages (public/html-docs.js).
 */
export const HTML_TEMPLATES = {
  'builtin-html-brochure': { kind: 'brochure', name: 'Codeace Growth Plan', size: BROCHURE_SIZE, photos: [] },
  'builtin-html-proposal': { kind: 'proposal', name: 'CodeAce Proposal', size: PROPOSAL_SIZE, photos: [['cover', 'Cover photo'], ['strip', 'Photo strip']] },
  // owner, 2026-11-12: "add this to brochure template and make this default" (the brochure in the proposal's look)
  [PS]: { kind: 'brochure', name: 'CodeAce Growth Brochure', size: PS_SIZE, photos: PS_PHOTOS },
  // owner, 2026-11-13: Codeace's Website & SEO services brochure, tailored per lead; default for "Website + SEO" leads
  [SEO]: { kind: 'brochure', name: 'CodeAce Website & SEO', size: SEO_SIZE, photos: SEO_PHOTOS },
  // pages written as HTML by Claude from the CodeAce design system; not the default until it beats the baseline
  [DESIGNED]: { kind: 'brochure', name: 'Designed brochure', size: DESIGNED_SIZE, photos: [] },
};
export const isHtmlTemplate = (tpl) => tpl?.mode === 'html' && (!!HTML_TEMPLATES[tpl.source] || tpl.source === IMPORTED);
export const isHtmlDoc = (d) => !!d?.content?.html?.template && (!!HTML_TEMPLATES[d.content.html.template] || (d.content.html.template === IMPORTED && !!d.content.html.tid));
/** The page size of an HTML document (an imported template carries its own). */
export const sizeOf = (h) => (h.template === IMPORTED ? h.size : HTML_TEMPLATES[h.template].size);
/** A document's words edited by hand (the form), cleaned for its template. */
export const sanitizeDocData = (h, v) => (h?.template === IMPORTED ? sanitizeImportedData(v) : sanitizeEdit(v));

/** Adds the two template rows once and makes them the defaults once (a later "Make default" elsewhere is kept). */
export async function seedHtmlTemplates() {
  for (const [source, t] of Object.entries(HTML_TEMPLATES)) {
    if (await get(`SELECT 1 FROM design_templates WHERE source = :source`, { source })) continue;
    const now = nowISO();
    await insert('design_templates', { kind: t.kind, name: t.name, mode: 'html', source, is_default: 0, created_at: now, updated_at: now });
  }
  // two instances starting together may both add them (seen with the Signature rows): keep the oldest
  await run(`DELETE FROM design_templates WHERE source LIKE 'builtin-html-%' AND id NOT IN (SELECT MIN(id) FROM design_templates WHERE source LIKE 'builtin-html-%' GROUP BY source)`);
  if (!(await getState('html_templates_default'))) {
    for (const [source, t] of Object.entries(HTML_TEMPLATES)) {
      const row = await get(`SELECT id FROM design_templates WHERE source = :source ORDER BY id LIMIT 1`, { source });
      if (row) await run(`UPDATE design_templates SET is_default = CASE WHEN id = :id THEN 1 ELSE 0 END WHERE kind = :kind`, { id: row.id, kind: t.kind });
    }
    await setState('html_templates_default', { at: nowISO() });
  }
  // the CodeAce Growth Brochure became the brochure default once, when it was added (owner, 2026-11-12)
  if (!(await getState('html_brochure_ps_default'))) {
    const row = await get(`SELECT id FROM design_templates WHERE source = :source AND hidden_at IS NULL ORDER BY id LIMIT 1`, { source: PS });
    if (row) await run(`UPDATE design_templates SET is_default = CASE WHEN id = :id THEN 1 ELSE 0 END WHERE kind = 'brochure'`, { id: row.id });
    await setState('html_brochure_ps_default', { at: nowISO() });
  }
  // the Website & SEO brochure became the template of the new "Website + SEO" website type once (owner, 2026-11-13:
  // "add a Website + Seo category and make this default for that"); a later choice in Integrations is kept
  if (!(await getState('html_seo_type_default'))) {
    const row = await get(`SELECT id FROM design_templates WHERE source = :source AND hidden_at IS NULL ORDER BY id LIMIT 1`, { source: SEO });
    if (row && !(Number(getSettings().automation?.website_templates?.brochure?.['website-seo']) || 0)) {
      await saveSettings({ automation: { website_templates: { brochure: { 'website-seo': row.id } } } });
    }
    await setState('html_seo_type_default', { at: nowISO() });
  }
}

// ------------------------------------------------------------------ context per document
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthYear(iso, s) {
  const { date } = tzParts(iso ? new Date(iso) : new Date(), s.schedule?.timezone || 'Asia/Kolkata');
  const [y, m] = date.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
const site = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
// "Sahya Building, Gov Cyberpark, Kozhikode, Kerala, India" → "Gov Cyberpark, Kozhikode" (as in the references)
function place(address) {
  const parts = String(address || '').split(',').map((x) => x.trim()).filter(Boolean).filter((x) => !/^(kerala|india)$/i.test(x));
  return parts.length > 2 ? parts.slice(1, 3).join(', ') : parts.join(', ');
}
/** "asset:html-docs/…" (bundled sample images) or "upload:…" / data: (photos added to a document) → a usable URL. */
export async function resolveSrc(src) {
  const v = String(src || '');
  if (v.startsWith('asset:html-docs/')) return dataUri(v.slice('asset:html-docs/'.length));
  if (v.startsWith('data:image/')) return v;
  if (v.startsWith('upload:')) {
    const { readUpload } = await import('../storage.js');
    const buf = await readUpload(v.slice(7)).catch(() => null);
    if (buf) return `data:${/\.png$/i.test(v) ? 'image/png' : /\.webp$/i.test(v) ? 'image/webp' : 'image/jpeg'};base64,${buf.toString('base64')}`;
  }
  return null;
}

async function context(kind, d, { client, items, created, website, template }) {
  const s = getSettings();
  const a = s.agency || {};
  if (template === DESIGNED) { // the client's pictures (stored copies) by id, the CodeAce contact block for the last page
    const src = {};
    for (const im of d.images || []) if (im?.id && im.src) src[im.id] = await resolveSrc(im.src);
    return { client, date: monthYear(created, s), docName: d.doc_name || 'Growth Brochure', title: `${client} ${d.doc_name || 'Growth Brochure'} — CodeAce`,
      contact: { agency: 'CodeAce IT Solutions LLP', phone: a.phone, email: a.email, website: site(a.website) }, imageSrc: (id) => src[id] || null };
  }
  if (template === SEO) {
    const p = s.seo_brochure || {};
    return { client, title: `${client ? `${client} · ` : ''}CodeAce Website & SEO`, contact: { email: a.email, phone: a.phone, website: site(a.website) },
      prices: { packages: [0, 1, 2].map((i) => ({ price: Number(p.packages?.[i]?.price) || 0 })), retainer_monthly: Number(p.retainer_monthly) || 70000, retainer_months: Number(p.retainer_months) || 6 } };
  }
  if (template === PS) {
    const photos = {};
    for (const [k] of PS_PHOTOS) if (d.photos?.[k]) photos[k] = await resolveSrc(d.photos[k]);
    return { client, date: monthYear(created, s), docName: d.doc_name || 'Growth Brochure', website: site(website), agency: 'CodeAce IT Solutions LLP',
      title: `${client} ${d.doc_name || 'Growth Brochure'} — CodeAce`, contact: { phone: a.phone, email: a.email }, photos };
  }
  if (kind === 'brochure') {
    return { client, tag: d.tag || 'Growth plan', date: monthYear(created, s), title: `${client} · ${d.tag || 'Growth plan'}`,
      contact: { phone: a.phone, email: a.email, website: site(a.website), place: place(a.address) } };
  }
  const cur = s.billing?.currency || 'INR';
  const money = (n) => (cur === 'INR' ? `₹ ${Math.round(n || 0).toLocaleString('en-IN')}` : `${cur} ${Math.round(n || 0).toLocaleString('en-US')}`);
  const srcs = {};
  for (const v of [d.photos?.cover, d.photos?.strip, ...(d.features || []).map((g) => g.image)].filter(Boolean)) srcs[v] = await resolveSrc(v);
  const docType = d.doc_type || 'Website Proposal';
  return {
    client, agency: 'CodeAce IT Solutions', title: `${client} ${docType} — CodeAce`,
    items: items || [], money, currency: cur, total: (items || []).reduce((t, i) => t + (Number(i.price) || 0), 0), taxNote: s.billing?.tax_label || 'GST',
    contact: { phone: a.phone, email: a.email, website: site(a.website), location: place(a.address).replace(/^Gov /, '') },
    footer: `${client} × CodeAce · ${docType}`,
    photos: { cover: srcs[d.photos?.cover] || null, strip: srcs[d.photos?.strip] || null },
    src: (v) => srcs[v] || null,
  };
}

/** The document's full HTML (what the PDF prints and the page shows). */
export async function htmlFor({ template, data, split, edits, tid }, { client, company, items, created, website }) {
  if (template === IMPORTED) return applyEdits(await importedHtml({ tid, data }, { client: company || '' }), edits, resolveSrc);
  const t = HTML_TEMPLATES[template];
  const d = template === 'builtin-html-proposal' ? { ...data, eyebrow: data.eyebrow || `${data.doc_type || 'Website Proposal'} · ${monthYear(created, getSettings())}` } : data;
  const ctx = await context(t.kind, d, { client: template === SEO ? (company ?? client) : client, items, created, website, template });
  const html = template === DESIGNED ? designedHtml(d, ctx) : template === SEO ? brochureSeoHtml(d, ctx) : template === PS ? brochurePsHtml(d, ctx, split || {}) : t.kind === 'brochure' ? brochureHtml(d, ctx, split || {}) : proposalHtml(d, ctx, split || {});
  return applyEdits(html, edits, resolveSrc); // data-k keys for the page editor + what was moved / retyped / added on the pages
}
const docArgs = (doc) => ({ client: doc.input?.company || doc.title || 'Client', company: doc.input?.company || '', items: doc.items, created: doc.created_at, website: doc.input?.website || '' });

/**
 * PDF of an HTML document. The page plan is checked in Chromium first: a page whose content runs past its bottom is
 * split (proposal scope 5 → 4 → 3 per page; brochure idea pages 4 → 2 → 1), up to three tries. The plan that fits is
 * saved with the document so the page view shows the same pages.
 */
export async function htmlDocPdf(doc) {
  const { htmlToPdf } = await import('./chrome.js');
  const { html } = await fitPlan(doc);
  return htmlToPdf(html, sizeOf(doc.content.html));
}
/**
 * The page plan that fits (checked in Chromium, saved with the document) and the HTML with it. Used before printing
 * and before the conversion for the classic editor, so both get the split pages.
 */
export async function fitPlan(doc) {
  const { withPage, overflowCheck } = await import('./chrome.js');
  const h = doc.content.html;
  const size = sizeOf(h);
  let split = h.split || {};
  let html = await htmlFor({ ...h, split }, docArgs(doc));
  // pages edited by hand keep their plan: splitting a page would move the elements the edits point at
  for (let i = 0; i < 3 && !hasEdits(h.edits); i++) {
    const over = await withPage(html, size, overflowCheck);
    if (!over.length) break;
    const next = h.template === IMPORTED ? null /* fixed pages, checked by importedIssues */ : h.template === SEO || h.template === DESIGNED ? null /* fixed pages; the designed brochure is checked by its own layout check */ : h.template === PS ? replanPs(h.data, split, over) : replan(HTML_TEMPLATES[h.template].kind, h.data, split, over);
    if (!next) break;
    split = next;
    html = await htmlFor({ ...h, split }, docArgs(doc));
  }
  if (doc.id && JSON.stringify(split) !== JSON.stringify(h.split || {})) {
    await run(`UPDATE docs SET content_json = :c WHERE id = :id`, { c: JSON.stringify({ ...doc.content, html: { ...h, split } }), id: doc.id }).catch(() => {});
  }
  return { html, split };
}
function replan(kind, data, split, over) {
  if (kind === 'proposal') {
    const per = split.scope || 6;
    return per > 3 ? { ...split, scope: per - 1 } : null;
  }
  // brochure: split every idea page that overflowed in half (page numbers: cover 1, then the sections before the ideas)
  const plan = split.ideaPages || ideaPlan(data);
  const firstIdeaPage = 2 + ['challenge', 'opportunity', 'journey'].filter((k) => data[k]).length + ((data.plan && data.ideas?.length) ? 1 : 0);
  const bad = new Set(over.map((o) => Number(o.id) - firstIdeaPage).filter((i) => i >= 0 && i < plan.length));
  let changed = false;
  const next = [];
  plan.forEach((p, i) => {
    if (bad.has(i) && p.count > 1) { const a = Math.ceil(p.count / 2); next.push({ ...p, count: a }, { ...p, count: p.count - a }); changed = true; } else next.push(p);
  });
  return changed ? { ...split, ideaPages: next } : null;
}

/** CodeAce Growth Brochure: an idea page that overflowed is split in half (4 → 2 + 2 → 1 + 1). */
function replanPs(data, split, over) {
  const P = psPagePlan(data, split);
  const bad = new Set(over.map((o) => P.at.ideas.indexOf(Number(o.id))).filter((i) => i >= 0));
  const next = [];
  let changed = false;
  P.ideas.forEach((p, i) => {
    const plain = p.pg !== (data.idea_pages || [])[p.page];
    if (bad.has(i) && p.count > 1) {
      const a = Math.ceil(p.count / 2);
      next.push({ page: p.page, count: a, plain }, { page: p.page, count: p.count - a, plain: true }); // the second half keeps the heading
      changed = true;
    } else next.push({ page: p.page, count: p.count, plain });
  });
  return changed ? { ...split, ideaPages: next } : null;
}

/**
 * Page numbers (1-based) whose content runs past the page (rendered in Chromium; the page clips it). Used to keep a
 * picture only where it fits (brochure fix guide 2026-11-13: the idea-page photo squeezed four cards into a 2 × 2 grid).
 */
export async function overflowingPages(doc) {
  const { withPage } = await import('./chrome.js');
  const html = await htmlFor(doc.content.html, docArgs(doc));
  return withPage(html, sizeOf(doc.content.html), (page) => page.evaluate(() => [...document.querySelectorAll('[data-page]')]
    .map((p, i) => ({ n: i + 1, over: p.scrollHeight > p.clientHeight + 1 || [...p.querySelectorAll('*')].some((e) => e.getBoundingClientRect().bottom > p.getBoundingClientRect().bottom + 1) }))
    .filter((x) => x.over).map((x) => x.n)));
}

/** An imported template's document: what no longer fits, compared with the template's own pages. */
export const importedLayoutIssues = (doc) => importedIssues(doc, (d) => htmlFor(d.content.html, docArgs(d)));
/** The designed brochure's layout check on its final pages (src/brochure/render.js checkInPage), in AxiFlow's Chromium. */
export async function designedIssues(doc) {
  const { withPage } = await import('./chrome.js');
  const { checkInPage } = await import('../brochure/render.js');
  const html = await htmlFor(doc.content.html, docArgs(doc));
  return withPage(html, HTML_TEMPLATES[DESIGNED].size, async (page) => {
    await page.evaluate(async () => { await Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((ok) => { im.onload = im.onerror = ok; })))); });
    return page.evaluate(checkInPage);
  });
}

/** HTML for the page view and the template preview (no fit check; the saved plan is used). */
export async function htmlDocHtml(doc) { return htmlFor(doc.content.html, docArgs(doc)); }
/** An imported template as a document with its own texts (the sample PDF). */
export async function importedSampleDoc(tpl) {
  const t = await importedTemplate(tpl.id);
  return { id: 0, kind: t.kind, title: t.name, input: { company: '' }, status: 'ready', created_at: new Date().toISOString(), items: null,
    content: { html: { template: IMPORTED, tid: t.id, size: t.size, data: templateData(t), split: {} } } };
}
/** The Nirapara reference of an HTML template, as a document (template preview, sample PDF). */
export function sampleDoc(source) {
  const t = HTML_TEMPLATES[source];
  const data = source === DESIGNED ? DESIGNED_SAMPLE : source === SEO ? SEO_BROCHURE : source === PS ? NIRAPARA_BROCHURE_PS : t.kind === 'brochure' ? NIRAPARA_BROCHURE : { ...NIRAPARA_PROPOSAL, doc_type: 'Shopify Store Proposal' };
  return { id: 0, kind: t.kind, title: source === DESIGNED ? 'Designed brochure sample' : source === SEO ? 'CodeAce Website & SEO' : 'Nirapara sample', input: source === PS ? { ...NIRAPARA_PS_INPUT } : source === SEO ? { company: '' } : source === DESIGNED ? { company: 'Sample Boutique' } : { company: 'Nirapara' }, status: 'ready', created_at: new Date().toISOString(),
    items: t.kind === 'proposal' ? NIRAPARA_ITEMS.map((name) => ({ name, price: 0 })) : null,
    content: { html: { template: source, data: JSON.parse(JSON.stringify(data)), split: {} } } };
}
export async function templatePreviewHtml(tpl) {
  if (tpl.source === IMPORTED) { const t = await importedTemplate(tpl.id); return { html: t.html, size: t.size, html_template: true, sample: t.sample || '' }; } // the file as it was imported
  const t = HTML_TEMPLATES[tpl.source];
  if (tpl.source === PS || tpl.source === SEO || tpl.source === DESIGNED) return { html: await htmlFor(sampleDoc(tpl.source).content.html, docArgs(sampleDoc(tpl.source))), size: t.size, html_template: true };
  if (t.kind === 'brochure') return { html: await htmlFor({ template: tpl.source, data: NIRAPARA_BROCHURE }, { client: 'Nirapara', created: null }), size: t.size, html_template: true };
  return { html: await htmlFor({ template: tpl.source, data: { ...NIRAPARA_PROPOSAL, doc_type: 'Shopify Store Proposal' } }, { client: 'Nirapara', items: NIRAPARA_ITEMS.map((name) => ({ name, price: 0 })), created: null }), size: t.size, html_template: true };
}

// ------------------------------------------------------------------ content: schema, Claude job, cleaning, fallback
const S = (maxLength) => ({ type: 'string', ...(maxLength ? { maxLength } : {}) });
const A = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const O = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const TT = O({ title: S(60), text: S(220) });

export const BROCHURE_SCHEMA = O({
  tag: S(40),
  cover: O({ script_word: S(30), title: S(40), title_em: S(30), subtitle: S(240) }),
  challenge: O({ label: S(30), title: S(60), lead: S(220), statement: S(70), rows: A(O({ title: S(30), points: A(S(90), 2, 3) }), 3, 3), gap: S(160) }),
  opportunity: O({ label: S(30), title: S(60), items: A(O({ title: S(30), text: S(130) }), 6, 6), approach: O({ title: S(60), text: S(260) }) }),
  journey: O({ label: S(30), title: S(50), lead: S(200), highlight: { type: 'integer', minimum: 0, maximum: 3 }, steps: A(O({ title: S(26), quote: S(48), text: S(130) }), 4, 4), bridge: O({ title: S(40), text: S(170) }) }),
  plan: O({ label: S(30), title: S(50), goals: A(O({ name: S(14), sub: S(40), note: S(130) }), 3, 3) }),
  idea_titles: A(S(55), 2, 5),
  ideas: A(O({ goal: { type: 'integer', minimum: 0, maximum: 2 }, title: S(40), short: S(30), intro: S(70), points: A(S(80), 2, 6), why: S(90), featured: { type: 'boolean' } }), 6, 14),
  economics: O({ label: S(30), title: S(55), lead: S(200), figures: A(O({ value: S(12), title: S(30), text: S(100) }), 6, 6), note: S(130) }),
  delivery: O({ label: S(30), title: S(50), includes_title: S(40), includes: A(S(55), 6, 10), phases: A(O({ when: S(24), title: S(30), text: S(140) }), 3, 3) }),
  results: O({ label: S(30), title: S(45), metrics: A(S(32), 8, 8), note: S(120), next: A(S(75), 3, 3), cta_before: S(50), cta_em: S(24), cta_after: S(30) }),
});
const CARD = O({ title: S(40), tone: { type: 'string', enum: ['grey', 'red', 'dark'] }, points: A(S(70), 2, 5) });
export const PROPOSAL_SCHEMA = O({
  doc_type: S(40),
  title: S(70),
  summary: O({ paragraphs: A(S(330), 2, 2), approach: S(50), stats: A(O({ value: S(14), label: S(28) }), 3, 3), closing: S(240) }),
  scope: O({ intro: S(240), items: A(O({ title: S(40), text: S(150), dark: { type: 'boolean' } }), 6, 10) }),
  structure: O({ intro: S(200), pages: A(S(42), 8, 18), note_bold: S(45), note: S(170) }),
  features: A(O({ title: S(34), cards: A(CARD, 3, 4), note_bold: S(30), note: S(240) }), 3, 5),
  timeline: O({ intro: S(160), steps: A(O({ label: S(10), title: S(36), text: S(110) }), 3, 6), after: A(O({ label: S(34), title: S(24), text: S(100) }), 2, 2) }),
  investment: O({ intro: S(110), retainer_bold: S(30), retainer: S(160), note: S(170) }),
  deliverables: O({ items: A(S(55), 6, 10), note: S(110) }),
  terms: A(S(220), 4, 7),
  closing: S(70),
});

const TONE = { type: 'string', enum: ['grey', 'red', 'dark'] };
const INT = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
export const BROCHURE_PS_SCHEMA = O({
  doc_name: S(32),
  cover: O({ label: S(40), title: S(30), lead: S(90), stats: A(O({ value: S(9), label: S(22) }), 2, 2), headline: S(50), text: S(120) }),
  contents: O({ title: S(32), lead: S(110), parts: A(O({ title: S(22), text: S(60) }), 4, 4) }),
  challenge: O({ label: S(28), title: S(32), lead: S(130), statement: S(60), rows: A(O({ title: S(26), points: A(S(55), 2, 3) }), 3, 3) }),
  opportunity: O({ label: S(28), title: S(32), lead: S(130), items: A(O({ title: S(28), text: S(80) }), 6, 6) }),
  journey: O({ label: S(28), title: S(32), lead: S(130), think_label: S(18), do_label: S(18), highlight: INT(0, 3), steps: A(O({ title: S(22), quote: S(45), text: S(80) }), 4, 4), bridge: O({ title: S(30), text: S(130) }) }),
  plan: O({ label: S(28), title: S(32), lead: S(130), goals: A(O({ name: S(12), sub: S(32), note: S(100) }), 3, 3) }),
  ideas: A(O({ goal: INT(0, 2), title: S(36), short: S(26), points: A(S(55), 2, 5), new: { type: 'boolean' }, tone: TONE }), 4, 14),
  idea_pages: A(O({ title: S(32), lead: S(120), statement: S(70) }), 1, 5),
  economics: O({ label: S(28), title: S(32), lead: S(130), figures: A(O({ value: S(10), title: S(26), text: S(60) }), 6, 6), note: S(100) }),
  delivery: O({ label: S(28), title: S(32), lead: S(120), includes_title: S(26), includes: A(S(30), 6, 10), phases: A(O({ title: S(18), when: S(20), text: S(100) }), 3, 3) }),
  results: O({ label: S(28), title: S(32), lead: S(120), metrics: A(S(30), 8, 8), highlight: INT(0, 7), next: A(S(45), 3, 3), closing: S(70) }),
});

// "CodeAce Website & SEO" (owner, 2026-11-13: tailored to each lead): the brochure stays CodeAce's (facts, results,
// clients, packages, prices); Claude writes only the parts that speak to the lead. The pages have fixed space, so the
// lengths below are kept (fitLen) and everything else comes from the brochure itself (SEO_BROCHURE).
const SEO_SERVICES = SEO_BROCHURE.seo.items;
export const BROCHURE_SEO_SCHEMA = O({
  toc_lead: S(110),
  intro_text: S(380),
  who_text: S(240),
  website: O({ lead: S(110), items: A(O({ title: S(34), text: S(90) }), 3, 3) }),
  capabilities: A(O({ title: S(34), text: S(110) }), 3, 3),
  seo_highlight: INT(0, 5),
  seo_texts: A(S(100), 6, 6),
  breakdown_quote: S(110),
  packages_lead: S(120),
  package_texts: A(S(100), 3, 3),
  recommended_package: INT(0, 2),
});
/** The brochure's own wording of those parts (the example Claude gets). */
function seoExample() {
  const b = SEO_BROCHURE;
  return {
    toc_lead: b.toc.lead, intro_text: b.intro.text, who_text: b.who.text,
    website: { lead: b.website.lead, items: b.website.items }, capabilities: b.capabilities.items,
    seo_highlight: b.seo.highlight, seo_texts: b.breakdown.rows.map((x) => x.text), breakdown_quote: b.breakdown.quote,
    packages_lead: b.packages.lead, package_texts: b.packages.cards.map((x) => x.text), recommended_package: 2,
  };
}
/** A text kept within its space: a little over is fine; more is cut at the last sentence (else word) that fits. */
export function fitLen(text, max) {
  const t = String(text || '').trim();
  if (t.length <= Math.round(max * 1.15)) return t;
  const head = t.slice(0, max);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'));
  if (stop > max * 0.5) return head.slice(0, stop + 1);
  return head.slice(0, head.lastIndexOf(' ')).replace(/[,;:\s—-]+$/, '') + '.';
}
function cleanSeo(out) {
  const t = clean(out, BROCHURE_SEO_SCHEMA);
  // CodeAce's own facts (stats, work, brands, prices) stay as in the brochure; every text written for the lead must be
  // there: an empty one fails the try instead of leaving the sample's general text (owner, 2026-11-13: no default content)
  const missing = [
    !t.toc_lead && 'toc_lead', !t.intro_text && 'intro_text', !t.who_text && 'who_text', !t.website?.lead && 'website.lead',
    (t.website?.items || []).filter((x) => x.title && x.text).length < 3 && 'website.items',
    (t.capabilities || []).filter((x) => x.title && x.text).length < 3 && 'capabilities',
    (t.seo_texts || []).length < 6 && 'seo_texts', !t.breakdown_quote && 'breakdown_quote', !t.packages_lead && 'packages_lead',
    (t.package_texts || []).length < 3 && 'package_texts',
  ].filter(Boolean);
  if (missing.length) throw new Error(`the brochure answer was incomplete (${missing.join(', ')})`);
  const d = structuredClone(SEO_BROCHURE);
  const set = (v, max, apply) => { const x = fitLen(v, max); if (x) apply(x); };
  set(t.toc_lead, 110, (x) => { d.toc.lead = x; });
  set(t.intro_text, 380, (x) => { d.intro.text = x; });
  set(t.who_text, 240, (x) => { d.who.text = x; });
  set(t.website.lead, 110, (x) => { d.website.lead = x; });
  t.website.items.slice(0, 3).forEach((it, i) => { if (it.title && it.text) d.website.items[i] = { title: fitLen(it.title, 34), text: fitLen(it.text, 90) }; });
  t.capabilities.slice(0, 3).forEach((it, i) => { if (it.title && it.text) d.capabilities.items[i] = { title: fitLen(it.title, 34), text: fitLen(it.text, 110) }; });
  d.seo.highlight = t.seo_highlight;
  t.seo_texts.slice(0, 6).forEach((x, i) => { d.breakdown.rows[i].text = fitLen(x, 100); });
  set(t.breakdown_quote, 110, (x) => { d.breakdown.quote = x.split('\n').slice(0, 4).join('\n'); });
  set(t.packages_lead, 120, (x) => { d.packages.lead = x; });
  t.package_texts.slice(0, 3).forEach((x, i) => { d.packages.cards[i].text = fitLen(x, 100); });
  d.packages.recommended = t.recommended_package;
  d.options.highlight = t.recommended_package;
  return d;
}

/**
 * Output → the template's data: only known fields, strings trimmed, list lengths kept to what the layout holds.
 * A text over its limit is cut at the last whole word within it (brochure fix guide 2026-11-13, section 8: before, it
 * was cut mid-word at limit + 40). opts.slack = characters allowed over the limit (0 where the job states the limits as
 * numbers, i.e. the brochures; 40 for the others, whose guides do not); opts.cuts collects every cut { path, length, max }.
 */
function cutAtWord(t, max) {
  const head = t.slice(0, max);
  // the next character a space: the limit falls exactly at the end of a word
  const sp = /\s/.test(t[max] || '') ? max : Math.max(head.lastIndexOf(' '), head.lastIndexOf('\n'));
  return (sp > 0 ? head.slice(0, sp) : head).replace(/[\s,;:—–-]+$/, ''); // a single long word is cut inside it
}
function clean(v, schema, opts = {}, path = '') {
  if (schema.type === 'string') {
    const t = String(v ?? '').replace(/\s+\n/g, '\n').trim();
    const max = schema.maxLength || 400;
    if (t.length <= max + (opts.slack ?? 40)) return t;
    opts.cuts?.push({ path, length: t.length, max });
    return cutAtWord(t, max);
  }
  if (schema.type === 'integer') return Math.max(schema.minimum ?? 0, Math.min(schema.maximum ?? 99, Math.round(Number(v) || 0)));
  if (schema.type === 'boolean') return !!v;
  if (schema.type === 'array') {
    const list = Array.isArray(v) ? v : [];
    if (list.length > (schema.maxItems || 50)) opts.cuts?.push({ path, items: list.length, max: schema.maxItems || 50 });
    return list.slice(0, schema.maxItems || 50).map((x, i) => clean(x, schema.items, opts, `${path}[${i}]`)).filter((x) => x !== '' && x != null);
  }
  const o = {};
  for (const [k, sub] of Object.entries(schema.properties || {})) o[k] = clean(v?.[k], sub, opts, path ? `${path}.${k}` : k);
  return o;
}
/** cuts: an array that receives every text cut to fit (see clean). */
export function cleanHtmlData(template, out, cuts = []) {
  if (template === DESIGNED) return cleanDesigned(out);
  if (template === SEO) return cleanSeo(out);
  if (template === PS) {
    const d = clean(out, BROCHURE_PS_SCHEMA, { slack: 0, cuts });
    d.ideas = d.ideas.map((it) => ({ ...it, short: it.short || it.title }));
    // every idea page needs its own heading from the answer (no standard 'The Ideas' heading any more, 2026-11-13)
    if (!d.idea_pages.length || d.idea_pages.some((p) => !p.title)) throw new Error('the brochure answer was incomplete (idea_pages titles)');
    return d;
  }
  if (template === 'builtin-html-brochure') {
    const d = clean(out, BROCHURE_SCHEMA, { slack: 0, cuts });
    d.ideas = d.ideas.map((it) => ({ ...it, short: it.short || it.title, intro: it.intro || '', why: it.why || '' }));
    if (!d.ideas.some((x) => x.featured)) d.ideas = d.ideas.map((x) => ({ ...x, featured: false }));
    else { let seen = false; d.ideas = d.ideas.map((x) => { const f = x.featured && !seen; if (f) seen = true; return { ...x, featured: f }; }); }
    d.cover.script_word = /[ഀ-ൿ]/.test(d.cover.script_word) ? d.cover.script_word : ''; // Malayalam script only
    return d;
  }
  const d = clean(out, PROPOSAL_SCHEMA, { cuts });
  d.summary.approach = d.summary.approach.replace(/\s*\/\s*|\s*\|\s*/g, '\n');
  d.features = d.features.map((g) => ({ ...g, note: g.note ? (g.note_bold ? { bold: g.note_bold, text: g.note } : g.note) : '' }));
  return d;
}

const BROCHURE_GUIDE = `Write the content of Codeace's growth-plan brochure for this one business, in the fixed design (landscape A4,
12 pages). It is Codeace's plan for the client: their situation, where they lose customers today, and the ideas Codeace
will build to win them. Write in the voice of the <style_note>, keep every field within the <limits>, and sell exactly
the <offer>.
Fields:
- tag: the brochure's name in sentence case, e.g. "Ecommerce growth plan", "Website growth plan".
- cover.script_word: the business's name written in Malayalam script when it is a Kerala business and you are sure of
  the spelling; else "". cover.title + cover.title_em: one headline split so title_em (shown in italics) ends it.
- challenge: 3 rows (where customers meet the business today), each 2-3 short points; statement = one sharp line;
  gap = the one problem everything else follows from.
- opportunity: 6 benefits of the plan; approach = how it works with the channels the business already has.
- journey: 4 moments of the customer's decision, each with the customer's own words as quote (no quote marks);
  highlight = the index (0-3) of the moment the plan changes most.
- plan.goals: always Attract / Convert / Retain with a one-line sub each (note only when an idea serves two goals).
- ideas: 6 to 14 numbered ideas; goal = 0 attract, 1 convert, 2 retain; short = a 2-4 word name for the plan page;
  2-4 points each (up to 6 when intro is set, for the "pair" pages); why = the result in one line, or "";
  intro only for broad ideas; featured = true for at most one idea, the signature one.
- idea_titles: one heading per idea page (ideas are shown 4 per page, 2 per page when they have an intro).
- economics: 6 figures: prices, thresholds or rules for this business as working figures (no invented market stats).
- delivery: what Codeace builds (6-10 lines) and 3 phases (when / title / text).
- results: 8 metrics Codeace will report, 3 next steps, and the closing line cta_before + cta_em (italic) + cta_after.
Plain sentences, British spelling, no emoji, no exclamation marks, no claims you cannot back with the lead data.`;

const BROCHURE_PS_GUIDE = `Write the content of CodeAce's growth brochure for this one business, in the fixed design (landscape,
about 13 pages, the CodeAce proposal look: big two-line headings, short cards). It is CodeAce's plan for the client:
their situation, where they lose customers today, and the ideas CodeAce will build to win them. Write in the voice of
the <style_note> and sell exactly the <offer>.
Every heading (cover.title, contents.title and each page title) is two short lines in Title Case, split with "\\n"
(e.g. "Everywhere,\\nBut Not First"): each line of cover.title at most 16 characters, of the other headings at most 20,
so no heading wraps to a third line. Text is short: the boxes have fixed sizes, so
keep every field within the <limits> (a shorter line is always better than a cut one).
In a lead, wrap a few words in **double asterisks** to set them in bold; use it sparingly.
Fields:
- doc_name: the brochure's name in the page headers, e.g. "Ecom Growth Brochure", "Website Growth Brochure".
- cover: label (eyebrow, e.g. "Ecommerce growth brochure"), title (two lines), lead (one line, may bold 1-2 phrases),
  2 stats about THIS plan (e.g. number of ideas, weeks to launch), headline (two lines over the photo) and text.
- contents: title, lead and the 4 parts (challenge, opportunity, plan, delivery) with one line each; page numbers are
  added by the layout.
- challenge: 3 rows (where customers meet the business today), 2-3 short points each; statement = one sharp line.
- opportunity: 6 benefits of the plan (title + one line).
- journey: the customer's decision in 4 moments: the customer's own words as quote (no quote marks), what the new
  site or store does; think_label / do_label name the two halves (e.g. "She thinks" / "The store does", "They ask" /
  "The site answers"); highlight = the index (0-3) of the moment the plan changes most; bridge = the one mechanism that
  links them.
- plan.goals: always Attract / Convert / Retain with a one-line sub each; note only when it adds something.
- ideas: 6 to 14 numbered ideas, in page order; goal = 0 attract, 1 convert, 2 retain; short = a 2-4 word name for the
  plan page; 2-4 points each (up to 5 on a statement page); new = true only for ideas that are new compared with what
  the business does today, if you mark a group of them; tone: per page use mostly grey with one red and one dark card.
- idea_pages: one heading per idea page, in order: each page shows 4 ideas, or 2 ideas when statement is set (a red
  card with one line about those ideas). So 14 ideas = e.g. 4 + 4 + 2 (with statement) + 4.
- economics: 6 working figures for THIS business (prices, thresholds, rules) and a note that they are working
  figures; no invented market statistics.
- delivery: what CodeAce builds (6-10 short lines, includes_title like "The store includes") and 3 phases (title,
  when, text) that fit the package time.
- results: 8 metrics CodeAce will report (highlight = the index of the most distinctive one), 3 next steps, and the
  closing line (two lines) for the last photo panel.
Plain sentences, British spelling, no emoji, no exclamation marks, no claims you cannot back with the lead data.`;

const BROCHURE_SEO_GUIDE = `Tailor CodeAce's Website & SEO services brochure (A4, 18 fixed pages) to this one business. The
brochure stays CodeAce's: its company facts and numbers, results, clients, brands, service names, package contents and
prices are fixed and are not written by you. You write only the parts listed below, so the reader sees how CodeAce's
website and search work applies to THEIR business: what it sells, where, to whom, and what the SWOT and the website
check found. The reference below is the brochure's own general wording of these parts: keep its length, tone and plain
style, but make every line specific to this business. The pages have fixed space: keep within the lengths.
Fields:
- toc_lead: one sentence under the contents title (max 110 characters): what this brochure covers for the business.
- intro_text: the introduction paragraph (max 380 characters): who CodeAce is and why that matters for this business.
- who_text: one short paragraph (max 240 characters): how CodeAce's mix of website engineering, search expertise,
  creative thinking and business technology helps this business reach its customers.
- website.lead: one line (max 110) on the website this business needs. website.items: 3 website services (title max
  34, text max 90, one line each) chosen and worded for this business (its kind of site, platform, catalogue, booking).
- capabilities: 3 things the new website will do (title max 34, text max 110) that answer the weaknesses found
  (speed, mobile, enquiries, bookings, content, support).
- seo_highlight: the index (0-5) of the SEO service that matters most for this business, in this order:
  ${SEO_SERVICES.join(' / ')}.
- seo_texts: 6 lines (max 100 characters each), one per SEO service in that order: what it does for this business.
- breakdown_quote: a short quote on getting this business found, in three lines separated by "\\n" (max 110
  characters, about 30 per line), starting with “ and ending with ”.
- packages_lead: one or two sentences (max 120) on the level of search support this business needs.
- package_texts: 3 texts (max 100 each) for Launch / Get Found / Grow: who each package is for, worded for this business.
- recommended_package: the package that fits this business from what you found: 0 Launch (website only), 1 Get Found
  (website, basic SEO, GA4, Search Console), 2 Grow (website, full SEO, Google Business Profile, Microsoft Clarity and
  the monthly SEO retainer).
Never write prices, amounts, CodeAce's own numbers or client results: they are fixed in the brochure. British spelling,
plain sentences, no emoji, no exclamation marks, no claims about the business you cannot back with the lead data.`;

const PROPOSAL_GUIDE = `Write the content of CodeAce's project proposal for this one business, in the fixed design (A4, 13-15
pages). The reference below is a finished proposal for Nirapara (a Shopify store): match its depth, structure and tone,
but every line must be about THIS business and the website type ordered; never reuse Nirapara's facts.
Fields:
- doc_type: e.g. "Shopify Store Proposal", "Website Proposal", "Ecommerce Store Proposal", "Landing Page Proposal".
- title: the cover title, e.g. "Shopify Store Development & Ecommerce Growth Proposal".
- summary: 2 paragraphs (who they are; what they have today and what we propose); approach = one short line in two
  parts separated by " / " (shown on two lines); 3 stats about THIS project (e.g. "5 weeks" / "to store launch");
  closing = one paragraph on how the new site earns.
- scope: an intro and 6-10 numbered work items; dark = true for the one most distinctive item.
- structure: the site map (8-18 page names), an intro and one note (note_bold starts it).
- features: 3-5 groups (titles without numbers), each with 3-4 cards; tone: use grey for most cards, one red and one
  dark per group at most; a group with 4 cards is shown 2 by 2. note: optional; note_bold makes it a boxed note.
- timeline: weekly steps (label "Week 1"...) that fit the package time, and two "after" cards (after launch, later).
- investment: a one-line intro (the price table comes from CodeAce's price list, not from you), the retainer line and
  the note of what is excluded. Never write any price or amount anywhere.
- deliverables: 6-10 short lines and a note. terms: 4-7 lines; start with the payment terms given below.
- closing: the contact page headline, e.g. "Let's Make <Business> the First Choice, Not the Third."
Plain sentences, title case for headings as in the reference, no emoji, no invented facts or numbers about the client.`;

// ------------------------------------------------------------------ brochures: research, per-lead content, fact check
// (owner, 2026-11-12: "for each brochure generation, the contents should be generated separately according to the lead
// details and SWOT. we research and update each and every content. also verify they are correct")
const FACT_STATUS = ['confirmed', 'from_crm', 'from_swot', 'removed'];
export const VERIFICATION = O({
  sources: A(O({ url: S(300), used_for: S(160) }), 0, 20),
  facts: A(O({ claim: S(200), source: S(300), status: { type: 'string', enum: FACT_STATUS } }), 0, 40),
  not_found: A(S(160), 0, 15),
});
const withVerification = (schema) => ({ ...schema, properties: { ...schema.properties, verification: VERIFICATION }, required: [...schema.required, 'verification'] });
export const processFor = (step3) => `<process>
Work in this order. The brochure is written for THIS business only, from what you find now; nothing is reused.
1. Research (web search is on): open the business's own website and its main pages, its Google / Maps listing and
   reviews, its Instagram / Facebook / YouTube pages, the marketplaces or directories it sells or lists on, and two or
   three competitors in the same place. Note what it sells, to whom, where, how customers enquire, book or buy today,
   what its website and listings lack, and anything recent (new outlets, launches, awards, press).
2. Read the lead data below: the CRM record and notes (the team's calls and what the client said), the SWOT and how
   we solve it, and the website check. They are the starting point; your research updates and completes them.
${step3}
4. Verify before answering: go through every fact about the business in your draft (names, places, products, prices,
   channels, years, numbers, quotes). Each must come from a page you opened (status confirmed, with its URL), the CRM
   record (from_crm) or the SWOT (from_swot). Anything you could not confirm: rewrite it in general terms or drop it,
   and list it under not_found (status removed in facts). Never present a guess as a fact.
5. Fill "verification": sources = the pages you used (URL + what for); facts = each checked claim with its source and
   status; not_found = what you looked for and could not confirm.
</process>`;
const BROCHURE_PROCESS = processFor(`3. Write every section from those sources: the challenge from the SWOT weaknesses and threats and what you saw on the
   website and listings; the opportunity from the SWOT opportunities; the customer journey from how THIS business's
   customers actually decide; the ideas from the SWOT solutions and the website type ordered; the working figures
   from the business's own prices and products where you found them (else clearly marked as working figures).`);
const SEO_PROCESS = processFor(`3. Write each field from those sources: the website services and capabilities from what its website and listings
   lack (the SWOT weaknesses, the website check); the SEO lines and the highlighted service from how its customers
   search for it (Google, Maps, AI answers) and what competitors show there; the package texts and the recommended
   package from its size, its goals and how much search support it needs.`);
// The Nirapara reference example and its copy guard (EXAMPLE_TERMS) were removed from the brochure jobs (brochure fix
// guide 2026-11-13, section 8): the example was 41% of the prompt, anchored every vertical to a food brand, and the
// guard refused true facts. The brochures get the short style note below instead.
/** How CodeAce writes (brochure fix guide, section 7.5): replaces the Nirapara example in the brochure jobs. */
export const STYLE_NOTE = `Voice: a senior consultant talking to an owner: direct, specific, warm, no jargon.
Headlines name a change the owner wants, in their terms: "From Instagram likes to paid orders",
not "Unlock your growth".
Every page supports the one sentence the brochure proves.
A card is a 2-5 word title and one line that is only true of this business.
  Good: "Kota Doria and Jamdani buyers ask about weave and care before they pay."
  Weak: "Customers want quality information."
Numbers only from the brief. When there are none, describe the mechanism instead of inventing a figure.
End on the next step the client takes, not on a slogan.`;
/**
 * The limits of a schema as numbers, for the prompt (brochure fix guide, section 8): "cover.title: max 30 characters"
 * etc., generated from the schema so the prompt never drifts from what clean() enforces.
 */
export function limitsText(schema, path = '') {
  const out = [];
  const walk = (s, p) => {
    if (s.type === 'string' && s.maxLength) out.push(`${p}: max ${s.maxLength} characters`);
    if (s.type === 'integer' && (s.minimum != null || s.maximum != null)) out.push(`${p}: ${s.minimum ?? 0} to ${s.maximum ?? 'any'}`);
    if (s.type === 'array') {
      if (s.minItems || s.maxItems) out.push(`${p}: ${s.minItems ?? 0}-${s.maxItems ?? 'any'} items`);
      walk(s.items, `${p}[]`);
    }
    for (const [k, v] of Object.entries(s.properties || {})) walk(v, p ? `${p}.${k}` : k);
  };
  walk(schema, path);
  return `<limits>\nHard limits: the boxes have fixed sizes, and text over these is cut at the last whole word.\n${out.join('\n')}\n</limits>`;
}
/**
 * The lead's SWOT as numbered lines (S1, W1, O1, T1, X1 for the solutions), never cut (brochure fix guide, section 8:
 * the JSON was cut mid-sentence at 4,000 characters). Points may be strings or { text, refs } objects.
 */
export function swotLines(sw) {
  const s = sw?.swot || {};
  const txt = (p) => (typeof p === 'string' ? p : [p?.text || p?.point || '', p?.refs?.length ? `[${p.refs.join(', ')}]` : ''].filter(Boolean).join(' ')).trim();
  const out = [];
  if (s.summary) out.push(`Summary: ${txt(s.summary)}`);
  for (const [k, letter] of [['strengths', 'S'], ['weaknesses', 'W'], ['opportunities', 'O'], ['threats', 'T']]) {
    (s[k] || []).map(txt).filter(Boolean).forEach((p, i) => out.push(`${letter}${i + 1} ${p}`));
  }
  const sol = (sw?.solutions || []).filter((x) => x && (x.problem || x.how));
  if (sol.length) {
    out.push('How CodeAce solves it:');
    sol.forEach((x, i) => out.push(`X${i + 1} ${[x.service, x.problem].filter(Boolean).join(': ')} → ${x.how || ''}${x.outcome ? ` → ${x.outcome}` : ''}`));
  }
  return out.join('\n');
}
/**
 * The designed brochure's answer → its data. Every page is sanitised again here (never trust the writer or the
 * runner): only design-system tags, classes and image ids stay. Fewer than 8 pages (or an empty one) fails the try.
 */
function cleanDesigned(out) {
  const pages = (Array.isArray(out?.pages) ? out.pages : []).slice(0, 14).map((p) => {
    const s = sanitizePage(p?.html);
    return { name: String(p?.name || '').trim().slice(0, 60), html: `<section class="${['page', ...s.variants].join(' ')}">${s.html}</section>`, empty: !s.html.replace(/<[^>]+>/g, '').trim() };
  });
  if (pages.length < 8 || pages.some((p) => p.empty)) throw new Error(`the brochure answer was incomplete (${pages.length} pages${pages.some((p) => p.empty) ? ', an empty page' : ''}; 8 to 14 needed)`);
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  return {
    story: s(out.story, 400), theme: s(out.theme, 30), fonts: s(out.fonts, 30), doc_name: s(out.doc_name, 40) || 'Growth Brochure',
    pages: pages.map(({ name, html }) => ({ name, html })),
    claims: (Array.isArray(out.claims) ? out.claims : []).slice(0, 80).map((c) => ({ text: s(c?.text, 300), refs: (Array.isArray(c?.refs) ? c.refs : []).map((r) => s(r, 12)).slice(0, 8) })),
  };
}
/** Claude's answer for an HTML template → the document content (with the fact check), or an error that retries. */
export function acceptHtml(template, output, job) {
  if (template === IMPORTED) return acceptImported(output, job, VERIFICATION, clean); // a promise: the template is read from the database
  const cuts = [];
  if (template === DESIGNED) { // + the client's pictures (stored copies) and the runner's checks (claims check, review)
    const data = cleanHtmlData(template, output);
    data.images = (job?.images || []).map((i) => ({ id: i.id, src: i.src, alt: i.alt || '' })).filter((i) => /^(upload:|asset:html-docs\/)/.test(i.src || '')); // stored copies or the template's own photos
    const problems = checkOutput(output, { ids: job?.brief_ids || [], images: job?.images || [] });
    return { html: { template, data, split: {}, check: { ...(output.check || {}), output_problems: problems.slice(0, 20), engine_checked: !!output.check } } };
  }
  const content = htmlContent(template, cleanHtmlData(template, output, cuts));
  if (output?.verification) content.html.verification = clean(output.verification, VERIFICATION);
  if (cuts.length) content.html.cuts = cuts; // texts cut to fit, logged by the caller (claude-worker postProcess)
  return content;
}

/**
 * The Claude job for an HTML template (the caller appends the website type, playbook and, for proposals, the strategy
 * and review sections). offer = the decided offer for brochures (src/brochure/offer.js): one sentence plus the package.
 */
export function htmlJob(template, { input, dossier, research, swot, settings, items, audit, offer }) {
  const brochure = HTML_TEMPLATES[template]?.kind === 'brochure';
  const ps = template === PS;
  const seo = template === SEO;
  const designed = brochure && !seo; // the brochures Claude writes in full (not the SEO brochure, which fills fixed copy)
  const lead = [`Business: ${input.company}`, input.industry && `Industry: ${input.industry}`, input.city && `Place: ${input.city}`, input.website && `Website: ${input.website}`,
    input.website_type && `Website type ordered: ${input.website_type}`, !offer?.package && input.package && `Package: ${input.package}`].filter(Boolean).join('\n');
  const facts = brochure ? '' : `\n<commercial_terms>\nPayment terms: ${settings.proposal?.payment_terms || ''}\nOther terms: ${(settings.proposal?.terms || []).join(' | ')}\nExcluded from the price: ${settings.proposal?.investment_note || ''}\nSupport after launch: ${settings.proposal?.support_days || 90} days\nPrice table rows (from our price list, shown as is): ${(items || []).map((i) => i.name).join('; ')}\n</commercial_terms>`;
  // brochures: the style note replaces the Nirapara example (brochure fix guide 2026-11-13); the SEO brochure keeps its
  // own general wording as the example, proposals keep theirs
  const example = seo ? seoExample() : brochure ? null : { ...NIRAPARA_PROPOSAL, photos: undefined };
  const offerBlock = offer?.text ? `<offer>\n${offer.text}${offer.package ? `\nPackage: ${offer.package}` : ''}\nThis offer is decided: sell exactly this. Do not suggest a different build, and do not contradict it anywhere.\n</offer>` : '';
  return {
    kind: 'html',
    template,
    purpose: brochure ? 'brochure_html' : 'proposal_html',
    system: `You are Codeace's senior strategist and copywriter. You write ${brochure ? 'growth-plan brochures' : 'project proposals'} for local businesses in Kerala and the Gulf: specific, plain and persuasive, built only on what is known about the business. You answer with JSON that matches the schema exactly.`,
    prompt: [
      seo ? BROCHURE_SEO_GUIDE : ps ? BROCHURE_PS_GUIDE : brochure ? BROCHURE_GUIDE : PROPOSAL_GUIDE,
      `<lead>\n${lead}\n</lead>`,
      offerBlock,
      seo ? SEO_PROCESS : brochure ? BROCHURE_PROCESS : '',
      dossier ? `<crm_and_notes>\n${dossier}\n</crm_and_notes>` : '',
      research ? `<research>\n${typeof research === 'string' ? research : JSON.stringify(research).slice(0, 6000)}\n</research>` : '',
      audit?.findings?.length ? `<website_check url="${String(input.website || '').replace(/"/g, '')}">\n${audit.findings.map((f) => `- ${f.text}`).join('\n')}\n(${WEBSITE_CHECK_RULE})\n</website_check>` : '',
      // the SWOT as numbered lines, never cut (it was JSON cut mid-sentence at 4,000 characters)
      swot ? `<swot>\n${swotLines(swot)}\n</swot>` : brochure ? '<swot>No SWOT has been made for this lead yet: work out its strengths, weaknesses, opportunities and threats from your research first.</swot>' : '',
      facts,
      designed ? `<style_note>\n${STYLE_NOTE}\n</style_note>` : '',
      designed ? limitsText(ps ? BROCHURE_PS_SCHEMA : BROCHURE_SCHEMA) : '',
      example ? `<reference_example business="${seo ? "none: the brochure's own general wording" : 'Nirapara'}">\n${JSON.stringify(example)}\n</reference_example>` : '',
    ].filter(Boolean).join('\n\n'),
    // limits (lengths, counts, ranges) are kept out of the schema Claude gets: strict structured output refuses them;
    // the <limits> section states them (brochures) and cleanHtmlData enforces them on the answer
    schema: stripLimits(seo ? withVerification(BROCHURE_SEO_SCHEMA) : ps ? withVerification(BROCHURE_PS_SCHEMA) : brochure ? withVerification(BROCHURE_SCHEMA) : PROPOSAL_SCHEMA),
    maxTokens: 16000,
  };
}
const LIMIT_KEYS = new Set(['maxLength', 'minLength', 'minItems', 'maxItems', 'minimum', 'maximum']);
export function stripLimits(s) {
  if (Array.isArray(s)) return s.map(stripLimits);
  if (!s || typeof s !== 'object') return s;
  return Object.fromEntries(Object.entries(s).filter(([k]) => !LIMIT_KEYS.has(k)).map(([k, v]) => [k, stripLimits(v)]));
}

/** A document edited by hand (the form beside the pages): same shape, sizes capped, nothing executable. */
export function sanitizeEdit(v, depth = 0) {
  if (depth > 7) return null;
  if (typeof v === 'string') return v.slice(0, 2000);
  if (typeof v === 'number' || typeof v === 'boolean' || v == null) return v;
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => sanitizeEdit(x, depth + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 60).filter(([k]) => /^[\w-]{1,40}$/.test(k)).map(([k, x]) => [k, sanitizeEdit(x, depth + 1)]));
  return null;
}

// (The general Codeace copy for documents without the AI, fallbackData, was removed on 2026-11-13: owner, "remove rule
// based default generation from the system completely". Every document is written by the AI from research.)

/** A ready HTML-template content block for a document. */
export const htmlContent = (template, data) => ({ html: { template, data, split: {} } });
