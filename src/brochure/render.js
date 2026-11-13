import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fontCss, img, esc } from '../html-docs/assets.js';

/*
 * Stage 3 of the designed brochure: Render (brochure fix guide 2026-11-13, section 6.4). The writer's pages are HTML
 * made of the CodeAce design system (assets/brochure-ds/ds.css). Here they are sanitised (only the system's tags,
 * classes and image ids get through), wrapped with CodeAce's header and footer (logo, "Prepared for", page number, the
 * contact block on the last page), given the chosen theme and fonts (inlined, so Chromium fetches nothing) and printed
 * by the existing htmlToPdf(). No settings or database here: the same file renders on the GitHub runner (for the visual
 * review) and in AxiFlow (the PDF), with the caller's image resolver.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DS_CSS = path.join(ROOT, 'assets', 'brochure-ds', 'ds.css');
export const SIZE = { width: 1123, height: 794, cssPage: true };

export const THEMES = {
  'ink-red': 'CodeAce ink and red: the default; tech, services, anything without a stronger fit',
  'ivory-maroon': 'ivory and maroon: fashion, sarees, jewellery, weddings, boutiques',
  'sand-forest': 'sand and forest green: food, spices, Ayurveda, wellness, natural products',
  'slate-blue': 'slate and blue: B2B, manufacturing, automotive, industrial, professional services',
};
export const FONTS = {
  manrope: 'Manrope for headings and text: modern, clean (the CodeAce default)',
  'playfair-manrope': 'Playfair Display headings with Manrope text: fashion, premium, editorial',
  'fraunces-inter': 'Fraunces headings with Inter text: warm, crafted, food and wellness',
};
const PAGE_VARIANTS = new Set(['page--dark', 'cover--photo', 'cover--type']);
/** Every class the writer may use (the design system); anything else is dropped. */
export const DS_CLASSES = new Set(['head', 'eyebrow', 'h-display', 'lead', 'accent', 'muted', 'row', 'col', 'grid-2', 'grid-3', 'grid-4', 'card', 'card--accent', 'card--dark', 'num',
  'stats', 'stat', 'statement', 'quote', 'split', 'split__row', 'steps', 'timeline', 'when', 'photo-panel', 'photo-panel--left', 'photo-panel--right', 'photo-panel--full',
  'photo-panel__text', 'photo-grid', 'checklist', 'metrics', 'key', 'cover', 'cover__text']);
/** Fixed-size components: the layout check reports any of them whose text does not fit (data-fit). */
const FIT = new Set(['lead', 'card', 'statement', 'quote', 'split__row', 'photo-panel__text', 'checklist', 'eyebrow']);
const TAGS = new Set(['section', 'div', 'h1', 'h2', 'h3', 'p', 'span', 'strong', 'em', 'ul', 'ol', 'li', 'figure', 'figcaption', 'blockquote', 'img', 'br']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea', 'video', 'audio', 'canvas', 'template', 'noscript', 'base', 'frame', 'frameset']);

/**
 * One page of the writer's HTML → { html (the inside of the page), variants, images (ids used), removed (what was
 * taken out) }. The outer <section class="page …"> gives the page variants; its children are the page body.
 */
export function sanitizePage(html, { imageIds = null } = {}) {
  const $ = cheerio.load(String(html || ''), null, false);
  const removed = [];
  let variants = [];
  // the page's own <section class="page …">: keep its variants, unwrap it
  const top = $.root().children();
  if (top.length === 1 && top.is('section')) {
    variants = String(top.attr('class') || '').split(/\s+/).filter((c) => PAGE_VARIANTS.has(c));
    top.replaceWith(top.contents());
  }
  $('*').each((_, el) => { if (DROP.has(el.tagName)) { removed.push(el.tagName); $(el).remove(); } });
  $.root().find('*').get().reverse().forEach((el) => { // innermost first, so unwrapping keeps the order
    const e = $(el);
    if (!TAGS.has(el.tagName)) { removed.push(el.tagName); e.replaceWith(e.contents()); return; }
    const cls = String(e.attr('class') || '').split(/\s+/).filter(Boolean);
    const keep = cls.filter((c) => DS_CLASSES.has(c));
    for (const c of cls) if (!DS_CLASSES.has(c)) removed.push(`.${c}`);
    const img = el.tagName === 'img' ? String(e.attr('data-img') || '') : '';
    const alt = String(e.attr('alt') || '').slice(0, 200);
    for (const a of Object.keys(el.attribs || {})) e.removeAttr(a);
    if (keep.length) e.attr('class', keep.join(' '));
    if (keep.some((c) => FIT.has(c)) || (el.tagName === 'li' && e.parent().is('.steps, .timeline, .metrics'))) e.attr('data-fit', '');
    if (el.tagName === 'img') {
      if (!/^I\d{1,3}$/.test(img) || (imageIds && !imageIds.has(img))) { removed.push(`img ${img || '(no id)'}`); e.remove(); return; }
      e.attr('data-img', img);
      if (alt) e.attr('alt', alt);
    }
  });
  $.root().contents().each((_, n) => { if (n.type === 'comment') $(n).remove(); });
  $('*').contents().each((_, n) => { if (n.type === 'comment') $(n).remove(); });
  const images = [...new Set($('img[data-img]').map((_, e) => $(e).attr('data-img')).get())];
  return { html: $.html().trim(), variants, images, removed };
}

let dsCss = null;
const ttf = (file) => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'assets', 'fonts', file)).toString('base64')}`;
const fontCache = new Map();
function fontsCss(fonts) {
  if (!fontCache.has(fonts)) {
    const parts = [fontCss('manrope-2.css')];
    if (fonts === 'playfair-manrope') parts.push(`@font-face { font-family: 'Playfair Display'; font-weight: 500; font-style: normal; font-display: block; src: url(${ttf('PlayfairDisplay-500.ttf')}) format('truetype'); }
@font-face { font-family: 'Playfair Display'; font-weight: 700; font-style: normal; font-display: block; src: url(${ttf('PlayfairDisplay-700.ttf')}) format('truetype'); }`);
    if (fonts === 'fraunces-inter') parts.push(fontCss('brochure-fonts.css'), fontCss('seo-fonts.css'));
    fontCache.set(fonts, parts.join('\n'));
  }
  return fontCache.get(fonts);
}

/**
 * The whole document. data = { theme, fonts, pages: [{ name, html }], doc_name }; ctx = { client, date, docName,
 * contact: { agency, phone, email, website }, imageSrc(id) → URL or data URI or null }.
 */
export function designedHtml(data, ctx = {}) {
  dsCss ??= fs.readFileSync(DS_CSS, 'utf8');
  const theme = THEMES[data.theme] ? data.theme : 'ink-red';
  const fonts = FONTS[data.fonts] ? data.fonts : 'manrope';
  const pages = data.pages || [];
  const c = ctx.contact || {};
  const body = pages.map((p, i) => {
    const s = sanitizePage(p.html);
    const dark = s.variants.includes('page--dark') || s.variants.includes('cover--type');
    const $ = cheerio.load(s.html, null, false);
    $('img[data-img]').each((_, e) => {
      const src = ctx.imageSrc ? ctx.imageSrc($(e).attr('data-img')) : null;
      if (src) $(e).attr('src', src); else $(e).remove();
    });
    const last = i === pages.length - 1;
    return `<div class="page ${s.variants.join(' ')}" data-page="${i + 1}">
<div class="ds-head"><img src="${img(dark && !s.variants.includes('cover--type') ? 'codeace-white.png' : 'codeace-dark.png')}" alt="CodeAce IT Solutions LLP"><div class="ds-meta"><span>Prepared for ${esc(ctx.client || '')}<br>${esc(ctx.date || '')}</span><span>${esc(ctx.docName || data.doc_name || 'Growth Brochure')}<br>${esc(p.name || '')}</span></div><span class="ds-n">${String(i + 1).padStart(2, '0')}</span></div>
<div class="ds-body">${$.html()}</div>${last ? `
<div class="ds-foot"><strong>${esc(c.agency || 'CodeAce IT Solutions LLP')}</strong>${[c.phone, c.email, c.website].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
</div>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(ctx.title || `${ctx.client || ''} ${ctx.docName || 'Brochure'} — CodeAce`)}</title>
<style>${fontsCss(fonts)}</style>
<style>${dsCss}</style>
</head>
<body data-theme="${theme}" data-fonts="${fonts}">
${body}
</body></html>`;
}

/**
 * The layout check (brochure fix guide, section 6.5), run inside the rendered page (page.evaluate): pages that
 * overflow, fixed-size components whose text does not fit, headings over two lines, empty pages, missing pictures.
 */
export const checkInPage = () => {
  const issues = [];
  document.querySelectorAll('.page').forEach((p, i) => {
    const page = i + 1;
    const body = p.querySelector('.ds-body');
    const pr = p.getBoundingClientRect();
    if (p.scrollHeight > p.clientHeight + 1 || [...p.querySelectorAll('.ds-body *')].some((e) => e.getBoundingClientRect().bottom > pr.bottom - 30)) issues.push({ page, what: 'page overflows' });
    p.querySelectorAll('[data-fit]').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) issues.push({ page, what: `${el.classList[0] || el.tagName.toLowerCase()} overflows`, text: el.textContent.trim().slice(0, 60) });
    });
    p.querySelectorAll('.h-display').forEach((h) => {
      const lh = parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize) * 1.05;
      const lines = Math.round(h.getBoundingClientRect().height / lh);
      if (lines > 2) issues.push({ page, what: `heading wraps to ${lines} lines`, text: h.textContent.trim() });
    });
    if (body && body.textContent.trim().length < 40 && !body.querySelector('img')) issues.push({ page, what: 'page is nearly empty' });
    p.querySelectorAll('img').forEach((im) => { if (!im.complete || !im.naturalWidth) issues.push({ page, what: 'picture did not load', text: im.getAttribute('data-img') || '' }); });
  });
  return issues;
};
