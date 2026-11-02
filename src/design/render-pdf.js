import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { registerFonts, toBuffer, clean } from '../pdf/brand.js';
import { ICONS } from './icons.js';
import { srcPath } from './model.js';

/*
 * Renders a design to PDF. Text metrics follow CSS so the PDF matches the editor:
 * line box = lh × size, glyphs sit in the middle of the line box (Poppins typo metrics:
 * ascent 1.05, descent 0.35 → content area 1.4 × size).
 */
const ASC = 1.05, CONTENT = 1.4, PDFKIT_LH = 1.5;

export const textOpts = (e) => ({ width: e.w, align: e.align, lineGap: (e.lh - PDFKIT_LH) * e.size, characterSpacing: e.ls });
const baselineShift = (e) => ((e.lh - CONTENT) / 2) * e.size;

/** Height a text element needs (used by layouts and for pagination). */
export function measureText(doc, e) {
  doc.font(e.font).fontSize(e.size);
  if (!e.list) return doc.heightOfString(clean(e.text) || ' ', textOpts(e));
  const items = listItems(e.text);
  const ind = listIndent(e);
  return items.reduce((a, it, i) => a + doc.heightOfString(clean(it) || ' ', { ...textOpts(e), width: e.w - ind }) + (i ? e.gap : 0), 0);
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

function imageSource(src) {
  if (/^data:image\/(png|jpe?g);base64,/.test(src)) return Buffer.from(src.split(',')[1], 'base64');
  return srcPath(src);
}

function drawImage(doc, e) {
  const img = imageSource(e.src);
  if (!img) return;
  doc.save().opacity(e.opacity);
  if (e.radius) { doc.roundedRect(e.x, e.y, e.w, e.h, Math.min(e.radius, e.w / 2, e.h / 2)).clip(); }
  else doc.rect(e.x, e.y, e.w, e.h).clip();
  try {
    if (e.fit === 'fill') doc.image(img, e.x, e.y, { width: e.w, height: e.h });
    else if (e.fit === 'contain') doc.image(img, e.x, e.y, { fit: [e.w, e.h], align: 'center', valign: 'center' });
    else doc.image(img, e.x, e.y, { cover: [e.w, e.h], align: 'center', valign: 'center' });
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
  const y0 = e.y + baselineShift(e);
  if (!e.list) {
    doc.text(clean(e.text), e.x, y0, textOpts(e));
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
      doc.fillColor(e.color).font(e.font).fontSize(e.size).text(clean(it), e.x + ind, y + baselineShift(e), { ...textOpts(e), width: e.w - ind });
      y += doc.heightOfString(clean(it) || ' ', { ...textOpts(e), width: e.w - ind }) + e.gap;
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
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: clean(title), Author: clean(author) } });
  registerFonts(doc);
  for (const p of design.pages) {
    doc.addPage({ size: [p.w, p.h], margin: 0 });
    doc.page.margins.bottom = -100000; // never auto-paginate: overflow stays on its page, like in the editor
    doc.rect(0, 0, p.w, p.h).fill(p.bg.color);
    if (p.bg.image) {
      const bg = srcPath(p.bg.image);
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
