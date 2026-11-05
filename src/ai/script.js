import { getSettings } from '../settings.js';
import { runJson, aiEnabled, obj, str, arr } from './claude.js';
import { managerSystem } from './playbook.js';
import { money, firstName, contactFirstName } from '../util.js';

/*
 * Pitch Script Maker: a call script for the telecaller, following the owner's plan (Web Development.pdf p.6):
 * company-specific introduction, relevant website / e-commerce opportunities, three main pitching points,
 * questions to understand the client's needs, and the meeting-booking approach. Plus objections, a short
 * "pitch point" for the CRM, and the whole thing as a word-for-word script.
 */
export const VERTICALS = [
  'FMCG & Spices', 'Clothing & Apparel', 'Toys & Baby Products', 'Wellness & Beauty', 'Automotive Parts',
  'Home Decor, Furniture & Building Materials', 'Jewellery & Accessories', 'Other',
];
export const LANGUAGES = ['English', 'Malayalam (in English letters)', 'Hindi (in English letters)'];

const schema = () => obj({
  pitch_point: str('one line for the CRM "Pitch Point" field: the angle we pitch this business on'),
  introduction: str('company-specific opening, 2-3 short lines: who we are, why we are calling them specifically'),
  opportunities: arr(obj({ title: str('short label'), detail: str('one or two sentences, specific to this business and vertical') }), '3-4 website or e-commerce opportunities relevant to this business'),
  pitch_points: arr(obj({ point: str('the claim, a few words'), detail: str('what we would say, 1-2 sentences, concrete outcome') }), 'exactly three main pitching points'),
  questions: arr(str('open question'), '4-6 discovery questions to understand the client requirements'),
  objections: arr(obj({ objection: str(), response: str('short, honest reply') }), '3 likely objections'),
  booking: obj({
    ask: str('how to ask for a 30-minute meeting (with the date/time choice)'),
    if_yes: str('what to say and what to confirm when they agree (WhatsApp/email permission, who will attend)'),
    if_not_now: str('how to keep the door open: callback time or sending the brochure'),
  }),
  script: str('the full word-for-word call script, short lines, with [pause] and [listen] cues, from greeting to booking'),
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

Our agency: ${s.agency.name}. Caller's name: use "${s.agency.sender_name}" unless told otherwise.
Our packages: ${s.packages.map((p) => `${p.name} ${money(p.price, s.billing.currency)} (${p.timeline}): ${p.includes.slice(0, 3).join(', ')}`).join(' | ')}
Payment: ${s.billing.advance_pct}% advance.`;
}

/**
 * The AI job for a call script: the same prompt runs in-app (runJson) or in Claude mode (Claude Code on GitHub,
 * src/claude-worker.js). postScript() cleans the answer either way.
 */
export function scriptJob(input, research, audit) {
  const s = getSettings();
  return {
    kind: 'script', purpose: 'pitch_script', effort: s.ai.effort_writing, schema: schema(), maxTokens: 12000,
    system: managerSystem('write a phone call script for our telecaller'),
    prompt: `Write a call script for our telecaller to pitch a new website (or online store) to this business.

${context(input, research, audit)}

Rules: sound like a real person on the phone, not a brochure. Short lines. Be specific to this business and its vertical; no generic claims. Never invent facts about the business: if research is missing, ask instead of asserting. The goal of the call is a 30-minute meeting, not a sale.
Language: write the script in ${input.language || 'English'}${/letters/.test(input.language || '') ? ' (spoken words in that language written in English letters; keep business terms like website, WhatsApp, Google in English)' : ''}.`,
  };
}
export const postScript = (content, input, audit) => repair(content || {}, templateScript(input, audit));

export async function writeScript(input, research, audit) {
  if (!aiEnabled()) return { content: templateScript(input, audit), source: 'template' };
  try {
    const content = await runJson(scriptJob(input, research, audit));
    return { content: postScript(content, input, audit), source: 'ai' };
  } catch (e) {
    return { content: templateScript(input, audit), source: 'template', error: e.message };
  }
}

/**
 * Weaker models sometimes ignore the structure (e.g. the whole script in "pitch_point", empty lists).
 * Keep what is usable, move a misplaced script to where it belongs, fill the rest from the standard script.
 */
function repair(c, std) {
  const out = { ...std };
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const list = (v, ok) => (Array.isArray(v) ? v.filter(ok) : []);
  let point = s(c?.pitch_point);
  let script = s(c?.script);
  if (point.length > 300 || point.split('\n').length > 3) { if (script.length < point.length) script = point; point = ''; }
  // A pitch point is what we offer the client, not a description of the call (seen from a free model:
  // "Short phone call script for Arjun, Codeace, targeting ... Goal: book a 30-minute meeting.").
  if (/\b(call script|phone call|script for|telecaller|goal:|targeting)\b/i.test(point)) point = '';
  // ...and it must say more than the business name and place ("Back To Roots ..., Meloor" is not a pitch).
  // The standard pitch point ends with "for <company>", so its tail gives the name to discount.
  const words = (v) => String(v || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const known = new Set([...words(String(std.pitch_point || '').split(' for ').pop()), 'the', 'and', 'for', 'of', 'in', 'at']);
  if (words(point).filter((w) => !known.has(w)).length < 2) point = '';
  if (point && std.pitch_point && point.toLowerCase().includes(String(std.pitch_point.split(' for ').pop() || '').replace(/\s*\(.*\)$/, '').toLowerCase().slice(0, 12))) out.pitch_point = point;
  if (s(c?.introduction) && s(c.introduction).length < 1200) out.introduction = s(c.introduction);
  const opps = list(c?.opportunities, (o) => s(o?.title) && s(o?.detail));
  if (opps.length >= 2) out.opportunities = opps;
  const pts = list(c?.pitch_points, (o) => s(o?.point) && s(o?.detail));
  if (pts.length >= 3) out.pitch_points = pts.slice(0, 3);
  const qs = list(c?.questions, (q) => s(q));
  if (qs.length >= 3) out.questions = qs;
  const obs = list(c?.objections, (o) => s(o?.objection) && s(o?.response));
  if (obs.length) out.objections = obs;
  if (s(c?.booking?.ask)) out.booking = { ask: s(c.booking.ask), if_yes: s(c.booking.if_yes) || std.booking.if_yes, if_not_now: s(c.booking.if_not_now) || std.booking.if_not_now };
  if (script.length > 200) out.script = script.replace(/\*\*/g, '');
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

export function templateScript(input, audit) {
  const s = getSettings();
  const pkg = s.packages[1] || s.packages[0];
  const name = contactFirstName(input.contact_name, input.company, '');
  const caller = s.agency.sender_name || 'our team';
  const where = input.city ? ` in ${input.city}` : '';
  const issue = (audit?.findings || [])[0]?.text;
  const opps = (OPPS[input.vertical] || DEFAULT_OPPS).map(([title, detail]) => ({ title, detail }));
  const points = [
    { point: input.website ? 'Your website can bring more enquiries' : 'Get found on Google', detail: issue ? `We had a quick look: ${issue.charAt(0).toLowerCase() + issue.slice(1)}.` : `When people${where} search for ${input.vertical ? input.vertical.toLowerCase() : 'what you sell'}, we want them to find ${input.company} first.` },
    { point: opps[0].title, detail: opps[0].detail },
    { point: 'Fixed price, ready fast', detail: `Our ${pkg.name} is ${money(pkg.price, s.billing.currency)}, ready in ${pkg.timeline}, and we manage it for you.` },
  ];
  const questions = [
    'How do most of your customers find you today?',
    input.website ? 'How many enquiries does your website bring in a month?' : 'When someone searches for your business online, what do they find?',
    'Do you take orders or enquiries on WhatsApp now?',
    'Which products or services would you most like to sell more of?',
    'Who decides on things like this, you or someone else as well?',
  ];
  const booking = {
    ask: 'Can we do a 30-minute call where I show you a homepage idea for your business? Would tomorrow or the day after work better?',
    if_yes: 'Great. Shall I send the details and a short plan on WhatsApp to this number? Who else should join the call?',
    if_not_now: 'No problem. When is a better time to call back? Meanwhile I can send a short plan on WhatsApp, is that okay?',
  };
  const objections = [
    { objection: 'It is too expensive', response: `It is a fixed ${money(pkg.price, s.billing.currency)} with ${s.billing.advance_pct}% to start. One extra customer a month usually covers it.` },
    { objection: 'We already get customers by word of mouth', response: 'That is great. People who hear about you now search for you first; the website makes that first look count.' },
    { objection: 'We are busy right now', response: `We do the work. It takes about 30 minutes of your time and is ready in ${pkg.timeline}.` },
  ];
  const introduction = `Hello${name ? ` ${name}` : ''}, this is ${caller} from ${s.agency.name}. We build websites and online stores for ${input.vertical && input.vertical !== 'Other' ? input.vertical.toLowerCase() + ' businesses' : 'businesses'}${where}. I'm calling ${input.company} because we see a clear opportunity for you online.`;
  const script = [
    `Hello, am I speaking with ${name || `someone from ${input.company}`}?`,
    `This is ${caller} calling from ${s.agency.name}. Is this a good time for two minutes?`,
    '[pause]',
    introduction.split('. ').slice(1).join('. '),
    '',
    questions[0], '[listen]', questions[1], '[listen]',
    '',
    ...points.map((p) => `${p.point}: ${p.detail}`),
    '',
    `If they object: "${objections[0].response}"`,
    '',
    booking.ask,
    `[If yes] ${booking.if_yes}`,
    `[If not now] ${booking.if_not_now}`,
    '[Log the outcome in the CRM]',
  ].join('\n');
  return {
    pitch_point: `${opps[0].title} for ${input.company}${input.website ? '' : ' (no website yet)'}`.slice(0, 200),
    introduction, opportunities: opps, pitch_points: points, questions, objections, booking, script,
  };
}
