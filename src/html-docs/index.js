import { get, insert, run } from '../db.js';
import { getSettings, getState, setState } from '../settings.js';
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
export { cleanEdits, hasEdits };

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
};
export const isHtmlTemplate = (tpl) => tpl?.mode === 'html' && !!HTML_TEMPLATES[tpl.source];
export const isHtmlDoc = (d) => !!d?.content?.html?.template && !!HTML_TEMPLATES[d.content.html.template];

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
export async function htmlFor({ template, data, split, edits }, { client, items, created, website }) {
  const t = HTML_TEMPLATES[template];
  const d = template === 'builtin-html-proposal' ? { ...data, eyebrow: data.eyebrow || `${data.doc_type || 'Website Proposal'} · ${monthYear(created, getSettings())}` } : data;
  const ctx = await context(t.kind, d, { client, items, created, website, template });
  const html = template === PS ? brochurePsHtml(d, ctx, split || {}) : t.kind === 'brochure' ? brochureHtml(d, ctx, split || {}) : proposalHtml(d, ctx, split || {});
  return applyEdits(html, edits, resolveSrc); // data-k keys for the page editor + what was moved / retyped / added on the pages
}
const docArgs = (doc) => ({ client: doc.input?.company || doc.title || 'Client', items: doc.items, created: doc.created_at, website: doc.input?.website || '' });

/**
 * PDF of an HTML document. The page plan is checked in Chromium first: a page whose content runs past its bottom is
 * split (proposal scope 5 → 4 → 3 per page; brochure idea pages 4 → 2 → 1), up to three tries. The plan that fits is
 * saved with the document so the page view shows the same pages.
 */
export async function htmlDocPdf(doc) {
  const { withPage, overflowCheck, htmlToPdf } = await import('./chrome.js');
  const h = doc.content.html;
  const t = HTML_TEMPLATES[h.template];
  let split = h.split || {};
  let html = await htmlFor({ ...h, split }, docArgs(doc));
  // pages edited by hand keep their plan: splitting a page would move the elements the edits point at
  for (let i = 0; i < 3 && !hasEdits(h.edits); i++) {
    const over = await withPage(html, t.size, overflowCheck);
    if (!over.length) break;
    const next = h.template === PS ? replanPs(h.data, split, over) : replan(t.kind, h.data, split, over);
    if (!next) break;
    split = next;
    html = await htmlFor({ ...h, split }, docArgs(doc));
  }
  if (doc.id && JSON.stringify(split) !== JSON.stringify(h.split || {})) {
    await run(`UPDATE docs SET content_json = :c WHERE id = :id`, { c: JSON.stringify({ ...doc.content, html: { ...h, split } }), id: doc.id }).catch(() => {});
  }
  return htmlToPdf(html, t.size);
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

/** HTML for the page view and the template preview (no fit check; the saved plan is used). */
export async function htmlDocHtml(doc) { return htmlFor(doc.content.html, docArgs(doc)); }
/** The Nirapara reference of an HTML template, as a document (template preview, sample PDF). */
export function sampleDoc(source) {
  const t = HTML_TEMPLATES[source];
  const data = source === PS ? NIRAPARA_BROCHURE_PS : t.kind === 'brochure' ? NIRAPARA_BROCHURE : { ...NIRAPARA_PROPOSAL, doc_type: 'Shopify Store Proposal' };
  return { id: 0, kind: t.kind, title: 'Nirapara sample', input: source === PS ? { ...NIRAPARA_PS_INPUT } : { company: 'Nirapara' }, status: 'ready', created_at: new Date().toISOString(),
    items: t.kind === 'proposal' ? NIRAPARA_ITEMS.map((name) => ({ name, price: 0 })) : null,
    content: { html: { template: source, data: JSON.parse(JSON.stringify(data)), split: {} } } };
}
export async function templatePreviewHtml(tpl) {
  const t = HTML_TEMPLATES[tpl.source];
  if (tpl.source === PS) return { html: await htmlFor(sampleDoc(PS).content.html, docArgs(sampleDoc(PS))), size: t.size, html_template: true };
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

/** Output → the template's data: only known fields, strings trimmed, list lengths kept to what the layout holds. */
function clean(v, schema) {
  if (schema.type === 'string') return String(v ?? '').replace(/\s+\n/g, '\n').trim().slice(0, (schema.maxLength || 400) + 40);
  if (schema.type === 'integer') return Math.max(schema.minimum ?? 0, Math.min(schema.maximum ?? 99, Math.round(Number(v) || 0)));
  if (schema.type === 'boolean') return !!v;
  if (schema.type === 'array') return (Array.isArray(v) ? v : []).slice(0, schema.maxItems || 50).map((x) => clean(x, schema.items)).filter((x) => x !== '' && x != null);
  const o = {};
  for (const [k, sub] of Object.entries(schema.properties || {})) o[k] = clean(v?.[k], sub);
  return o;
}
export function cleanHtmlData(template, out) {
  if (template === PS) {
    const d = clean(out, BROCHURE_PS_SCHEMA);
    d.ideas = d.ideas.map((it) => ({ ...it, short: it.short || it.title }));
    d.idea_pages = d.idea_pages.map((p) => ({ ...p, title: p.title || 'The Ideas' }));
    return d;
  }
  if (template === 'builtin-html-brochure') {
    const d = clean(out, BROCHURE_SCHEMA);
    d.ideas = d.ideas.map((it) => ({ ...it, short: it.short || it.title, intro: it.intro || '', why: it.why || '' }));
    if (!d.ideas.some((x) => x.featured)) d.ideas = d.ideas.map((x) => ({ ...x, featured: false }));
    else { let seen = false; d.ideas = d.ideas.map((x) => { const f = x.featured && !seen; if (f) seen = true; return { ...x, featured: f }; }); }
    d.cover.script_word = /[ഀ-ൿ]/.test(d.cover.script_word) ? d.cover.script_word : ''; // Malayalam script only
    return d;
  }
  const d = clean(out, PROPOSAL_SCHEMA);
  d.summary.approach = d.summary.approach.replace(/\s*\/\s*|\s*\|\s*/g, '\n');
  d.features = d.features.map((g) => ({ ...g, note: g.note ? (g.note_bold ? { bold: g.note_bold, text: g.note } : g.note) : '' }));
  return d;
}

const BROCHURE_GUIDE = `Write the content of Codeace's growth-plan brochure for this one business, in the fixed design (landscape A4,
12 pages). It is Codeace's plan for the client: their situation, where they lose customers today, and the ideas Codeace
will build to win them. The reference below is a finished brochure for Nirapara (a Kerala spice and rice brand): match
its depth, specificity and tone, but every fact must be about THIS business; never reuse Nirapara's facts or ideas.
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
their situation, where they lose customers today, and the ideas CodeAce will build to win them. The reference below
is a finished brochure for Nirapara (a Kerala spice and rice brand): match its depth, specificity, brevity and tone,
but every fact must be about THIS business; never reuse Nirapara's facts or ideas.
Every heading (cover.title, contents.title and each page title) is two short lines in Title Case, split with "\\n"
(e.g. "Everywhere,\\nBut Not First"). Text is short: cards hold a few words per line, so keep to the reference's length.
In a lead, wrap a few words in **double asterisks** to set them in bold (as in the reference); use it sparingly.
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
const VERIFICATION = O({
  sources: A(O({ url: S(300), used_for: S(160) }), 0, 20),
  facts: A(O({ claim: S(200), source: S(300), status: { type: 'string', enum: FACT_STATUS } }), 0, 40),
  not_found: A(S(160), 0, 15),
});
const withVerification = (schema) => ({ ...schema, properties: { ...schema.properties, verification: VERIFICATION }, required: [...schema.required, 'verification'] });
const BROCHURE_PROCESS = `<process>
Work in this order. The brochure is written for THIS business only, from what you find now; nothing is reused.
1. Research (web search is on): open the business's own website and its main pages, its Google / Maps listing and
   reviews, its Instagram / Facebook / YouTube pages, the marketplaces or directories it sells or lists on, and two or
   three competitors in the same place. Note what it sells, to whom, where, how customers enquire, book or buy today,
   what its website and listings lack, and anything recent (new outlets, launches, awards, press).
2. Read the lead data below: the CRM record and notes (the team's calls and what the client said), the SWOT and how
   we solve it, and the website check. They are the starting point; your research updates and completes them.
3. Write every section from those sources: the challenge from the SWOT weaknesses and threats and what you saw on the
   website and listings; the opportunity from the SWOT opportunities; the customer journey from how THIS business's
   customers actually decide; the ideas from the SWOT solutions and the website type ordered; the working figures
   from the business's own prices and products where you found them (else clearly marked as working figures).
4. Verify before answering: go through every fact about the business in your draft (names, places, products, prices,
   channels, years, numbers, quotes). Each must come from a page you opened (status confirmed, with its URL), the CRM
   record (from_crm) or the SWOT (from_swot). Anything you could not confirm: rewrite it in general terms or drop it,
   and list it under not_found (status removed in facts). Never present a guess as a fact.
5. Fill "verification": sources = the pages you used (URL + what for); facts = each checked claim with its source and
   status; not_found = what you looked for and could not confirm.
</process>`;
/** Words particular to the Nirapara reference: in another lead's brochure they mean the example was copied. */
const EXAMPLE_TERMS = ['Nirapara', 'Kalady', 'Blinkit', 'Instamart', 'BigBasket', 'Reliance Smart', 'puttu', 'palappam', 'appam', 'podi', 'Kerala Kitchen Box', 'pack QR', 'purity report', 'batch report', 'chilli powder', 'curry masala', 'kirana'];
/** What the job says about the lead itself (not the guide, which names the example). */
const leadContext = (prompt) => [...String(prompt || '').matchAll(/<(lead|crm_and_notes|research|website_check|swot)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]).join('\n').toLowerCase();
export function exampleLeaks(output, job) {
  const lead = leadContext(job?.prompt);
  const text = JSON.stringify({ ...output, verification: undefined, strategy: undefined, review: undefined }).toLowerCase();
  const confirmed = JSON.stringify((output?.verification?.facts || []).filter((f) => f.status === 'confirmed' && /^https?:\/\//.test(f.source || ''))).toLowerCase();
  return EXAMPLE_TERMS.filter((t) => { const w = t.toLowerCase(); return new RegExp(`\\b${w}\\b`).test(text) && !lead.includes(w) && !confirmed.includes(w); });
}
/** Claude's answer for an HTML template → the document content (with the fact check), or an error that retries. */
export function acceptHtml(template, output, job) {
  if (HTML_TEMPLATES[template]?.kind === 'brochure') {
    const leaks = exampleLeaks(output, job);
    if (leaks.length) throw new Error(`facts copied from the Nirapara example (${leaks.join(', ')}): written again`);
  }
  const content = htmlContent(template, cleanHtmlData(template, output));
  if (output?.verification) content.html.verification = clean(output.verification, VERIFICATION);
  return content;
}

/** The Claude job for an HTML template (the caller appends the playbook, strategy and review sections). */
export function htmlJob(template, { input, dossier, research, swot, settings, items, audit }) {
  const brochure = HTML_TEMPLATES[template]?.kind === 'brochure';
  const ps = template === PS;
  const lead = [`Business: ${input.company}`, input.industry && `Industry: ${input.industry}`, input.city && `Place: ${input.city}`, input.website && `Website: ${input.website}`,
    input.website_type && `Website type ordered: ${input.website_type}`, input.package && `Package: ${input.package}`].filter(Boolean).join('\n');
  const facts = brochure ? '' : `\n<commercial_terms>\nPayment terms: ${settings.proposal?.payment_terms || ''}\nOther terms: ${(settings.proposal?.terms || []).join(' | ')}\nExcluded from the price: ${settings.proposal?.investment_note || ''}\nSupport after launch: ${settings.proposal?.support_days || 90} days\nPrice table rows (from our price list, shown as is): ${(items || []).map((i) => i.name).join('; ')}\n</commercial_terms>`;
  const example = ps ? { ...NIRAPARA_BROCHURE_PS, photos: undefined, idea_pages: NIRAPARA_BROCHURE_PS.idea_pages.map(({ title, lead, statement }) => ({ title, lead, statement })) }
    : brochure ? NIRAPARA_BROCHURE : { ...NIRAPARA_PROPOSAL, photos: undefined };
  return {
    kind: 'html',
    template,
    purpose: brochure ? 'brochure_html' : 'proposal_html',
    system: `You are Codeace's senior strategist and copywriter. You write ${brochure ? 'growth-plan brochures' : 'project proposals'} for local businesses in Kerala and the Gulf: specific, plain and persuasive, built only on what is known about the business. You answer with JSON that matches the schema exactly.`,
    prompt: [
      ps ? BROCHURE_PS_GUIDE : brochure ? BROCHURE_GUIDE : PROPOSAL_GUIDE,
      `<lead>\n${lead}\n</lead>`,
      brochure ? BROCHURE_PROCESS : '',
      dossier ? `<crm_and_notes>\n${dossier}\n</crm_and_notes>` : '',
      research ? `<research>\n${typeof research === 'string' ? research : JSON.stringify(research).slice(0, 6000)}\n</research>` : '',
      audit?.findings?.length ? `<website_check url="${String(input.website || '').replace(/"/g, '')}">\n${audit.findings.map((f) => `- ${f.text}`).join('\n')}\n</website_check>` : '',
      swot ? `<swot>\n${JSON.stringify(swot).slice(0, 4000)}\n</swot>` : brochure ? '<swot>No SWOT has been made for this lead yet: work out its strengths, weaknesses, opportunities and threats from your research first.</swot>' : '',
      facts,
      `<reference_example business="Nirapara">\n${JSON.stringify(example)}\n</reference_example>`,
    ].filter(Boolean).join('\n\n'),
    // limits (lengths, counts, ranges) are kept out of the schema Claude gets: strict structured output refuses them;
    // the guide states them and cleanHtmlData enforces them on the answer
    schema: stripLimits(ps ? withVerification(BROCHURE_PS_SCHEMA) : brochure ? withVerification(BROCHURE_SCHEMA) : PROPOSAL_SCHEMA),
    ...(brochure ? { example_terms: EXAMPLE_TERMS } : {}), // the GitHub worker's validator refuses copies of the example too
    maxTokens: 16000,
  };
}
const LIMIT_KEYS = new Set(['maxLength', 'minLength', 'minItems', 'maxItems', 'minimum', 'maximum']);
function stripLimits(s) {
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

/** Content without Claude (Claude mode off, or a local server): the reference structure with general Codeace copy. */
export function fallbackData(template, input, settings = getSettings()) {
  const c = input.company || 'your business';
  const type = ({ 'business-website': 'website', 'ecommerce-store': 'online store', 'shopify-store': 'Shopify store', 'landing-page': 'landing page' })[input.website_type] || 'website';
  if (template === PS) {
    const store = /store/.test(type);
    const Type = type.replace(/^./, (x) => x.toUpperCase());
    return cleanHtmlData(PS, {
      doc_name: store ? 'Ecom Growth Brochure' : 'Website Growth Brochure',
      cover: { label: `${type} growth brochure`, title: store ? 'Ecom Growth\nBrochure' : 'Website Growth\nBrochure', lead: `Where **${store ? 'orders' : 'enquiries'}**, **trust** and **repeat customers** come together.`,
        stats: [{ value: '8', label: 'Growth ideas' }, { value: store ? '6 wks' : '4 wks', label: `To ${type} launch` }],
        headline: 'From being found\nto being chosen.', text: `A ${type} that brings ${c} more ${store ? 'orders' : 'enquiries'} and keeps customers coming back.` },
      contents: { title: "What's Inside\nThis Brochure", lead: 'Four parts: the problem, the opportunity, the plan, and how we deliver it.',
        parts: [{ title: 'The challenge', text: 'Customers compare before they choose.' }, { title: 'The opportunity', text: `What a better ${type} changes for ${c}.` }, { title: 'The plan', text: 'Eight ideas to attract, convert and retain.' }, { title: 'Delivery', text: 'Working figures, the build, results and next steps.' }] },
      challenge: { label: 'The challenge', title: 'Found Online,\nNot Yet Chosen', lead: `People look up ${c} on their phone before they call, visit or buy.`, statement: 'Being found is not enough. Being chosen is.',
        rows: [{ title: 'On Google', points: ['Searches decide who gets the call', 'Listings without proof lose', 'Competitors look bigger online'] }, { title: 'On social media', points: ['Followers see posts but cannot act', 'Enquiries get lost in messages'] }, { title: `On the current ${store ? 'site' : 'website'}`, points: ['No clear next step on the page', 'Slow on mobile data', 'Nothing brings visitors back'] }] },
      opportunity: { label: 'The opportunity', title: `Why a Better\n${Type} Wins`, lead: `**One place that works for ${c}.** Every channel points to it, and every visit ends with a clear next step.`,
        items: [{ title: 'Be found first', text: 'Search and maps bring nearby customers who are ready to buy.' }, { title: 'Look premium', text: 'A design that matches the quality of the business.' }, { title: 'Make it easy to act', text: `Calls, WhatsApp${store ? ', checkout' : ', bookings'} in one tap.` },
          { title: 'Own the relationship', text: 'Enquiries and customer details stay with the business.' }, { title: 'Earn trust faster', text: 'Reviews, photos and proof on every page.' }, { title: 'Measure what works', text: 'Monthly numbers on visits, enquiries and sales.' }] },
      journey: { label: 'The decision', title: `How Customers\nChoose ${c}`.slice(0, 60), lead: 'Most decisions happen online, in a few minutes, before any call.', think_label: 'They ask', do_label: `The ${store ? 'store' : 'site'} answers`, highlight: 2,
        steps: [{ title: 'Searching', quote: 'Who is good near me?', text: 'Search and maps show the business with reviews.' }, { title: 'Comparing', quote: 'Can I trust them?', text: 'Proof, prices and real photos on every page.' }, { title: 'Deciding', quote: 'How do I start?', text: `One clear button: call, WhatsApp${store ? ' or buy' : ' or book'}.` }, { title: 'Coming back', quote: 'That went well.', text: 'Follow-ups and offers bring the customer back.' }],
        bridge: { title: 'One clear next step', text: 'Every visit ends with an easy way to act, so attention becomes business.' } },
      plan: { label: 'The plan', title: 'Eight Ideas,\nThree Goals', lead: 'Each idea serves one goal: bring customers in, turn visits into business, and bring them back.',
        goals: [{ name: 'Attract', sub: `Bring customers to ${c}`, note: '' }, { name: 'Convert', sub: `Turn visits into ${store ? 'orders' : 'enquiries'}`, note: '' }, { name: 'Retain', sub: 'Make customers regulars', note: '' }] },
      ideas: [
        { goal: 0, title: 'Search-ready pages', short: 'Search-ready pages', tone: 'red', points: ['Pages written for what people search', 'Google Business Profile linked', 'Fast on mobile data'] },
        { goal: 1, title: 'Clear offer up front', short: 'Clear offer', tone: 'grey', points: ['What you do, for whom, in one line', 'Prices or packages where it helps', 'One main button on every page'] },
        { goal: 1, title: 'Proof on every page', short: 'Proof on every page', tone: 'grey', points: ['Reviews and real photos', 'Results and short case notes', 'Certificates and partners'] },
        { goal: 2, title: 'WhatsApp follow-up', short: 'WhatsApp follow-up', tone: 'dark', points: ['Every enquiry gets a quick reply', 'Reminders and offers by WhatsApp', 'Nothing lost in the inbox'] },
        { goal: 0, title: 'Content that ranks', short: 'Content that ranks', tone: 'dark', points: ['Answers to the questions customers ask', 'Local pages for each area served', 'Ready for AI search answers'] },
        { goal: 1, title: store ? 'Easy checkout' : 'Easy enquiry', short: store ? 'Easy checkout' : 'Easy enquiry', tone: 'grey', points: store ? ['UPI, cards and COD', 'One-page checkout', 'Order updates on WhatsApp'] : ['Short form, call and WhatsApp', 'Booking where it fits', 'Instant confirmation'] },
        { goal: 2, title: 'Reviews and referrals', short: 'Reviews and referrals', tone: 'red', points: ['Ask happy customers at the right time', 'Simple referral rewards', 'Reviews shown on the site'] },
        { goal: 0, title: 'Campaign landing pages', short: 'Campaign pages', tone: 'grey', points: ['One page per offer or season', 'Ads and posts point to it', 'Results measured per campaign'] },
      ],
      idea_pages: [{ title: 'Be Found,\nBe Chosen', lead: `The core of the plan: how ${c} is found, trusted and contacted.`, statement: '' }, { title: 'Keep Growing,\nMonth by Month', lead: 'Content, offers and follow-ups that bring more customers every month.', statement: '' }],
      economics: { label: 'Working figures', title: 'What We Track\nFrom Day One', lead: 'Targets are agreed together after the first month of live data.',
        figures: [{ value: '30 days', title: 'First review', text: 'Numbers checked together after launch.' }, { value: '1 tap', title: 'To act', text: `Call, WhatsApp or ${store ? 'buy' : 'enquire'} on every page.` }, { value: '< 3 s', title: 'Page load', text: 'Fast on mobile data.' }, { value: '24/7', title: 'Always open', text: 'Enquiries and orders arrive any time.' }, { value: '100%', title: 'Ownership', text: 'The site and its data belong to you.' }, { value: 'Monthly', title: 'Report', text: 'Visits, enquiries and sales in one page.' }],
        note: 'Working figures for discussion, set together in the discovery call.' },
      delivery: { label: 'Delivery', title: 'What We Build,\nHow It Rolls Out', lead: `A ${type} live in a few weeks, then improved from real data.`, includes_title: `The ${type} includes`,
        includes: ['Custom mobile-first design', 'Pages written for search', 'Call, WhatsApp and forms', store ? 'Catalogue and checkout' : 'Services and booking', 'Reviews and proof', 'Google Business Profile', 'Analytics and reports', 'Training and handover'],
        phases: [{ title: 'Launch', when: store ? 'About 6 weeks' : 'About 4 weeks', text: `Design, build and launch of the ${type}.` }, { title: 'First 90 days', when: 'Months 1 to 3', text: 'Content, search and conversion improvements.' }, { title: 'Scale', when: 'Month 4 onward', text: 'New pages, campaigns and automation.' }] },
      results: { label: 'Results and next steps', title: 'How We Measure\nSuccess', lead: 'Eight numbers, reported monthly. Targets are set together after 30 days.', highlight: 1,
        metrics: ['Website visits', store ? 'Orders' : 'Enquiries', 'Conversion rate', 'Search rankings', 'Calls and WhatsApp clicks', 'Returning visitors', 'Cost per enquiry', 'Reviews'],
        next: ['Discovery call on goals and priorities', 'Content, photos and access review', 'Final scope, timeline and investment'], closing: `Let us make ${c}\nthe first choice online.` },
    });
  }
  if (template === 'builtin-html-brochure') {
    const services = (settings.brochure?.services || []).slice(0, 8);
    const ideas = services.map((s, i) => ({ goal: i % 3, title: s.name || s.title || `Idea ${i + 1}`, short: s.name || `Idea ${i + 1}`, intro: '', points: (s.bullets || s.points || [s.description || s.summary || 'Planned with you in the discovery call.']).slice(0, 3), why: '', featured: i === 0 }));
    return cleanHtmlData(template, {
      tag: 'Growth plan',
      cover: { script_word: '', title: 'A clear plan to grow', title_em: `${c} online.`, subtitle: `How a ${type} built by Codeace can bring ${c} more enquiries, orders and repeat customers.` },
      challenge: { label: 'The challenge', title: 'Customers look online before they choose', lead: `People compare ${c} with others on their phone before they call, visit or buy.`, statement: 'Being found is not enough. Being chosen is.',
        rows: [{ title: 'On Google', points: ['Searches decide who gets the call.', 'Listings without reviews or a site lose.'] }, { title: 'On social media', points: ['Followers see posts but have no easy way to act.', 'Enquiries get lost in messages.'] }, { title: 'On the website', points: ['Visitors need prices, proof and one clear next step.', 'Slow or unclear pages send them away.'] }],
        gap: `${c} has customers' attention, but no single place that turns it into enquiries and repeat business.` },
      opportunity: { label: 'The opportunity', title: 'What a better online home changes', items: [
        { title: 'Be found first', text: 'Search and maps bring nearby customers who are ready to buy.' }, { title: 'Look premium', text: 'A design that matches the quality of the business.' },
        { title: 'Make it easy to act', text: 'Calls, WhatsApp, bookings or orders in one tap.' }, { title: 'Own the relationship', text: 'Enquiries and customers stay with the business.' },
        { title: 'Earn trust faster', text: 'Reviews, photos and proof on every page.' }, { title: 'Measure what works', text: 'Monthly numbers on visits, enquiries and sales.' }],
        approach: { title: 'Built around how customers decide', text: 'Codeace plans the site from the questions customers ask before they choose, then builds, launches and improves it with you.' } },
      journey: { label: 'The customer journey', title: 'How a customer chooses', lead: 'Most decisions happen online, in a few minutes, before any call.', highlight: 2,
        steps: [{ title: 'Searching', quote: 'Who is good near me?', text: 'Search and maps show the business with reviews.' }, { title: 'Comparing', quote: 'Can I trust them?', text: 'The site answers with proof, prices and photos.' }, { title: 'Deciding', quote: 'How do I start?', text: 'One clear button: call, WhatsApp, book or order.' }, { title: 'Coming back', quote: 'That went well.', text: 'Follow-ups and offers bring the customer back.' }],
        bridge: { title: 'One clear next step on every page.', text: 'Every visit ends with an easy way to act, so attention becomes business.' } },
      plan: { label: 'The plan', title: 'Ideas across three goals', goals: [{ name: 'Attract', sub: `Bring customers to ${c}` }, { name: 'Convert', sub: 'Turn visits into enquiries' }, { name: 'Retain', sub: 'Make customers regulars', note: '' }] },
      idea_titles: ['The core of the plan', 'Growth that keeps going', 'More ways to win', 'Finishing touches'],
      ideas,
      economics: { label: 'Working figures', title: 'What we will track from day one', lead: 'Targets are agreed together after the first month of live data.',
        figures: [{ value: '30 days', title: 'First review', text: 'Numbers checked together a month after launch.' }, { value: '1 tap', title: 'To enquire', text: 'Call, WhatsApp or form on every page.' }, { value: '< 3 s', title: 'Page load', text: 'Fast on mobile data.' }, { value: '24/7', title: 'Always open', text: 'Enquiries and orders arrive any time.' }, { value: '100%', title: 'Ownership', text: 'The site and its data belong to the business.' }, { value: 'Monthly', title: 'Report', text: 'Visits, enquiries and sales in one page.' }],
        note: 'Working figures for discussion.' },
      delivery: { label: 'Delivery', title: 'What we build, and how it rolls out', includes_title: `The ${type} includes`.replace(/^The (w)/, (m, c) => 'The ' + c.toUpperCase()),
        includes: ['Custom, mobile-first design', 'Pages written for search', 'Enquiry, WhatsApp and call buttons', 'Reviews and proof sections', 'Google Business Profile set-up', 'Analytics and monthly reporting'],
        phases: [{ when: 'First weeks', title: 'Phase 1 · Launch', text: 'Design, build and launch of the core site.' }, { when: 'First 90 days', title: 'Phase 2 · Grow', text: 'Content, search and conversion improvements.' }, { when: 'Ongoing', title: 'Phase 3 · Scale', text: 'New pages, campaigns and automation.' }] },
      results: { label: 'Results and next steps', title: 'How we will measure success', metrics: ['Website visits', 'Enquiries', 'Conversion rate', 'Search rankings', 'Calls and WhatsApp clicks', 'Returning visitors', 'Cost per enquiry', 'Reviews'], note: 'Reported monthly.',
        next: ['Discovery call to align on goals and priorities', 'Content, photos and access review', 'Detailed proposal with scope, timeline and investment'], cta_before: `Let us make ${c} the`, cta_em: 'first choice', cta_after: ' online.' },
    });
  }
  const pkg = (settings.packages || []).find((p) => p.id === input.package) || (settings.packages || [])[0] || { name: 'Website', includes: [], timeline: '3 weeks' };
  const weeks = Math.max(1, Math.min(6, parseInt(pkg.timeline, 10) || 3));
  return cleanHtmlData(template, {
    doc_type: `${pkg.name} Proposal`, title: `${pkg.name} Design & Development Proposal`,
    summary: { paragraphs: [`${c} is ready for a ${String(pkg.name).toLowerCase()} that brings in enquiries and shows the quality of the business.`, `We propose a fast, mobile-first ${String(pkg.name).toLowerCase()} built by CodeAce, with clear pages, strong calls to action and search basics in place from day one.`], approach: 'Built to be found / and to be chosen.',
      stats: [{ value: pkg.timeline || `${weeks} weeks`, label: 'to launch' }, { value: String((pkg.includes || []).length || 6), label: 'key features' }, { value: 'Mobile', label: 'first design' }], closing: 'Every page ends with one clear next step: a call, a WhatsApp message or an enquiry.' },
    scope: { intro: `We will design and build a new ${String(pkg.name).toLowerCase()} for ${c}.`, items: [
      { title: 'Discovery & Planning', text: 'Goals, audience, pages and content plan.' }, { title: 'Custom UI/UX Design', text: 'A premium, mobile-first design in your brand.' },
      { title: 'Development', text: 'A fast, secure build that your team can update.' }, { title: 'Content & SEO', text: 'Page copy structure, metadata and search basics.' },
      { title: 'Integrations', text: 'Forms, WhatsApp, maps and analytics.' }, { title: 'Testing, Launch & Support', text: `Testing on every device, launch and ${settings.proposal?.support_days || 90} days of support.`, dark: true }] },
    structure: { intro: 'A clear structure that answers what customers ask before they choose.', pages: ['Home', 'About', 'Services', 'Gallery', 'Reviews', 'FAQs', 'Contact', 'Privacy & Terms'], note_bold: 'Every page mobile-first.', note: 'Each page ends with a clear call to action.' },
    features: [
      { title: 'Design & Experience', cards: [{ title: 'Home Page', tone: 'grey', points: ['Clear headline and offer', 'Proof: reviews and photos', 'One-tap call and WhatsApp'] }, { title: 'Inner Pages', tone: 'grey', points: ['Service and about pages', 'Gallery and FAQs', 'Enquiry form on every page'] }, { title: 'Mobile First', tone: 'dark', points: ['Fast on mobile data', 'Thumb-friendly buttons', 'Readable on any screen'] }], note_bold: '', note: '' },
      { title: 'Search & Growth', cards: [{ title: 'SEO Basics', tone: 'red', points: ['Page titles and descriptions', 'Schema and sitemap', 'Google Business Profile link'] }, { title: 'Analytics', tone: 'grey', points: ['GA4 set-up', 'Enquiry and call tracking', 'Monthly report'] }, { title: 'Speed & Security', tone: 'grey', points: ['SSL', 'Image optimisation', 'Spam protection'] }], note_bold: '', note: '' },
      { title: 'Handover & Support', cards: [{ title: 'Training', tone: 'grey', points: ['Admin walkthrough', 'Short usage guide'] }, { title: 'Support', tone: 'dark', points: [`${settings.proposal?.support_days || 90} days of post-launch support`, 'Fixes and small changes'] }, { title: 'Ownership', tone: 'grey', points: ['Full access on completion', 'Your domain, your data'] }], note_bold: '', note: '' },
    ],
    timeline: { intro: `The site goes live in about ${pkg.timeline || `${weeks} weeks`} from sign-off.`, steps: Array.from({ length: weeks }, (_, i) => ({ label: `Week ${i + 1}`, title: ['Discovery & Design', 'Design Approval & Build', 'Content & Integrations', 'Testing & Launch', 'Launch', 'Handover'][Math.min(i, 5)], text: ['Kick-off, sitemap and page designs.', 'Sign-off and development.', 'Content, forms, WhatsApp and analytics.', 'Testing on devices and go-live.', 'Go-live and checks.', 'Training and handover.'][Math.min(i, 5)] })),
      after: [{ label: 'After launch · Months 1 to 3', title: 'First 90 Days', text: 'Search improvements, content and conversion fixes.' }, { label: 'Month 4 onward', title: 'Scale', text: 'New pages, campaigns and automation.' }] },
    investment: { intro: `Module-wise pricing for the ${String(pkg.name).toLowerCase()}.`, retainer_bold: 'Post-launch growth.', retainer: 'Ongoing SEO, content and campaigns run as a monthly retainer, quoted separately.', note: settings.proposal?.investment_note || '' },
    deliverables: { items: (pkg.includes || []).slice(0, 8).concat(['Admin training and usage guide']).slice(0, 10), note: settings.proposal?.deliverables_note || '' },
    terms: [settings.proposal?.payment_terms, ...(settings.proposal?.terms || [])].filter(Boolean).slice(0, 7),
    closing: `Let's Make ${c} the First Choice.`,
  });
}

/** A ready HTML-template content block for a document. */
export const htmlContent = (template, data) => ({ html: { template, data, split: {} } });
