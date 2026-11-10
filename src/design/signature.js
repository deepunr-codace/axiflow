import { W, H, WHITE, mix, T, R, I, ICON, page, pad2, Builder } from './deck-kit.js';
import { normalizeData, serviceSlideTitle, LOGO } from './brochure-data.js';

/*
 * "Codeace Signature": the premium brochure family (owner, 2026-11-10: "we are premium company … for each package
 * how can we create a design system", then a folder of agency brochures: "we need like this. can u make it as our
 * templates"). One slide system, four looks; the look is fixed by the design system (palette, type, rhythm),
 * Claude only writes and chooses. What the looks take from the samples the owner liked:
 *   precision  white grid paper, royal blue + charcoal two-tone headlines, one giant ghost word
 *   mono       black and white, small upper-case grotesque, one signal colour, a lot of empty space
 *   bold       upper-case headlines, full-bleed colour panels, strong contrast
 *   commerce   the bold structure in deep green with a warm accent, softer corners (shops)
 * Type-led on purpose: the generic sample images (3D props, the stylist) are never used; a photo appears only
 * when a real one was chosen (stock: / upload:). Input: BrochureData, plus the optional `gaps` slide
 * ("where the client loses customers today", from the lead's SWOT).
 */
const M = 120;
const INK_LOGO = 'asset:brochure/sig/codeace-ink.png';
const GRID = 'asset:brochure/sig/grid.png';

export const SIGNATURE_STYLES = {
  precision: {
    name: 'Codeace Precision', paper: '#fbfcfe', ink: '#1d2029', primary: '#2337c6', hlLight: '#2337c6', hlSolid: '#b7c2ff', hlDark: '#8fa1ff',
    H: 'AR7', hls: -0.035, hlh: 1.02, hk: 1, upper: false, twoTone: true, radius: 18, grid: true, ghost: true,
    r: { cover: 'solid', about: 'light', gaps: 'light', insight: 'solid', approach: 'light', panel: 'solid', why: 'light', cta: 'solid', closing: 'light' },
  },
  mono: {
    name: 'Codeace Mono', paper: '#ffffff', ink: '#0b0b0c', primary: '#0b0b0c', hlLight: '#f2542d', hlSolid: '#f2542d', hlDark: '#f2542d',
    H: 'LF5', hls: -0.03, hlh: 1.04, hk: 0.74, upper: true, twoTone: false, radius: 0, grid: false, ghost: true,
    r: { cover: 'dark', about: 'dark', gaps: 'light', insight: 'dark', approach: 'light', panel: 'dark', why: 'light', cta: 'dark', closing: 'light' },
  },
  bold: {
    name: 'Codeace Bold', paper: '#ffffff', ink: '#16181d', primary: '#e2362f', hlLight: '#e2362f', hlSolid: '#16181d', hlDark: '#ff6a5f',
    H: 'AR7', hls: -0.02, hlh: 1.04, hk: 0.82, upper: true, twoTone: true, radius: 0, grid: false, ghost: false,
    r: { cover: 'solid', about: 'light', gaps: 'light', insight: 'solid', approach: 'dark', panel: 'solid', why: 'light', cta: 'solid', closing: 'dark' },
  },
  commerce: {
    name: 'Codeace Commerce', paper: '#fbfaf5', ink: '#10231c', primary: '#0c6b4e', hlLight: '#0c6b4e', hlSolid: '#f4be3c', hlDark: '#f4be3c',
    H: 'AR7', hls: -0.03, hlh: 1.03, hk: 0.96, upper: false, twoTone: true, radius: 28, grid: false, ghost: false,
    r: { cover: 'solid', about: 'light', gaps: 'light', insight: 'dark', approach: 'light', panel: 'solid', why: 'light', cta: 'solid', closing: 'dark' },
  },
};
export const signatureStyle = (design) => String(design || '').replace(/^signature-/, '');
export const isSignature = (design) => !!SIGNATURE_STYLES[signatureStyle(design)] && String(design).startsWith('signature-');

function tones(s) {
  const light = { key: 'light', bg: s.paper, text: s.ink, muted: mix(s.ink, 62, s.paper), hl: s.hlLight, line: mix(s.ink, 14, s.paper), card: mix(s.primary === s.ink ? s.ink : s.primary, 6, s.paper), ghost: mix(s.ink, 5, s.paper), logo: INK_LOGO, btnBg: s.primary, btnFg: WHITE };
  const on = (bg, hl) => ({ key: 'deep', bg, text: WHITE, muted: mix(WHITE, 76, bg), hl, line: mix(WHITE, 24, bg), card: mix(WHITE, 10, bg), ghost: mix(WHITE, 6, bg), logo: LOGO.src, btnBg: WHITE, btnFg: bg });
  return { light, solid: on(s.primary, s.hlSolid), dark: on(s.ink, s.hlDark) };
}
/** Only real photos (chosen stock or an upload); the generic sample catalogue is left out of this design. */
const real = (img) => (img && /^(stock|upload):/.test(img.src || '') ? img : null);
const shift = (els, dy) => { for (const e of els) e.y += dy; return els; };

class SigBuilder extends Builder {
  constructor(s) { super(); this.s = s; }
  /** A headline in the style's face: upper-cased where the style asks, shrunk to `lines`, two-tone by default. */
  head({ text, highlight = '', x, y, w, size, tone, lines = 3, plain = false, align }) {
    const s = this.s;
    let txt = String(text || '').trim(), hl = String(highlight || '');
    if (s.upper) { txt = txt.toUpperCase(); hl = hl.toUpperCase(); }
    let sz = Math.round(size * s.hk);
    const probe = () => T({ font: s.H, size: sz, ls: sz * s.hls, lh: s.hlh });
    let ls = this.wrap(probe(), txt, w);
    while (ls.length > lines && sz > size * s.hk * 0.6) { sz -= 4; ls = this.wrap(probe(), txt, w); }
    if (!hl && !plain && s.twoTone && ls.length > 1) hl = ls[0];
    return this.rich({ text: ls.join('\n'), highlight: plain ? '' : hl, x, y, w, font: s.H, size: sz, lh: s.hlh, ls: sz * s.hls, color: tone.text, hl: tone.hl, align });
  }
  /** Running text that must fit in maxH. */
  body({ text, x, y, w, size = 26, color, maxH = 300, font = 'IR', lh = 1.55 }) {
    return this.fitIn(T({ text: String(text || ''), x, y, w, font, size, lh, color }), maxH);
  }
  /** A big figure; the rupee sign is set in Inter (the display faces may not have it). */
  figure({ value, x, y, w, size, color }) {
    const s = this.s, v = String(value);
    const o = { font: s.H, size, lh: 1, ls: size * s.hls, color, y, h: Math.ceil(size) };
    if (!v.startsWith('₹')) return [T({ ...o, text: v, x, w })];
    const r = T({ text: '₹', font: 'IS', size: size * 0.84, lh: 1, color, y: y + size * 0.1, h: Math.ceil(size) });
    const rw = Math.ceil(this.width(r, '₹'));
    return [Object.assign(r, { x, w: rw + 6 }), T({ ...o, text: v.slice(1), x: x + rw + size * 0.05, w: w - rw })];
  }
  /** Logo, "For <client>" and the page number. x0…x1 = the text column of the slide. */
  chrome(tn, n, total, { x0 = M, x1 = W - M, label = '' } = {}) {
    const lw = Math.round(46 * LOGO.ratio);
    return [
      I({ src: tn.logo, x: x0, y: 62, w: lw, h: 46, ha: 'left' }),
      T({ text: label, x: x0, y: H - 80, w: x1 - x0 - 220, h: 26, font: 'IM', size: 19, color: tn.muted }),
      T({ text: `${pad2(n)} / ${pad2(total)}`, x: x1 - 200, y: H - 80, w: 200, h: 26, font: 'IM', size: 19, color: tn.muted, align: 'right' }),
    ];
  }
  /** One very large, very faint word that bleeds off the page. */
  ghost(word, tn, { y = H - 268, size = 380, x = -22 } = {}) {
    const s = this.s, text = String(word || '').toUpperCase().slice(0, 12);
    const e = T({ text, font: s.H, size, lh: 1, ls: size * -0.045, color: tn.ghost });
    const w = Math.ceil(this.width(e, text));
    return Object.assign(e, { x, y, w: w + 40, h: Math.ceil(size) });
  }
  page(tn, els) { return page(tn.bg, els, this.s.grid && tn.key === 'light' ? GRID : ''); }
}

/** BrochureData → editable pages. `style` = precision | mono | bold | commerce. */
export function signatureDesign(input, style = 'precision') {
  const s = SIGNATURE_STYLES[style] || SIGNATURE_STYLES.precision;
  const d = normalizeData(input);
  const b = new SigBuilder(s);
  const tone = tones(s);
  const client = d.client.name;
  const label = `${d.brand.name} for ${client}`;
  const services = d.services;
  const gaps = (input.gaps?.items || []).filter((g) => g && g.title).slice(0, 4);
  const up = (v) => (s.upper ? String(v).toUpperCase() : String(v));
  const slides = [];

  // ---- cover: the offer on the left, a colour panel "prepared for" on the right
  slides.push(() => {
    const c = d.cover, tn = tone.light, pt = tone[s.r.cover], els = [];
    const px = 1270, pw = W - px, hero = real(c.heroImage);
    if (s.ghost) els.push(b.ghost(d.brand.name, tn, { y: H - 300, size: 400 }));
    els.push(R({ x: px, y: 0, w: pw, h: H, fill: pt.bg }));
    if (hero) els.push(I({ ...hero, x: px, y: 0, w: pw, h: H, fit: 'cover' }), R({ x: px, y: 0, w: pw, h: H, fill: pt.bg, opacity: 0.8 }));
    els.push(I({ src: tn.logo, x: M, y: 92, w: Math.round(68 * LOGO.ratio), h: 68, ha: 'left' }));
    const title = b.head({ text: c.title, highlight: c.highlight, x: M, y: 0, w: px - M - 110, size: 148, tone: tn, lines: 3 });
    const sub = b.body({ text: c.subtitle, x: M, y: 0, w: 820, size: 30, lh: 1.5, color: tn.muted, maxH: 190 });
    const y0 = Math.max(232, Math.round((H - title.h - 44 - sub.h) / 2) - 6);
    shift(title.els, y0); sub.y = y0 + title.h + 44;
    els.push(...title.els, sub);
    if (c.tag) els.push(T({ text: c.tag, x: px - 110 - 620, y: 112, w: 620, h: 30, font: 'IM', size: 22, color: tn.muted, align: 'right' }));
    // panel
    const ix = px + 80, iw = pw - 160;
    els.push(T({ text: 'Prepared for', x: ix, y: 104, w: iw, h: 30, font: 'IM', size: 22, color: pt.muted }));
    const name = b.head({ text: client, x: ix, y: 148, w: iw, size: 62, tone: pt, lines: 4, plain: true });
    els.push(...name.els);
    let y = 148 + name.h + 56;
    const chips = (c.chips || []).slice(0, 6);
    for (const chip of chips) {
      els.push(R({ x: ix, y, w: iw, h: 1.5, fill: pt.line }), R({ x: ix, y: y + 31, w: 11, h: 11, fill: pt.hl }), T({ text: chip, x: ix + 32, y: y + 19, w: iw - 32, h: 36, font: 'IM', size: 25, color: pt.text }));
      y += 72;
    }
    if (chips.length) els.push(R({ x: ix, y, w: iw, h: 1.5, fill: pt.line }));
    const when = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    els.push(T({ text: `A proposal by ${d.brand.name}`, x: ix, y: H - 156, w: iw, h: 30, font: 'IS', size: 22, color: pt.text }), T({ text: when, x: ix, y: H - 122, w: iw, h: 30, font: 'IR', size: 22, color: pt.muted }));
    return b.page(tn, els);
  });

  // ---- about the agency
  if (d.about) slides.push((n, total) => {
    const ab = d.about, tn = tone[s.r.about], els = [];
    const head = b.head({ text: ab.heading, highlight: ab.highlight, x: M, y: 210, w: 1000, size: 92, tone: tn, lines: 4 });
    const body = b.body({ text: ab.body, x: M, y: 210 + head.h + 44, w: 900, size: 28, color: tn.muted, maxH: 320 });
    els.push(...head.els, body);
    const cx = 1250, cw = W - M - cx;
    let y = 216;
    if (ab.credential) {
      const ct = b.fit(T({ text: up(ab.credential.title), x: cx + 44, w: cw - 88, font: s.H, size: Math.round(40 * s.hk), lh: 1.12, ls: 40 * s.hk * s.hls, color: tn.text }));
      const cb = b.fit(T({ text: ab.credential.text, x: cx + 44, w: cw - 88, font: 'IR', size: 24, lh: 1.5, color: tn.muted }));
      const h = 46 + ct.h + 14 + cb.h + 46;
      els.push(R({ x: cx, y, w: cw, h, fill: tn.card, radius: s.radius }), Object.assign(ct, { y: y + 46 }), Object.assign(cb, { y: y + 46 + ct.h + 14 }));
      y += h + 52;
    }
    for (const tag of (ab.tags || []).slice(0, 5)) {
      els.push(R({ x: cx, y, w: cw, h: 1.5, fill: tn.line }), R({ x: cx, y: y + 32, w: 11, h: 11, fill: tn.hl }), T({ text: tag, x: cx + 32, y: y + 20, w: cw - 32, h: 36, font: 'IM', size: 25, color: tn.text }));
      y += 74;
    }
    els.push(...b.chrome(tn, n, total, { label }));
    return b.page(tn, els);
  });

  // ---- where the client loses customers today (from the lead's SWOT)
  if (gaps.length) slides.push((n, total) => {
    const g = input.gaps, tn = tone[s.r.gaps], els = [];
    const head = b.head({ text: g.heading || `Where ${client} loses customers today`, highlight: g.highlight, x: M, y: 210, w: 700, size: 84, tone: tn, lines: 5 });
    els.push(...head.els);
    if (g.note) els.push(b.body({ text: g.note, x: M, y: 210 + head.h + 40, w: 620, size: 24, color: tn.muted, maxH: 200 }));
    const x = 930, w = W - M - x;
    const rows = gaps.map((it) => {
      const t = b.fit(T({ text: it.title, x: x + 44, w: w - 44, font: 'IS', size: 34, lh: 1.25, color: tn.text }));
      const p = b.body({ text: it.text, x: x + 44, y: 0, w: w - 44, size: 25, lh: 1.5, color: tn.muted, maxH: 116 });
      return { t, p, h: 30 + t.h + 8 + p.h + 30 };
    });
    const free = 740 - rows.reduce((a, r) => a + r.h, 0);
    const pad = Math.max(0, Math.min(64, Math.floor(free / rows.length)));
    let y = 210;
    for (const r of rows) {
      els.push(R({ x, y, w, h: 1.5, fill: tn.line }), R({ x, y: y + 30 + pad / 2 + 14, w: 14, h: 14, fill: tn.hl }), Object.assign(r.t, { y: y + 30 + pad / 2 }), Object.assign(r.p, { y: y + 30 + pad / 2 + r.t.h + 8 }));
      y += r.h + pad;
    }
    els.push(R({ x, y, w, h: 1.5, fill: tn.line }), ...b.chrome(tn, n, total, { label }));
    return b.page(tn, els);
  });

  // ---- the shift in their market (only with verified figures)
  if (d.insight) slides.push((n, total) => {
    const ins = d.insight, tn = tone[s.r.insight], els = [];
    const head = b.head({ text: ins.heading, highlight: ins.highlight, x: M, y: 200, w: 1500, size: 96, tone: tn, lines: 2 });
    els.push(...head.els);
    const k = ins.stats.length, colW = (W - 2 * M) / k, y0 = Math.max(470, 200 + head.h + 90), size = k > 3 ? 124 : 156;
    ins.stats.forEach((st, i) => {
      const x = M + i * colW + (i ? 48 : 0);
      if (i) els.push(R({ x: M + i * colW, y: y0, w: 1.5, h: 290, fill: tn.line }));
      els.push(...b.figure({ value: st.value, x, y: y0, w: colW - 60, size, color: tn.text }), b.body({ text: st.label, x, y: y0 + size + 26, w: colW - 90, size: 24, lh: 1.45, color: tn.muted, maxH: 110 }));
    });
    if (ins.statement) els.push(R({ x: M, y: 838, w: 64, h: 4, fill: tn.hl }), b.body({ text: ins.statement, x: M, y: 862, w: 1300, size: 28, lh: 1.45, font: 'IM', color: tn.text, maxH: 84 }));
    els.push(...b.chrome(tn, n, total, { label }));
    return b.page(tn, els);
  });

  // ---- how we help: the services as a table of contents
  const svcStart = slides.length + (d.approach ? 2 : 1);
  if (d.approach) slides.push((n, total) => {
    const ap = d.approach, tn = tone[s.r.approach], els = [];
    const head = b.head({ text: ap.heading, highlight: ap.highlight, x: M, y: 210, w: 620, size: 84, tone: tn, lines: 4 });
    els.push(...head.els, b.body({ text: ap.body, x: M, y: 210 + head.h + 40, w: 600, size: 26, color: tn.muted, maxH: 300 }));
    const x = 880, w = W - M - x, rowH = Math.min(180, Math.floor(736 / Math.max(services.length, 1)));
    const ns = Math.round((rowH >= 150 ? 48 : rowH >= 110 ? 42 : 34) * s.hk);
    services.forEach((sv, i) => {
      const y = 214 + i * rowH;
      const nm = T({ text: up(sv.name), x, w: 500, font: s.H, size: ns, lh: 1.1, ls: ns * s.hls, color: tn.text });
      const lines = b.wrap(nm, nm.text, 500).length;
      nm.h = Math.ceil(ns * 1.1 * lines);
      const sm = b.body({ text: sv.summary, x: x + 540, y: 0, w: w - 540 - 90, size: rowH >= 150 ? 25 : 22, lh: 1.4, color: tn.muted, maxH: rowH - 30 });
      els.push(R({ x, y, w, h: 1.5, fill: tn.line }), Object.assign(nm, { y: y + (rowH - nm.h) / 2 }), Object.assign(sm, { y: y + (rowH - sm.h) / 2 }),
        T({ text: pad2(svcStart + i), x: x + w - 80, y: y + (rowH - 28) / 2, w: 80, h: 28, font: 'IM', size: 22, color: tn.hl, align: 'right' }));
    });
    els.push(R({ x, y: 214 + services.length * rowH, w, h: 1.5, fill: tn.line }), ...b.chrome(tn, n, total, { label }));
    return b.page(tn, els);
  });

  // ---- one slide per service: the case on paper, the four results on a colour panel (sides alternate)
  services.forEach((sv, i) => slides.push((n, total) => {
    const tn = tone.light, pt = tone[s.r.panel], els = [];
    const flip = i % 2 === 1, pw = 800, px = flip ? 0 : W - pw;
    const tx = flip ? pw + 110 : M, tw = W - pw - M - 110;
    const photo = real(sv.image), ph = photo ? 380 : 0;
    els.push(R({ x: px, y: 0, w: pw, h: H, fill: pt.bg }));
    if (photo) els.push(I({ ...photo, x: px, y: 0, w: pw, h: ph, fit: 'cover' }));
    const head = b.head({ text: serviceSlideTitle(sv), x: tx, y: 0, w: tw, size: 108, tone: tn, lines: 3 });
    const lead = b.body({ text: sv.lead, x: tx, y: 0, w: tw - 20, size: 36, lh: 1.38, font: 'IM', color: tn.text, maxH: 210 });
    const body = b.body({ text: sv.body, x: tx, y: 0, w: tw - 40, size: 28, color: tn.muted, maxH: 300 });
    const ty = Math.max(190, Math.round(190 + (760 - (head.h + 48 + lead.h + 30 + body.h)) / 2));
    shift(head.els, ty); lead.y = ty + head.h + 48; body.y = lead.y + lead.h + 30;
    els.push(...head.els, lead, body);
    // panel: what the client gets
    const ix = px + 84, iw = pw - 168;
    let y = ph + (photo ? 54 : 150);
    els.push(T({ text: 'What you get', x: ix, y, w: iw, h: 30, font: 'IM', size: 22, color: pt.muted }));
    y += 56;
    const rows = (sv.benefits || []).map((bt) => b.body({ text: bt, x: ix + 58, y: 0, w: iw - 58, size: photo ? 26 : 31, lh: 1.35, font: 'IS', color: pt.text, maxH: 130 }));
    const room = H - 110 - y, used = rows.reduce((a, r) => a + r.h, 0);
    const gap = Math.max(34, Math.min(photo ? 60 : 124, Math.floor((room - used) / Math.max(rows.length, 1))));
    for (const r of rows) {
      els.push(R({ x: ix, y, w: iw, h: 1.5, fill: pt.line }), ICON({ name: 'check-bold', x: ix, y: y + gap / 2 + 4, w: 34, h: 34, color: pt.hl }), Object.assign(r, { y: y + gap / 2 }));
      y += r.h + gap;
    }
    if (rows.length) els.push(R({ x: ix, y, w: iw, h: 1.5, fill: pt.line }));
    els.push(...b.chrome(tn, n, total, { x0: tx, x1: flip ? W - M : W - pw - 110, label }));
    return b.page(tn, els);
  }));

  // ---- why this agency: body and proof figures
  if (d.whyUs) slides.push((n, total) => {
    const wy = d.whyUs, tn = tone[s.r.why], els = [], stats = wy.stats || [];
    const tw = stats.length ? 760 : 1300;
    const head = b.head({ text: wy.heading, highlight: wy.highlight, x: M, y: 210, w: tw, size: 84, tone: tn, lines: 5 });
    els.push(...head.els, b.body({ text: wy.body, x: M, y: 210 + head.h + 40, w: tw - 40, size: 26, color: tn.muted, maxH: Math.max(140, 930 - (210 + head.h + 40)) }));
    const gx = 1000, gw = W - M - gx, cw = (gw - 28) / 2, ch = 330;
    stats.forEach((st, i) => {
      const x = gx + (i % 2) * (cw + 28), y = 214 + Math.floor(i / 2) * (ch + 28);
      els.push(R({ x, y, w: cw, h: ch, fill: tn.card, radius: s.radius }), ...b.figure({ value: st.value, x: x + 40, y: y + 56, w: cw - 60, size: 92, color: tn.hl }),
        b.body({ text: st.label, x: x + 40, y: y + 56 + 92 + 26, w: cw - 80, size: 23, lh: 1.45, color: tn.muted, maxH: 110 }));
    });
    els.push(...b.chrome(tn, n, total, { label }));
    return b.page(tn, els);
  });

  // ---- call to action
  slides.push((n, total) => {
    const c = d.cta, tn = tone[s.r.cta], els = [];
    const head = b.head({ text: c.heading, highlight: c.highlight, x: M, y: 0, w: 1520, size: 124, tone: tn, lines: 3 });
    const body = c.body ? b.body({ text: c.body, x: M, y: 0, w: 960, size: 30, lh: 1.5, color: tn.muted, maxH: 150 }) : null;
    const btn = b.pill({ text: c.buttonLabel, x: M, y: 0, font: 'IS', size: 28, ls: 0, upper: false, fg: tn.btnFg, bg: tn.btnBg, padX: 44, padY: 24 });
    const total_h = head.h + (body ? 44 + body.h : 0) + 64 + btn.h;
    let y = Math.max(210, Math.round((H - total_h) / 2));
    shift(head.els, y); y += head.h;
    els.push(...head.els);
    if (body) { body.y = y + 44; y = body.y + body.h; els.push(body); }
    shift(btn.els, y + 64);
    els.push(...btn.els);
    const contact = [d.closing.phone, d.closing.email].filter(Boolean).join('   ·   ');
    if (contact) els.push(T({ text: contact, x: M + btn.w + 44, y: y + 64 + (btn.h - 34) / 2, w: 1000, h: 34, font: 'IM', size: 26, color: tn.text }));
    els.push(...b.chrome(tn, n, total, { label }));
    return b.page(tn, els);
  });

  // ---- closing: thank you and how to reach us
  slides.push((n, total) => {
    const cl = d.closing, tn = tone[s.r.closing], els = [];
    if (s.ghost) els.push(b.ghost(d.brand.name, tn, { y: H - 300, size: 400 }));
    const text = cl.heading || `Thank you,\n${client}.`;
    const head = b.head({ text, highlight: cl.highlight || (cl.heading ? '' : `${client}.`), x: M, y: 250, w: 1000, size: 128, tone: tn, lines: 4 });
    els.push(...head.els, b.body({ text: 'The next step is a short call: we walk you through the plan and answer every question.', x: M, y: 250 + head.h + 44, w: 760, size: 28, color: tn.muted, maxH: 140 }));
    const x = 1250, w = W - M - x;
    const rows = [['phone', 'Call', cl.phone], ['mail', 'Write', cl.email], ['web', 'Visit', cl.website], ['pin', 'Meet', cl.address]].filter((r) => r[2]);
    let y = 262;
    for (const [icon, what, value] of rows) {
      const v = b.body({ text: value, x: x + 64, y: y + 58, w: w - 64, size: 27, lh: 1.4, font: 'IM', color: tn.text, maxH: 120 });
      els.push(R({ x, y, w, h: 1.5, fill: tn.line }), ICON({ name: icon, x, y: y + 34, w: 34, h: 34, color: tn.hl }), T({ text: what, x: x + 64, y: y + 26, w: w - 64, h: 28, font: 'IR', size: 20, color: tn.muted }), v);
      y += 58 + v.h + 30;
    }
    if (rows.length) els.push(R({ x, y, w, h: 1.5, fill: tn.line }));
    els.push(...b.chrome(tn, n, total, { label }));
    return b.page(tn, els);
  });

  const pages = slides.map((fn, i) => fn(i + 1, slides.length));
  return { pages };
}
