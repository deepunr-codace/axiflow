import { getSettings } from '../settings.js';
import { obj, str, arr } from './claude.js';
import { managerSystem } from './playbook.js';
import { money } from '../util.js';

/*
 * Pitch Script Maker = a SWOT report of the lead plus how we solve it (owner, 2026-11-06: "the pitch script
 * generating is wrong, we want SWOT of the lead … and how we solve the problem: AEO, GEO, website development,
 * automations, SEO"; then "dont need call script"). Output: swot, solutions, and a one-line pitch point for the CRM.
 * The doc kind stays 'script' so the flow (CRM note, pitch point, tool pages) is unchanged.
 */
export const VERTICALS = [
  'FMCG & Spices', 'Clothing & Apparel', 'Toys & Baby Products', 'Wellness & Beauty', 'Automotive Parts',
  'Home Decor, Furniture & Building Materials', 'Jewellery & Accessories', 'Other',
];
export const LANGUAGES = ['English', 'Malayalam (in English letters)', 'Hindi (in English letters)'];

/** Our services a finding can be solved with. */
export const SERVICES = ['Website development', 'SEO', 'AEO', 'GEO', 'Automation'];
export const SERVICE_NOTES = {
  'Website development': 'a fast, mobile-first website or online store built around how their customers enquire, book or buy',
  SEO: 'search engine optimisation: ranking on Google Search and Google Maps for what their customers type (local pages, Google Business Profile, reviews, speed, structured data)',
  AEO: 'answer engine optimisation: being the answer shown in Google AI Overviews, featured snippets and voice search (clear question-and-answer content, FAQ and schema markup)',
  GEO: 'generative engine optimisation: being named and recommended by AI assistants such as ChatGPT, Gemini and Perplexity (consistent facts about the business across the web, citable pages, reviews and mentions)',
  Automation: 'WhatsApp and email auto-replies, online booking and enquiry forms that go straight to the CRM, follow-up reminders, review requests',
};
export const SWOT_KEYS = [['strengths', 'Strengths'], ['weaknesses', 'Weaknesses'], ['opportunities', 'Opportunities'], ['threats', 'Threats']];

// The owner's SWOT brief (2026-11-06), used in every job.
export const SWOT_BRIEF = `Analyse the business thoroughly across the four SWOT dimensions:
- Strengths: key advantages and existing positive factors.
- Weaknesses: internal limitations, gaps and areas that need improvement.
- Opportunities: potential growth areas and future possibilities.
- Threats: external risks, challenges and competitive factors.
Present the findings as a short, structured and professional analytical report. Focus on meaningful insights, factual observations and practical conclusions rather than generic statements or promotional language. Base every point on the research, the website check and the CRM record; where nothing is known, say what is unknown instead of guessing.`;

const schema = () => obj({
  pitch_point: str('one line for the CRM "Pitch Point" field: the main problem we solve for this business (must name the business)'),
  swot: obj({
    summary: str('2-3 sentences: the conclusion of the analysis, what matters most for this business right now'),
    strengths: arr(str('one factual observation, one sentence'), '2-4 key advantages and existing positive factors'),
    weaknesses: arr(str('one factual observation, one sentence'), '2-4 internal limitations, gaps and areas that need improvement (especially online)'),
    opportunities: arr(str('one factual observation, one sentence'), '2-4 potential growth areas and future possibilities'),
    threats: arr(str('one factual observation, one sentence'), '2-4 external risks, challenges and competitive factors'),
  }),
  solutions: arr(obj({
    service: { type: 'string', enum: SERVICES, description: 'which of our services solves it' },
    problem: str('the weakness or threat (or the opportunity to seize) from the SWOT, in a few words'),
    how: str('what exactly we would do for this business, 1-2 sentences'),
    outcome: str('the practical result for them, one sentence, no invented numbers'),
  }), '4-6 rows mapping the SWOT findings to our services; cover website development, SEO, AEO, GEO and automation where each is relevant'),
});

function context(input, research, audit) {
  const s = getSettings();
  const findings = (audit?.findings || []).map((f) => `- ${f.text}`).join('\n') || '- no website check available';
  return `Business: ${input.company}
Contact person: ${input.contact_name || 'unknown'}
Vertical: ${input.vertical || 'unknown'}${input.industry ? ` (${input.industry})` : ''}
Place: ${input.city || 'unknown'}
Website: ${input.website || 'none'}
What we know: <untrusted>${input.notes || 'nothing more'}</untrusted>

Website check:
${findings}

Web research:
<untrusted>${research ? JSON.stringify({ ...research, sources: undefined }) : 'not run'}</untrusted>

Our agency: ${s.agency.name}.
Our packages: ${s.packages.map((p) => `${p.name} ${money(p.price, s.billing.currency)} (${p.timeline}): ${p.includes.slice(0, 3).join(', ')}`).join(' | ')}`;
}

/**
 * The AI job: the same prompt runs in Claude mode (Claude Code on GitHub or an API engine, src/claude-worker.js).
 * postScript() cleans the answer.
 */
export function scriptJob(input, research, audit) {
  const s = getSettings();
  return {
    kind: 'script', purpose: 'pitch_script', effort: s.ai.effort_writing, schema: schema(), maxTokens: 8000,
    system: managerSystem('write a SWOT analysis of a lead and how our services solve it'),
    prompt: `Write a SWOT analysis of this business, then show how our services solve what it found.

${context(input, research, audit)}

SWOT analysis (swot):
${SWOT_BRIEF}

How we solve it (solutions): map the most important weaknesses, threats and opportunities to our services:
${SERVICES.map((k) => `- ${k}: ${SERVICE_NOTES[k]}`).join('\n')}
Each row names one concrete problem of this business and what we would do about it. No prices, no invented numbers or guarantees.
Language: English.`,
  };
}
export const postScript = (content, input, audit) => repair(content || {}, templateScript(input, audit));

/** Without Claude: the rule-based SWOT. Claude mode writes it (claudeScriptJob in src/ai/claude-jobs.js). */
export async function writeScript(input, research, audit) {
  return { content: templateScript(input, audit), source: 'template' };
}

/** The report as plain text (the CRM note, the lead's pitch, copy to clipboard). */
export function swotText(c, company = '') {
  const out = [];
  if (company) out.push(`SWOT analysis: ${company}`);
  if (c.pitch_point) out.push(`Pitch point: ${c.pitch_point}`);
  if (c.swot?.summary) out.push(`Summary:\n${c.swot.summary}`);
  for (const [k, label] of SWOT_KEYS) if (c.swot?.[k]?.length) out.push(`${label}:\n${c.swot[k].map((v) => `- ${v}`).join('\n')}`);
  if (c.solutions?.length) out.push(`How we solve it:\n${c.solutions.map((r) => `- ${r.service}: ${r.problem}. ${r.how}${r.outcome ? ` Result: ${r.outcome}` : ''}`).join('\n')}`);
  return out.join('\n\n');
}

/** Keep what is usable from the model's answer, fill the rest from the rule-based report. */
function repair(c, std) {
  const out = { ...std, swot: { ...std.swot } };
  const s = (v) => (typeof v === 'string' ? v.trim().replace(/\*\*/g, '') : '');
  const list = (v, ok) => (Array.isArray(v) ? v.filter(ok) : []);
  let point = s(c?.pitch_point);
  if (point.length > 300 || point.split('\n').length > 3) point = '';
  // ...and it must say more than the business name and place.
  const words = (v) => String(v || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const known = new Set([...words(String(std.pitch_point || '').split(' for ').pop()), 'the', 'and', 'for', 'of', 'in', 'at']);
  if (words(point).filter((w) => !known.has(w)).length < 2) point = '';
  if (point) out.pitch_point = point;
  if (s(c?.swot?.summary)) out.swot.summary = s(c.swot.summary);
  for (const [k] of SWOT_KEYS) {
    const got = list(c?.swot?.[k], (v) => s(v)).map(s).slice(0, 6);
    if (got.length) out.swot[k] = got;
  }
  const sol = list(c?.solutions, (o) => SERVICES.includes(o?.service) && s(o?.problem) && s(o?.how))
    .map((o) => ({ service: o.service, problem: s(o.problem), how: s(o.how), outcome: s(o.outcome) })).slice(0, 8);
  if (sol.length >= 2) out.solutions = sol;
  return out;
}

// ------------------------------------------------------------------ fallback
const OPPS = {
  'FMCG & Spices': [['Online store with WhatsApp ordering', 'Shops and home cooks can order pack sizes directly, with UPI or cash on delivery.'], ['Distributor and retailer enquiries', 'A wholesale page that turns searches into dealer leads.'], ['Recipes and product story', 'Content that ranks on Google and builds trust in quality and origin.']],
  'Clothing & Apparel': [['Online catalogue and store', 'Every collection online with sizes, prices and WhatsApp checkout.'], ['Instagram to website', 'Turn Instagram followers into orders with a shoppable site.'], ['New arrivals and offers', 'Festival and season sales without printing flyers.']],
  'Toys & Baby Products': [['Online store for parents', 'Age-wise categories, safety details and quick delivery options.'], ['Gift finder', 'Birthday and gifting pages that parents search for.'], ['Repeat orders', 'Easy re-ordering of essentials.']],
  'Wellness & Beauty': [['Online booking', 'Clients book appointments and services without calling.'], ['Service menu with prices', 'Clear packages build trust and reduce questions.'], ['Reviews and before/after', 'Social proof that converts Google searches.']],
  'Automotive Parts': [['Searchable parts catalogue', 'Customers search by vehicle and part, then enquire on WhatsApp.'], ['Garage and dealer enquiries', 'A B2B page for bulk and trade customers.'], ['Stock and price updates', 'Fewer calls asking "do you have this part?".']],
  'Home Decor, Furniture & Building Materials': [['Product gallery with enquiry', 'Show every range with photos, sizes and an enquiry button.'], ['Project showcase', 'Completed homes and projects that win builders and families.'], ['Quote requests', 'Collect requirements and send quotes faster.']],
  'Jewellery & Accessories': [['Online collection', 'Designs with weight, price guide and WhatsApp enquiry.'], ['Wedding and occasion pages', 'Be found when families search for bridal sets.'], ['Trust signals', 'Hallmark, exchange policy and reviews in one place.']],
};
const DEFAULT_OPPS = [['A website that brings enquiries', 'Show up on Google and turn searches into calls and WhatsApp messages.'], ['WhatsApp enquiry button', 'One tap from the website to a conversation.'], ['Easy to update', 'Prices, photos and offers updated without hassle.']];

/**
 * Rule-based SWOT from what AxiFlow knows without research: the website check, the vertical and the place.
 * It states only what was checked; anything else is marked as something to confirm.
 */
export function templateScript(input, audit) {
  const opps = OPPS[input.vertical] || DEFAULT_OPPS;
  const kind = input.vertical && input.vertical !== 'Other' ? input.vertical.toLowerCase() : 'their category';
  const where = input.city || 'their area';
  const f = (audit?.findings || []).map((x) => String(x.text).replace(/\.$/, ''));
  const has = !!input.website && audit?.has_website !== false;
  const strengths = [`An established ${kind} business in ${where} with existing customers and a local reputation (to confirm).`];
  if (has && audit?.https) strengths.push('The website is live and served securely (HTTPS).');
  if (has && audit?.load_ms && audit.load_ms < 2500) strengths.push(`The website loads quickly (about ${(audit.load_ms / 1000).toFixed(1)} s).`);
  if (!has) strengths.push('A clean start online: nothing outdated to undo, so the first website can be built around how customers buy today.');
  const weaknesses = f.length ? f.slice(0, 4).map((t) => `${t}.`) : ['Online presence not checked yet: how customers find them today is unknown.'];
  const opportunities = [
    `Customers in ${where} search Google and Maps for ${kind} before they call or visit.`,
    'More people now ask AI assistants (ChatGPT, Gemini, Google AI Overviews) for recommendations; few local businesses are prepared for it.',
    ...opps.slice(0, 2).map(([t, d]) => `${t}: ${d}`),
  ].slice(0, 4);
  const threats = [
    `Competitors in ${where} who rank on Google and answer enquiries on WhatsApp quickly win the customers who search first.`,
    'Enquiries that wait for a manual reply are lost to whoever answers first.',
    'If facts about the business (hours, services, location) are missing or inconsistent online, search engines and AI assistants recommend others.',
  ];
  const solutions = [
    { service: 'Website development', problem: has ? (f.find((x) => !/meta|title|heading|description/i.test(x)) || 'A website that does not turn visitors into enquiries') : 'No website', how: `A fast, mobile-first website for ${input.company} with their services, photos, reviews and a WhatsApp enquiry button on every page.`, outcome: 'Visitors see what they offer and enquire in one tap.' },
    { service: 'SEO', problem: 'Not found first on Google and Maps', how: `Local pages for ${where}, a complete Google Business Profile, page titles and descriptions, speed and structured data.`, outcome: `Shows up when people in ${where} search for ${kind}.` },
    { service: 'AEO', problem: 'Customer questions are not answered online', how: 'A clear questions-and-answers section and FAQ markup on what customers ask before buying.', outcome: 'Their answers appear in Google AI Overviews, snippets and voice search.' },
    { service: 'GEO', problem: 'AI assistants do not know or recommend them', how: 'Consistent business facts across the website, Google, directories and social pages, plus citable pages and review requests.', outcome: 'ChatGPT, Gemini and Perplexity can name them when asked for a recommendation.' },
    { service: 'Automation', problem: 'Enquiries depend on someone being free to reply', how: 'Instant WhatsApp and email replies, an enquiry or booking form that goes straight to the CRM, follow-up and review reminders.', outcome: 'No enquiry waits, and every lead is followed up.' },
  ];
  const summary = `${input.company} ${has ? 'has a website, but' : 'has no website yet, so'} ${f.length ? 'the website check found gaps that cost enquiries' : 'its online presence still needs to be confirmed'}. The clearest gains are being found first on Google, Maps and AI assistants, and answering every enquiry quickly.`;
  return {
    pitch_point: `${has ? (f.length ? 'Fix the website gaps and get found on Google and AI search' : 'Get found on Google and AI search') : 'A website that brings enquiries'} for ${input.company}`.slice(0, 200),
    swot: { summary, strengths: strengths.slice(0, 4), weaknesses, opportunities, threats },
    solutions,
  };
}
