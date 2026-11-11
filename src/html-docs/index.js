import { get, insert, run } from '../db.js';
import { getSettings, getState, setState } from '../settings.js';
import { nowISO, tzParts } from '../util.js';
import { dataUri } from './assets.js';
import { proposalHtml, SIZE as PROPOSAL_SIZE } from './proposal-codeace.js';
import { brochureHtml, ideaPlan, SIZE as BROCHURE_SIZE } from './brochure-codeace.js';
import { NIRAPARA_PROPOSAL, NIRAPARA_ITEMS } from './samples/nirapara-proposal.js';
import { NIRAPARA_BROCHURE } from './samples/nirapara-brochure.js';

/*
 * HTML document templates (owner, 2026-11-11: "i generated brochure and proposal from claude web. can u convert this
 * exactly to our system. next generations should use this as default. but it should be same as exactly without any
 * difference"). The two designs are code templates (brochure-codeace.js, proposal-codeace.js) that keep the reference
 * HTML and CSS as they are; a document stores only its content (content.html = { template, data, split }) and is
 * printed by Chromium (chrome.js). Template rows have mode 'html'; documents made with them have no design_json, so
 * the Canva-style editor is replaced by a form beside the live pages (public/html-docs.js).
 */
export const HTML_TEMPLATES = {
  'builtin-html-brochure': { kind: 'brochure', name: 'Codeace Growth Plan', size: BROCHURE_SIZE },
  'builtin-html-proposal': { kind: 'proposal', name: 'CodeAce Proposal', size: PROPOSAL_SIZE },
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

async function context(kind, d, { client, items, created }) {
  const s = getSettings();
  const a = s.agency || {};
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
export async function htmlFor({ template, data, split }, { client, items, created }) {
  const t = HTML_TEMPLATES[template];
  const d = template === 'builtin-html-proposal' ? { ...data, eyebrow: data.eyebrow || `${data.doc_type || 'Website Proposal'} · ${monthYear(created, getSettings())}` } : data;
  const ctx = await context(t.kind, d, { client, items, created });
  return t.kind === 'brochure' ? brochureHtml(d, ctx, split || {}) : proposalHtml(d, ctx, split || {});
}
const docArgs = (doc) => ({ client: doc.input?.company || doc.title || 'Client', items: doc.items, created: doc.created_at });

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
  for (let i = 0; i < 3; i++) {
    const over = await withPage(html, t.size, overflowCheck);
    if (!over.length) break;
    const next = replan(t.kind, h.data, split, over);
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

/** HTML for the page view and the template preview (no fit check; the saved plan is used). */
export async function htmlDocHtml(doc) { return htmlFor(doc.content.html, docArgs(doc)); }
export async function templatePreviewHtml(tpl) {
  const t = HTML_TEMPLATES[tpl.source];
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

/** The Claude job for an HTML template (the caller appends the playbook, strategy and review sections). */
export function htmlJob(template, { input, dossier, research, swot, settings, items }) {
  const brochure = template === 'builtin-html-brochure';
  const lead = [`Business: ${input.company}`, input.industry && `Industry: ${input.industry}`, input.city && `Place: ${input.city}`, input.website && `Website: ${input.website}`,
    input.website_type && `Website type ordered: ${input.website_type}`, input.package && `Package: ${input.package}`].filter(Boolean).join('\n');
  const facts = brochure ? '' : `\n<commercial_terms>\nPayment terms: ${settings.proposal?.payment_terms || ''}\nOther terms: ${(settings.proposal?.terms || []).join(' | ')}\nExcluded from the price: ${settings.proposal?.investment_note || ''}\nSupport after launch: ${settings.proposal?.support_days || 90} days\nPrice table rows (from our price list, shown as is): ${(items || []).map((i) => i.name).join('; ')}\n</commercial_terms>`;
  const example = brochure ? NIRAPARA_BROCHURE : { ...NIRAPARA_PROPOSAL, photos: undefined };
  return {
    kind: 'html',
    template,
    purpose: brochure ? 'brochure_html' : 'proposal_html',
    system: `You are Codeace's senior strategist and copywriter. You write ${brochure ? 'growth-plan brochures' : 'project proposals'} for local businesses in Kerala and the Gulf: specific, plain and persuasive, built only on what is known about the business. You answer with JSON that matches the schema exactly.`,
    prompt: [
      brochure ? BROCHURE_GUIDE : PROPOSAL_GUIDE,
      `<lead>\n${lead}\n</lead>`,
      dossier ? `<crm_and_notes>\n${dossier}\n</crm_and_notes>` : '',
      research ? `<research>\n${typeof research === 'string' ? research : JSON.stringify(research).slice(0, 6000)}\n</research>` : '',
      swot ? `<swot>\n${JSON.stringify(swot).slice(0, 4000)}\n</swot>` : '',
      facts,
      `<reference_example business="Nirapara">\n${JSON.stringify(example)}\n</reference_example>`,
    ].filter(Boolean).join('\n\n'),
    // limits (lengths, counts, ranges) are kept out of the schema Claude gets: strict structured output refuses them;
    // the guide states them and cleanHtmlData enforces them on the answer
    schema: stripLimits(brochure ? BROCHURE_SCHEMA : PROPOSAL_SCHEMA),
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
