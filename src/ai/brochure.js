import { getSettings } from '../settings.js';
import { runJson, aiEnabled, obj, str, arr } from './claude.js';
import { managerSystem } from './playbook.js';

/*
 * AI Brochure Generator: writes client-specific copy for every page of the brochure deck.
 * The agency's own copy (about, service descriptions, stats, CTA) comes from settings.brochure
 * and is only lightly tailored; the "digital shift" and "how we help" pages are written per client.
 */
const fill = (t, vars) => String(t || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');

export function brochureVars(input) {
  const industry = input.industry || 'business';
  return {
    company: input.company,
    industry,
    industry_lower: industry.toLowerCase(),
    city: input.city || '',
    customers: /salon|clinic|hospital|gym|spa|restaurant|cafe|hotel|school/i.test(industry) ? 'customers' : 'customers',
  };
}

/** Rule-based brochure: the agency defaults with the client's name and industry filled in. */
export function templateBrochure(input, selected) {
  const s = getSettings();
  const b = s.brochure;
  const v = brochureVars(input);
  const services = b.services.filter((sv) => selected.includes(sv.id));
  return {
    cover_title: fill(b.cover_title, v),
    cover_subtitle: fill(b.cover_subtitle, v),
    about: b.about.map((p) => fill(p, v)),
    shift_title: fill(b.shift_title, v),
    shift_paragraphs: b.shift_paragraphs.map((p) => fill(p, v)),
    help_intro: fill(b.help_intro, v),
    help_bullets: services.map((sv) => fill(sv.help_bullet, v)),
    services: services.map((sv) => ({ id: sv.id, name: sv.name, asset: sv.asset, text_side: sv.text_side, paragraphs: sv.paragraphs.map((p) => fill(p, v)), bullets: sv.bullets.map((p) => fill(p, v)) })),
    why_paragraphs: b.why_paragraphs.map((p) => fill(p, v)),
    stats: b.stats,
    cta_title: fill(b.cta_title, v),
    cta_text: fill(b.cta_text, v),
    cta_button: b.cta_button,
  };
}

function schema(serviceIds) {
  return obj({
    cover_title: str('e.g. "Digital Growth Solutions for <company>"; max 6 words after "for"'),
    cover_subtitle: str('one sentence, max 30 words: which services and what they do for this business'),
    shift_title: str('"The Digital Shift in <industry> Experience" or similar, max 6 words'),
    shift_paragraphs: arr(str('2-3 sentences each'), 'exactly 3 paragraphs: how customers in this industry search/book/trust online today, why social presence matters, why going digital alone rarely works. Use only widely known, conservative figures; if unsure give no number.'),
    help_intro: str('2 sentences: we build systems that help <company> attract, convert and retain customers'),
    help_bullets: arr(str('max 10 words'), `one benefit bullet per selected service, in this order: ${serviceIds.join(', ')}`),
    services: arr(obj({
      id: { type: 'string', enum: serviceIds },
      paragraphs: arr(str('2-3 sentences, specific to this business'), 'exactly 2 paragraphs'),
      bullets: arr(str('max 8 words'), 'exactly 4 bullets'),
    }), `one entry per selected service: ${serviceIds.join(', ')}`),
    why_paragraphs: arr(str(), 'exactly 2 short paragraphs, mention the industry once'),
    cta_title: str('max 8 words, ends with a full stop'),
    cta_text: str('one sentence'),
  });
}

export function postBrochure(out, input, selected) {
  const base = templateBrochure(input, selected);
  out = out || {};
  const byId = Object.fromEntries((out.services || []).map((sv) => [sv.id, sv]));
  return {
    ...base,
    cover_title: out.cover_title || base.cover_title,
    cover_subtitle: out.cover_subtitle || base.cover_subtitle,
    shift_title: out.shift_title || base.shift_title,
    shift_paragraphs: out.shift_paragraphs?.length ? out.shift_paragraphs.slice(0, 3) : base.shift_paragraphs,
    help_intro: out.help_intro || base.help_intro,
    help_bullets: out.help_bullets?.length === selected.length ? out.help_bullets : base.help_bullets,
    services: base.services.map((sv) => ({ ...sv, paragraphs: byId[sv.id]?.paragraphs?.length ? byId[sv.id].paragraphs.slice(0, 2) : sv.paragraphs, bullets: byId[sv.id]?.bullets?.length ? byId[sv.id].bullets.slice(0, 4) : sv.bullets })),
    why_paragraphs: out.why_paragraphs?.length ? out.why_paragraphs.slice(0, 2) : base.why_paragraphs,
    cta_title: out.cta_title || base.cta_title,
    cta_text: out.cta_text || base.cta_text,
  };
}

/** Writes the brochure with the AI, falling back to the template on any failure. Returns { content, source }. */
/** Without Claude: the agency copy with the client filled in (the in-app AI writer was removed, owner 2026-11-05). */
export async function writeBrochure(input, selected, research = null) {
  return { content: templateBrochure(input, selected), source: 'template' };
}
