import * as cheerio from 'cheerio';
import { get, insert } from '../db.js';
import { nowISO } from '../util.js';
import { TOKEN, visible, maxLen, leftovers, cutMarked, fitLines, importedProblems } from './imported-core.js';

/*
 * HTML files imported as templates (owner, 2026-11-13: "downlds/codeace-brochure-ceakay (1).html import this to
 * templates. add option to upload html files too in template import").
 *
 * The file is kept as it is and printed by Chromium, like the CodeAce HTML templates, so the design stays exact:
 *  1. sanitizeUpload: scripts, frames, event handlers and remote files are removed; Google Fonts are fetched once and
 *     put inside the file (latin + latin-ext), so nothing is fetched when a page is shown or printed.
 *  2. analyse (in Chromium): the pages are found (data-page, else .page, else the largest set of equal boxes) and get
 *     data-page="n"; every block of text (an element holding only text and inline elements) gets data-t="t<n>" and
 *     becomes a slot, written in the light markup of imported-core.js. The wrappers around the pages (a centred column
 *     with gaps and a zoom) are flattened by one added style, and the layout of every page is compared before and after.
 *  3. Per lead, Claude rewrites the slots that were written for the sample client (the client named in the file:
 *     "Prepared for …") from research and the lead's data, and keeps CodeAce's own content; code checks the lengths
 *     and that the sample client's name and place are gone, and puts the texts back in their elements.
 * The template row: mode 'html', source 'html-import', design_json = { html, slots, size, sample, removed, layout }.
 * A document: content.html = { template: 'html-import', tid, size, data: { p<page>: { t<n>: text } } }.
 */
export const IMPORTED = 'html-import';

// ------------------------------------------------------------------ 1. the upload, made safe and self-contained
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const GOOGLE_CSS = /^https:\/\/fonts\.googleapis\.com\/css2?\?/i;
async function fetchOk(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url.slice(0, 60)}: ${r.status}`);
  return r;
}
/** A Google Fonts stylesheet with its font files inside (only the latin and latin-ext subsets). */
async function googleFontsCss(url, files) {
  const css = await (await fetchOk(url)).text();
  const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/);
  let out = blocks.filter((b) => { const sub = /^\/\*\s*([\w-]+)\s*\*\//.exec(b)?.[1]; return !sub || /^latin(-ext)?$/.test(sub); }).join('');
  if (!/@font-face/.test(out)) out = css;
  for (const u of new Set([...out.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+)\)/g)].map((m) => m[1]))) {
    if (!files.has(u)) files.set(u, `data:font/${/\.woff2(\?|$)/.test(u) ? 'woff2' : /\.woff(\?|$)/.test(u) ? 'woff' : 'ttf'};base64,${Buffer.from(await (await fetchOk(u)).arrayBuffer()).toString('base64')}`);
    out = out.split(u).join(files.get(u));
  }
  return out;
}
const REMOTE = /^\s*(https?:)?\/\//i;
/** CSS of the file: Google Fonts @imports inlined, other remote files (pictures, stylesheets) dropped. */
async function cleanCss(css, files, removed) {
  let out = String(css);
  for (const m of [...out.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi)]) {
    if (GOOGLE_CSS.test(m[1])) out = out.replace(m[0], await googleFontsCss(m[1], files));
    else { out = out.replace(m[0], ''); removed.push(`stylesheet ${m[1].slice(0, 80)}`); }
  }
  return out.replace(/url\(\s*['"]?((?:https?:)?\/\/[^'")]+)['"]?\s*\)/gi, (all, u) => (/^data:/.test(u) ? all : (removed.push(`picture ${u.slice(0, 80)}`), 'none')))
    .replace(/expression\s*\(/gi, '(').replace(/javascript:/gi, '');
}
export async function sanitizeUpload(raw) {
  if (!/<\w/.test(String(raw || ''))) throw new Error('This file has no HTML in it');
  const $ = cheerio.load(String(raw));
  const removed = [];
  const files = new Map();
  $('script, noscript, iframe, frame, frameset, object, embed, applet, base, portal, meta[http-equiv]').each((_, e) => { removed.push(`<${e.tagName}>`); $(e).remove(); });
  for (const e of $('link').toArray()) {
    const href = $(e).attr('href') || '';
    const rel = String($(e).attr('rel') || '').toLowerCase();
    if (/stylesheet/.test(rel) && GOOGLE_CSS.test(href)) $(e).replaceWith(`<style>${await googleFontsCss(href, files)}</style>`);
    else { if (/stylesheet/.test(rel)) removed.push(`stylesheet ${href.slice(0, 80)}`); $(e).remove(); }
  }
  for (const e of $('style').toArray()) $(e).text(await cleanCss($(e).text(), files, removed));
  $('*').each((_, e) => {
    for (const [k, v] of Object.entries(e.attribs || {})) {
      const name = k.toLowerCase();
      if (name.startsWith('on')) { $(e).removeAttr(k); continue; }
      if (/^(href|src|xlink:href|action|formaction|poster|data|srcset)$/.test(name) && /^\s*(javascript|vbscript):/i.test(v)) { $(e).removeAttr(k); continue; }
      if (/^(src|srcset|poster|data)$/.test(name) && REMOTE.test(v)) { removed.push(`picture ${v.slice(0, 80)}`); $(e).removeAttr(k); continue; }
      if (name === 'style' && /url\(|expression|javascript:/i.test(v)) $(e).attr(k, v.replace(/url\(\s*['"]?((?:https?:)?\/\/[^'")]+)['"]?\s*\)/gi, () => 'none').replace(/expression\s*\(/gi, '(').replace(/javascript:/gi, ''));
    }
  });
  return { html: $.html(), removed: [...new Set(removed)], fonts: files.size };
}

// ------------------------------------------------------------------ 2. pages and text blocks (run inside Chromium)
/* eslint-disable no-undef */
function markInPage() {
  const INLINE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'CODE', 'DATA', 'DFN', 'EM', 'I', 'KBD', 'MARK', 'Q', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'BR', 'WBR', 'FONT', 'DEL', 'INS', 'LABEL']);
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const outer = (list) => list.filter((e) => !list.some((q) => q !== e && q.contains(e)));
  let pages = outer([...document.querySelectorAll('[data-page]')]);
  if (!pages.length) pages = outer([...document.querySelectorAll('.page')]);
  if (!pages.length) { // the largest set of equal boxes (at least 2, at least 300 px each way)
    const groups = new Map();
    for (const e of document.body.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (r.width < 300 || r.height < 300) continue;
      const k = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    let best = [];
    for (const list of groups.values()) { const o = outer(list); if (o.length >= 2 && o.length > best.length) best = o; }
    pages = best;
  }
  if (!pages.length) return { error: 'No pages found: give each page the class "page" (or data-page)' };
  if (pages.length > 60) return { error: `${pages.length} pages found: at most 60` };
  const wraps = new Set();
  pages.forEach((p, i) => {
    p.setAttribute('data-page', String(i + 1));
    for (let a = p.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) wraps.add(a);
  });
  for (const w of wraps) w.setAttribute('data-ax-wrap', '');
  const shown = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inlineOnly = (el) => { for (const d of el.querySelectorAll('*')) if (d.namespaceURI !== HTML_NS || !INLINE.has(d.tagName)) return false; return true; };
  const slots = [];
  let n = 0;
  const makeSlot = (el, page) => {
    const parts = [];
    const pre = /^pre/.test(getComputedStyle(el).whiteSpace);
    const ser = (node) => {
      let s = '';
      for (const c of node.childNodes) {
        if (c.nodeType === 3) s += pre ? c.data : c.data.replace(/[ \t\n\r\f]+/g, ' ');
        else if (c.nodeType === 1) {
          if (c.tagName === 'BR') { s += '\n'; continue; }
          if (c.tagName === 'WBR') continue;
          const i = parts.length + 1;
          if (!/[^\s]/.test(c.textContent)) { parts.push({ atom: c.outerHTML }); s += `<${i}/>`; continue; }
          const shallow = c.cloneNode(false).outerHTML;
          const close = `</${c.tagName.toLowerCase()}>`;
          parts.push({ open: shallow.endsWith(close) ? shallow.slice(0, -close.length) : shallow, close });
          s += `<${i}>${ser(c)}</${i}>`;
        }
      }
      return s;
    };
    let text = ser(el);
    if (!pre) text = text.replace(/ *\n */g, '\n').replace(/^ +| +$/g, '');
    const id = `t${++n}`;
    el.setAttribute('data-t', id);
    const vis = text.replace(/<\/?\d{1,3}\/?>/g, '');
    slots.push({ id, page, tag: el.tagName.toLowerCase(), text, len: vis.length, lines: (vis.match(/\n/g) || []).length, parts, pre,
      li: el.tagName === 'LI' && el.parentElement.querySelectorAll(':scope > li').length > 1 });
  };
  const walk = (el, page) => {
    for (const c of el.children) {
      if (c.namespaceURI !== HTML_NS || ['SCRIPT', 'STYLE', 'TEMPLATE', 'TEXTAREA', 'SELECT'].includes(c.tagName)) continue;
      if (!/[\p{L}\p{N}]/u.test(c.textContent || '')) continue;
      if (inlineOnly(c)) { if (shown(c)) makeSlot(c, page); } else walk(c, page);
    }
  };
  pages.forEach((p, i) => walk(p, i + 1));
  return { pages: pages.length, slots };
}
/**
 * Pictures inside the file far bigger than they are drawn (owner, 2026-11-13: "html file too large"): each data: picture
 * over minLen characters is scaled to 3x its largest drawn box (sharp in print at 2x), and an opaque PNG photo is
 * stored as JPEG. Only replacements at least 20% smaller are returned: [[old, new], ...].
 */
async function shrinkInPage(minLen) {
  const seen = new Map();
  const note = (u, w, h) => {
    if (!u || !u.startsWith('data:image/') || u.length < minLen || /^data:image\/(svg|gif)/i.test(u)) return;
    const m = seen.get(u) || { w: 0, h: 0 };
    m.w = Math.max(m.w, w); m.h = Math.max(m.h, h);
    seen.set(u, m);
  };
  for (const im of document.images) { const r = im.getBoundingClientRect(); note(im.currentSrc || im.src, r.width, r.height); }
  for (const el of document.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const bg = getComputedStyle(el, pseudo).backgroundImage;
      if (!bg || bg === 'none' || !bg.includes('data:image/')) continue;
      const r = el.getBoundingClientRect();
      for (const m of bg.matchAll(/url\("?(data:image\/[^")]+)"?\)/g)) note(m[1], r.width, r.height);
    }
  }
  const out = [];
  for (const [u, box] of seen) {
    if (!box.w || !box.h) continue; // not drawn on screen: left alone
    try {
      const im = new Image(); im.src = u; await im.decode();
      const nw = im.naturalWidth, nh = im.naturalHeight;
      const k = Math.min(1, Math.max((3 * box.w) / nw, (3 * box.h) / nh));
      const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, w, h);
      let opaque = true;
      if (/^data:image\/(png|webp)/i.test(u)) {
        const d = x.getImageData(0, 0, w, h).data;
        for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 255) { opaque = false; break; }
      }
      const png = /^data:image\/png/i.test(u) && !opaque;
      const next = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
      if (next.length < u.length * 0.8) out.push([u, next]);
    } catch { /* a picture the browser cannot read stays as it is */ }
  }
  return out;
}
/** Every element's box on each page, relative to the page (to compare the layout before and after the flattening). */
function pageBoxes() {
  return [...document.querySelectorAll('[data-page]')].map((p) => {
    const o = p.getBoundingClientRect();
    return { w: o.width, h: o.height, boxes: [...p.querySelectorAll('*')].map((e) => { const r = e.getBoundingClientRect(); return [r.left - o.left, r.top - o.top, r.width, r.height].map((v) => Math.round(v * 2) / 2); }) };
  });
}
/* eslint-enable no-undef */

// One added style: the pages stacked edge to edge (each one a printed page), the wrappers neutral. The page view adds its
// own gap and shadow after it (public/html-docs.js framePages).
const NORM_CSS = `<style data-ax-norm>
html,body{margin:0!important;padding:0!important;background:transparent!important;min-width:0!important;min-height:0!important;height:auto!important}
[data-ax-wrap]{display:block!important;margin:0!important;padding:0!important;gap:0!important;zoom:1!important;transform:none!important;width:auto!important;height:auto!important;min-height:0!important;max-width:none!important;background:transparent!important;box-shadow:none!important;border:0!important;overflow:visible!important}
*,*::before,*::after{animation:none!important;transition:none!important}
[data-page]{margin:0;box-shadow:none;break-after:page;page-break-after:always;break-inside:avoid;flex:none!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style>`;
const addNorm = (html) => (/<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${NORM_CSS}</head>`) : `${NORM_CSS}${html}`);

/** Paper for printing: A4 (portrait or landscape) when the pages have its shape, else the page size itself. */
function paperFor(w, h) {
  const A4 = 210 / 25.4 * 96, A4L = 297 / 25.4 * 96;
  if (Math.abs(h / w - 297 / 210) < 0.012 && A4 / w >= 0.25 && A4 / w <= 2) return { paper: { width: '210mm', height: '297mm' }, scale: A4 / w };
  if (Math.abs(h / w - 210 / 297) < 0.012 && A4L / w >= 0.25 && A4L / w <= 2) return { paper: { width: '297mm', height: '210mm' }, scale: A4L / w };
  return {};
}

/** The client the file was written for: the words after "Prepared for", else the next block after a "Prepared for" label. */
function detectSample(slots) {
  const v = (s) => visible(s.text).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < slots.length; i++) {
    const t = v(slots[i]);
    if (/^prepared (for|exclusively for):?$/i.test(t) && slots[i + 1]) return v(slots[i + 1]).slice(0, 120);
    const m = /^prepared (?:exclusively )?for:?\s+(.{2,100})$/i.exec(t);
    if (m) return m[1];
  }
  return '';
}
const GENERIC = new Set(['the', 'and', 'for', 'pvt', 'private', 'limited', 'ltd', 'llp', 'llc', 'inc', 'company', 'group', 'solutions', 'services', 'interiors', 'designs', 'studio', 'clinic', 'hospital', 'store', 'shop', 'traders', 'foods', 'india', 'kerala', 'your', 'client']);
/** "Ceakay Interiors, Kottayam" → ["Ceakay Interiors", "Ceakay", "Kottayam"]: what must not stay in a lead's document. */
export function sampleWords(sample) {
  const parts = String(sample || '').split(/[,|·–—]/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 3);
  const out = [];
  if (parts[0]) {
    out.push(parts[0]);
    const first = parts[0].split(' ')[0];
    if (first.length >= 4 && !GENERIC.has(first.toLowerCase())) out.push(first);
  }
  for (const p of parts.slice(1)) if (!GENERIC.has(p.toLowerCase())) out.push(p);
  return [...new Set(out)];
}
const LABEL = { h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading', li: 'List item', td: 'Table cell', th: 'Table heading', p: 'Text', a: 'Link', b: 'Bold text', strong: 'Bold text', button: 'Button', label: 'Label', blockquote: 'Quote', figcaption: 'Caption' };
export const slotLabel = (s) => LABEL[s.tag] || (s.len <= 24 ? 'Label' : 'Text');

/**
 * Upload → template row. Returns { id, pages, slots, sample, words, removed, fonts, layout }. Throws when the file has
 * no pages or the pages are not the same size.
 */
export async function importHtmlTemplate({ kind, name, sample_company, html }) {
  if (!['brochure', 'proposal'].includes(kind)) throw new Error('Choose brochure or proposal');
  if (String(html || '').length > 40e6) throw new Error('The HTML file is too large (max 40 MB)');
  const clean = await sanitizeUpload(html);
  const { withPage } = await import('./chrome.js');
  // oversized pictures scaled to what the pages draw (the template is stored in the database and printed for every lead)
  const before = clean.html.length;
  const swaps = await withPage(clean.html, { width: 1440, height: 1000, media: 'screen' }, (page) => page.evaluate(shrinkInPage, 200000));
  for (const [a, b] of swaps) clean.html = clean.html.split(a).join(b);
  clean.shrunk = swaps.length ? { pictures: swaps.length, from: before, to: clean.html.length } : null;
  if (clean.html.length > 12e6) throw new Error(`The template is still ${Math.round(clean.html.length / 1e6)} MB after scaling its pictures (max 12 MB): use fewer or smaller pictures`);
  // the file as it is (screen view): pages found and marked, the layout of every page measured
  const first = await withPage(clean.html, { width: 1440, height: 1000, media: 'screen' }, async (page) => {
    const r = await page.evaluate(markInPage);
    if (r.error) return r;
    return { ...r, boxes: await page.evaluate(pageBoxes), html: `<!DOCTYPE html>\n${await page.evaluate(() => document.documentElement.outerHTML)}` };
  });
  if (first.error) throw new Error(first.error);
  const w = first.boxes[0].w, h = first.boxes[0].h;
  if (first.boxes.some((b) => Math.abs(b.w - w) > 2 || Math.abs(b.h - h) > 2)) throw new Error('The pages are not all the same size');
  const size = { width: Math.round(w * 100) / 100, height: Math.round(h * 100) / 100, media: 'screen', ...paperFor(w, h) };
  const out = addNorm(first.html);
  // the same pages edge to edge, as they are printed: every element must sit where it did
  const after = await withPage(out, { ...size, media: 'screen' }, (page) => page.evaluate(pageBoxes));
  const moved = first.boxes.map((b, i) => {
    const a = after[i];
    if (!a || a.boxes.length !== b.boxes.length) return i + 1;
    return b.boxes.some((x, j) => x.some((v, k) => Math.abs(v - a.boxes[j][k]) > 1)) ? i + 1 : 0;
  }).filter(Boolean);
  const sample = String(sample_company || '').trim().slice(0, 120) || detectSample(first.slots);
  const now = nowISO();
  const words = sampleWords(sample);
  // the sample client's web and email addresses ("ceakayinteriors.com"): a whole-word test on its name misses them
  const key = words.find((w) => !/\s/.test(w))?.toLowerCase() || words[0]?.toLowerCase().replace(/\s+/g, '');
  if (key && key.length >= 4) {
    for (const s of first.slots) for (const m of visible(s.text).matchAll(/[\w.+-]*@?[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?:\/[\w./-]*)?/gi)) {
      const addr = m[0].replace(/[./-]+$/, '');
      if (addr.toLowerCase().includes(key) && !words.includes(addr)) words.push(addr);
    }
  }
  const design = { html: out, slots: first.slots, size, sample, words, removed: clean.removed, fonts: clean.fonts, layout: { pages: first.pages, moved } };
  const id = await insert('design_templates', { kind, name: String(name || 'Imported HTML template').slice(0, 80), mode: 'html', design_json: design, sample_company: sample, source: IMPORTED, created_at: now, updated_at: now });
  return { id, pages: first.pages, slots: first.slots.length, sample, words: design.words, removed: clean.removed, fonts: clean.fonts, moved, shrunk: clean.shrunk };
}

// ------------------------------------------------------------------ the template, cached (it never changes after import)
const cache = new Map();
export async function importedTemplate(tid) {
  if (cache.has(tid)) return cache.get(tid);
  const row = await get(`SELECT id, name, kind, design_json FROM design_templates WHERE id = :id AND source = :s`, { id: tid, s: IMPORTED });
  if (!row) throw new Error('The imported template of this document is gone');
  const d = typeof row.design_json === 'string' ? JSON.parse(row.design_json) : row.design_json;
  const t = { id: row.id, name: row.name, kind: row.kind, ...d, byId: new Map(d.slots.map((s) => [s.id, s])) };
  if (cache.size > 20) cache.clear();
  cache.set(tid, t);
  return t;
}

// ------------------------------------------------------------------ 3. a document's HTML
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
/** A block's text (light markup) → its inner HTML, with the template's own inline elements. */
export function markupToHtml(v, slot) {
  let out = '';
  const stack = [], used = new Set();
  const text = (s) => { out += slot.pre ? escHtml(s) : escHtml(s).replace(/\n/g, '<br>'); };
  let last = 0;
  for (const m of String(v).matchAll(TOKEN)) {
    text(v.slice(last, m.index));
    last = m.index + m[0].length;
    const i = Number(m[2]), p = slot.parts[i - 1];
    if (!p) continue;
    if (p.atom) { if (!m[1] && !used.has(i)) { out += p.atom; used.add(i); } continue; }
    if (m[3]) continue;
    if (!m[1]) { out += p.open; stack.push(i); used.add(i); } else if (stack.includes(i)) {
      while (stack.length) { const j = stack.pop(); out += slot.parts[j - 1].close; if (j === i) break; }
    }
  }
  text(v.slice(last));
  while (stack.length) out += slot.parts[stack.pop() - 1].close;
  // decorations left out go back where they were: before the words or after them
  let head = '', tail = '';
  slot.parts.forEach((p, k) => {
    if (!p.atom || used.has(k + 1)) return;
    const at = slot.text.indexOf(`<${k + 1}/>`);
    if (!visible(slot.text.slice(0, at)).trim()) head += p.atom; else tail += p.atom;
  });
  return head + out + tail;
}
/** The document's full HTML: the template with the document's texts in their blocks. */
export async function importedHtml(h, { client }) {
  const t = await importedTemplate(h.tid);
  const changed = t.slots.filter((s) => { const v = h.data?.[`p${s.page}`]?.[s.id]; return typeof v === 'string' && v !== s.text; });
  if (!changed.length && !client) return t.html;
  const $ = cheerio.load(t.html);
  for (const s of changed) {
    const v = h.data[`p${s.page}`][s.id];
    const el = $(`[data-t="${s.id}"]`);
    if (!visible(v).trim()) { if (s.li) el.remove(); continue; }
    el.html(markupToHtml(v, s));
  }
  if (client) {
    $('title').text(`${client} · ${t.name}`.slice(0, 160));
    // the sample client's name in alt texts and labels (not shown, but read by screen readers and kept in the PDF)
    const words = (t.words || []).filter((w) => w.length >= 4);
    if (words.length) {
      const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|'), 'gi');
      $('[alt], [aria-label], [title]').each((_, e) => { for (const k of ['alt', 'aria-label', 'title']) { const a = $(e).attr(k); if (a && re.test(a)) $(e).attr(k, a.replace(re, client)); re.lastIndex = 0; } });
    }
  }
  return $.html();
}
/** The template's own texts as a document's data: { p<page>: { t<n>: text } }. */
export function templateData(t) {
  const data = {};
  for (const s of t.slots) (data[`p${s.page}`] ||= {})[s.id] = s.text;
  return data;
}
/** Labels for the Words form: "Page 4", "Heading", "List item". */
export function formLabels(t) {
  const out = {};
  for (const s of t.slots) { out[`p${s.page}`] = `Page ${s.page}`; out[s.id] = slotLabel(s); }
  return out;
}
/** A document's texts edited by hand: only the template's ids, strings, sizes capped. */
export function sanitizeImportedData(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const [p, texts] of Object.entries(v).slice(0, 80)) {
    if (!/^p\d{1,3}$/.test(p) || !texts || typeof texts !== 'object') continue;
    out[p] = {};
    for (const [id, t] of Object.entries(texts).slice(0, 400)) if (/^t\d{1,5}$/.test(id) && typeof t === 'string') out[p][id] = t.slice(0, 3000);
  }
  return out;
}

// ------------------------------------------------------------------ Claude: the job and the answer
/** Words of the sample client that are not also this lead's own (a lead in the same town keeps its town). */
function wordsFor(t, input) {
  const own = [input.company, input.city, input.address, input.website, input.contact_name].filter(Boolean).join(' ').toLowerCase();
  return (t.words || []).filter((w) => !own.includes(w.toLowerCase()));
}
export async function importedJob(tpl, { input, dossier, research, swot, offer, audit, settings: s }) {
  const h = await import('./index.js');
  const { WEBSITE_CHECK_RULE } = await import('../pipeline/enrich.js');
  const t = await importedTemplate(tpl.id);
  const brochure = t.kind === 'brochure';
  const words = wordsFor(t, input);
  const must = t.slots.filter((x) => leftovers(x.text, words).length).map((x) => x.id);
  const lead = [`Business: ${input.company}`, input.industry && `Industry: ${input.industry}`, input.city && `Place: ${input.city}`, input.website && `Website: ${input.website}`,
    input.website_type && `Website type ordered: ${input.website_type}`, !offer?.package && input.package && `Package: ${input.package}`].filter(Boolean).join('\n');
  const pages = [];
  for (const x of t.slots) {
    if (!pages[x.page - 1]) pages[x.page - 1] = [`## Page ${x.page}`];
    pages[x.page - 1].push(`${x.id} · ${slotLabel(x).toLowerCase()}${x.li ? ' (may be "")' : ''} · max ${maxLen(x.len)}${x.lines ? ` · ${x.lines + 1} lines max` : ''} · ${JSON.stringify(x.text)}`);
  }
  const sample = t.sample || 'another client';
  const guide = `Tailor CodeAce's ${brochure ? 'brochure' : 'proposal'} "${t.name}" (${t.slots.length} text blocks on ${t.layout?.pages || pages.length} fixed pages) to this one business.
The design is fixed: only the words change, each in its own box. The template was written for ${sample}.
- Rewrite every block that is about ${sample} for this business: its name, place, what it sells, the facts and numbers
  about it, the findings, SWOT, review, plan and recommendation, the search phrases and examples, and tags such as
  "Prepared for …". Use the research and the lead data below; never carry over a fact about ${sample}.
- Keep CodeAce's own content as it is (who we are, our services and capabilities, our results and clients, packages,
  prices, terms and contact details), unless a block is clearly an example made for ${sample}'s sector: then make the
  example fit this business.
- Answer only with the blocks you change: { "id": "t12", "text": "…" }. Blocks you leave out keep the template's text.
${must.length ? `- These blocks name ${sample} and must be rewritten: ${must.join(', ')}.\n` : ''}- Each block: at most its "max" characters and at most its lines ("\\n" is a line break; a heading keeps its line count).
- Markers keep the template's styling: "<2>…</2>" is a styled part (bold, coloured), "<3/>" is a decoration. Keep each
  marker, in the same order, around the words that take that role; never add markers that are not in the block.
- A list item marked (may be "") can be left empty to drop it when this business has fewer true points.
- Plain words: no HTML, no markdown, no emoji.`;
  const step3 = `3. Rewrite the blocks about ${sample} from those sources (the business, its findings, SWOT, plan and recommended
   package); keep CodeAce's own blocks.`;
  const offerBlock = offer?.text ? `<offer>\n${offer.text}${offer.package ? `\nPackage: ${offer.package}` : ''}\nThis offer is decided: sell exactly this. Do not suggest a different build, and do not contradict it anywhere.\n</offer>` : '';
  const schema = h.stripLimits({ type: 'object', additionalProperties: false, required: ['texts', 'verification'], properties: {
    texts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string' } } } },
    verification: h.VERIFICATION } });
  return {
    kind: 'html',
    template: IMPORTED,
    purpose: brochure ? 'brochure_html' : 'proposal_html',
    system: `You are Codeace's senior strategist and copywriter. You tailor CodeAce's ${brochure ? 'brochures' : 'proposals'} to local businesses in Kerala and the Gulf: specific, plain and persuasive, built only on what is known about the business. You answer with JSON that matches the schema exactly.`,
    prompt: [
      guide,
      `<lead>\n${lead}\n</lead>`,
      offerBlock,
      h.processFor(step3),
      dossier ? `<crm_and_notes>\n${dossier}\n</crm_and_notes>` : '',
      research ? `<research>\n${typeof research === 'string' ? research : JSON.stringify(research).slice(0, 6000)}\n</research>` : '',
      audit?.findings?.length ? `<website_check url="${String(input.website || '').replace(/"/g, '')}">\n${audit.findings.map((f) => `- ${f.text}`).join('\n')}\n(${WEBSITE_CHECK_RULE})\n</website_check>` : '',
      swot ? `<swot>\n${h.swotLines(swot)}\n</swot>` : '<swot>No approved SWOT for this lead yet: work out its strengths, weaknesses, opportunities and threats from your research first.</swot>',
      `<style_note>\n${h.STYLE_NOTE}\n</style_note>`,
      `<template_texts>\nEach line: id · what it is · max characters · the template's text (JSON string).\n${pages.filter(Boolean).map((p) => p.join('\n')).join('\n\n')}\n</template_texts>`,
    ].filter(Boolean).join('\n\n'),
    schema,
    // for the runner's validator (claude-worker/validate.mjs) and the acceptance: ids, limits and the words that must go
    imported: { tid: t.id, words, must, max: Object.fromEntries(t.slots.map((x) => [x.id, maxLen(x.len)])), lines: Object.fromEntries(t.slots.filter((x) => x.lines).map((x) => [x.id, x.lines])), li: t.slots.filter((x) => x.li).map((x) => x.id) },
    maxTokens: 16000,
  };
}
/** Claude's answer → the document content. Throws (the try is repeated) when the sample client is still in it. */
export async function acceptImported(output, job, VERIFICATION, clean) {
  const im = job?.imported;
  if (!im?.tid) throw new Error('the job has no template');
  const t = await importedTemplate(im.tid);
  const hard = importedProblems(output, im).filter((p) => !/characters; keep it to/.test(p));
  if (hard.length) throw new Error(`the answer is not usable yet: ${hard.slice(0, 4).join('; ')}`);
  const data = templateData(t);
  const cuts = [];
  for (const x of output.texts) {
    const s = t.byId.get(x.id);
    if (!s) continue;
    let v = fitLines(String(x.text ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim(), s.lines);
    const max = maxLen(s.len);
    if (visible(v).length > max) { cuts.push({ path: x.id, length: visible(v).length, max }); v = cutMarked(v, max); }
    data[`p${s.page}`][s.id] = v;
  }
  // nothing about the sample client may be left, in the blocks Claude changed or in those it kept
  const left = t.slots.filter((s) => leftovers(data[`p${s.page}`][s.id], im.words).length).map((s) => s.id);
  if (left.length) throw new Error(`the answer still names the sample client in ${left.slice(0, 8).join(', ')}`);
  const content = { html: { template: IMPORTED, tid: t.id, size: t.size, data, split: {} } };
  if (output?.verification) content.html.verification = clean(output.verification, VERIFICATION);
  if (cuts.length) content.html.cuts = cuts;
  return content;
}

// ------------------------------------------------------------------ the layout check of a finished document
/* eslint-disable no-undef */
function layoutInPage() {
  return [...document.querySelectorAll('[data-page]')].map((pg) => {
    const pr = pg.getBoundingClientRect();
    const slots = [...pg.querySelectorAll('[data-t]')];
    const bad = [];
    const rect = new Map();
    for (const e of slots) {
      const r = e.getBoundingClientRect();
      rect.set(e, r);
      let cut = r.bottom > pr.bottom + 1 || r.right > pr.right + 1 || r.left < pr.left - 1;
      const cs = getComputedStyle(e);
      if ((cs.overflowY !== 'visible' && e.scrollHeight > e.clientHeight + 2) || (cs.overflowX !== 'visible' && e.scrollWidth > e.clientWidth + 2)) cut = true;
      for (let a = e.parentElement; !cut && a && a !== pg; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (ac.overflow === 'visible' && ac.overflowX === 'visible' && ac.overflowY === 'visible') continue;
        const q = a.getBoundingClientRect();
        if (r.bottom > q.bottom + 1 || r.right > q.right + 1) cut = true;
      }
      if (cut) bad.push(e.dataset.t);
    }
    const overlaps = [];
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const a = rect.get(slots[i]), b = rect.get(slots[j]);
      if (slots[i].contains(slots[j]) || slots[j].contains(slots[i])) continue;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlaps.push(`${slots[i].dataset.t}+${slots[j].dataset.t}`);
    }
    let below = 0;
    for (const e of pg.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.height && r.bottom > pr.bottom + 1) below++; }
    return { page: Number(pg.dataset.page), bad, overlaps, below };
  });
}
/* eslint-enable no-undef */
/**
 * What no longer fits on the finished pages, compared with the template's own pages (a template that already lets a
 * decoration run off the page is not reported): [{ page, what, text }].
 */
export async function importedIssues(doc, htmlOf) {
  const { withPage } = await import('./chrome.js');
  const t = await importedTemplate(doc.content.html.tid);
  const run1 = (html) => withPage(html, t.size, async (page) => {
    await page.evaluate(async () => { await Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((ok) => { im.onload = im.onerror = ok; })))); });
    return page.evaluate(layoutInPage);
  });
  const base = await run1(t.html);
  const now = await run1(await htmlOf(doc));
  const text = (id) => { const s = t.byId.get(id); return s ? visible(doc.content.html.data?.[`p${s.page}`]?.[id] ?? s.text).replace(/\s+/g, ' ').slice(0, 60) : ''; };
  const out = [];
  for (const p of now) {
    const b = base.find((x) => x.page === p.page) || { bad: [], overlaps: [], below: 0 };
    for (const id of p.bad.filter((x) => !b.bad.includes(x))) out.push({ page: p.page, what: 'a text does not fit its box', text: text(id) });
    for (const pair of p.overlaps.filter((x) => !b.overlaps.includes(x))) { const [x, y] = pair.split('+'); out.push({ page: p.page, what: 'two texts overlap', text: `${text(x)} / ${text(y)}` }); }
    if (p.below > b.below) out.push({ page: p.page, what: 'content runs past the bottom of the page' });
  }
  return out;
}

