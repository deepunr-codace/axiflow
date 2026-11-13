import { addColumns, get, all, insert, update, run } from './db.js';
import { isWebsiteType, websiteTypeFor, websiteTypeSection, websiteTypeLabel } from './website-type.js';
import { background } from './background.js';
import { scriptJob, VERTICALS, LANGUAGES, SERVICES, swotText } from './ai/script.js';
import { scriptPdf } from './pdf/script.js';
import { collectFacts, saveFacts, WEBSITE_CHECK_RULE } from './pipeline/enrich.js';
import { addActivity } from './pipeline/log.js';
import { crmEvent } from './crm-sync.js';
import { getSettings } from './settings.js';
import { nowISO, token, normalizeUrl, BASE_URL } from './util.js';
import { brochureVars, templateBrochure } from './ai/brochure.js';
import { proposalJob, templateProposal } from './ai/proposal-doc.js';
import { chatEdit } from './ai/design-ai.js';
import { brochureDesign, proposalDesign } from './design/layouts.js';
import { classicDesign } from './design/deck.js';
import { editorialDesign } from './design/editorial.js';
import { signatureDesign, isSignature, signatureStyle } from './design/signature.js';
import { growthDesign } from './design/growth.js';
import { contentToData } from './design/brochure-data.js';
import { buildBrief, deckJob } from './ai/brochure-deck.js';
import { claudeOn, claudeBroken, dispatchJob, claudeState } from './claude-worker.js';
import { claudeScriptJob, claudeProposalJob } from './ai/claude-jobs.js';
import { decideOffer } from './brochure/offer.js';
import { buildBrief as buildLeadBrief } from './brochure/brief.js';
import { designedJob } from './brochure/writer.js';

/**
 * Built-in brochure layouts by template source: 'builtin-deck' = Codeace Growth Deck (classic design),
 * 'builtin-editorial' = Codeace Editorial (owner's template package, 2026-11-05), else the classic 12-page layout.
 */
const DECK_DESIGNS = { 'builtin-deck': 'classic', 'builtin-editorial': 'editorial', 'builtin-claude': 'editorial', 'builtin-signature-precision': 'signature-precision', 'builtin-signature-mono': 'signature-mono', 'builtin-signature-bold': 'signature-bold', 'builtin-signature-commerce': 'signature-commerce', 'builtin-growth': 'growth' }; // "Claude designs" without Claude = Editorial
const deckOf = (tpl) => DECK_DESIGNS[tpl?.source] || null;
const drawDeck = (design, data) => (isSignature(design) ? signatureDesign(data, signatureStyle(design)) : design === 'growth' ? growthDesign(data) : design === 'editorial' ? editorialDesign(data) : classicDesign(data));
/**
 * The look for each website type chosen in the CRM (used when no template is set for the type). Business website =
 * Codeace Business Website (owner, 2026-11-10: "new default template for business website plan"), the others Signature.
 */
const TYPE_TEMPLATES = { 'business-website': 'builtin-growth', 'ecommerce-store': 'builtin-signature-bold', 'shopify-store': 'builtin-signature-commerce', 'landing-page': 'builtin-signature-mono' };
// fonts.brochure: a fixed pairing wins, "template" keeps the design's fonts, "auto" uses the one Claude chose (theme.fonts)
const withPairing = (data, s) => ({ ...data, theme: { ...(data.theme || {}), fonts: resolvePairing(s.fonts?.brochure, data.theme?.fonts) } });
const brochureLayout = (tpl, content, s, company) => {
  if (content?.free?.design) return content.free.design; // "Claude designs": Claude drew the pages itself
  if (content?.deck?.data) return drawDeck(content.deck.design, withPairing(content.deck.data, s));
  const design = deckOf(tpl);
  return design ? drawDeck(design, withPairing(contentToData(content, s, { company, design }), s)) : brochureDesign(content, s);
};
/** Deck brochures without Claude: the agency copy mapped onto the deck data contract (no AI). */
async function writeDeck(doc, design, research, s) {
  // no rule-based brochure copy any more (owner, 2026-11-13): generate() never calls this; it stops if anything does
  throw new Error('Rule-based brochures were removed: the AI writes every brochure');
  const data = contentToData(w.content, s, { company: doc.input.company, design });
  if (isSignature(design) || design === 'growth') {
    // the lead's SWOT weaknesses become the "where you lose customers today" slide
    const sw = await leadSwot(doc.lead_id);
    const items = (sw?.swot?.weaknesses || []).slice(0, 4).map((x) => {
      const t = String(x).trim().replace(/\.$/, ''), cut = t.search(/[:,;]/);
      return cut >= 12 && cut <= 56 ? { title: t.slice(0, cut), text: t.slice(cut + 1).trim().replace(/^./, (c) => c.toUpperCase()) + '.' } : { title: t, text: '' };
    });
    if (items.length) data.gaps = { heading: `Where ${doc.input.company} loses customers today`, note: 'From our check of your website and online presence.', items };
    data.cover.tag = websiteTypeLabel(doc.input.website_type) ? `${websiteTypeLabel(doc.input.website_type)} plan` : data.cover.tag;
  }
  if (design === 'growth') {
    // the sample cover photo is a salon stylist: keep it for salons, else the layout shows the website mockup
    const salon = /salon|beauty|spa\b|hair|groom|makeup|bridal/i.test(`${doc.input.industry} ${doc.input.vertical} ${doc.input.company}`);
    if (!salon && /stylist/.test(data.cover.heroImage?.src || '')) data.cover.heroImage = undefined;
    if (w.content.about?.[1] && data.about) data.about.more = w.content.about[1];
  }
  return { content: { ...w.content, deck: { design, data } }, source: w.source };
}
/** The lead's SWOT (its latest ready call-script document): the evidence for the brochure's gaps slide. */
/**
 * The verified facts for the brochure and proposal (SWOT guide 5.6: "pass the verified facts to those generators too,
 * so their own fact check has the same ground truth"). The same lines the SWOT writer and critic read.
 */
function factsSection(facts) {
  if (!facts?.length) return '';
  const lines = facts.map((f) => `${f.id}. ${f.kind && f.kind !== 'seen' ? `(${f.kind === 'not_checked' ? 'not checked' : f.kind}) ` : ''}${f.text} (${f.source})`).join('\n');
  return `<verified_facts>
Checked by AxiFlow's own code from the website and the CRM. These are confirmed: never contradict them. A fact you take
from here counts as confirmed in your fact check (give its id, e.g. V3, as the source). A "(not checked)" line means that
page could not be read: it is not evidence that something is missing.
${lines}
</verified_facts>`;
}
async function leadSwot(leadId) {
  if (!leadId) return null;
  // only an approved SWOT (guide 5.6): the newest one a person approved; none approved = the brochure goes without one
  const row = await get(`SELECT content_json FROM docs WHERE lead_id = :id AND kind = 'script' AND status = 'ready' AND approved_at IS NOT NULL ORDER BY id DESC LIMIT 1`, { id: leadId }).catch(() => null);
  let c = row?.content_json;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
  return c?.swot ? { swot: c.swot, solutions: Array.isArray(c.solutions) ? c.solutions : [] } : null;
}
function swotSection(sw) {
  if (!sw) return '';
  const list = (k) => (sw.swot[k] || []).map((x) => `  - ${x}`).join('\n');
  const sol = sw.solutions.map((x) => `  - ${x.service}: ${x.problem} → ${x.how} → ${x.outcome}`).join('\n');
  return `<swot>
Our own SWOT of this business (the sales team already has it). The weaknesses and threats are the evidence for the gaps slide; the solutions are the reason for each service slide. Say them from the client's side (customers they are missing), never as criticism, and keep "to confirm" points out.
Weaknesses:
${list('weaknesses')}
Threats:
${list('threats')}
Opportunities:
${list('opportunities')}${sol ? `
How we solve it:
${sol}` : ''}
</swot>`;
}
const designSection = (design, websiteType) => (isSignature(design) ? `<design_system>
This brochure is laid out in the Codeace Signature design ("${signatureStyle(design)}"): type-led, with a fixed palette and fixed typefaces (your theme is ignored).
- Images: set every image field to null unless a stock photo in the brief clearly shows this kind of business; then use it for cover.heroImage or a service image only.
- gaps: 3–4 concrete places where this client loses customers today. Each must be backed by the brief (website check, <swot>, CRM notes or your research); no invented figures. title = the gap in a few plain words, text = one sentence on what it costs them.
- cover.tag: the package in 2–4 words${websiteTypeLabel(websiteType) ? ` ("${websiteTypeLabel(websiteType)} plan")` : ''}. about.tags: the agency's service lines (at most 5). cover.chips: the services in this brochure.
- Headlines are set large in one sans-serif face: keep them short and concrete.
</design_system>` : design === 'growth' ? `<design_system>
This brochure is laid out in the Codeace Business Website design: light lavender grid paper, Codeace blue, bold Inter headlines, white rounded cards and photo cards (your theme is ignored).
- Slides: cover → about → insight (only with verified figures) → gaps → how we help (one card per service) → one slide per service (text, 4 benefit cards, a photo card) → why us (team photo + 4 figures) → call to action → thank you.
- cover.title: either "Digital Growth Solutions" (the layout adds "for <client>" with the client's name in blue) or one short sentence of at most 8 words about the client's outcome, with cover.highlight = 1–3 of its words. cover.tag: the package in 2–4 words${websiteTypeLabel(websiteType) ? ` ("${websiteTypeLabel(websiteType)} plan")` : ''}. cover.chips: the services in this brochure (1–2 words each).
- cover.heroImage: a stock photo in the brief that clearly shows this kind of business, a person or the owner's trade; the sample stylist only for a salon or beauty business; else null (the layout then shows a website mockup).
- Service images: a stock photo that fits the service and this business, else the matching sample (web-mockup, robot, erp-laptop, seo-report, phone-instagram), else null. Service names stay short (they sit on small cards); slideTitle may be longer (one line of about 26 characters).
- gaps: 3–4 concrete places where this client loses customers today. Each must be backed by the brief (website check, <swot>, CRM notes or your research); no invented figures. title = the gap in a few plain words, text = one sentence on what it costs them.
- about.heading and whyUs.heading: at most 30 characters (longer ones become "About Us" / "Why Choose Us"). Stat values: at most 8 characters.
</design_system>` : '');
import { renderDesignPdf } from './design/render-pdf.js';
import { cleanDesign, cloneDesign, fillTokens } from './design/model.js';
import * as htmlDocs from './html-docs/index.js';
import { getTemplate, defaultTemplate } from './design/templates.js';
import { freeformJob } from './ai/claude-freeform.js';
import { verticalFor as verticalOf, playbookFor, playbookSection } from './ai/verticals.js';
import { strategySection, qualitySection, withStrategy } from './ai/strategy.js';
import { stockCandidates } from './images.js';
import { resolvePairing } from './design/fonts.js';

/*
 * AI Brochure Generator and AI Proposal Generator.
 * A document = form input + a design (pages of editable elements) made from a template,
 * plus (proposals) the price line items. The editor, the AI assistant and the PDF all use the design.
 */
addColumns('docs', { design_json: 'TEXT', template_id: 'INTEGER', chat_json: 'TEXT' });
// SWOT approval (SWOT guide 5.6, 2026-11-13): a person approves the SWOT in the CRM (or AxiFlow); only approved SWOTs feed
// the brochure and proposal. A hand edit after approval clears it.
addColumns('docs', { approved_at: 'TEXT', approved_by: 'TEXT' });
addColumns('leads', { strategy_json: 'TEXT' }); // the lead's agreed pitch strategy (src/ai/strategy.js), shared by all three tools

const parse = (j, fb = null) => { try { return j ? JSON.parse(j) : fb; } catch { return fb; } };
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);


const FIELDS = ['company', 'contact_name', 'industry', 'city', 'website', 'package', 'notes', 'research', 'vertical', 'language', 'phone', 'website_type'];
export const KINDS = ['brochure', 'proposal', 'script'];
function cleanInput(raw) {
  const out = {};
  for (const f of FIELDS) out[f] = f === 'research' ? raw.research !== false && raw.research !== 0 && raw.research !== '0' : str(raw[f], f === 'notes' ? 6000 : 300);
  if (!out.company) throw new Error('Business name is required');
  return out;
}

/**
 * Documents of one tool, newest first, only for live CRM leads. Each row also says which lead it is for,
 * the template, whether it was made automatically, and whether it is the version the CRM has
 * (the newest ready one per lead) with the CRM's approval status for brochures and proposals.
 */
export async function listDocs(kind) {
  const rows = await all(`SELECT d.id, d.kind, d.token, d.title, d.status, d.source, d.error, d.template_id, d.created_at, d.updated_at, d.lead_id,
      d.input_json, d.items_json, l.company, l.city, l.contact_name, l.crm_brochure_state, l.crm_proposal_state, t.name AS template_name,
      (d.id = (SELECT MAX(d2.id) FROM docs d2 WHERE d2.kind = d.kind AND d2.lead_id = d.lead_id AND d2.status = 'ready')) AS current,
      (d.kind = 'brochure' AND d.content_json LIKE '%"needs_look":true%') AS needs_look
    FROM docs d JOIN leads l ON l.id = d.lead_id AND l.crm_removed_at IS NULL LEFT JOIN design_templates t ON t.id = d.template_id
    WHERE d.kind = :kind ORDER BY d.id DESC LIMIT 200`, { kind });
  const s = getSettings();
  return rows.map(({ input_json, items_json, crm_brochure_state, crm_proposal_state, ...r }) => {
    const input = parseJson(input_json) || {};
    const items = parseJson(items_json) || [];
    return {
      ...r, current: !!r.current && r.status === 'ready', needs_look: !!r.needs_look && r.status === 'ready', // a designed brochure held back for a look
      made: input.auto === true ? 'auto' : input.auto === false ? 'hand' : '',
      claude: claudeState(input),
      crm_state: kind === 'brochure' ? crm_brochure_state || '' : kind === 'proposal' ? crm_proposal_state || '' : '',
      detail: kind === 'script' ? [input.vertical, input.language].filter(Boolean).join(' · ')
        : kind === 'brochure' ? `${(input.services || []).length} service${(input.services || []).length === 1 ? '' : 's'}`
        : (s.packages.find((p) => p.id === input.package)?.name || ''),
      total: kind === 'proposal' ? items.reduce((a, i) => a + Number(i.price || 0), 0) : null,
    };
  });
}
const parseJson = (v) => { if (v && typeof v === 'object') return v; try { return v ? JSON.parse(v) : null; } catch { return null; } };

export async function getDoc(id) {
  const d = await get(`SELECT * FROM docs WHERE id = :id`, { id });
  if (!d) return null;
  return { ...d, input: parse(d.input_json, {}), content: parse(d.content_json), items: parse(d.items_json, null), design: parse(d.design_json), chat: parse(d.chat_json, []) };
}

export async function leadPrefill(leadId) {
  const l = await get(`SELECT * FROM leads WHERE id = :leadId`, { leadId });
  if (!l) return null;
  // a CRM contact named after the business is not a person: send "unknown" instead (SWOT guide 2026-11-13, input bugs)
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  return {
    lead_id: l.id, company: l.company, contact_name: same(l.contact_name, l.company) ? '' : l.contact_name || '', industry: l.industry || '', city: l.city || '',
    website: l.website || '', package: l.recommended_package || l.service || '', notes: l.notes || '', phone: l.phone || '',
  };
}

// ------------------------------------------------------------------ jobs
const running = new Set();
/** Runs a document job. wait=false: in the background (forms); wait=true: finishes before returning (pipeline). */
async function startJob(id, fn, { wait = false } = {}) {
  if (running.has(id)) return;
  running.add(id);
  await update('docs', id, { status: 'working', error: null, updated_at: nowISO() });
  const job = async () => {
    try {
      // 'waiting' = the job went to Claude Code (Claude mode); the doc stays "working" until /webhooks/claude-result.
      if ((await fn()) === 'waiting') return;
      await update('docs', id, { status: 'ready', updated_at: nowISO() });
      await announce(id);
    } catch (e) {
      await update('docs', id, { status: 'error', error: String(e.message).slice(0, 500), updated_at: nowISO() });
    } finally {
      running.delete(id);
    }
  };
  if (wait) await job();
  else background(job, 'doc-job');
}
/** Restarts generation jobs that never finished. staleMinutes: only jobs idle that long (serverless: the instance may have been stopped). */
export async function resumeDocs({ staleMinutes = 0 } = {}) {
  const before = new Date(Date.now() - staleMinutes * 60000).toISOString();
  // (docs waiting for Claude Code are left alone: claude-worker.retryStale() handles them)
  for (const d of await all(`SELECT id FROM docs WHERE status = 'working' AND updated_at <= :before AND (input_json IS NULL OR input_json NOT LIKE '%"waiting":true%')`, { before })) await generate(d.id);
  // Documents made before the editor existed: lay out their saved copy with the built-in template (no AI).
  const s = getSettings();
  // (HTML-template documents have no design on purpose: they are left alone)
  for (const { id } of await all(`SELECT id FROM docs WHERE status = 'ready' AND kind <> 'script' AND design_json IS NULL AND content_json IS NOT NULL AND content_json NOT LIKE '%"html":{"template":"builtin-html-%'`)) { // scripts have no page design
    try {
      const d = await getDoc(id);
      const design = d.kind === 'brochure' ? brochureLayout(null, d.content, s, d.input.company) : proposalDesign(d.content, d.items, s, { preparedFor: d.input.company });
      await update('docs', id, { design_json: cleanDesign(design), template_id: (await defaultTemplate(d.kind))?.id ?? null });
    } catch (e) {
      console.error('[tools] could not migrate doc', id, e.message);
    }
  }
}

// (researchFor(), which read the old pitch maker's stored research, was removed with Phase 3 of the SWOT guide: the
// research pack comes from src/pipeline/research.js and passes the gate in usableResearch(), see buildClaudeJob.)

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

/**
 * The template for documents the automation makes (owner, 2026-11-05: "let auto creation use template and manual show
 * options"): Tool settings → automation.auto_template.<kind> (a template id, 0 = the default). "Claude designs (no
 * template)" is only for documents made by hand, so the automation then falls back to the first real template.
 */
export async function autoTemplate(kind, websiteType = null) {
  const isReal = (t) => t && t.kind === kind && t.source !== 'builtin-claude' && !t.hidden_at; // hidden = deleted by the owner
  // the Codeace HTML templates as the default (owner, 2026-11-11: "next generations should use this as default") win over
  // the per-type looks, unless a template is set for the website type or for automatic documents
  const def = await defaultTemplate(kind);
  if (htmlDocs.isHtmlTemplate(def) && !(Number(getSettings().automation?.website_templates?.[kind]?.[websiteType]) || 0) && !(Number(getSettings().automation?.auto_template?.[kind]) || 0)) return def;
  // a template set for the lead's website type (owner, 2026-11-10) wins over the general one
  const byType = Number(getSettings().automation?.website_templates?.[kind]?.[websiteType]) || 0;
  const typed = byType ? await getTemplate(byType) : null;
  if (isReal(typed)) return typed;
  // no template set for the type: its Signature look (brochures only)
  if (kind === 'brochure' && TYPE_TEMPLATES[websiteType]) {
    const row = await get(`SELECT id FROM design_templates WHERE kind = 'brochure' AND source = :source AND hidden_at IS NULL ORDER BY id LIMIT 1`, { source: TYPE_TEMPLATES[websiteType] });
    const t = row ? await getTemplate(row.id) : null;
    if (isReal(t)) return t;
  }
  const pick = Number(getSettings().automation?.auto_template?.[kind]) || 0;
  const chosen = pick ? await getTemplate(pick) : await defaultTemplate(kind);
  if (isReal(chosen)) return chosen;
  const row = await get(`SELECT id FROM design_templates WHERE kind = :kind AND COALESCE(source, '') <> 'builtin-claude' AND hidden_at IS NULL ORDER BY is_default DESC, (COALESCE(source, '') = 'builtin-editorial') DESC, id LIMIT 1`, { kind });
  return row ? getTemplate(row.id) : null;
}

export async function createDoc(kind, raw, { wait = false, auto = false } = {}) {
  if (!KINDS.includes(kind)) throw new Error('Unknown document type');
  // Every document belongs to a lead from the CRM (owner, 2026-11-05: only CRM data is stored).
  const crmLead = Number(raw?.lead_id) ? await get(`SELECT id FROM leads WHERE id = :id AND external_id LIKE 'atomic:%' AND crm_removed_at IS NULL`, { id: Number(raw.lead_id) }) : null;
  if (!crmLead) throw new Error('Pick a lead from the CRM first');
  const s = getSettings();
  const input = cleanInput(raw);
  input.auto = !!auto; // made by the automation (true) or by hand in the tool (false)
  if (!isWebsiteType(input.website_type)) input.website_type = await websiteTypeFor(await get(`SELECT * FROM leads WHERE id = :id`, { id: crmLead.id })) || '';
  if (kind === 'script') {
    if (!VERTICALS.includes(input.vertical)) input.vertical = input.vertical ? 'Other' : '';
    if (!LANGUAGES.includes(input.language)) input.language = LANGUAGES[0];
    const now = nowISO();
    const id = await insert('docs', { kind, token: token(), title: input.company, lead_id: Number(raw.lead_id) || null, template_id: null, input_json: input, status: 'working', created_at: now, updated_at: now });
    await generate(id, { wait });
    return id;
  }
  const tpl = auto ? await autoTemplate(kind, input.website_type || null) : (raw.template_id && await getTemplate(Number(raw.template_id))) || await defaultTemplate(kind);
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
  await generate(id, { wait });
  return id;
}

/** (Re)builds the document's design from its template. Replaces manual edits. */
/**
 * Claude mode: the same job the in-app AI would run (prompt, schema, lead data) goes to Claude Code on GitHub.
 * Returns false for documents Claude does not write (templates imported from a PDF stay in-app).
 */
/**
 * Everything known about the lead, for Claude: the CRM record read live (company, contacts and their call results,
 * deals, notes and open tasks; AxiFlow's own notes left out) plus AxiFlow's research and website check.
 * Owner, 2026-11-05: "same result in all generations … based on the leads data, build the brochure from scratch".
 */
// AxiFlow's own notes in the CRM (script note, brochure / proposal notes): not the team's notes.
const OWN_NOTE = /AxiFlow|Call script from|SWOT analysis|Pitch point:|^Brochure ready for|^Proposal ready for|^Proposal sent|from the link below/i;
/**
 * Stage 3 of the SWOT pipeline: the gate (owner's SWOT fix guide, 2026-11-13, section 5.3). Evidence whose source URL
 * the research run did not actually see is dropped; a pack that is too thin is refused (null). The SWOT is then not
 * written: the lead shows "Research thin, needs a look" instead of a confident but empty SWOT.
 */
const normUrl = (u) => String(u).replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
export function usableResearch(r, { hasWebsite } = {}) {
  if (!r?.evidence?.length) return null;
  const seen = new Set(r._seen_urls || []);
  const evidence = r.evidence.filter((e) => e.source_url && seen.has(normUrl(e.source_url)));
  if (evidence.length < 5) return null; // too thin to write from
  if (hasWebsite && !evidence.some((e) => e.area === 'website')) return null;
  return { ...r, evidence };
}
/** Where the CRM disagrees with itself about the lead's interest (contact call stage / last call vs deal stage). */
export function crmContradictions(c) {
  const key = (v) => String(v || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
  const yes = (v) => /^(interested|meeting_booked|qualified|won|proposal.*)$/.test(key(v));
  const no = (v) => /^(not_interested|lost|do_not_contact|closed_lost)$/.test(key(v));
  const out = [];
  for (const d of (c.deals || []).filter((x) => !x.archived)) {
    for (const ct of c.contacts || []) {
      const said = [ct.lead_stage, ct.last_outcome].filter(Boolean);
      if (no(d.stage) && said.some(yes)) out.push(`the CRM disagrees with itself: the deal "${d.name || 'deal'}" is "${d.stage}" but ${ct.name}'s call stage / last call says "${said.find(yes)}". Do not build the pitch on either one alone; treat the lead's interest as unclear.`);
      else if (yes(d.stage) && said.some(no)) out.push(`the CRM disagrees with itself: the deal "${d.name || 'deal'}" is "${d.stage}" but ${ct.name}'s call stage / last call says "${said.find(no)}". Do not build the pitch on either one alone; treat the lead's interest as unclear.`);
    }
  }
  return [...new Set(out)];
}
/** Returns { text, crm } where crm is the live CRM record (null when it could not be read). */
async function leadDossier(doc) {
  if (!doc.lead_id) return { text: '', crm: null };
  const l = await get(`SELECT external_id, pitch_json, website, industry, city, notes, company FROM leads WHERE id = :id`, { id: doc.lead_id });
  const out = [];
  let crm = null;
  const m = /^atomic:(co|ct):(\d+)$/.exec(l?.external_id || '');
  if (m) {
    try {
      const { crmLead } = await import('./crm-leads.js');
      const c = await crmLead(`${m[1]}-${m[2]}`);
      crm = c;
      const co = c.company;
      if (co) out.push(`Company in the CRM: ${co.name}${co.sector ? ` · sector: ${co.sector}` : ''}${co.size ? ` · size: ${co.size}` : ''}${co.address ? ` · address: ${co.address}` : ''}${co.website ? ` · website: ${co.website}` : ''}${co.linkedin_url ? ` · LinkedIn: ${co.linkedin_url}` : ''}${co.description ? `\nDescription: ${co.description}` : ''}${co.business_description ? `\nBusiness description in the CRM: ${co.business_description}` : ''}`);
      // contact details stored in the CRM are verified facts (SWOT guide 2026-11-13, input bugs: they were never sent,
      // which let the writer claim "no phone or email")
      const routes = (x) => [x.phone && `phone ${x.phone}`, x.email && `email ${x.email}`, x.whatsapp && `WhatsApp ${x.whatsapp}`].filter(Boolean).join('; ');
      if (co && routes(co)) out.push(`Verified contact details of the company (from the CRM): ${routes(co)}`);
      for (const ct of c.contacts || []) out.push(`Contact: ${ct.name}${ct.title ? ` (${ct.title})` : ''}${ct.lead_stage ? ` · call stage: ${ct.lead_stage}` : ''}${ct.last_outcome ? ` · last call: ${ct.last_outcome}` : ''}${ct.do_not_contact ? ' · do not contact' : ''}${routes(ct) ? ` · verified contact details (from the CRM): ${routes(ct)}` : ''}`);
      for (const d of c.deals || []) out.push(`Deal: ${d.name || 'deal'} · stage: ${d.stage}${d.amount ? ` · amount: ${d.amount}` : ''}`);
      // the telecaller's calls with their notes, newest first (call_logs were not read before)
      for (const call of (c.calls || []).filter((x) => x.outcome || String(x.notes || '').trim().length >= 4).slice(0, 6)) {
        out.push(`Call by the telecaller (${String(call.date || '').slice(0, 10)}${call.by ? `, ${call.by}` : ''}${call.on ? `, with ${call.on}` : ''}): ${call.outcome || 'no result'}${String(call.notes || '').trim() ? `: ${String(call.notes).trim().slice(0, 500)}` : ''}`);
      }
      // the CRM contradicting itself (e.g. call stage "interested" while the deal is "not_interested"): said out loud, so the
      // writer does not build the pitch on one side of it
      for (const w of crmContradictions(c)) out.push(`Warning: ${w}`);
      const seen = new Set();
      const notes = (c.notes || []).filter((n) => {
        const t = String(n.text || '').trim();
        if (t.length < 4 || OWN_NOTE.test(t) || seen.has(t)) return false; // skip empty test notes ("h")
        seen.add(t);
        return true;
      }).slice(0, 8);
      for (const n of notes) out.push(`Note from the team (${String(n.date || '').slice(0, 10)}${n.by ? `, ${n.by}` : ''}): ${String(n.text).slice(0, 500)}`);
      for (const t of (c.tasks || []).filter((x) => !x.done_date).slice(0, 5)) out.push(`Open task: ${t.type ? `${t.type}: ` : ''}${String(t.text || '').slice(0, 200)}`);
      if (!notes.length) out.push('The team has written no notes on this lead yet.');
    } catch (e) { out.push(`(The CRM record could not be read: ${e.message})`); }
  }
  if (l?.notes) out.push(`AxiFlow notes: ${String(l.notes).slice(0, 800)}`);
  return { text: out.join('\n').slice(0, 6000), crm };
}

async function sendToClaude(doc, s) {
  const built = await buildClaudeJob(doc, s);
  if (!built) return false;
  // Stage 1 (SWOT guide): the verified facts collected for this job are kept on the lead (leads.facts_json)
  if (built.facts && doc.lead_id) await saveFacts(doc.lead_id, built.facts).catch(() => {});
  await dispatchJob(doc, built.job, built.ctx);
  return true;
}

/** The exact job Claude Code gets for a document (also used to show the prompt without sending it). */
/**
 * opts.preview: build the job without calling the research API or saving anything (read-only checks: the research
 * request is returned instead, and a missing pack does not stop the SWOT).
 */
export async function buildClaudeJob(doc, s = getSettings(), opts = {}) {
  const { text: dossier, crm } = await leadDossier(doc).catch(() => ({ text: '', crm: null }));
  // The CRM is the source of truth: its website (even when empty) wins over AxiFlow's older copy of the lead
  // (found 2026-11-05: lead 10 kept "amazon.com" and another business's research after a CRM id was reused).
  const base0 = crm?.company ? { ...doc.input, website: crm.company.website || '' } : doc.input;
  // documents saved before the contact-name fix still carry a contact named after the business: not a person
  const base = String(base0.contact_name || '').trim().toLowerCase() === String(base0.company || '').trim().toLowerCase() ? { ...base0, contact_name: '' } : base0;
  // Stage 1 (SWOT guide 2026-11-13): the verified facts from the CRM record and the website, collected by code once per
  // job (home, contact, about, up to 3 menu pages, robots.txt, sitemap); its `audit` is the old website check
  const collected = await collectFacts({ website: base.website ? normalizeUrl(base.website) : '' }, { crm }).catch(() => null);
  // Stages 2 and 3: the research pack (one run per lead, reused 30 days or until the website changes), then the gate
  let research = null, researchNote = '', researchRequest = null;
  if (doc.lead_id) {
    try {
      const { runResearch } = await import('./pipeline/research.js');
      const rr = await runResearch(doc.lead_id, { facts: collected?.facts || null, fingerprint: collected ? collected.fingerprint : undefined, crm, input: base, preview: !!opts.preview });
      researchRequest = rr.request;
      const gated = usableResearch(rr.pack, { hasWebsite: !!base.website });
      if (gated) research = { ...gated, _seen_urls: undefined };
      else researchNote = rr.pack ? `${(rr.pack.evidence || []).length} evidence items, ${(rr.pack.evidence || []).filter((e) => (rr.pack._seen_urls || []).includes(normUrl(e.source_url || ''))).length} with a source the research run actually saw (5 needed${base.website ? ', incl. one about the website' : ''})` : 'no research yet';
    } catch (e) { researchNote = `the research could not run: ${e.message}`; }
  }
  if (doc.kind === 'script' && !research && !opts.preview) throw new Error(`Research thin, needs a look: ${researchNote}. Nothing was written.`);
  const input = { ...base, notes: [base.notes, dossier && `What the CRM and AxiFlow know about this lead:\n${dossier}`].filter(Boolean).join('\n\n') };
  const vertical = VERTICALS.includes(doc.input.vertical) && doc.input.vertical !== 'Other' ? doc.input.vertical
    : verticalOf(base.industry, crm?.company?.sector, crm?.company?.name || base.company, crm?.company?.business_description);
  let job, ctx = {};
  if (doc.kind === 'script') {
    // Written by Claude from the verified facts, the gated evidence and the CRM record (SWOT guide stage 4). ctx.ids =
    // the ids the job gave, so postScript() can drop a point that cites none of them.
    const facts = collected?.facts || [];
    job = claudeScriptJob(base, research, facts, dossier);
    ctx = { ids: [...facts.map((f) => f.id), ...(research?.evidence || []).map((e) => e.id)].filter(Boolean),
      // the same sources for the critic (guide 5.5) and for the refs shown on the script page
      sources: { facts: facts.map((f) => ({ id: f.id, kind: f.kind, text: f.text, source: f.source })), evidence: research?.evidence || [], competitors: research?.competitors || [] } };
  } else {
    // opts.template: a template given directly (scripts/compare-brochures.js, read-only, before a new template's row exists)
    const tpl = opts.template || await getTemplate(doc.template_id) || await defaultTemplate(doc.kind);
    if (htmlDocs.isHtmlTemplate(tpl)) { // the Codeace HTML templates: Claude writes the content of the fixed design
      // brochures: the offer is decided in code before writing (brochure fix guide 2026-11-13, section 6.1), from the
      // website type chosen in the CRM and what the website is today; the writer never chooses between instructions
      const offer = doc.kind === 'brochure' ? decideOffer({ websiteType: doc.input.website_type, website: base.website, facts: collected?.facts, audit: collected?.audit, settings: s }) : null;
      if (offer?.blocked) throw new Error(offer.blocked);
      if (tpl.source === htmlDocs.DESIGNED) {
        // the designed brochure (brochure fix guide 2026-11-13, phases 2-4): a short brief built by code (facts, evidence,
        // approved SWOT, CRM, decided offer, the client's images), then one writing call that composes the pages from the
        // CodeAce design system; the claims check and the visual review run on the same GitHub run (claude-worker/designed.mjs)
        const { leadImages } = await import('./brochure/images.js');
        const images = await leadImages(doc.lead_id, base.website).catch(() => []);
        const b = await buildLeadBrief(doc.lead_id, { crm, facts: collected?.facts || [], research, offer, audit: collected?.audit, images });
        const a = s.agency || {};
        job = designedJob({ brief: b.text, ids: b.ids, images, model: s.claude?.api_model?.anthropic || 'claude-opus-5-5', client: base.company,
          date: new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: s.schedule?.timezone || 'Asia/Kolkata' }),
          contact: { agency: 'CodeAce IT Solutions LLP', phone: a.phone, email: a.email, website: String(a.website || '').replace(/^https?:\/\//, '').replace(/\/$/, '') } });
        ctx = { html: tpl.source };
      } else {
        job = htmlDocs.htmlJob(tpl.source, { input: base, dossier, research, swot: await leadSwot(doc.lead_id), settings: s, items: doc.items, offer,
          audit: doc.kind === 'brochure' && base.website ? collected?.audit || null : null }); // the website check (2026-11-12)
        ctx = { html: tpl.source };
      }
      if (doc.kind === 'brochure' && tpl.source !== htmlDocs.DESIGNED) {
        // lean run on the GitHub runner with a pinned model (prepare.mjs / the workflow read these), the same model as the
        // API backup; research within at most 4 searches and 4 fetches, then the answer
        job.model = s.claude?.api_model?.anthropic || 'claude-opus-5-5';
        job.max_turns = 14;
        job.offer = offer;
      }
    } else if (!tpl || tpl.mode !== 'smart') return null;
    else if (doc.kind === 'proposal') job = claudeProposalJob(base, doc.items || [], research, dossier); // their own site structure; prices stay ours
    else {
      // Brochures are built from scratch by Claude: concept, copy, palette, images and layout (the deck job).
      // A Growth Deck / Editorial template fixes the design; with the classic template Claude chooses it.
      const audit = input.website ? collected?.audit || null : null;
      if (audit?.findings?.length) input.notes += `\n\nWebsite check: ${audit.findings.map((f) => f.text).join('; ')}\n(${WEBSITE_CHECK_RULE})`;
      const design = deckOf(tpl) || '';
      const brief = buildBrief(input, { design, research, settings: s });
      // Stock photos that fit the vertical and this business (Pexels / Unsplash keys), offered next to the sample images
      const stock = await stockCandidates([
        [base.industry, crm?.company?.sector].filter(Boolean).join(' ') || null,
        ...playbookFor(vertical).images,
      ]).catch(() => ({ assets: [], map: {} }));
      if (stock.assets.length) brief.assets = [...stock.assets, ...brief.assets.map((a) => ({ ...a, description: `${a.description} (generic sample image: use only if nothing better fits)` }))];
      if (tpl.source === 'builtin-claude') { job = freeformJob(brief, dossier); ctx = { stock: stock.map }; } // no template: Claude lays out every slide
      else { job = deckJob(brief); ctx = { brief, design, stock: stock.map }; job.prompt = [job.prompt, swotSection(await leadSwot(doc.lead_id)), designSection(design, doc.input.website_type)].filter(Boolean).join('\n\n'); }
    }
  }
  // Every job: the vertical's playbook. Proposals (and the older deck brochures) also get the lead's agreed strategy and
  // a quality review before answering (owner, 2026-11-05: premium, relevant to the vertical and the business).
  // Not the SWOT (script): no quality-review section or scores, to use fewer tokens (owner, 2026-11-06), and no strategy
  // section (SWOT fix guide 5.4: it still returns a strategy). Not the HTML brochures (brochure fix guide 2026-11-13,
  // section 8): the decided <offer> replaces the strategy (it conflicted with the website type), and the self-review and
  // restated strategy only cost output tokens (the scores were always 8-9).
  const htmlBrochure = doc.kind === 'brochure' && job.kind === 'html';
  const strategy = doc.lead_id ? (await get(`SELECT strategy_json FROM leads WHERE id = :id`, { id: doc.lead_id }).catch(() => null))?.strategy_json : null;
  const lean = doc.kind === 'script';
  const designed = job.purpose === 'brochure_designed'; // its brief already lists the verified facts (V-ids)
  job.prompt = [job.prompt, doc.kind === 'script' ? '' : websiteTypeSection(doc.input.website_type), doc.kind === 'script' || designed ? '' : factsSection(collected?.facts), playbookSection(vertical),
    lean || htmlBrochure ? '' : strategySection(strategy ? JSON.parse(strategy) : null), lean || htmlBrochure ? '' : qualitySection(doc.kind)].filter(Boolean).join('\n\n');
  if (!htmlBrochure) job.schema = withStrategy(job.schema, { review: !lean });
  job.vertical = vertical;
  // Research is always on (owner, 2026-11-13: "use only research"). For a SWOT it is done before writing, by the
  // separate research stage (guide 5.4): the writer gets the usable pack and does not browse. The other documents
  // still let Claude Code research the business itself.
  job.web = !(doc.kind === 'script' && research);
  // the SWOT writer's model is pinned (guide P11: predictable quality and cost); the GitHub workflow passes job.model as --model
  if (doc.kind === 'script') job.model = 'claude-sonnet-5-5';
  if (designed) job.web = false; // the designed brochure writes from its brief: research happened in the SWOT stage
  return { job, ctx, facts: collected, research, researchNote, researchRequest };
}

/**
 * Puts the current closing slide into an existing classic-deck brochure without regenerating it (owner, 2026-11-05:
 * "redesign this last. dont generate anymore"): the deck is laid out again from its saved content and only the last
 * page is swapped, so every edit on the other pages stays. Returns true when the slide was replaced.
 */
export async function refreshClosingSlide(id) {
  const d = await getDoc(id);
  if (!d || d.kind !== 'brochure' || d.status !== 'ready' || !d.design?.pages?.length || !d.content) return false;
  const tpl = await getTemplate(d.template_id) || await defaultTemplate('brochure');
  const isClassic = d.content?.deck ? d.content.deck.design === 'classic' : deckOf(tpl) === 'classic';
  if (!isClassic || d.content?.free) return false;
  const old = d.design.pages.at(-1);
  const looksClosing = old.elements.some((e) => e.type === 'text' && /THANK|Thank you/.test(e.text || '')) || old.elements.some((e) => e.type === 'image' && /closing-bg/.test(e.src || ''));
  if (!looksClosing) return false;
  const fresh = cleanDesign(brochureLayout(tpl, d.content, getSettings(), d.input.company));
  const design = { ...d.design, pages: [...d.design.pages.slice(0, -1), fresh.pages.at(-1)] };
  await update('docs', id, { design_json: cleanDesign(design), updated_at: nowISO() });
  await announce(id, { edited: true }); // the CRM copy of the PDF is replaced too (one waiting upload)
  return true;
}

/** True while a document is with Claude Code (Claude mode). */
export const waitingForClaude = (d) => d?.status === 'working' && !!d?.input?.claude?.waiting;

/** Finishes a document whose content came from Claude Code: the same layout and CRM writes as the in-app path. */
export async function completeDoc(id, { content, source }) {
  const doc = await getDoc(id);
  const s = getSettings();
  const patch = { content_json: content, source, status: 'ready', error: null, updated_at: nowISO() };
  if (doc.kind !== 'script' && !content?.html) { // HTML-template documents have no design: their content is printed as is
    const tpl = await getTemplate(doc.template_id) || await defaultTemplate(doc.kind);
    const design = doc.kind === 'brochure' ? brochureLayout(tpl, content, s, doc.input.company) : proposalDesign(content, doc.items, s, { preparedFor: doc.input.company });
    patch.design_json = cleanDesign(design);
  }
  // HTML documents are delivered as the Chromium print of their pages (brochure fix guide 2026-11-13, section 8: the
  // CRM got a pdfkit re-render of a converted design, 3-7.6% off, italics lost, other line breaks). They are converted
  // for the classic editor only when someone opens them there (POST /api/tools/docs/:id/to-design), never for delivery.
  if (content?.html && doc.kind === 'brochure') await addClientPhotos(doc, content);
  // the designed brochure: AxiFlow's own layout check on the final pages; anything still wrong (or claims nobody
  // checked) = "needs a look": shown in AxiFlow and the CRM's Documents panel, and not sent to the CRM as finished
  const look = content?.html?.template === htmlDocs.DESIGNED ? await designedLook({ ...doc, content }) : null;
  await update('docs', id, patch);
  if (look?.needs_look) {
    const { logEvent } = await import('./pipeline/log.js');
    await logEvent(doc.lead_id || null, 'tools', 'brochure_check', 'ok', `doc #${id} needs a look: ${look.reasons.slice(0, 4).join('; ')}`.slice(0, 500)).catch(() => {});
    return; // released by hand (POST /api/tools/docs/:id/release) or written again
  }
  await announce(id);
}
/**
 * The designed brochure's final check (brochure fix guide 2026-11-13, section 6.5): the runner's verdict (claims check,
 * visual review, layout), AxiFlow's own layout check on the pages it will print, and the output check. Updates
 * content.html.check in place and returns it.
 */
async function designedLook(doc) {
  const c = doc.content.html.check ||= {};
  let issues = [];
  try { issues = await htmlDocs.designedIssues(doc); } catch (e) { issues = [{ page: 0, what: `the pages could not be checked (${e.message})` }]; }
  const reasons = [
    ...issues.map((x) => `page ${x.page}: ${x.what}${x.text ? ` ("${String(x.text).slice(0, 50)}")` : ''}`),
    ...(c.output_problems || []).map((p) => `output: ${p}`),
    ...(!c.engine_checked ? ['the claims and the pages were not checked by the review (the brochure came from the backup engine)'] : []),
    ...(c.engine_checked && c.claims?.status !== 'checked' ? ['the claims were not checked'] : []),
    ...((c.claims?.unresolved || []).filter((u) => u.verdict === 'unsupported').map((u) => `an unsupported claim is still on page ${u.page || '?'}: "${String(u.find || '').slice(0, 60)}"`)),
  ];
  Object.assign(c, { layout_final: issues, needs_look: reasons.length > 0, reasons: [...new Set(reasons)].slice(0, 20), checked_at: nowISO() });
  return c;
}
/** Sends a "needs a look" brochure to the CRM after a person looked at it (the CRM gets it as finished, pending approval). */
export async function releaseDoc(id, by = '') {
  const d = await getDoc(id);
  if (!d || d.status !== 'ready' || !d.content?.html?.check?.needs_look) throw new Error('This document is not waiting for a look');
  const content = { ...d.content, html: { ...d.content.html, check: { ...d.content.html.check, needs_look: false, released_at: nowISO(), released_by: String(by || 'someone').slice(0, 120) } } };
  await update('docs', id, { content_json: content, updated_at: nowISO() });
  await announce(id);
  return { ok: true };
}
/**
 * The client's own photos in the brochure's photo areas (brochure fix guide 2026-11-13, section 8: they shipped as dark
 * gradients unless someone uploaded pictures by hand): collected from the client's website once per lead
 * (src/brochure/images.js) and placed by shape: wide ones on the cover and the closing panel, tall ones on the challenge
 * card and beside one idea page. Photos added by hand are kept. Never stops the document.
 */
export async function addClientPhotos(doc, content) {
  const h = content.html;
  if (h?.template !== 'builtin-html-brochure-ps' || !doc.lead_id) return;
  try {
    const { leadImages, pickPhotos } = await import('./brochure/images.js');
    const lead = await get(`SELECT website FROM leads WHERE id = :id`, { id: doc.lead_id });
    const images = await leadImages(doc.lead_id, lead?.website || doc.input.website);
    const { photos, alt } = pickPhotos(images);
    if (!Object.keys(photos).length) return;
    h.data.photos = { ...photos, ...(h.data.photos || {}) };
    if (photos.ideas) { // one idea page without a statement card shows the picture beside its ideas, if they still fit
      const before = await htmlDocs.overflowingPages({ ...doc, content }).catch(() => null);
      const pages = h.data.idea_pages || [];
      let placed = false;
      for (let k = 0; k < pages.length && before && !placed; k++) {
        if (pages[k].statement) continue;
        pages[k] = { ...pages[k], photo: true, photo_alt: alt.ideas || '' };
        const after = await htmlDocs.overflowingPages({ ...doc, content }).catch(() => null);
        if (after && after.length <= before.length) placed = true;
        else pages[k] = { ...pages[k], photo: false, photo_alt: '' }; // the cards no longer fit beside it: no picture here
      }
      if (!placed && h.data.photos.ideas === photos.ideas) delete h.data.photos.ideas; // a picture added by hand stays
    }
    h.images = images.map(({ id, kind, w, h: ht, orientation, alt: a, src }) => ({ id, kind, w, h: ht, orientation, alt: a, src }));
  } catch (e) {
    const { logEvent } = await import('./pipeline/log.js');
    await logEvent(doc.lead_id, 'tools', 'brochure_images', 'error', `doc ${doc.id}: ${e.message}`).catch(() => {});
  }
}
/**
 * The classic editor's design of a Codeace HTML document (owner, 2026-11-12: "use classic editor always. but i need my
 * same pdf structure and styles"): the pages converted in Chromium (src/html-docs/to-design.js). null when that fails;
 * the document is then printed from its HTML and converted when it is opened.
 */
export async function classicDesignOf(doc) {
  try { return cleanDesign(await (await import('./html-docs/to-design.js')).htmlToDesign(doc)); }
  catch (e) {
    const { logEvent } = await import('./pipeline/log.js');
    await logEvent(doc.lead_id || null, 'tools', 'to-design', 'error', `doc ${doc.id}: ${e.message}`).catch(() => {});
    return null;
  }
}

/** Why a document could not be written by AI (shown in AxiFlow and in the CRM's Documents panel). */
function noAiReason(doc, s) {
  if (!s.claude?.mode) return 'AI writing is switched off (AxiFlow → AI page), so nothing was made. Switch it on, then press Try again.';
  if (!/^https:/.test(BASE_URL)) return 'AI writing runs only on the live site; nothing was made on this server.';
  return `This ${doc.kind === 'script' ? 'SWOT' : doc.kind} uses a template the AI cannot write (an imported PDF template). Choose a Codeace template, then press Try again.`;
}
export async function generate(id, { wait = false } = {}) {
  await startJob(id, async () => {
    const doc = await getDoc(id);
    const s = getSettings();
    // AI writes every document: Claude Code on GitHub or an API key (AI page), and the answer finishes it.
    if ((claudeOn(s) || claudeBroken(s)) && await sendToClaude(doc, s)) return 'waiting';
    // No default content, ever (owner, 2026-11-13: "make sure dont generate any default bad content at any cost.
    // disable that option fully. if any AI is failed or any error show a try again button in crm"). Before, a document
    // the AI could not write got the template's general copy, a rule-based SWOT or the template with only the name
    // filled in. Now it fails with the reason; the CRM's Try again (or AxiFlow's Write it again) makes it again.
    throw new Error(noAiReason(doc, s));
  }, { wait });
}

// ----------------------------------------------------------- edit & pdf
/** Keeps a script's shape (strings and short lists only) whatever the browser sends. */
function cleanScript(c) {
  const s = (v, n = 2000) => String(v ?? '').slice(0, n);
  const list = (v, n, f) => (Array.isArray(v) ? v.slice(0, n).map(f) : []);
  if (c.swot || c.solutions) {
    const sw = c.swot || {};
    return {
      pitch_point: s(c.pitch_point, 300),
      swot: { summary: s(sw.summary, 2000), ...Object.fromEntries(['strengths', 'weaknesses', 'opportunities', 'threats'].map((k) => [k, list(sw[k], 10, (v) => s(v, 600)).filter(Boolean)])) },
      solutions: list(c.solutions, 10, (o) => ({ service: SERVICES.includes(o?.service) ? o.service : SERVICES[0], problem: s(o?.problem, 300), how: s(o?.how, 800), outcome: s(o?.outcome, 400) })).filter((o) => o.problem || o.how),
    };
  }
  return { // older call-script docs
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
    if (htmlDocs.isHtmlDoc(doc)) { // the words (form) and/or what was done on the pages (page editor)
      const h0 = doc.content.html, sent = content?.html || {};
      const edits = sent.edits !== undefined ? htmlDocs.cleanEdits(sent.edits) : h0.edits;
      patch.content_json = { ...doc.content, html: { ...h0, data: sent.data !== undefined ? htmlDocs.sanitizeEdit(sent.data) : h0.data, edits, split: htmlDocs.hasEdits(edits) ? h0.split || {} : {} } };
      // new words for a document that is edited in the classic editor: its pages are laid out again from them
      if (doc.design && sent.data !== undefined && design === undefined) {
        patch.design_json = await classicDesignOf({ ...doc, content: patch.content_json }) || doc.design;
        patch.content_json.html.design_edited = false; // the design is the HTML again: the Chromium print is delivered
      }
    }
    else if (doc.kind !== 'script') throw new Error('Only scripts are saved as text');
    else {
      patch.content_json = cleanScript(content || {});
      // a hand edit keeps the refs of the points it did not change (matched by text) and the to-confirm list
      const old = doc.content || {};
      if (patch.content_json.swot) for (const k of ['swot_check', 'sources']) if (old[k]) patch.content_json[k] = old[k];
      if (doc.approved_at) { patch.approved_at = null; patch.approved_by = null; } // edited after approval: needs approval again
      if (patch.content_json.swot && (old.swot_refs || old.swot?.to_confirm)) {
        const now = new Set(Object.entries(patch.content_json.swot).filter(([k]) => k !== 'summary').flatMap(([k, v]) => (v || []).map((x) => `${k}\u0000${x}`)));
        patch.content_json.swot_refs = (old.swot_refs || []).filter((r) => now.has(`${r.quadrant}\u0000${r.text}`));
        patch.content_json.swot.to_confirm = Array.isArray(content?.swot?.to_confirm) ? content.swot.to_confirm.map((v) => str(v, 600)).filter(Boolean).slice(0, 10) : old.swot?.to_confirm || [];
      }
    }
  }
  if (design !== undefined) patch.design_json = cleanDesign(design);
  const designEdited = design !== undefined;
  // an HTML document changed by hand in the classic editor: from now on its PDF is the edited design (docPdf)
  if (designEdited && htmlDocs.isHtmlDoc(doc)) patch.content_json = { ...(patch.content_json || doc.content), html: { ...(patch.content_json || doc.content).html, design_edited: true } };
  if (title !== undefined) patch.title = str(title, 200) || doc.title;
  if (items !== undefined) {
    if (doc.kind !== 'proposal') throw new Error('Only proposals have line items');
    patch.items_json = (items || []).map((i) => ({ name: str(i.name, 200), price: Math.max(0, Math.round(Number(String(i.price).replace(/[^\d.]/g, '')) || 0)) })).filter((i) => i.name);
    if (!patch.items_json.length) throw new Error('Add at least one line item');
  }
  await update('docs', id, patch);
  if (content !== undefined || designEdited || items !== undefined) await announce(id, { edited: true }); // prices change the proposal PDF too
  return await getDoc(id);
}

/**
 * Tells the CRM about a lead's new or edited brochure / call script (the CRM write reads the latest
 * version when it runs, so one waiting event per lead is enough while someone keeps editing).
 */
async function announce(id, { edited = false } = {}) {
  const d = await get(`SELECT id, kind, lead_id FROM docs WHERE id = :id`, { id });
  if (!d?.lead_id || !['brochure', 'script', 'proposal'].includes(d.kind)) return;
  const event = { brochure: 'lead.brochure_ready', script: 'lead.script_ready', proposal: 'lead.proposal_ready' }[d.kind];
  if (await get(`SELECT 1 AS one FROM crm_outbox WHERE lead_id = :lid AND event = :event AND target = 'atomic' AND status = 'pending'`, { lid: d.lead_id, event })) return;
  await crmEvent(d.lead_id, event, { doc_id: d.id, edited }, { delayMinutes: edited && d.kind !== 'script' ? 2 : 0 }).catch(() => {});
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
  if (r.applied) {
    patch.design_json = r.design;
    if (doc.kind === 'proposal') patch.items_json = r.items;
    if (htmlDocs.isHtmlDoc(doc)) patch.content_json = { ...doc.content, html: { ...doc.content.html, design_edited: true } }; // its PDF is now the edited design
  }
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
  // HTML documents: the Chromium print of their pages (src/html-docs), unless someone changed the classic design by hand
  // (brochure fix guide 2026-11-13: the CRM got a pdfkit re-render of the converted design, 3-7.6% off the template)
  if (htmlDocs.isHtmlDoc(d) && (!d.design || !d.content.html.design_edited)) {
    if (d.status !== 'ready') throw new Error('Document is not ready yet');
    return htmlDocs.htmlDocPdf(d);
  }
  if (d.status !== 'ready' || !d.design) throw new Error('Document is not ready yet');
  return renderDesignPdf(d.design, { title: `${d.title} ${d.kind}`, author: s.agency.name, items: d.items, settings: s });
}

/**
 * "Approve SWOT" (SWOT guide 5.6): a person confirms a finished SWOT of a live CRM lead. Only approved SWOTs feed the
 * brochure and proposal (leadSwot). Errors carry an HTTP status: 404 unknown, 409 not a finished SWOT / already approved.
 */
export async function approveSwot(id, by) {
  const d = await getDoc(id);
  const fail = (status, msg) => Object.assign(new Error(msg), { status });
  if (!d || d.kind !== 'script') throw fail(404, 'SWOT not found');
  const live = d.lead_id && await get(`SELECT id FROM leads WHERE id = :id AND external_id LIKE 'atomic:%' AND crm_removed_at IS NULL`, { id: d.lead_id });
  if (!live) throw fail(404, 'This SWOT is not for a lead in the CRM');
  if (d.status !== 'ready' || !d.content?.swot) throw fail(409, 'Only a finished SWOT can be approved');
  if (d.approved_at) throw fail(409, 'This SWOT is already approved');
  const at = nowISO();
  await update('docs', id, { approved_at: at, approved_by: String(by || 'someone').slice(0, 120) });
  const { logEvent } = await import('./pipeline/log.js');
  await logEvent(d.lead_id, 'tools', 'swot-approved', 'ok', `SWOT #${id} approved by ${by || 'someone'}`).catch(() => {});
  return { ok: true, id, approved_at: at, approved_by: by };
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
  if (htmlDocs.isHtmlTemplate(t)) return htmlDocs.templatePreviewHtml(t); // { html, size }: shown in an iframe
  if (t.mode !== 'smart') return t.design;
  const s = getSettings();
  const input = { company: 'Your Client', industry: 'Business', package: s.packages[0].id };
  if (t.kind === 'brochure') return brochureLayout(t, templateBrochureCopy(input), s, input.company);
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
  const text = d.content.swot ? swotText(d.content) : d.content.script;
  pitch.telecaller_script = text;
  if (d.content.pitch_point) pitch.headline = pitch.headline || d.content.pitch_point;
  await update('leads', lead.id, { pitch_json: pitch, updated_at: nowISO() });
  await addActivity(lead.id, 'note', 'SWOT updated from the Pitch Script Maker', d.content.pitch_point || null);
  await crmEvent(lead.id, 'lead.script_updated', { telecaller_script: text, pitch_point: d.content.pitch_point });
  return { ok: true };
}

// ----------------------------------------------------------- pipeline use
addColumns('proposals', { doc_id: 'INTEGER' });

const VERTICAL_WORDS = [
  ['FMCG & Spices', /spice|fmcg|food|grocery|bakery|sweet|snack|tea|coffee|masala/i],
  ['Clothing & Apparel', /cloth|apparel|fashion|boutique|garment|textile|saree|wear/i],
  ['Toys & Baby Products', /toy|baby|kid|child/i],
  ['Wellness & Beauty', /wellness|beauty|salon|spa|clinic|ayurved|physio|health|fitness|yoga|derma/i],
  ['Automotive Parts', /auto|car|bike|vehicle|spare|tyre|motor|garage/i],
  ['Home Decor, Furniture & Building Materials', /decor|furniture|interior|tile|hardware|building|cement|paint|sanitary|home/i],
  ['Jewellery & Accessories', /jewel|gold|silver|accessor|watch/i],
];
const verticalFor = (industry) => (VERTICAL_WORDS.find(([, re]) => re.test(String(industry || ''))) || ['Other'])[0];

/** Latest finished document of a kind for a lead (or null). */
export async function latestLeadDoc(kind, leadId) {
  const r = await get(`SELECT id FROM docs WHERE kind = :kind AND lead_id = :leadId AND status = 'ready' ORDER BY id DESC LIMIT 1`, { kind, leadId });
  return r ? getDoc(r.id) : null;
}

/**
 * Makes a tool document for a lead from its CRM details (default template, the lead's recommended package,
 * the pitch maker's research) and waits until it is finished. Returns the document (status ready or error).
 */
export async function createDocForLead(kind, leadId) {
  const p = await leadPrefill(leadId);
  if (!p) throw new Error('Lead not found');
  const l = await get(`SELECT industry, recommended_package FROM leads WHERE id = :id`, { id: leadId });
  const raw = { ...p, lead_id: leadId, research: false, package: l?.recommended_package || p.package, vertical: verticalFor(l?.industry), language: 'English' };
  const id = await createDoc(kind, raw, { wait: true, auto: true });
  return getDoc(id);
}

/** Unsent proposal documents waiting for an OK (the newest per lead, not yet turned into a sent proposal). */
export async function proposalsToCheck() {
  return all(`SELECT d.id, d.lead_id, d.title, d.items_json, d.updated_at, l.company, l.stage FROM docs d JOIN leads l ON l.id = d.lead_id
    WHERE l.crm_removed_at IS NULL AND d.kind = 'proposal' AND d.status = 'ready' AND d.lead_id IS NOT NULL
      AND d.id = (SELECT MAX(id) FROM docs d2 WHERE d2.kind = 'proposal' AND d2.lead_id = d.lead_id AND d2.status = 'ready')
      AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.doc_id = d.id)
      AND l.stage IN ('replied', 'meeting_booked', 'needs_manual', 'contacted', 'follow_up_1', 'follow_up_2')
    ORDER BY d.updated_at DESC`);
}
