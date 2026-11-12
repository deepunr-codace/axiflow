import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { registerFonts, toBuffer, clean } from '../pdf/brand.js';
import { ICONS } from './icons.js';
import { srcPath, loadImage } from './model.js';
import { EXTRA_FONTS } from './fonts.js';
import { isUserFont, userFontMetrics, preloadUserFonts, registerUserFonts, effectiveFont } from './user-fonts.js';

/*
 * Renders a design to PDF. Text metrics follow CSS so the PDF matches the editor:
 * line box = lh × size, glyphs sit in the middle of the line box. Content area = the font's
 * hhea ascent + descent (Poppins 1.4, Unbounded 1.24, Hanken Grotesk 1.303 × size), as in Chrome.
 */
const CONTENT = 1.4, PDFKIT_LH = 1.5; // Poppins (the pricing table)
// Per font code: [content area, pdfkit line height] in em (from pdfkit's own font metrics, hhea).
const METRICS = { UM: [1.24, 1.24], US: [1.24, 1.24], HR: [1.303, 1.303], HM: [1.303, 1.303], HS: [1.303, 1.303],
  LR: [1.28, 1.28], LM: [1.28, 1.28], LS: [1.28, 1.28], IR: [1.21, 1.21], IM: [1.21, 1.21], IS: [1.21, 1.21] };
// The classic typefaces (src/design/fonts.js): measured once from the font file (hhea ascent − descent, + line gap).
let mdoc = null;
function measuredMetrics(font) {
  try {
    mdoc ??= scratchDoc();
    mdoc.font(font);
    const f = mdoc._font;
    const content = (f.ascender - f.descender) / 1000;
    return (METRICS[font] = [content, content + (f.lineGap || 0) / 1000]);
  } catch { return (METRICS[font] = [CONTENT, PDFKIT_LH]); }
}
const fm = (font) => METRICS[font] || (EXTRA_FONTS[font] ? measuredMetrics(font) : isUserFont(font) ? userMetrics(font) : [CONTENT, PDFKIT_LH]);
// A font of an imported PDF: its own hhea numbers (stored when it was imported), as pdfkit and Chrome use them.
const userMetrics = (font) => { const m = userFontMetrics(font); return m ? [m.ascent + m.descent, m.ascent + m.descent + (m.lineGap || 0)] : [CONTENT, PDFKIT_LH]; };
/** CSS line-height "normal" (content area) of a font code, in em. */
export const fontNormal = (font) => fm(font)[0];

export const textOpts = (e) => ({ width: e.w, align: e.align, lineGap: (e.lh - fm(e.font)[1]) * e.size, characterSpacing: e.ls });
/*
 * pdfkit needs room for the space after a line's last word, the browser does not: a line that fills
 * the box exactly would wrap one word earlier in the PDF. So pdfkit gets one space more width, and
 * centred / right-aligned text moves back by half / all of it.
 */
const hang = (doc, e) => doc.font(e.font).fontSize(e.size).widthOfString(' ') + (e.ls || 0);
const wrapOpts = (doc, e, w = e.w) => { const sp = hang(doc, e); return { ...textOpts(e), width: w + sp }; };
/** Text as pdfkit gets it: every paragraph ends in a space, so its last line wraps by the same rule as the others. */
const ptext = (t) => clean(t) + ' ';
/*
 * Paragraphs are measured and drawn one by one: pdfkit counts a line break as a glyph (half a letter
 * wide or more), so a line ending in a hard break that nearly fills the box would wrap one word early.
 */
const paras = (t) => String(t ?? '').split('\n');
function paraHeights(doc, e, w = e.w) {
  const o = wrapOpts(doc, e, w);
  return paras(e.text).map((p) => (clean(p) ? doc.heightOfString(ptext(p), o) : e.lh * e.size));
}
const hangX = (doc, e) => (e.align === 'center' ? hang(doc, e) / 2 : e.align === 'right' ? hang(doc, e) : 0);
const baselineShift = (e) => ((e.lh - fm(e.font)[0]) / 2) * e.size;
/** Width of one line of text (no wrapping), as the layouts need for inline highlights. */
export function lineWidth(doc, e, text = e.text) { doc.font(e.font).fontSize(e.size); return doc.widthOfString(String(text ?? ''), { characterSpacing: e.ls }); }

/** Height a text element needs (used by layouts and for pagination). */
/*
 * Rich text (owner, 2026-11-05: editing split headings did not work): `**words**` in a text element with `hl` set are
 * drawn in the highlight colour, so a heading stays one editable box. Lines are wrapped word by word here (the same
 * greedy rule the browser uses); the editor shows the same text with <span>s.
 */
const isRich = (e) => !!e.hl && String(e.text || '').includes('**');
function richTokens(p) {
  const out = [];
  let on = false, gap = false;
  for (const part of String(p).split('**')) {
    for (const bit of part.split(/(\s+)/)) {
      if (!bit) continue;
      if (/^\s+$/.test(bit)) { gap = true; continue; }
      out.push({ t: clean(bit), hl: on, gap });
      gap = false;
    }
    on = !on;
  }
  return out;
}
/** The font of a token: highlighted words may have their own (hlf: a bold phrase); an unusable one falls back. */
function tokenFont(doc, e, tk) {
  if (tk.hl && e.hlf) { try { doc.font(e.hlf); return; } catch { /* not loaded */ } }
  doc.font(e.font);
}
function richLines(doc, e, p) {
  doc.font(e.font).fontSize(e.size);
  const sp = doc.widthOfString(' ') + (e.ls || 0);
  const lines = [];
  let line = [], lw = 0;
  for (const tk of richTokens(p)) {
    tokenFont(doc, e, tk);
    const w = doc.widthOfString(tk.t, { characterSpacing: e.ls }) + (e.ls || 0);
    const add = (line.length && tk.gap ? sp : 0) + w;
    if (line.length && lw + add > e.w + 0.5) { lines.push({ tokens: line, w: lw }); line = []; lw = 0; }
    tk.w = w;
    lw += (line.length && tk.gap ? sp : 0) + w;
    line.push(tk);
  }
  lines.push({ tokens: line, w: lw });
  return { lines, sp };
}
function drawRich(doc, e) {
  const lineH = e.lh * e.size;
  let y = e.y + baselineShift(e);
  for (const p of paras(e.text)) {
    const { lines, sp } = richLines(doc, e, p);
    for (const ln of lines) {
      let x = e.x + (e.align === 'center' ? (e.w - ln.w) / 2 : e.align === 'right' ? e.w - ln.w : 0);
      ln.tokens.forEach((tk, i) => {
        if (i && tk.gap) x += sp;
        tokenFont(doc, e, tk);
        doc.fillColor(tk.hl ? e.hl : e.color).text(tk.t, x, y, { lineBreak: false, characterSpacing: e.ls });
        x += tk.w;
      });
      y += lineH;
    }
  }
}
/*
 * Text around a circle (`arc` = radius, centred in the element), like an SVG textPath that starts at the left and runs
 * clockwise over the top, stretched to the whole circumference. "✦" is drawn as a small four-point star.
 */
const STAR = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';
function drawArc(doc, e) {
  const r = e.arc, cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  doc.font(e.font).fontSize(e.size);
  const asc = (doc._font?.ascender || 900) / 1000 * e.size;
  const chars = [...String(e.text || '')];
  const widths = chars.map((c) => (c === '✦' ? e.size * 0.8 : doc.widthOfString(clean(c) || ' ')));
  const extra = (2 * Math.PI * r - widths.reduce((a, b) => a + b, 0)) / Math.max(1, chars.length);
  let s = 0;
  chars.forEach((c, i) => {
    const mid = s + widths[i] / 2;
    s += widths[i] + extra;
    if (/\s/.test(c)) return;
    const th = Math.PI + mid / r;
    const px = cx + r * Math.cos(th), py = cy + r * Math.sin(th);
    doc.save().rotate((th * 180) / Math.PI + 90, { origin: [px, py] });
    if (c === '✦') {
      const z = e.size * 0.62;
      doc.translate(px - z / 2, py - e.size * 0.35 - z / 2).scale(z / 24).path(STAR).fill(e.color);
    } else {
      doc.fillColor(e.color).text(clean(c), px - widths[i] / 2, py - asc, { lineBreak: false });
    }
    doc.restore();
  });
}

export function measureText(doc, e) {
  doc.font(e.font).fontSize(e.size);
  if (e.arc) return e.h;
  if (isRich(e)) return paras(e.text).reduce((a, p) => a + Math.max(1, richLines(doc, e, p).lines.length) * e.lh * e.size, 0);
  if (!e.list) return paraHeights(doc, e).reduce((a, h) => a + h, 0);
  const items = listItems(e.text);
  const ind = listIndent(e);
  return items.reduce((a, it, i) => a + doc.heightOfString(ptext(it), wrapOpts(doc, e, e.w - ind)) + (i ? e.gap : 0), 0);
}
export const listItems = (t) => String(t || '').split('\n').map((s) => s.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);
export const listIndent = (e) => (e.list === 'icon' ? e.size * 2.3 : e.size * 1.6);

export function scratchDoc() {
  const doc = new PDFDocument({ autoFirstPage: false });
  registerFonts(doc);
  registerUserFonts(doc);
  return doc;
}

function money(n, currency) {
  const v = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
  return currency === 'INR' ? `₹${v}` : `${currency} ${v}`;
}

function gradientFor(doc, e, g) {
  const a = (g.angle * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const len = Math.abs(e.w * dx) + Math.abs(e.h * dy);
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const grad = doc.linearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  for (const [o, c, op] of g.stops) grad.stop(o, c, op);
  return grad;
}

function shapePath(doc, e, inset = 0) {
  const x = e.x + inset, y = e.y + inset, w = Math.max(0, e.w - 2 * inset), h = Math.max(0, e.h - 2 * inset);
  if (e.shape === 'ellipse') doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
  else if (e.radius) doc.roundedRect(x, y, w, h, Math.min(e.radius, w / 2, h / 2));
  else doc.rect(x, y, w, h);
}

function drawShape(doc, e) {
  doc.save().opacity(e.opacity);
  if (e.shape === 'line') { // a horizontal rule; 'dot' = round dots like CSS border-style: dotted
    const y = e.y + e.h / 2, sw = e.sw || 1;
    doc.moveTo(e.x + (e.dash ? sw / 2 : 0), y).lineTo(e.x + e.w, y).lineWidth(sw).strokeColor(e.stroke === 'none' ? e.fill : e.stroke);
    if (e.dash) doc.lineCap('round').dash(0.001, { space: sw * 2 }); 
    doc.stroke().undash();
    doc.restore();
    return;
  }
  if (e.gradient || e.fill !== 'none') {
    shapePath(doc, e);
    doc.fill(e.gradient ? gradientFor(doc, e, e.gradient) : e.fill);
  }
  if (e.stroke !== 'none' && e.sw > 0) {
    shapePath(doc, e, e.sw / 2);
    doc.lineWidth(e.sw).strokeColor(e.stroke).stroke();
  }
  doc.restore();
}

// Images are loaded before drawing (uploads may live in Vercel Blob); drawing itself stays synchronous.
let IMAGES = new Map();
function imageSource(src) {
  return IMAGES.get(src) ?? srcPath(src);
}
async function preloadImages(design) {
  const srcs = new Set();
  for (const p of design.pages) {
    if (p.bg?.image) srcs.add(p.bg.image);
    for (const e of p.elements) if (e.type === 'image' && e.src) srcs.add(e.src);
  }
  const map = new Map();
  await Promise.all([...srcs].map(async (s) => { const v = await loadImage(s).catch(() => null); if (v) map.set(s, v); }));
  return map;
}

function drawImage(doc, e) {
  const img = imageSource(e.src);
  if (!img) return;
  doc.save().opacity(e.opacity);
  if (e.radius) { doc.roundedRect(e.x, e.y, e.w, e.h, Math.min(e.radius, e.w / 2, e.h / 2)).clip(); }
  else doc.rect(e.x, e.y, e.w, e.h).clip();
  try {
    if (e.fit === 'fill') doc.image(img, e.x, e.y, { width: e.w, height: e.h });
    else if (e.fit === 'contain') doc.image(img, e.x, e.y, { fit: [e.w, e.h], align: e.ha || 'center', valign: e.va || 'center' });
    else doc.image(img, e.x, e.y, { cover: [e.w, e.h], align: e.ha || 'center', valign: e.va || 'center' });
  } catch { /* unreadable image: skip */ }
  doc.restore();
}

function drawIcon(doc, e) {
  const ic = ICONS[e.name];
  if (!ic) return;
  doc.save().opacity(e.opacity).translate(e.x, e.y).scale(e.w / 24, e.h / 24);
  for (const p of ic.prims) {
    if (p.t === 'circle') doc.circle(p.cx, p.cy, p.r); else doc.path(p.d);
    if (ic.mode === 'fill') doc.fill(e.color);
    else doc.lineWidth(ic.sw).lineCap('round').lineJoin('round').strokeColor(e.color).stroke();
  }
  doc.restore();
}

const bulletIcon = () => srcPath('asset:brochure/bullet.png');

function drawText(doc, e) {
  doc.save().opacity(e.opacity).fillColor(e.color).font(e.font).fontSize(e.size);
  if (e.rot) doc.rotate(e.rot, { origin: [e.x + e.w / 2, e.y + (e.h || e.size * e.lh) / 2] });
  const y0 = e.y + baselineShift(e);
  if (e.arc) drawArc(doc, e);
  else if (isRich(e)) drawRich(doc, e);
  else if (!e.list) {
    const hs = paraHeights(doc, e), o = wrapOpts(doc, e), x = e.x - hangX(doc, e);
    if (e.outline) doc.lineWidth(e.outline).strokeColor(e.color);
    let y = y0;
    paras(e.text).forEach((p, i) => {
      if (clean(p)) doc.font(e.font).fontSize(e.size).text(ptext(p), x, y, e.outline ? { ...o, stroke: true, fill: false } : o);
      y += hs[i];
    });
  } else {
    const ind = listIndent(e);
    let y = e.y;
    for (const it of listItems(e.text)) {
      const lineH = e.lh * e.size;
      if (e.list === 'icon') {
        const icon = bulletIcon();
        const ih = e.size * 1.2, iw = ih * 1.31;
        if (icon) doc.image(icon, e.x, y + (lineH - ih) / 2, { width: iw, height: ih });
      } else {
        doc.circle(e.x + e.size * 0.45, y + lineH / 2, Math.max(1.6, e.size * 0.14)).fill(e.color);
      }
      doc.fillColor(e.color).font(e.font).fontSize(e.size).text(ptext(it), e.x + ind, y + baselineShift(e), wrapOpts(doc, e, e.w - ind));
      y += doc.heightOfString(ptext(it), wrapOpts(doc, e, e.w - ind)) + e.gap;
    }
  }
  doc.restore();
}

/** Pricing table (module-wise breakdown), bound to the document's line items. */
export const PRICING = { size: 16, pad: 10, minRow: 46, col: 0.7, head: '#eaecf8', line: '#d7dcf3', ink: '#141413' };
export function pricingRows(items, settings) {
  const cur = settings.billing.currency;
  const total = (items || []).reduce((a, i) => a + Number(i.price || 0), 0);
  return [
    { label: 'Module / Component', value: `Cost (${cur})`, head: true },
    ...(items || []).map((i) => ({ label: i.name, value: money(i.price, cur) })),
    { label: 'Total', value: `${money(total, cur).replace('₹', '')} + ${settings.billing.tax_label}`, total: true },
  ];
}
/** The CodeAce proposal's price table (look 'codeace'); the same sizes as public/editor.js pricingCodeace. */
function drawPricingCodeace(doc, e, items, settings) {
  const s = e.size || 11.25, k = s / 11.25, col = 127.5 * k, px = 15 * k, lh = 1.366;
  const cur = settings.billing.currency;
  const money = (n) => (cur === 'INR' || !cur ? `₹ ${Math.round(Number(n) || 0).toLocaleString('en-IN')}` : `${cur} ${Math.round(Number(n) || 0).toLocaleString('en-US')}`);
  const font = (code, d) => { try { doc.font(code); return code; } catch { doc.font(d); return d; } };
  const total = (items || []).reduce((a, i) => a + Number(i.price || 0), 0);
  const rows = [
    { a: 'Module / Component', b: `Cost (${cur || 'INR'})`, bg: '#111111', ink: '#FFFFFF', pad: 11.25 * k, fa: e.fontb, fb: e.fontb, size: s, line: false },
    ...(items || []).map((i, n) => ({ a: i.name, b: money(i.price), bg: n % 2 ? '#F7F7F7' : null, ink: '#111111', pad: 10.5 * k, fa: e.fontm, fb: e.font, size: s, line: true })),
    { a: 'Total', b: `${money(total)}${settings.billing.tax_label ? ` + ${settings.billing.tax_label}` : ''}`, bg: '#D7261E', ink: '#FFFFFF', pad: 12 * k, fa: e.fontb, fb: e.fontb, size: s * 16 / 15, line: false },
  ];
  // row heights: the label may wrap in its column
  const hs = rows.map((r) => { font(r.fa, 'PB'); doc.fontSize(r.size); return Math.max(lh * r.size, doc.heightOfString(clean(r.a), { width: e.w - col - 2 * px })) + 2 * r.pad + (r.line ? 0.75 : 0); });
  const H = hs.reduce((a, b) => a + b, 0);
  doc.save();
  doc.roundedRect(e.x, e.y, e.w, H, 12 * k).clip();
  let y = e.y;
  rows.forEach((r, i) => {
    if (r.bg) doc.rect(e.x, y, e.w, hs[i]).fill(r.bg);
    if (r.line) doc.rect(e.x, y, e.w, 0.75).fill('#E2E2E2');
    const ty = y + (r.line ? 0.75 : 0) + r.pad;
    font(r.fa, 'PB'); doc.fontSize(r.size).fillColor(r.ink).text(clean(r.a), e.x + px, ty, { width: e.w - col - 2 * px });
    font(r.fb, 'PR'); doc.fontSize(r.size).fillColor(r.ink).text(clean(r.b), e.x + e.w - col, ty, { width: col - px, align: 'right', lineBreak: false });
    y += hs[i];
  });
  doc.restore();
  doc.roundedRect(e.x + 0.375, e.y + 0.375, e.w - 0.75, H - 0.75, 12 * k).lineWidth(0.75).strokeColor('#E2E2E2').stroke();
}

function drawPricing(doc, e, items, settings) {
  if (e.look === 'codeace') return drawPricingCodeace(doc, e, items, settings);
  const P = PRICING;
  const c1 = e.w * P.col;
  let y = e.y;
  doc.save();
  for (const r of pricingRows(items, settings)) {
    doc.font('PB').fontSize(P.size);
    const th = doc.heightOfString(clean(r.label), { width: c1 - 2 * P.pad, lineGap: (1.35 - PDFKIT_LH) * P.size });
    const h = Math.max(P.minRow, th + 2 * P.pad);
    if (r.head) doc.rect(e.x, y, e.w, h).fill(P.head);
    doc.rect(e.x, y, e.w, h).lineWidth(0.8).strokeColor(P.line).stroke();
    doc.moveTo(e.x + c1, y).lineTo(e.x + c1, y + h).stroke();
    const ty = y + (h - th) / 2 + ((1.35 - CONTENT) / 2) * P.size;
    doc.fillColor(P.ink).font('PB').fontSize(P.size).text(clean(r.label), e.x + P.pad, ty, { width: c1 - 2 * P.pad, lineGap: (1.35 - PDFKIT_LH) * P.size });
    const vy = y + (h - 1.35 * P.size) / 2 + ((1.35 - CONTENT) / 2) * P.size;
    doc.font(r.head || r.total ? 'PB' : 'PR').fontSize(P.size).text(clean(r.value), e.x + c1 + P.pad, vy, { width: e.w - c1 - 2 * P.pad, lineBreak: false });
    y += h;
  }
  doc.restore();
}

/** Renders a whole design to a PDF buffer. */
export async function renderDesignPdf(design, { title = '', author = '', items = null, settings }) {
  IMAGES = await preloadImages(design);
  await preloadUserFonts(design).catch(() => {});
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: clean(title), Author: clean(author) } });
  registerFonts(doc);
  registerUserFonts(doc);
  for (const p of design.pages) {
    doc.addPage({ size: [p.w, p.h], margin: 0 });
    doc.page.margins.bottom = -100000; // never auto-paginate: overflow stays on its page, like in the editor
    doc.rect(0, 0, p.w, p.h).fill(p.bg.color);
    if (p.bg.image) {
      const bg = imageSource(p.bg.image);
      if (bg) { try { doc.image(bg, 0, 0, { width: p.w, height: p.h }); } catch { /* skip */ } }
    }
    for (const e of p.elements) {
      if (e.type === 'shape') drawShape(doc, e);
      else if (e.type === 'image') drawImage(doc, e);
      else if (e.type === 'icon') drawIcon(doc, e);
      else if (e.type === 'text') drawText(doc, isUserFont(e.font) ? { ...e, font: effectiveFont(e) } : e);
      else if (e.type === 'pricing') drawPricing(doc, e, items, settings);
    }
  }
  return toBuffer(doc);
}

export const fileExists = (p) => !!p && fs.existsSync(p);
