import { esc } from './assets.js';

/*
 * Drag-and-drop edits on the HTML documents (owner, 2026-11-12: "i need my editor. its just content editor. where is
 * my drag n drop editor?"). The pages stay the template's own HTML (printed by Chromium, exact); what the owner does
 * on a page is stored beside the words, in content.html.edits:
 *   els:   { "<page>:<path>": { tx, ty, w, h, color, bg, size, weight, radius, z, hidden, text } }
 *          one entry per element moved, resized, recoloured, hidden or retyped; the key is the element's place in its
 *          page (child indexes), the same in the page view and in the PDF because both come from applyEdits();
 *   added: [{ id, page, type: text | image | box, x, y, w, h, text, src, color, bg, size, weight, radius, align, z }]
 * Every element of a page gets data-k="<key>" so the editor in the browser can find it. Rewriting the words of the
 * document ("Write it again") starts with no edits.
 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : undefined; };
const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : v === 'none' ? 'none' : undefined);
const KEY = /^\d{1,3}:[\d.]{0,120}$/;
const SRC = /^(upload:images\/[\w-]+\.(jpg|png)|asset:[\w./-]+)$/;

function cleanEl(e) {
  if (!e || typeof e !== 'object') return null;
  const o = {
    tx: num(e.tx, -3000, 3000), ty: num(e.ty, -3000, 3000), w: num(e.w, 4, 3000), h: num(e.h, 4, 3000),
    color: hex(e.color), bg: hex(e.bg), size: num(e.size, 4, 300), weight: [300, 400, 500, 600, 700, 800].includes(Number(e.weight)) ? Number(e.weight) : undefined,
    radius: num(e.radius, 0, 500), z: num(e.z, 0, 99), hidden: e.hidden ? true : undefined,
    text: typeof e.text === 'string' ? e.text.slice(0, 2000) : undefined,
  };
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return Object.keys(o).length ? o : null;
}
function cleanAdded(a) {
  if (!a || typeof a !== 'object' || !['text', 'image', 'box'].includes(a.type)) return null;
  const o = {
    id: /^[\w-]{2,30}$/.test(a.id || '') ? a.id : `a${Math.random().toString(36).slice(2, 9)}`, type: a.type, page: num(a.page, 1, 200) || 1,
    x: num(a.x, -500, 3000) ?? 40, y: num(a.y, -500, 3000) ?? 40, w: num(a.w, 4, 3000) ?? 200, h: num(a.h, 4, 3000) ?? 60,
    color: hex(a.color), bg: hex(a.bg), size: num(a.size, 4, 300), weight: [300, 400, 500, 600, 700, 800].includes(Number(a.weight)) ? Number(a.weight) : undefined,
    radius: num(a.radius, 0, 500), z: num(a.z, 0, 99), align: ['left', 'center', 'right'].includes(a.align) ? a.align : undefined,
    text: a.type === 'text' ? String(a.text ?? '').slice(0, 2000) : undefined, src: a.type === 'image' && SRC.test(a.src || '') ? a.src : undefined,
  };
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return a.type === 'image' && !o.src ? null : o;
}
/** Edits as sent by the browser → only known keys and values. */
export function cleanEdits(e) {
  const els = {};
  for (const [k, v] of Object.entries(e?.els || {}).slice(0, 2000)) { if (KEY.test(k)) { const c = cleanEl(v); if (c) els[k] = c; } }
  const added = (Array.isArray(e?.added) ? e.added : []).slice(0, 300).map(cleanAdded).filter(Boolean);
  return { els, added };
}
export const hasEdits = (e) => !!e && (Object.keys(e.els || {}).length > 0 || (e.added || []).length > 0);

const textHtml = (t) => esc(t).replace(/\n/g, '<br>');
function styleOf(o) {
  const s = [];
  if (o.tx || o.ty) s.push(`translate: ${o.tx || 0}px ${o.ty || 0}px`);
  if (o.w) s.push(`width: ${o.w}px; max-width: none; flex: 0 0 auto; box-sizing: border-box`);
  if (o.h) s.push(`height: ${o.h}px; min-height: 0; box-sizing: border-box`);
  if (o.color) s.push(`color: ${o.color}`);
  if (o.bg) s.push(o.bg === 'none' ? 'background: none' : `background: ${o.bg}`);
  if (o.size) s.push(`font-size: ${o.size}px`);
  if (o.weight) s.push(`font-weight: ${o.weight}`);
  if (o.radius !== undefined) s.push(`border-radius: ${o.radius}px`);
  if (o.z) s.push(`position: relative; z-index: ${o.z}`);
  if (o.hidden) s.push('visibility: hidden');
  return s.join('; ');
}
function withStyle(attrs, extra) {
  if (!extra) return attrs;
  const m = /\sstyle="([^"]*)"/.exec(attrs);
  if (m) return attrs.replace(m[0], ` style="${m[1].replace(/;\s*$/, '')}; ${extra}"`);
  return `${attrs} style="${extra}"`;
}
async function addedHtml(a, resolveSrc) {
  const box = `position: absolute; left: ${a.x}px; top: ${a.y}px; width: ${a.w}px; height: ${a.h}px; box-sizing: border-box; z-index: ${10 + (a.z || 0)}`;
  if (a.type === 'image') {
    const src = await resolveSrc(a.src);
    if (!src) return '';
    return `<div data-a="${a.id}" style="${box}; overflow: hidden; border-radius: ${a.radius || 0}px"><img src="${src}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block"></div>`;
  }
  if (a.type === 'box') return `<div data-a="${a.id}" style="${box}; background: ${a.bg && a.bg !== 'none' ? a.bg : '#D7261E'}; border-radius: ${a.radius ?? 20}px"></div>`;
  return `<div data-a="${a.id}" style="${box}; color: ${a.color || '#111111'}; font-size: ${a.size || 18}px; font-weight: ${a.weight || 500}; line-height: 1.35; text-align: ${a.align || 'left'}${a.bg && a.bg !== 'none' ? `; background: ${a.bg}; padding: 8px 12px` : ''}${a.radius ? `; border-radius: ${a.radius}px` : ''}">${textHtml(a.text || '')}</div>`;
}

/**
 * The document's HTML with data-k keys on every element of every page and the edits applied. The HTML is the
 * templates' own output (well formed, no scripts; <style> blocks are skipped as raw text).
 */
export async function applyEdits(html, edits, resolveSrc = async () => null) {
  const els = edits?.els || {};
  const added = edits?.added || [];
  const out = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0, m;
  let page = null;           // { n, depth, counts: [], path: [] }
  let skip = null;           // replacing an element's content: { depth } of that element
  let depth = 0;
  const pageAdds = async (n) => (await Promise.all(added.filter((a) => a.page === n).map((a) => addedHtml(a, resolveSrc)))).join('');
  while ((m = re.exec(html))) {
    const [all, close, tagRaw, attrsRaw] = m;
    const tag = (tagRaw || '').toLowerCase();
    if (!skip) out.push(html.slice(last, m.index));
    last = m.index + all.length;
    if (all.startsWith('<!--')) { if (!skip) out.push(all); continue; }
    if (!close && (tag === 'style' || tag === 'script')) { // raw text up to the closing tag
      const end = html.indexOf(`</${tag}>`, last);
      const stop = end < 0 ? html.length : end + tag.length + 3;
      if (!skip) out.push(all + html.slice(last, stop));
      last = stop; re.lastIndex = stop;
      continue;
    }
    const selfClose = /\/\s*$/.test(attrsRaw) || VOID.has(tag);
    if (close) {
      if (skip) { // inside an element whose text was replaced: its old content is dropped
        if (depth > skip.depth) { depth--; continue; }
        skip = null; // the replaced element itself closes: handled below
      }
      if (page && depth === page.depth) { // the page closes: added elements go last, on top
        if (!skip) out.push(await pageAdds(page.n));
        page = null;
      } else if (page) { page.path.pop(); page.counts.pop(); }
      depth--;
      if (!skip) out.push(all);
      continue;
    }
    if (skip) { if (!selfClose) depth++; continue; }
    let attrs = attrsRaw;
    if (!page) {
      const pm = /\sdata-page="(\d+)"/.exec(attrs);
      if (pm && !selfClose) {
        depth++;
        page = { n: Number(pm[1]), depth, counts: [0], path: [] };
        const n = page.n;
        if (added.some((a) => a.page === n)) attrs = withStyle(attrs, 'position: relative');
        out.push(`<${tagRaw}${attrs} data-k="${n}:">`);
        continue;
      }
      out.push(all);
      if (!selfClose) depth++;
      continue;
    }
    // an element inside a page (line breaks are not elements you can select)
    if (tag === 'br' || tag === 'wbr') { out.push(all); continue; }
    const idx = page.counts[page.counts.length - 1]++;
    const key = `${page.n}:${[...page.path, idx].join('.')}`;
    const ed = els[key];
    attrs = withStyle(attrs, ed ? styleOf(ed) : '');
    out.push(`<${tagRaw}${attrs.replace(/\s*\/\s*$/, '')} data-k="${key}"${/\/\s*$/.test(attrsRaw) ? ' /' : ''}>`);
    if (selfClose) continue;
    depth++;
    page.path.push(idx); page.counts.push(0);
    if (ed && typeof ed.text === 'string') { out.push(textHtml(ed.text)); skip = { depth }; }
  }
  out.push(html.slice(last));
  return out.join('');
}
