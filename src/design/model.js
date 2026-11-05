import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ASSETS } from '../pdf/brand.js';
import { ICONS } from './icons.js';
import { saveUpload, readUpload, UPLOADS } from '../storage.js';

/*
 * Design documents: { pages: [{ id, w, h, bg: { color, image }, elements: [...] }] }
 * Element types (all have id, type, x, y, w, h in points; optional opacity):
 *   text    { text, font: PR|PM|PS|PB (Poppins) | UM|US (Unbounded) | HR|HM|HS (Hanken Grotesk), size, color, align, lh, ls,
 *             list: ''|'dot'|'icon', gap, outline (stroke width, 0 = filled), rot (degrees),
 *             hl (colour for **marked** words, '' = none), arc (radius: text runs around a circle, 0 = off) }
 *   image   { src, fit: cover|contain|fill, radius, ha: left|center|right, va: top|center|bottom }
 *   shape   { shape: rect|ellipse|line (horizontal, through the box's middle; dash: '' | 'dot'), fill, stroke, sw, radius, gradient: { angle, stops: [[offset, color, opacity]] } }
 *   icon    { name, color }
 *   pricing { }   → line-item table bound to the document's items
 * Image sources: "asset:<path under assets/>" or "upload:<key in storage.js (Supabase Storage, Vercel Blob or data/uploads)>" or a data: URL.
 */
export { UPLOADS };
export const FONTS = ['PR', 'PM', 'PS', 'PB', 'UM', 'US', 'HR', 'HM', 'HS', 'LR', 'LM', 'LS', 'IR', 'IM', 'IS'];

export const newId = () => 'e' + crypto.randomBytes(5).toString('hex');

/** Disk path for an "asset:" source (files shipped with the app), or null. */
export function srcPath(src) {
  const m = /^(asset):(.+)$/.exec(String(src || ''));
  if (!m) return null;
  const base = ASSETS;
  const p = path.resolve(base, m[2]);
  if (!p.startsWith(path.resolve(base) + path.sep)) return null;
  return fs.existsSync(p) ? p : null;
}

/** Image bytes (or an asset path) for any source: asset:, upload: or data: URL. */
export async function loadImage(src) {
  const s = String(src || '');
  if (/^data:image\/(png|jpe?g);base64,/.test(s)) return Buffer.from(s.split(',')[1], 'base64');
  if (s.startsWith('upload:')) return readUpload(s.slice(7));
  return srcPath(s);
}

/** Saves a data-URL image under uploads/<dir>/ and returns its "upload:" source. */
export async function saveDataUrl(dataUrl, dir, name = null) {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Upload a PNG or JPEG image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8e6) throw new Error('Image too large (max 8 MB)');
  const ext = m[1] === 'png' ? 'png' : 'jpg';
  const file = `${name || crypto.randomBytes(8).toString('hex')}.${ext}`;
  await saveUpload(`${dir}/${file}`, buf, ext === 'png' ? 'image/png' : 'image/jpeg');
  return `upload:${dir}/${file}`;
}

// ------------------------------------------------------------- sanitising
const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim() : d);
const str = (v, max) => String(v ?? '').slice(0, max);
const SRC_RE = /^(asset|upload):[\w\-./]+$/;

function cleanGradient(g) {
  if (!g || !Array.isArray(g.stops) || g.stops.length < 2) return null;
  return { angle: num(g.angle, -360, 360, 180), stops: g.stops.slice(0, 6).map((s) => [num(s[0], 0, 1, 0), color(s[1], '#ffffff'), num(s[2], 0, 1, 1)]) };
}

export function cleanElement(e) {
  if (!e || typeof e !== 'object') return null;
  const base = { id: /^[\w-]{2,40}$/.test(e.id || '') ? e.id : newId(), type: e.type, x: num(e.x, -5000, 5000, 0), y: num(e.y, -5000, 5000, 0), w: num(e.w, 1, 5000, 100), h: num(e.h, 1, 5000, 40), opacity: num(e.opacity, 0, 1, 1) };
  if (e.locked) base.locked = true;
  switch (e.type) {
    case 'text':
      return { ...base, text: str(e.text, 8000), font: FONTS.includes(e.font) ? e.font : 'PR', size: num(e.size, 4, 400, 16), color: color(e.color, '#141413'), align: ['left', 'center', 'right'].includes(e.align) ? e.align : 'left', lh: num(e.lh, 0.7, 3, 1.4), ls: num(e.ls, -20, 40, 0), list: ['', 'dot', 'icon'].includes(e.list) ? e.list : '', gap: num(e.gap, 0, 200, 8), outline: num(e.outline, 0, 20, 0), rot: num(e.rot, -180, 180, 0), hl: e.hl ? color(e.hl, '') : '', arc: num(e.arc, 0, 2000, 0) };
    case 'image':
      return { ...base, src: SRC_RE.test(e.src || '') ? e.src : '', fit: ['cover', 'contain', 'fill'].includes(e.fit) ? e.fit : 'cover', radius: num(e.radius, 0, 1000, 0), ha: ['left', 'center', 'right'].includes(e.ha) ? e.ha : 'center', va: ['top', 'center', 'bottom'].includes(e.va) ? e.va : 'center' };
    case 'shape':
      return { ...base, shape: ['ellipse', 'line'].includes(e.shape) ? e.shape : 'rect', dash: e.dash === 'dot' ? 'dot' : '', fill: e.fill === 'none' ? 'none' : color(e.fill, '#2d4bd8'), stroke: e.stroke && e.stroke !== 'none' ? color(e.stroke, '#ffffff') : 'none', sw: num(e.sw, 0, 50, 1), radius: num(e.radius, 0, 1000, 0), gradient: cleanGradient(e.gradient) };
    case 'icon':
      return { ...base, name: ICONS[e.name] ? e.name : 'star4', color: color(e.color, '#ffffff') };
    case 'pricing':
      return { ...base };
    default:
      return null;
  }
}

export function cleanDesign(d) {
  const pages = (Array.isArray(d?.pages) ? d.pages : []).slice(0, 80).map((p) => ({
    id: /^[\w-]{2,40}$/.test(p.id || '') ? p.id : newId(),
    w: num(p.w, 100, 3000, 595.28), h: num(p.h, 100, 3000, 841.89),
    bg: { color: color(p.bg?.color, '#ffffff'), image: SRC_RE.test(p.bg?.image || '') ? p.bg.image : '' },
    elements: (Array.isArray(p.elements) ? p.elements : []).slice(0, 400).map(cleanElement).filter(Boolean),
  }));
  if (!pages.length) throw new Error('A design needs at least one page');
  return { pages };
}

// ----------------------------------------------- AI-facing view + operations
/** Compact description of the design for the AI assistant (ids, types, text, key styles). */
export function describeDesign(design) {
  return design.pages.map((p, i) => ({
    page: i + 1,
    size: `${Math.round(p.w)}x${Math.round(p.h)}`,
    background: p.bg.image ? `image + ${p.bg.color}` : p.bg.color,
    elements: p.elements.map((e) => {
      const o = { id: e.id, type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h) };
      if (e.type === 'text') Object.assign(o, { text: e.text.length > 600 ? e.text.slice(0, 600) + '…' : e.text, font: e.font, size: e.size, color: e.color, align: e.align, list: e.list || undefined });
      if (e.type === 'shape') Object.assign(o, { shape: e.shape, fill: e.fill, stroke: e.stroke !== 'none' ? e.stroke : undefined });
      if (e.type === 'image') Object.assign(o, { src: e.src.replace(/^(asset|upload):/, '') });
      if (e.type === 'icon') Object.assign(o, { name: e.name, color: e.color });
      return o;
    }),
  }));
}

const PROP_KEYS = {
  text: ['x', 'y', 'w', 'h', 'opacity', 'font', 'size', 'color', 'align', 'lh', 'ls', 'list', 'gap', 'text', 'outline', 'rot', 'hl', 'arc'],
  image: ['x', 'y', 'w', 'h', 'opacity', 'fit', 'radius'],
  shape: ['x', 'y', 'w', 'h', 'opacity', 'shape', 'fill', 'stroke', 'sw', 'radius'],
  icon: ['x', 'y', 'w', 'h', 'opacity', 'name', 'color'],
  pricing: ['x', 'y', 'w'],
};

/**
 * Applies the assistant's operations to a design (and the item list). Unknown ids or
 * properties are skipped, everything is re-sanitised. Returns { design, items, applied, skipped }.
 */
export function applyOps(design, items, ops) {
  const d = JSON.parse(JSON.stringify(design));
  let its = items ? JSON.parse(JSON.stringify(items)) : items;
  let applied = 0;
  const skipped = [];
  const pageAt = (n) => d.pages[Number(n) - 1];
  const find = (id) => { for (const p of d.pages) { const i = p.elements.findIndex((e) => e.id === id); if (i >= 0) return { p, i, e: p.elements[i] }; } return null; };
  const props = (op) => { try { const o = JSON.parse(op.props_json || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
  for (const op of ops || []) {
    try {
      switch (op.op) {
        case 'set_text': { const f = find(op.element); if (!f || f.e.type !== 'text') throw new Error('no text element'); f.e.text = String(op.text ?? ''); break; }
        case 'set_props': {
          const f = find(op.element); if (!f) throw new Error('no element');
          const pr = props(op);
          for (const k of PROP_KEYS[f.e.type] || []) if (k in pr) f.e[k] = pr[k];
          if (f.e.type === 'shape' && 'fill' in pr) f.e.gradient = null;
          break;
        }
        case 'delete_element': { const f = find(op.element); if (!f) throw new Error('no element'); f.p.elements.splice(f.i, 1); break; }
        case 'add_text': {
          const p = pageAt(op.page); if (!p) throw new Error('no page');
          const pr = props(op);
          p.elements.push({ id: newId(), type: 'text', x: 60, y: 60, w: Math.min(500, p.w - 120), h: 40, size: 18, color: '#141413', font: 'PR', ...pr, text: String(op.text || pr.text || '') });
          break;
        }
        case 'add_shape': { const p = pageAt(op.page); if (!p) throw new Error('no page'); p.elements.push({ id: newId(), type: 'shape', shape: 'rect', x: 60, y: 60, w: 200, h: 100, fill: '#2d4bd8', ...props(op) }); break; }
        case 'set_page_bg': { const p = pageAt(op.page); if (!p) throw new Error('no page'); const pr = props(op); if (pr.color) p.bg.color = pr.color; if (pr.remove_image) p.bg.image = ''; break; }
        case 'duplicate_page': { const p = pageAt(op.page); if (!p) throw new Error('no page'); const copy = JSON.parse(JSON.stringify(p)); copy.id = newId(); copy.elements.forEach((e) => (e.id = newId())); d.pages.splice(Number(op.page), 0, copy); break; }
        case 'delete_page': { if (d.pages.length < 2 || !pageAt(op.page)) throw new Error('cannot delete'); d.pages.splice(Number(op.page) - 1, 1); break; }
        case 'move_page': { const to = Number(props(op).to); const p = pageAt(op.page); if (!p || !(to >= 1 && to <= d.pages.length)) throw new Error('bad move'); d.pages.splice(Number(op.page) - 1, 1); d.pages.splice(to - 1, 0, p); break; }
        case 'set_items': {
          if (!Array.isArray(its)) throw new Error('this document has no price list');
          const list = props(op).items;
          if (!Array.isArray(list) || !list.length) throw new Error('no items');
          its = list.map((i) => ({ name: String(i.name || '').slice(0, 200), price: Math.max(0, Math.round(Number(i.price) || 0)) })).filter((i) => i.name);
          break;
        }
        default: throw new Error(`unknown op ${op.op}`);
      }
      applied++;
    } catch (e) {
      skipped.push(`${op.op}${op.element ? ` ${op.element}` : ''}: ${e.message}`);
    }
  }
  return { design: cleanDesign(d), items: its, applied, skipped };
}

/** Replaces {{tokens}} (and a template's sample client name) in every text element. */
export function fillTokens(design, vars, sampleCompany = '') {
  const d = JSON.parse(JSON.stringify(design));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const p of d.pages) for (const e of p.elements) {
    if (e.type !== 'text') continue;
    e.text = e.text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? vars[k] : m));
    if (sampleCompany && vars.company) e.text = e.text.replace(new RegExp(esc(sampleCompany), 'gi'), vars.company);
  }
  return d;
}

/** Copies a design with fresh page and element ids. */
export function cloneDesign(design) {
  const d = JSON.parse(JSON.stringify(design));
  for (const p of d.pages) { p.id = newId(); for (const e of p.elements) e.id = newId(); }
  return d;
}
