/*
 * The brochure data contract shared by the two deck designs ("classic" = Codeace Growth Deck,
 * "editorial" = Codeace Editorial), ported from the owner's template package
 * (Downloads/files (1)/brochure-template: types.ts, normalize.ts, editorial/EditorialBrochure.tsx).
 *
 * BrochureData = { brand, client, theme, cover, about?, insight?, approach?, services[1..8], whyUs?, cta, closing }
 * Images are { src: 'asset:…' | 'upload:…', alt }. Text fields use "\n" for line breaks and
 * `highlight` = a substring of the heading shown in the accent colour.
 *
 * Data comes from the AI pipeline (src/ai/brochure-deck.js) or, without AI, from contentToData()
 * (the brochure copy written by src/ai/brochure.js plus the agency defaults).
 */
export const DESIGNS = ['classic', 'editorial', 'signature-precision', 'signature-mono', 'signature-bold', 'signature-commerce'];
export const THEMES = {
  classic: { primary: '#2d4bd8', ink: '#0b1033', paper: '#f3f4f9', accent: '#d7ff3f' },
  editorial: { primary: '#2d4bd8', ink: '#121a4a', paper: '#f4f1fb', accent: '#ffb8cc' },
};

/** Maximum lengths measured against the 1920×1080 grid (the template's LIMITS). */
export const LIMITS = {
  coverTitleLine: 12, coverTitleLines: 3, coverSubtitle: 160, coverChips: 6,
  aboutHeading: 60, aboutBody: 240, insightHeading: 48, statValue: 8, statLabel: 70, statement: 160,
  approachHeading: 30, approachBody: 160, servicesMin: 1, servicesMax: 8, serviceTitleLine: 16,
  serviceSummary: 60, serviceLead: 120, serviceBody: 200, benefits: 4, benefit: 50,
  whyHeading: 60, whyBody: 260, whyStats: 4, ctaHeading: 60, ctaBody: 130, closingHeadingLine: 6,
  gapsHeading: 48, gapsNote: 110, gaps: 4, gapTitle: 44, gapText: 130,
};

const IMG = (f) => `asset:brochure/deck/${f}`;
export const LOGO = { src: IMG('codeace.png'), alt: 'Codeace logo', ratio: 361 / 156 };

/** The image catalogue the AI picks from (descriptions from the template's sample brief). */
export const ASSETS = [
  { id: 'stylist', file: 'stylist.png', kind: 'cutout', orientation: 'square', description: 'Smiling stylist in an apron holding a hair dryer and a round brush' },
  { id: 'coin', file: 'coin.png', kind: 'cutout', orientation: 'portrait', description: '3D bar chart topped with a trophy coin' },
  { id: 'man-laptop', file: 'man.png', kind: 'cutout', orientation: 'portrait', description: 'Man sitting cross-legged with a laptop, giving a thumbs up' },
  { id: 'team-table', file: 'team.jpg', kind: 'photo', orientation: 'portrait', description: 'Overhead view of a team working around a white table' },
  { id: 'web-mockup', file: 'mockup.jpg', kind: 'screenshot', orientation: 'landscape', description: 'Dark website design mockups' },
  { id: 'bubbles', file: 'bubbles.png', kind: 'cutout', orientation: 'square', description: 'Cluster of glossy blue 3D bubbles' },
  { id: 'robot', file: 'robot.jpg', kind: 'photo', orientation: 'landscape', description: 'White robot pointing at data dashboards' },
  { id: 'ai-hand', file: 'aihand.png', kind: 'cutout', orientation: 'portrait', description: '3D hand holding a glowing AI chip in a network' },
  { id: 'erp-laptop', file: 'laptop.jpg', kind: 'photo', orientation: 'square', description: 'Laptop on a wooden desk showing an accounting dashboard' },
  { id: 'erp-3d', file: 'erp3d.png', kind: 'cutout', orientation: 'square', description: '3D dashboard tiles with charts, a handbag icon and coins' },
  { id: 'seo-report', file: 'console.jpg', kind: 'screenshot', orientation: 'portrait', description: 'Search performance report with clicks and impressions chart' },
  { id: 'seo-guy', file: 'seoguy.png', kind: 'cutout', orientation: 'portrait', description: '3D character holding a magnifying glass over a search page' },
  { id: 'phone-instagram', file: 'phone.jpg', kind: 'photo', orientation: 'landscape', description: 'Hand holding a phone showing an Instagram profile' },
  { id: 'social-girl', file: 'socialgirl.png', kind: 'cutout', orientation: 'portrait', description: '3D woman with a megaphone surrounded by likes and follower badges' },
  { id: 'team-3d', file: 'team3d.png', kind: 'cutout', orientation: 'square', description: '3D team meeting around a table with laptops' },
].map((a) => ({ ...a, src: IMG(a.file) }));
const asset = (id) => { const a = ASSETS.find((x) => x.id === id); return a ? { src: a.src, alt: a.description } : undefined; };
export const CLOSING_BG = { src: IMG('closing-bg.jpg'), alt: '' };

/** Images per built-in service id (used without AI). */
const SERVICE_ART = {
  website: ['web-mockup', 'bubbles', 'wide'], automation: ['robot', 'ai-hand', 'wide'], erp: ['erp-laptop', 'erp-3d', 'square'],
  seo: ['seo-report', 'seo-guy', 'portrait'], social: ['phone-instagram', 'social-girl', 'wide-low'],
};
const CHIP = { website: 'Website', automation: 'AI Automation', erp: 'ERP', seo: 'SEO', social: 'Social Media' };

/** Agency copy of the template that the AI does not rewrite without the pipeline. */
export const DECK_COPY = {
  tag: 'Digital Growth Proposal',
  about_heading: 'A next-gen digital transformation company.', about_highlight: 'transformation',
  credential: { title: 'Trusted since 2018', text: 'A multi-million dollar global technology firm.' },
  tags: ['Software Development', 'Automation', 'SEO', 'Branding'],
  approach_heading: 'How We Help\nYou Grow',
  why_heading: 'Not just a provider — your digital growth partner.', why_highlight: 'digital growth partner.',
  cta_eyebrow: 'Let’s begin',
};

const HEX = /^#[0-9a-f]{6}$/i;
export function resolveTheme(design, theme) {
  const base = THEMES[design] || THEMES.classic;
  const pick = (k) => (HEX.test(String(theme?.[k] || '').trim()) ? String(theme[k]).trim().toLowerCase() : base[k]);
  const t = { primary: pick('primary'), ink: pick('ink'), paper: pick('paper'), accent: pick('accent') };
  t.onAccent = HEX.test(String(theme?.onAccent || '')) ? theme.onAccent : t.ink;
  return t;
}

const VISUALS = ['wide', 'square', 'portrait', 'wide-low'];
export const serviceVisual = (svc, i) => (VISUALS.includes(svc.visual) ? svc.visual : VISUALS[i % VISUALS.length]);
export function serviceSlideTitle(svc) {
  if (svc.slideTitle) return svc.slideTitle;
  const words = String(svc.name || '').trim().split(/\s+/);
  return words.length < 2 ? svc.name : `${words.slice(0, -1).join(' ')}\n${words.at(-1)}`;
}

const SAFE_SRC = /^(asset|upload|stock):[\w\-./]+$/;
const safeImage = (img) => (img && SAFE_SRC.test(img.src || '') ? { src: img.src, alt: String(img.alt || '') } : undefined);

/** Fills defaults, trims lists to what the layout holds, drops unsafe images. Never mutates the input. */
export function normalizeData(d) {
  const services = (d.services || []).slice(0, LIMITS.servicesMax).map((s) => ({
    ...s, benefits: (s.benefits || []).slice(0, LIMITS.benefits), image: safeImage(s.image), accentImage: safeImage(s.accentImage),
  }));
  return {
    ...d,
    brand: { name: d.brand?.name || 'Codeace', logo: safeImage(d.brand?.logo) },
    client: { name: d.client?.name || 'Your Client' },
    cover: {
      ...d.cover,
      heroImage: safeImage(d.cover?.heroImage),
      badge: d.cover?.badge === '' ? '' : d.cover?.badge || `For ${d.client?.name || 'you'}`,
      chips: (d.cover?.chips ?? services.map((s) => s.name)).slice(0, LIMITS.coverChips),
    },
    about: d.about && { ...d.about, image: safeImage(d.about.image), credential: d.about.credential && { ...d.about.credential, logo: safeImage(d.about.credential.logo) || safeImage(d.brand?.logo) } },
    // where the client loses customers today (Signature designs; from the lead's SWOT)
    gaps: d.gaps && (d.gaps.items || []).some((g) => g && g.title) ? { ...d.gaps, items: d.gaps.items.filter((g) => g && g.title).slice(0, LIMITS.gaps).map((g) => ({ title: String(g.title), text: String(g.text || '') })) } : undefined,
    insight: d.insight && (d.insight.stats || []).length ? { ...d.insight, stats: d.insight.stats.slice(0, 4), image: safeImage(d.insight.image) } : undefined,
    approach: d.approach && { ...d.approach, image: safeImage(d.approach.image) },
    services,
    whyUs: d.whyUs && { ...d.whyUs, stats: (d.whyUs.stats || []).slice(0, LIMITS.whyStats), image: safeImage(d.whyUs.image) },
    cta: { ...d.cta },
    closing: { ...d.closing, backgroundImage: safeImage(d.closing?.backgroundImage) },
  };
}

/** Problems a layout would show: missing parts (errors) and text longer than the grid holds (warnings). */
export function validateData(d) {
  const out = [];
  const err = (path, message) => out.push({ level: 'error', path, message });
  const max = (path, v, n) => { if (v && String(v).length > n) out.push({ level: 'warning', path, message: `${String(v).length} characters; keep it to ${n} or fewer.` }); };
  const lines = (path, v, n, k) => { const ls = String(v || '').split('\n'); if (k && ls.length > k) out.push({ level: 'warning', path, message: `Use ${k} lines or fewer.` }); ls.forEach((l, i) => max(`${path} line ${i + 1}`, l, n)); };
  if (!d.cover?.title) err('cover.title', 'Missing.');
  lines('cover.title', d.cover?.title, LIMITS.coverTitleLine, LIMITS.coverTitleLines);
  max('cover.subtitle', d.cover?.subtitle, LIMITS.coverSubtitle);
  if (d.about) { max('about.heading', d.about.heading, LIMITS.aboutHeading); max('about.body', d.about.body, LIMITS.aboutBody); }
  if (d.insight) {
    max('insight.heading', d.insight.heading, LIMITS.insightHeading); max('insight.statement', d.insight.statement, LIMITS.statement);
    (d.insight.stats || []).forEach((s, i) => { max(`insight.stats.${i}.value`, s.value, LIMITS.statValue); max(`insight.stats.${i}.label`, s.label, LIMITS.statLabel); });
  }
  if (d.gaps) { max('gaps.heading', d.gaps.heading, LIMITS.gapsHeading); max('gaps.note', d.gaps.note, LIMITS.gapsNote); (d.gaps.items || []).forEach((g, i) => { max(`gaps.items.${i}.title`, g.title, LIMITS.gapTitle); max(`gaps.items.${i}.text`, g.text, LIMITS.gapText); }); }
  if (d.approach) { max('approach.heading', d.approach.heading, LIMITS.approachHeading); max('approach.body', d.approach.body, LIMITS.approachBody); }
  if (!(d.services || []).length) err('services', 'Add at least one service.');
  (d.services || []).forEach((s, i) => {
    lines(`services.${i}.slideTitle`, serviceSlideTitle(s), LIMITS.serviceTitleLine);
    max(`services.${i}.summary`, s.summary, LIMITS.serviceSummary); max(`services.${i}.lead`, s.lead, LIMITS.serviceLead); max(`services.${i}.body`, s.body, LIMITS.serviceBody);
    if ((s.benefits || []).length !== LIMITS.benefits) out.push({ level: 'warning', path: `services.${i}.benefits`, message: `Give exactly ${LIMITS.benefits} benefits.` });
    (s.benefits || []).forEach((b, j) => max(`services.${i}.benefits.${j}`, b, LIMITS.benefit));
  });
  if (d.whyUs) { max('whyUs.heading', d.whyUs.heading, LIMITS.whyHeading); max('whyUs.body', d.whyUs.body, LIMITS.whyBody); }
  if (!d.cta?.heading || !d.cta?.buttonLabel) err('cta', 'Heading and button label are required.');
  max('cta.heading', d.cta?.heading, LIMITS.ctaHeading); max('cta.body', d.cta?.body, LIMITS.ctaBody);
  if (d.closing?.heading) lines('closing.heading', d.closing.heading, LIMITS.closingHeadingLine);
  return out;
}

/** Agency facts, stats and market figures the brochure may use (Tool settings → Brochure). */
export function agencyFacts(settings) {
  const ai = settings.brochure_ai || {};
  return {
    facts: ai.facts?.length ? ai.facts : ['Founded in 2018', 'Backed by a multi-million dollar global technology firm', 'Builds websites, AI booking agents, ERP systems, SEO and social media campaigns'],
    stats: (settings.brochure?.stats || []).map((s) => ({ value: String(s.value), label: String(s.label) })),
    market: (ai.market_stats || []).filter((s) => s && s.value && s.label),
  };
}

/** BrochureData from the brochure copy (src/ai/brochure.js) without the AI pipeline. */
export function contentToData(content, settings, { company = '', design = 'classic', cover = '' } = {}) {
  const a = settings.agency || {};
  const client = company || 'Your Client';
  const services = (content.services || []).slice(0, LIMITS.servicesMax);
  const titleText = String(content.cover_title || 'Digital Growth Solutions').replace(/\s+for\s+.+$/i, '').trim().replace(/([^.!?])$/, '$1.');
  const words = titleText.split(/\s+/);
  const title = words.length <= 3 ? words.join('\n') : titleText;
  const shift = String(content.shift_title || 'The Digital Shift').replace(/\s+in\s+/i, (m) => `${m.trimEnd()}\n`).replace(/\n\s*/, '\n');
  const ctaTitle = String(content.cta_title || 'Let’s turn your digital goals into real growth.');
  const ctaHl = (/real growth\.?/i.exec(ctaTitle) || [ctaTitle.split(/\s+/).slice(-2).join(' ')])[0];
  const { stats, market } = agencyFacts(settings);
  return {
    brand: { name: a.name || 'Codeace', logo: { src: LOGO.src, alt: LOGO.alt } },
    client: { name: client },
    cover: {
      tag: DECK_COPY.tag, title, highlight: title.split('\n').at(-1).split(/\s+/).at(-1), subtitle: content.cover_subtitle || '',
      heroImage: cover ? { src: cover, alt: '' } : asset('stylist'), chips: services.map((s) => CHIP[s.id] || s.name),
    },
    about: {
      heading: DECK_COPY.about_heading, highlight: DECK_COPY.about_highlight, body: (content.about || [])[0] || '',
      image: asset('coin'), credential: { ...DECK_COPY.credential }, tags: DECK_COPY.tags,
    },
    insight: market.length ? {
      eyebrow: 'The Digital Shift', heading: shift, stats: market.slice(0, 3).map((s) => ({ value: s.value, label: s.label })),
      statement: (content.shift_paragraphs || [])[2] || (content.shift_paragraphs || []).at(-1) || '', image: asset('man-laptop'),
    } : undefined,
    approach: { heading: DECK_COPY.approach_heading, body: content.help_intro || '', image: asset('team-table') },
    services: services.map((sv, i) => {
      const art = SERVICE_ART[sv.id];
      return {
        name: sv.name, summary: (content.help_bullets || [])[i] || '', lead: (sv.paragraphs || [])[0] || '', body: (sv.paragraphs || [])[1] || '',
        benefits: (sv.bullets || []).slice(0, 4), image: art ? asset(art[0]) : undefined, accentImage: art ? asset(art[1]) : undefined, visual: art?.[2],
      };
    }),
    whyUs: { heading: DECK_COPY.why_heading, highlight: DECK_COPY.why_highlight, body: (content.why_paragraphs || []).join(' '), stats: (content.stats || stats).slice(0, 4), image: asset('team-3d') },
    cta: { eyebrow: DECK_COPY.cta_eyebrow, heading: ctaTitle, highlight: ctaHl, body: content.cta_text || '', buttonLabel: content.cta_button || 'Book a Free Strategy Call' },
    closing: { backgroundImage: CLOSING_BG, phone: a.phone, address: a.address, email: a.email, website: String(a.website || '').replace(/^https?:\/\//, '') },
    design,
  };
}
