import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { registerFonts, toBuffer, clean } from '../pdf/brand.js';
import { ICONS } from './icons.js';
import { srcPath, loadImage } from './model.js';

/*
 * Renders a design to PDF. Text metrics follow CSS so the PDF matches the editor:
 * line box = lh × size, glyphs sit in the middle of the line box. Content area = the font's
 * hhea ascent + descent (Poppins 1.4, Unbounded 1.24, Hanken Grotesk 1.303 × size), as in Chrome.
 */
const CONTENT = 1.4, PDFKIT_LH = 1.5; // Poppins (the pricing table)
// Per font code: [content area, pdfkit line height] in em (from pdfkit's own font metrics, hhea).
const METRICS = { UM: [1.24, 1.24], US: [1.24, 1.24], HR: [1.303, 1.303], HM: [1.303, 1.303], HS: [1.303, 1.303] };
const fm = (font) => METRICS[font] || [CONTENT, PDFKIT_LH];

export const textOpts = (e) => ({ width: e.w, align: e.align, lineGap: (e.lh - fm(e.font)[1]) * e.size, characterSpacing: e.ls });
/*
 * pdfkit needs room for the space after a line's last word, the browser does not: a line that fills
 * the box exactly would wrap one word earlier in the PDF. So pdfkit gets one space more width, and
 * centred / right-aligned text moves back by half / all of it.
 */
const hang = (doc, e) => doc.font(e.font).fontSize(e.size).widthOfString(' ') + (e.ls || 0);
const wrapOpts = (doc, e, w = e.w) => { const sp = hang(doc, e); return { ...textOpts(e), width: w + sp }; };
/** Text as pdfkit gets it: every paragraph ends in a space, so its last line wraps by the same rule as the others. */
const ptext = (t) => clean(t).replace(/\n/g, ' \n') + ' ';
const hangX = (doc, e) => (e.align === 'center' ? hang(doc, e) / 2 : e.align === 'right' ? hang(doc, e) : 0);
const baselineShift = (e) => ((e.lh - fm(e.font)[0]) / 2) * e.size;
/** Width of one line of text (no wrapping), as the layouts need for inline highlights. */
export function lineWidth(doc, e, text = e.text) { doc.font(e.font).fontSize(e.size); return doc.widthOfString(String(text ?? ''), { characterSpacing: e.ls }); }

/** Height a text element needs (used by layouts and for pagination). */
export function measureText(doc, e) {
  doc.font(e.font).fontSize(e.size);
  if (!e.list) return doc.heightOfString(ptext(e.text), wrapOpts(doc, e));
  const items = listItems(e.text);
  const ind = listIndent(e);
  return items.reduce((a, it, i) => a + doc.heightOfString(ptext(it), wrapOpts(doc, e, e.w - ind)) + (i ? e.gap : 0), 0);
}
export const listItems = (t) => String(t || '').split('\n').map((s) => s.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);
export const listIndent = (e) => (e.list === 'icon' ? e.size * 2.3 : e.size * 1.6);

export function scratchDoc() {
  const doc = new PDFDocument({ autoFirstPage: false });
  registerFonts(doc);
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
  if (!e.list) {
    if (e.outline) { doc.lineWidth(e.outline).strokeColor(e.color); doc.text(ptext(e.text), e.x - hangX(doc, e), y0, { ...wrapOpts(doc, e), stroke: true, fill: false }); }
    else doc.text(ptext(e.text), e.x - hangX(doc, e), y0, wrapOpts(doc, e));
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
function drawPricing(doc, e, items, settings) {
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
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: clean(title), Author: clean(author) } });
  registerFonts(doc);
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
      else if (e.type === 'text') drawText(doc, e);
      else if (e.type === 'pricing') drawPricing(doc, e, items, settings);
    }
  }
  return toBuffer(doc);
}

export const fileExists = (p) => !!p && fs.existsSync(p);
