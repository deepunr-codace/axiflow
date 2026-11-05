import { newId } from './model.js';
import { measureText, lineWidth, scratchDoc } from './render-pdf.js';

/*
 * Shared pieces for the 1920×1080 brochure decks (classic = deck.js, editorial = editorial.js):
 * element constructors, colour mixing, text measuring, highlighted headings, pills, stacking
 * and text set around a circle (the editorial stickers).
 */
export const W = 1920, H = 1080;
export const WHITE = '#ffffff';
/** CSS line-height: normal per font code (hhea ascent + descent). */
export const NORMAL = { HR: 1.303, HM: 1.303, HS: 1.303, UM: 1.24, US: 1.24, LR: 1.28, LM: 1.28, LS: 1.28, IR: 1.21, IM: 1.21, IS: 1.21 };
const ASCENT = { IR: 0.9688, IM: 0.9688, IS: 0.9688 };

/** color-mix(in srgb, a pct%, b) */
export function mix(a, pct, b) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v * pct / 100 + y[i] * (1 - pct / 100)).toString(16).padStart(2, '0')).join('');
}
export const T = (o) => ({ id: newId(), type: 'text', font: 'HR', color: WHITE, align: 'left', lh: NORMAL[o.font || 'HR'], ls: 0, list: '', gap: 8, h: 40, opacity: 1, outline: 0, rot: 0, ...o });
export const R = (o) => ({ id: newId(), type: 'shape', shape: 'rect', fill: WHITE, stroke: 'none', sw: 1, radius: 0, gradient: null, opacity: 1, dash: '', ...o });
export const I = (o) => ({ id: newId(), type: 'image', fit: 'contain', radius: 0, opacity: 1, ha: 'center', va: 'center', ...o });
export const ICON = (o) => ({ id: newId(), type: 'icon', color: WHITE, opacity: 1, ...o });
export const page = (bg, elements, image = '') => ({ id: newId(), w: W, h: H, bg: { color: bg, image }, elements });
export const pad2 = (n) => String(n).padStart(2, '0');
export const ring = (cx, cy, r, color, sw, opacity = 1) => R({ shape: 'ellipse', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: 'none', stroke: color, sw, opacity });

/** Stacks blocks vertically with a gap; returns the y after the last one. */
export const stack = (blocks, y, gap) => {
  let cy = y;
  blocks.forEach((b, i) => { b.place(cy); cy += b.h + (i < blocks.length - 1 ? (Array.isArray(gap) ? gap[i] : gap) : 0); });
  return cy;
};
/** A group of elements built at y = 0 that can be moved as one. */
export const block = (els, h) => ({ els, h, at: 0, place(y0) { const dy = y0 - this.at; for (const e of els) e.y += dy; this.at = y0; } });

export class Builder {
  constructor() { this.doc = scratchDoc(); }
  /** Measured height of a text element (sets e.h). */
  fit(e) { e.h = Math.ceil(measureText(this.doc, e)); return e; }
  /** Text that must fit in maxH: shrinks the size step by step (never below 80%). */
  fitIn(e, maxH) {
    const s0 = e.size;
    this.fit(e);
    while (e.h > maxH && e.size > s0 * 0.8) { e.size -= 1; this.fit(e); }
    return e;
  }
  width(e, text) { return lineWidth(this.doc, e, text); }
  /** Word-wraps text (with \n hard breaks) to width w; returns the lines. */
  wrap(e, text, w) {
    const out = [];
    for (const hard of String(text || '').split('\n')) {
      let line = '';
      for (const word of hard.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.width(e, next) > w) { out.push(line); line = word; } else line = next;
      }
      out.push(line);
    }
    return out;
  }
  /**
   * A heading with an optional highlighted phrase. Wrapped here so the editor and the PDF break lines
   * at the same words; a highlighted line is split into coloured pieces. Returns { els, h, lines }.
   */
  rich({ text, highlight = '', x, y, w, font = 'US', size, lh, ls, color, hl, align = 'left' }) {
    const proto = T({ font, size, lh, ls, color, align: 'left' });
    const lines = this.wrap(proto, text, w);
    const lineH = size * lh;
    const full = lines.join('\n');
    const at = highlight ? full.replace(/\n/g, ' ').indexOf(highlight) : -1;
    if (at < 0) {
      const e = T({ ...proto, text: full, x, y, w: w + 8, align });
      if (align === 'center') e.x = x - 4;
      e.h = Math.ceil(lineH * lines.length);
      return { els: [e], h: e.h, lines };
    }
    const els = [];
    let pos = 0;
    lines.forEach((line, i) => {
      const start = pos, end = pos + line.length;
      pos = end + 1;
      const a = Math.max(at, start), b = Math.min(at + highlight.length, end);
      const parts = a < b ? [[line.slice(0, a - start), color], [line.slice(a - start, b - start), hl], [line.slice(b - start), color]] : [[line, color]];
      const lw = this.width(proto, line);
      let cx = align === 'center' ? x + (w - lw) / 2 : x;
      for (const [t, c] of parts) {
        if (!t) continue;
        const tw = this.width(proto, t);
        if (t.trim()) els.push(T({ ...proto, text: t.trim(), x: cx + (tw - this.width(proto, t.trimStart())), y: y + i * lineH, w: Math.ceil(this.width(proto, t.trim())) + 8, h: Math.ceil(lineH), color: c }));
        cx += tw;
      }
    });
    return { els, h: Math.ceil(lineH * lines.length), lines };
  }
  /** A pill with text (tags, chips). Returns { els, w, h }. */
  pill({ text, x, y, font = 'HS', size = 24, ls = 2, upper = true, fg, bg = 'none', border = 'none', bw = 1, padX = 22, padY = 10 }) {
    const label = upper ? String(text).toUpperCase() : String(text);
    const t = T({ text: label, font, size, ls, color: fg, lh: NORMAL[font] });
    const tw = Math.ceil(this.width(t, label));
    const b = border === 'none' ? 0 : bw;
    const h = Math.ceil(size * NORMAL[font] + 2 * padY + 2 * b);
    const w = tw + 2 * padX + 2 * b;
    Object.assign(t, { x: x + padX + b, y: y + padY + b, w: tw + 6, h: Math.ceil(size * NORMAL[font]) });
    return { els: [R({ x, y, w, h, radius: h / 2, fill: bg, stroke: border, sw: b || 1 }), t], w, h };
  }
  /** Pills in a wrapping row. */
  pillRow(items, { x, y, maxW, gap = 12, ...o }) {
    const els = [];
    let cx = x, cy = y, rowH = 0;
    for (const it of items) {
      const probe = this.pill({ ...o, text: it, x: 0, y: 0 });
      if (cx > x && cx + probe.w > x + maxW) { cx = x; cy += rowH + gap; rowH = 0; }
      const p = this.pill({ ...o, text: it, x: cx, y: cy });
      els.push(...p.els);
      cx += p.w + gap;
      rowH = Math.max(rowH, p.h);
    }
    return { els, h: items.length ? cy + rowH - y : 0 };
  }
  /**
   * Text around a circle, like an SVG textPath on a circle that starts at the left and runs clockwise
   * over the top, stretched to the full circumference (textLength + lengthAdjust="spacing").
   * One rotated text element per letter; "✦" becomes a small star icon. turn = whole-sticker rotation in degrees.
   */
  circleText({ text, cx, cy, r, font = 'IS', size, ls = 0, color, turn = 0 }) {
    const chars = [...String(text)];
    const proto = T({ font, size, ls: 0, color });
    const widths = chars.map((c) => (c === '✦' ? size * 0.8 : this.width(proto, c)));
    const total = 2 * Math.PI * r;
    const extra = (total - widths.reduce((a, b) => a + b, 0)) / chars.length;
    const asc = ASCENT[font] ?? 0.95, lineN = NORMAL[font] ?? 1.25;
    const lift = (asc - lineN / 2) * size; // box centre above the baseline
    const tr = (turn * Math.PI) / 180;
    const els = [];
    let s = 0;
    chars.forEach((c, i) => {
      const mid = s + widths[i] / 2;
      s += widths[i] + extra;
      if (c === ' ') return;
      const th = Math.PI + mid / r + tr;
      const px = cx + (r + lift) * Math.cos(th), py = cy + (r + lift) * Math.sin(th);
      const rot = ((th * 180) / Math.PI + 90) % 360;
      if (c === '✦') { const z = size * 0.62; els.push(ICON({ name: 'star4', x: px - z / 2, y: py - z / 2, w: z, h: z, color })); return; }
      const bw = Math.ceil(widths[i]) + 6, bh = Math.ceil(size * lineN);
      els.push(T({ text: c, font, size, ls, color, x: px - bw / 2, y: py - bh / 2, w: bw, h: bh, align: 'center', rot: rot > 180 ? rot - 360 : rot }));
    });
    return els;
  }
}
