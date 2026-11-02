import { getSettings } from '../settings.js';
import { esc, money, firstName } from '../util.js';
import { runText, runJson, aiEnabled, obj, str, arr } from './claude.js';
import { managerSystem, leadContext } from './playbook.js';

// ------------------------------------------------------------------ research

const RESEARCH_SCHEMA = obj({
  business_summary: str('2-3 sentences: who they are and what they do'),
  what_they_sell: arr(str()),
  target_customers: str(),
  location_and_reach: str(),
  online_presence: obj({ website: str(), google_business: str(), social_media: str(), reviews: str() }),
  competitors: arr(obj({ name: str(), what_they_do_better_online: str() })),
  brand: obj({ personality: str(), colors_seen: arr(str('hex or colour name')), tone_of_voice: str() }),
  growth_signals: arr(str('recent news, expansion, hiring, new branches, events')),
  pain_points: arr(str('problems a better website/online presence would solve')),
  opportunities: arr(str()),
  fit_score: { type: 'integer', description: '0-100: how good a fit and how likely to buy a website project' },
  fit_reason: str(),
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
});

/** Web research on the lead: Claude searches and reads the web, then we structure the notes. */
export async function researchLead(lead, audit) {
  const s = getSettings();
  const countryHint = s.sending.default_country_code === '91' ? 'India' : '';
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: s.ai.web_search_max_uses },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 },
  ];
  const prompt = `Research this business so we can pitch them a website project. Use web search (and fetch their website${lead.website ? ` at ${lead.website}` : ''} if useful). Look for: what they sell, their customers, locations, Google Business profile and reviews, social media activity, competitors in ${lead.city || 'their area'} with better online presence, brand look and feel, and any recent growth signals.

${leadContext(lead, { includePitch: false })}
${countryHint ? `Country: ${countryHint}` : ''}
Our automated website audit: <untrusted>${JSON.stringify(audit?.findings || [])}</untrusted>

Write concise research notes with clear headings. Say explicitly when you could not find something. Do not guess.`;

  const notes = await runText({
    purpose: 'research', leadId: lead.id, tools, effort: s.ai.effort_research, maxTokens: 24000,
    system: managerSystem('business research analyst for a new lead'), prompt,
  });
  const structured = await runJson({
    purpose: 'research_structure', leadId: lead.id, effort: s.ai.effort_light, schema: RESEARCH_SCHEMA,
    system: managerSystem('turn research notes into structured data'),
    prompt: `Convert these research notes into the JSON schema. Use "unknown" for anything not in the notes.\n\n<untrusted>${notes.text}</untrusted>`,
  });
  return { ...structured, notes: notes.text, sources: notes.sources.slice(0, 15), source: 'ai' };
}

export function fallbackResearch(lead, audit) {
  return {
    business_summary: `${lead.company}${lead.industry ? `, a ${lead.industry} business` : ''}${lead.city ? ` in ${lead.city}` : ''}.`,
    what_they_sell: [], target_customers: 'unknown', location_and_reach: lead.city || 'unknown',
    online_presence: { website: audit?.has_website ? (audit.unreachable ? 'unreachable' : `${audit.issues} issue(s) found`) : 'no website', google_business: 'unknown', social_media: 'unknown', reviews: 'unknown' },
    competitors: [], brand: { personality: 'unknown', colors_seen: [], tone_of_voice: 'unknown' },
    growth_signals: [], pain_points: (audit?.findings || []).map((f) => f.text), opportunities: [],
    fit_score: lead.score || 0, fit_reason: 'Rule-based score (AI research not available).', confidence: 'low',
    notes: 'AI research not run (no API key, AI disabled, or budget reached). Based on CRM data and the website audit only.',
    sources: [], source: 'fallback',
  };
}

// --------------------------------------------------------------------- pitch

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const poss = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

function pitchSchema(packageIds) {
  return obj({
    headline: str('one-line pitch, specific to this business'),
    hook: str('opening line that shows we did our homework'),
    pain_points: arr(str()),
    value_props: arr(str('concrete outcomes for this business')),
    recommended_package: { type: 'string', enum: packageIds },
    package_reason: str(),
    objections: arr(obj({ objection: str(), response: str() })),
    call_script: arr(str('talking points for a 5-minute sales call, in order')),
    telecaller_script: str('word-for-word phone script for our telecaller: opening line, permission to talk, 2-3 discovery questions, the pitch in 3 sentences, how to answer the top objection, and the close (book a 30-minute call and ask permission to send the plan on WhatsApp/email). Use [pauses] and short lines.'),
    email: obj({ subject: str(), body: str('plain text intro email; include the placeholders {{brochure_link}} and {{booking_link}} exactly once each; sign as the sender') }),
    whatsapp_intro: str('short WhatsApp intro; include {{brochure_link}} once'),
    design_brief: obj({
      style: str('visual style in a few words'),
      palette: arr(str('hex colour like #1a2b3c'), '4-5 colours: primary, secondary, accent, dark, light'),
      heading_font: str('Google Fonts family name'),
      body_font: str('Google Fonts family name'),
      hero_headline: str(),
      hero_subheadline: str(),
      primary_cta: str(),
      sections: arr(str('homepage sections in order')),
    }),
  });
}

export async function buildPitch(lead, research) {
  const s = getSettings();
  return runJson({
    purpose: 'pitch', leadId: lead.id, effort: s.ai.effort_writing, schema: pitchSchema(s.packages.map((p) => p.id)), maxTokens: 16000,
    system: managerSystem('build the sales pitch and a homepage design brief for an interested lead'),
    prompt: `This lead told us they are interested. Build a sharp, specific pitch and a design brief for their new homepage.

${leadContext(lead, { includePitch: false })}

Research (from the web):
<untrusted>${JSON.stringify({ ...research, notes: undefined, sources: undefined })}</untrusted>

Pick the package that fits their real need and budget. Base pain points and value props on the research, not on generic claims.`,
  }).then((p) => ({ ...p, source: 'ai' }));
}

const PALETTES = {
  food: ['#b4432c', '#f2b134', '#2f6f4e', '#1f1a17', '#fff8ef'],
  health: ['#127a8a', '#5cc3b5', '#f28c6a', '#123038', '#f4fbfb'],
  fashion: ['#1c1c1c', '#c9a27e', '#e85d75', '#111111', '#faf7f2'],
  tech: ['#3a4bf2', '#22c3a6', '#f5a623', '#0e1230', '#f5f7ff'],
  default: ['#2f5bea', '#7a5af8', '#ffb547', '#16181d', '#f7f7f5'],
};
function paletteFor(industry) {
  const i = String(industry || '').toLowerCase();
  if (/food|restaurant|sweet|cafe|bakery|catering/.test(i)) return PALETTES.food;
  if (/health|clinic|physio|dental|hospital|doctor|care/.test(i)) return PALETTES.health;
  if (/fashion|boutique|beauty|salon|jewel/.test(i)) return PALETTES.fashion;
  if (/tech|it |software|saas|digital/.test(i)) return PALETTES.tech;
  return PALETTES.default;
}

/** Rule-based pitch used when AI is unavailable, so the pipeline never stalls. */
export function fallbackPitch(lead, audit) {
  const s = getSettings();
  const pkg = s.packages.find((p) => p.id === lead.recommended_package) || s.packages[0];
  const first = firstName(lead.contact_name);
  const issues = (audit?.findings || []).map((f) => f.text);
  return {
    headline: `A website that turns ${poss(lead.company)} visitors into enquiries`,
    hook: issues[0] ? `We noticed: ${lowerFirst(issues[0])}.` : `${lead.company} deserves an online presence as good as its service.`,
    pain_points: issues.slice(0, 4),
    value_props: ['More enquiries from Google and WhatsApp', 'Fast, mobile-first design', 'Easy to update, fully managed by us'],
    recommended_package: pkg.id,
    package_reason: `${pkg.name} covers the essentials for ${lead.industry || 'your business'}.`,
    objections: [
      { objection: 'It is too expensive', response: `Fixed price (${money(pkg.price, s.billing.currency)}), ${s.billing.advance_pct}% advance, and one extra customer a month usually pays for it.` },
      { objection: 'We get customers by word of mouth', response: 'Referrals now Google you before calling. The website makes that first impression convert.' },
      { objection: 'Not the right time', response: `We deliver in ${pkg.timeline}, so starting now means it is live before your busy season.` },
    ],
    call_script: [`Introduce ${s.agency.sender_name} from ${s.agency.name}`, 'Ask how customers find them today', issues[0] ? `Mention: ${issues[0]}` : 'Ask what they would like a website to do', `Suggest ${pkg.name} and its timeline`, 'Offer a 30-minute call to walk through a homepage concept'],
    telecaller_script: [
      `Hello, am I speaking with ${first === 'there' ? `someone from ${lead.company}` : first}? This is calling from ${s.agency.name}. Is this a good time for two minutes?`,
      '[pause]',
      `We help businesses${lead.city ? ` in ${lead.city}` : ''} get more enquiries from Google and WhatsApp.`,
      'Quick question: how do most of your customers find you today?',
      'And when someone searches for you online, what do they find?',
      '[listen]',
      issues[0] ? `We had a quick look and noticed: ${lowerFirst(issues[0])}.` : 'We put together a short plan with a homepage idea for you.',
      `Our ${pkg.name} fixes that: ${pkg.includes.slice(0, 2).join(' and ').toLowerCase()}, ready in ${pkg.timeline}, at a fixed price.`,
      `If they say it's expensive: "It's a fixed ${money(pkg.price, s.billing.currency)} with ${s.billing.advance_pct}% to start. One extra customer a month usually covers it."`,
      'Close: "Can I send you the plan on WhatsApp, and book a 30-minute call to walk you through it?"',
      '[If yes: note WhatsApp/email permission in the CRM and log the outcome as Interested]',
    ].join('\n'),
    email: {
      subject: `${lead.company}: a quick idea to win more customers online`,
      body: `Hi ${first},\n\nWe put together a short personalised plan for ${lead.company}, including a homepage concept:\n\n{{brochure_link}}\n\n${issues[0] ? `The main thing we spotted: ${lowerFirst(issues[0])}.\n\n` : ''}If you'd like to talk it through, pick a 30-minute slot here: {{booking_link}}\n\nBest,\n${s.agency.sender_name}\n${s.agency.name}`,
    },
    whatsapp_intro: `Hi ${first}, ${s.agency.sender_name} from ${s.agency.name}. We made a personalised website plan and homepage concept for ${lead.company}: {{brochure_link}}. Reply YES to chat.`,
    design_brief: {
      style: 'clean, modern, trustworthy',
      palette: paletteFor(lead.industry),
      heading_font: 'Poppins', body_font: 'Inter',
      hero_headline: `${lead.company}${lead.city ? `, ${poss(lead.city)}` : ', your'} trusted ${lead.industry || 'local business'}`,
      hero_subheadline: 'Quality you can count on. Get in touch in one tap.',
      primary_cta: 'Enquire on WhatsApp',
      sections: ['Hero', 'Services', 'Why choose us', 'Testimonials', 'Gallery', 'Contact & map'],
    },
    source: 'fallback',
  };
}

// -------------------------------------------------------------------- design

/** Strips anything executable. Designs are also served with a sandboxing CSP. */
export function sanitizeHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<(iframe|object|embed|form)[\s\S]*?>/gi, '')
    .replace(/<\/(iframe|object|embed|form)>/gi, '');
}

export async function buildDesign(lead, research, pitch) {
  const s = getSettings();
  const out = await runText({
    purpose: 'design', leadId: lead.id, effort: s.ai.effort_writing, maxTokens: 48000,
    system: managerSystem('web designer: create a homepage design concept as a single HTML file'),
    prompt: `Design a polished, modern homepage concept for ${lead.company} that we will show them as part of our pitch.

Design brief: ${JSON.stringify(pitch.design_brief)}
Pitch headline: ${pitch.headline}
What they sell / audience (from research): <untrusted>${JSON.stringify({ what_they_sell: research.what_they_sell, target_customers: research.target_customers, brand: research.brand, location: research.location_and_reach })}</untrusted>
Business: ${lead.company}, ${lead.industry || ''}, ${lead.city || ''}

Hard requirements:
- Output ONLY one complete HTML document, starting with <!doctype html> and ending with </html>. No commentary, no markdown fences.
- All CSS inline in a <style> tag. No JavaScript at all. No forms.
- The only external resource allowed is Google Fonts via <link>. No external images: use CSS gradients, shapes, inline SVG icons and emoji as image placeholders.
- Fully responsive (looks great at 390px and 1440px). Accessible colour contrast.
- Use realistic but clearly placeholder contact details (e.g. "+91 XXXXX XXXXX"). Do not invent awards, reviews with real names, or statistics; write sample testimonials as "Sample review".
- Add a slim top banner: "Homepage concept by ${s.agency.name} for ${lead.company}".
- Make it look like a premium, finished design, not a wireframe.`,
  });
  const html = out.text.match(/<!doctype html[\s\S]*<\/html>/i)?.[0] || out.text.match(/<html[\s\S]*<\/html>/i)?.[0];
  if (!html) throw new Error('design output did not contain an HTML document');
  return sanitizeHtml(html);
}

/** Template-based homepage concept used when AI is unavailable. */
export function fallbackDesign(lead, pitch) {
  const s = getSettings();
  const b = pitch.design_brief;
  const [p1, p2, accent, dark, light] = [...b.palette, ...PALETTES.default].slice(0, 5);
  const font = (f) => encodeURIComponent(f).replace(/%20/g, '+');
  const services = (pitch.value_props || []).slice(0, 3);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(lead.company)}: homepage concept</title>
<link href="https://fonts.googleapis.com/css2?family=${font(b.heading_font)}:wght@600;800&family=${font(b.body_font)}:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:'${esc(b.body_font)}',system-ui,sans-serif;color:${dark};background:${light};line-height:1.6}
h1,h2,h3{font-family:'${esc(b.heading_font)}',system-ui,sans-serif;line-height:1.15;margin:0 0 12px}
.banner{background:${dark};color:#fff;text-align:center;font-size:13px;padding:6px 12px}
.nav{display:flex;justify-content:space-between;align-items:center;padding:18px 6vw}
.brand{font-weight:800;font-size:20px;font-family:'${esc(b.heading_font)}',sans-serif}
.nav a{color:${dark};text-decoration:none;margin-left:22px;font-weight:600;font-size:14px}
.hero{padding:9vh 6vw 12vh;background:radial-gradient(circle at 85% 20%,${accent}55,transparent 40%),linear-gradient(135deg,${p1},${p2});color:#fff}
.hero h1{font-size:clamp(34px,6vw,64px);max-width:14ch}.hero p{font-size:clamp(16px,2vw,20px);max-width:46ch;opacity:.92}
.btn{display:inline-block;background:${accent};color:${dark};padding:14px 24px;border-radius:999px;font-weight:700;text-decoration:none;margin-top:18px}
section{padding:72px 6vw}.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.card{background:#fff;border-radius:18px;padding:26px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
.ic{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,${p1},${p2});display:grid;place-items:center;color:#fff;font-size:24px;margin-bottom:14px}
.gal{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}.gal div{aspect-ratio:4/3;border-radius:14px;background:linear-gradient(135deg,${p2}88,${accent}88)}
.quote{font-size:18px;font-style:italic}.cta{background:${dark};color:#fff;text-align:center;border-radius:28px;margin:0 6vw 72px}
footer{padding:28px 6vw;font-size:14px;opacity:.7}
@media(max-width:640px){.nav a{display:none}}
</style></head><body>
<div class="banner">Homepage concept by ${esc(s.agency.name)} for ${esc(lead.company)}</div>
<div class="nav"><div class="brand">${esc(lead.company)}</div><div><a href="#">Services</a><a href="#">About</a><a href="#">Gallery</a><a href="#">Contact</a></div></div>
<header class="hero"><h1>${esc(b.hero_headline)}</h1><p>${esc(b.hero_subheadline)}</p><a class="btn" href="#">${esc(b.primary_cta)}</a></header>
<section><h2>What we offer</h2><div class="grid">${(services.length ? services : ['Quality service', 'Trusted by locals', 'Easy to reach']).map((v, i) => `<div class="card"><div class="ic">${['★', '✓', '☎'][i]}</div><h3>${esc(v)}</h3><p>Sample text describing this benefit for ${esc(lead.company)}'s customers.</p></div>`).join('')}</div></section>
<section><h2>Gallery</h2><div class="gal"><div></div><div></div><div></div><div></div></div></section>
<section><div class="card"><p class="quote">"Sample review: wonderful experience, highly recommended."</p><b>Sample customer</b></div></section>
<section class="cta"><h2>Ready when you are</h2><p>Call +91 XXXXX XXXXX or message us on WhatsApp.</p><a class="btn" href="#">${esc(b.primary_cta)}</a></section>
<footer>© ${new Date().getFullYear()} ${esc(lead.company)}${lead.city ? ` · ${esc(lead.city)}` : ''}</footer>
</body></html>`;
}

export { aiEnabled };
