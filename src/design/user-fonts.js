import crypto from 'node:crypto';
import fs from 'node:fs';
import { create as fontkitCreate } from 'fontkit';
import { registerSchema, get, all, insert } from '../db.js';
import { saveUpload, readUpload } from '../storage.js';
import { nowISO } from '../util.js';
import { fontPath } from '../pdf/brand.js';

/*
 * Fonts of imported PDF templates (owner, 2026-11-10: "the pdf templates import is not same as the pdf, its changing
 * the design"). The importer used to set every text in Poppins; now each font of the PDF gets a code X<8 hex>:
 *  - google:   the same family and weight from Google Fonts (full character set, OFL), when it is there;
 *  - embedded: the font file the PDF carries (pdf.js converts it), which is usually a subset: it only has the
 *              letters the PDF used. Text with a letter it lacks is set in `fallback` (a built-in face of the same
 *              weight), as a whole element, in the editor and the PDF alike (effectiveFont), so both still match.
 * Files live in storage (fonts/<code>.ttf|otf) and are served at /fonts/x/<code>; the PDF renderer loads the ones a
 * design uses (preloadUserFonts) and registers them on its documents (registerUserFonts).
 */
registerSchema(`
CREATE TABLE IF NOT EXISTS design_fonts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  family TEXT,
  weight INTEGER,
  italic INTEGER DEFAULT 0,
  source TEXT,
  file TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);`);

export const isUserFont = (code) => /^X[0-9a-f]{8}$/.test(String(code || ''));
const WEIGHTS = [[/thin|hairline/, 100], [/extra.?light|ultra.?light/, 200], [/light/, 300], [/semi.?bold|demi.?bold/, 600], [/extra.?bold|ultra.?bold/, 800], [/black|heavy/, 900], [/bold/, 700], [/medium/, 500]];
// Fonts PDFs use without embedding them (or office fonts): metric-compatible open families on Google Fonts.
const ALIASES = { arial: 'Arimo', helvetica: 'Arimo', 'helvetica neue': 'Arimo', 'times new roman': 'Tinos', times: 'Tinos', 'courier new': 'Cousine', courier: 'Cousine', calibri: 'Carlito', cambria: 'Caladea', georgia: 'Gelasio' };
// Built-in faces for letters an embedded subset lacks: [code, file] by weight, sans or serif.
const FALLBACK = { sans: [[450, 'IR'], [550, 'IM'], [1000, 'IS']], serif: [[450, 'LR'], [550, 'LM'], [1000, 'LS']] };

/** "ABCDEF+OpenSauceOne-SemiBoldItalic" → { family: 'Open Sauce One', weight: 600, italic: true } */
export function parseFontName(raw, { bold = false, black = false, italic = false } = {}) {
  let n = String(raw || '').replace(/^[A-Z]{6}\+/, '').replace(/(PS)?MT$/, '').replace(/PSMT/, '');
  let [fam, style = ''] = n.split(/[-,]/);
  const words = `${style} ${fam}`.toLowerCase();
  let weight = 400;
  for (const [re, w] of WEIGHTS) if (re.test(style.toLowerCase()) || (!style && re.test(words))) { weight = w; break; }
  if (weight === 400 && (bold || black)) weight = black ? 900 : 700;
  const it = italic || /italic|oblique/i.test(style) || /italic|oblique/i.test(fam);
  if (!style) fam = fam.replace(/(Thin|ExtraLight|UltraLight|Light|Regular|Book|Medium|SemiBold|DemiBold|ExtraBold|UltraBold|Bold|Black|Heavy|Italic|Oblique)+$/i, '');
  fam = fam.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([0-9])([A-Za-z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  return { family: fam, weight, italic: it };
}
const familyCandidates = (family, embeddedFamily) => {
  const out = [];
  const add = (f) => { f = String(f || '').trim(); if (f && !out.some((x) => x.toLowerCase() === f.toLowerCase())) out.push(f); };
  add(ALIASES[family.toLowerCase()]);
  add(family);
  add(family.replace(/\s*\d+\s*pt$/i, '').replace(/\s+(Variable|VF)$/i, '')); // "Inter 18pt" → Inter
  if (embeddedFamily) add(String(embeddedFamily).replace(/\s+(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)$/i, ''));
  add(ALIASES[out.at(-1)?.toLowerCase()]);
  return out.slice(0, 4);
};

async function fromGoogle(family, weight, italic) {
  const q = `${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@${italic ? 1 : 0},${weight}`;
  const r = await fetch(`https://fonts.googleapis.com/css2?family=${q}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return null;
  const m = (await r.text()).match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
  if (!m) return null;
  const f = await fetch(m[1], { signal: AbortSignal.timeout(15000) }).catch(() => null);
  return f?.ok ? Buffer.from(await f.arrayBuffer()) : null;
}

function metricsOf(buf) {
  const f = fontkitCreate(buf);
  const u = f.unitsPerEm || 1000;
  return { font: f, ascent: f.ascent / u, descent: Math.abs(f.descent) / u, lineGap: (f.lineGap || 0) / u, cff: !!f['CFF '] || !!f.CFF2 };
}
const fbMetrics = new Map();
function fallbackMetrics(code) {
  if (!fbMetrics.has(code)) {
    try { const m = metricsOf(fs.readFileSync(fontPath(code))); fbMetrics.set(code, { ascent: m.ascent, descent: m.descent, lineGap: m.lineGap }); } catch { fbMetrics.set(code, { ascent: 0.969, descent: 0.242, lineGap: 0 }); }
  }
  return fbMetrics.get(code);
}
/*
 * pdf.js moves most glyphs of an embedded font to private-use code points (it found live 2026-11-10: "Why Choose Us"
 * had 8 of its letters only there), so typed text would not reach them. The importer sends pdf.js's own map
 * (letter → the font char it uses); this writes a new cmap table with the real letters (and the ones that already
 * worked) into the font file: format 4 for the BMP and format 12 when there is more.
 */
export function withCmap(buf, font, map) {
  const uni = new Map();
  for (const c of font.characterSet || []) if (c >= 32 && !(c >= 0xe000 && c <= 0xf8ff)) { const g = font.glyphForCodePoint(c); if (g?.id) uni.set(c, g.id); }
  for (const [u, fc] of map || []) {
    const cp = typeof u === 'string' && [...u].length === 1 ? u.codePointAt(0) : null;
    if (!cp || cp < 32 || !Number.isInteger(fc)) continue;
    const g = font.glyphForCodePoint(fc);
    if (g?.id && !uni.has(cp)) uni.set(cp, g.id);
  }
  if (!uni.size) return null;
  // Canva subsets often have no space (words are placed, not spaced): the browser then borrows one from another font
  // and pdfkit draws a missing-glyph box (found 2026-11-10). Map the space and no-break space to an unused empty glyph
  // and give it a space's width (0.25 em), so the editor and the PDF use the same space from this file.
  let hmtx = null;
  if (!uni.has(32) && font.directory?.tables?.hmtx && font.directory?.tables?.glyf) {
    const used = new Set(uni.values());
    const nm = font.hhea?.numberOfMetrics || 0;
    for (let gid = 1; gid < Math.min(nm, font.numGlyphs); gid++) {
      if (used.has(gid)) continue;
      let empty = false;
      try { empty = font.getGlyph(gid).path.commands.length === 0; } catch { empty = false; }
      if (!empty) continue;
      const t = font.directory.tables.hmtx;
      hmtx = Buffer.from(buf.subarray(t.offset, t.offset + t.length));
      hmtx.writeUInt16BE(Math.round((font.unitsPerEm || 1000) * 0.25), gid * 4);
      hmtx.writeInt16BE(0, gid * 4 + 2);
      uni.set(32, gid); uni.set(0xa0, gid);
      break;
    }
  }
  const codes = [...uni.keys()].sort((a, b) => a - b);
  const bmp = codes.filter((c) => c <= 0xffff);
  // format 4: one segment per character (subsets are small) + the closing 0xFFFF segment
  const seg = bmp.length + 1, f4len = 16 + seg * 8;
  const f4 = Buffer.alloc(f4len);
  const sr = 2 ** Math.floor(Math.log2(seg)) * 2;
  f4.writeUInt16BE(4, 0); f4.writeUInt16BE(f4len, 2); f4.writeUInt16BE(0, 4); f4.writeUInt16BE(seg * 2, 6);
  f4.writeUInt16BE(sr, 8); f4.writeUInt16BE(Math.log2(sr / 2), 10); f4.writeUInt16BE(seg * 2 - sr, 12);
  const ends = 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
  [...bmp, 0xffff].forEach((c, i) => {
    f4.writeUInt16BE(c, ends + i * 2); f4.writeUInt16BE(c, starts + i * 2);
    f4.writeUInt16BE(c === 0xffff && i === bmp.length ? 1 : (uni.get(c) - c + 0x10000) % 0x10000, deltas + i * 2);
    f4.writeUInt16BE(0, ranges + i * 2);
  });
  const big = codes.some((c) => c > 0xffff);
  const f12 = big ? Buffer.alloc(16 + codes.length * 12) : null;
  if (f12) {
    f12.writeUInt16BE(12, 0); f12.writeUInt32BE(f12.length, 4); f12.writeUInt32BE(codes.length, 12);
    codes.forEach((c, i) => { f12.writeUInt32BE(c, 16 + i * 12); f12.writeUInt32BE(c, 20 + i * 12); f12.writeUInt32BE(uni.get(c), 24 + i * 12); });
  }
  const subs = [[0, 3, f4], [3, 1, f4], ...(f12 ? [[0, 4, f12], [3, 10, f12]] : [])];
  const head = Buffer.alloc(4 + subs.length * 8);
  head.writeUInt16BE(0, 0); head.writeUInt16BE(subs.length, 2);
  let off = head.length;
  const bodies = [];
  const at = new Map();
  subs.forEach(([p, e, t], i) => {
    if (!at.has(t)) { at.set(t, off); bodies.push(t); off += t.length; }
    head.writeUInt16BE(p, 4 + i * 8); head.writeUInt16BE(e, 6 + i * 8); head.writeUInt32BE(at.get(t), 8 + i * 8);
  });
  const file = replaceTable(hmtx ? replaceTable(buf, 'hmtx', hmtx) : buf, 'cmap', Buffer.concat([head, ...bodies]));
  return { file, chars: codes.map((c) => String.fromCodePoint(c)).join('') };
}
const sum32 = (b) => { let s = 0; const p = Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]); for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0; return s; };
/** An sfnt (TrueType / OpenType) file with one table replaced; offsets, checksums and head.checkSumAdjustment redone. */
function replaceTable(buf, tag, data) {
  const n = buf.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16, t = buf.toString('latin1', r, r + 4);
    tables.push({ tag: t, data: t === tag ? data : Buffer.from(buf.subarray(buf.readUInt32BE(r + 8), buf.readUInt32BE(r + 8) + buf.readUInt32BE(r + 12))) });
  }
  if (!tables.some((t) => t.tag === tag)) tables.push({ tag, data });
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const headT = tables.find((t) => t.tag === 'head');
  if (headT) { headT.data = Buffer.from(headT.data); headT.data.writeUInt32BE(0, 8); }
  const dir = Buffer.alloc(12 + tables.length * 16);
  buf.copy(dir, 0, 0, 4);
  const sr = 2 ** Math.floor(Math.log2(tables.length));
  dir.writeUInt16BE(tables.length, 4); dir.writeUInt16BE(sr * 16, 6); dir.writeUInt16BE(Math.log2(sr), 8); dir.writeUInt16BE(tables.length * 16 - sr * 16, 10);
  let off = dir.length;
  const parts = [dir];
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    dir.write(t.tag, r, 4, 'latin1'); dir.writeUInt32BE(sum32(t.data), r + 4); dir.writeUInt32BE(off, r + 8); dir.writeUInt32BE(t.data.length, r + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    parts.push(t.data, Buffer.alloc(pad));
    t.off = off; off += t.data.length + pad;
  });
  const out = Buffer.concat(parts);
  if (headT) out.writeUInt32BE((0xb1b0afba - sum32(out)) >>> 0, headT.off + 8);
  return out;
}

const SERIF = /serif|garamond|times|tinos|roman|baskerville|bodoni|playfair|caslon|georgia|gelasio|lora|merriweather|didot|cormorant|libre caslon|crimson|spectral|prata/i;

/**
 * One font of a PDF being imported → its code (made once per family + weight, or per embedded file).
 * data = the font file pdf.js built from the PDF (base64), used when Google Fonts does not have the family.
 */
export async function resolveFont({ name, bold, black, italic, data, map }) {
  const p = parseFontName(name, { bold, black, italic });
  const serif = SERIF.test(`${p.family} ${name}`);
  const fallback = (serif ? FALLBACK.serif : FALLBACK.sans).find(([w]) => p.weight <= w)[1];
  let embedded = null;
  if (data) { try { const buf = Buffer.from(String(data), 'base64'); embedded = { buf, ...metricsOf(buf) }; } catch { embedded = null; } }
  for (const fam of familyCandidates(p.family, embedded?.font?.familyName)) {
    const code = 'X' + crypto.createHash('sha256').update(`google:${fam.toLowerCase()}:${p.weight}:${p.italic ? 1 : 0}`).digest('hex').slice(0, 8);
    const have = await get(`SELECT * FROM design_fonts WHERE code = :code`, { code });
    if (have) return rowOut(have);
    const buf = await fromGoogle(fam, p.weight, p.italic);
    if (!buf) continue;
    let m; try { m = metricsOf(buf); } catch { continue; }
    return rowOut(await save({ code, name: String(name).slice(0, 120), family: fam, weight: p.weight, italic: p.italic, source: 'google', buf, ext: 'ttf', meta: { ascent: m.ascent, descent: m.descent, lineGap: m.lineGap, chars: null, fallback } }));
  }
  if (embedded) {
    const code = 'X' + crypto.createHash('sha256').update(embedded.buf).digest('hex').slice(0, 8);
    const have = await get(`SELECT * FROM design_fonts WHERE code = :code`, { code });
    if (have) return rowOut(have);
    // pdf.js moves glyphs to private-use code points: give the real letters back to them (withCmap); only real characters count
    let fixed = null;
    try { fixed = withCmap(embedded.buf, embedded.font, Array.isArray(map) ? map.slice(0, 5000) : []); if (fixed) fontkitCreate(fixed.file); } catch { fixed = null; }
    const chars = fixed?.chars ?? [...new Set(embedded.font.characterSet || [])].filter((c) => c >= 32 && !(c >= 0xe000 && c <= 0xf8ff)).map((c) => String.fromCodePoint(c)).join('');
    if (chars.length) return rowOut(await save({ code, name: String(name).slice(0, 120), family: p.family, weight: p.weight, italic: p.italic, source: 'embedded', buf: fixed?.file || embedded.buf, ext: embedded.cff ? 'otf' : 'ttf', meta: { ascent: embedded.ascent, descent: embedded.descent, lineGap: embedded.lineGap, chars, fallback } }));
  }
  // nothing usable: the importer sets this text in the built-in face of the same weight
  return { code: fallback, builtin: true, family: p.family, weight: p.weight, ...fallbackMetrics(fallback), chars: null, fallback };
}

async function save({ code, name, family, weight, italic, source, buf, ext, meta }) {
  const file = await saveUpload(`fonts/${code}.${ext}`, buf, ext === 'otf' ? 'font/otf' : 'font/ttf');
  await insert('design_fonts', { code, name, family, weight, italic: italic ? 1 : 0, source, file, meta_json: meta, created_at: nowISO() }).catch(() => {}); // a second import at the same moment
  return get(`SELECT * FROM design_fonts WHERE code = :code`, { code });
}
function rowOut(r) {
  let m = {};
  try { m = typeof r.meta_json === 'string' ? JSON.parse(r.meta_json) : r.meta_json || {}; } catch { /* old row */ }
  return { code: r.code, name: r.name, family: r.family, weight: r.weight, italic: !!r.italic, source: r.source, ascent: m.ascent, descent: m.descent, lineGap: m.lineGap || 0, chars: m.chars ?? null, fallback: m.fallback || 'IR', fallback_metrics: fallbackMetrics(m.fallback || 'IR') };
}
export const listUserFonts = async () => (await all(`SELECT * FROM design_fonts ORDER BY id`)).map(rowOut);
export async function fontFile(code) {
  if (!isUserFont(code)) return null;
  const r = await get(`SELECT file FROM design_fonts WHERE code = :code`, { code });
  if (!r) return null;
  const buf = await readUpload(r.file);
  return buf ? { buf, type: r.file.endsWith('.otf') ? 'font/otf' : 'font/ttf' } : null;
}

// ------------------------------------------------------------------ PDF side (render-pdf.js)
const LOADED = new Map(); // code → { buf, row }
/** Loads the imported fonts a design uses (before the synchronous drawing). */
export async function preloadUserFonts(design) {
  const codes = new Set();
  for (const p of design?.pages || []) for (const e of p.elements || []) if (e.type === 'text' && isUserFont(e.font) && !LOADED.has(e.font)) codes.add(e.font);
  await Promise.all([...codes].map(async (code) => {
    const r = await get(`SELECT * FROM design_fonts WHERE code = :code`, { code }).catch(() => null);
    const buf = r ? await readUpload(r.file).catch(() => null) : null;
    if (buf) LOADED.set(code, { buf, row: rowOut(r) });
  }));
}
/** Registers the loaded imported fonts on a pdfkit document (an unknown one falls back to Poppins). */
export function registerUserFonts(doc) {
  for (const [code, f] of LOADED) { try { doc.registerFont(code, f.buf); } catch { /* broken file: effectiveFont falls back */ } }
}
export const userFontMetrics = (code) => LOADED.get(code)?.row || null;
/** The face a text element is really set in: an imported subset lacking one of its letters → its fallback face. */
export function effectiveFont(e) {
  if (!isUserFont(e.font)) return e.font;
  const f = LOADED.get(e.font)?.row;
  if (!f) return 'PR';
  if (f.chars == null) return e.font;
  for (const ch of String(e.text || '').replace(/\*\*/g, '')) if (ch.trim() && !f.chars.includes(ch)) return f.fallback;
  return e.font;
}
