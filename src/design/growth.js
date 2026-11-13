import { W, H, WHITE, T, R, I, ICON, page, pad2, Builder } from './deck-kit.js';
import { normalizeData, serviceSlideTitle, LOGO, ASSETS } from './brochure-data.js';

/*
 * "Codeace Growth": the business website plan brochure (owner, 2026-11-10: "create a new default template for
 * business website plan", reference Downloads/Digital Growth Solutions for Bodhis LUXE.pdf).
 * Light lavender grid paper, Codeace blue, bold Inter headlines, mono eyebrows ("02 — THE OPPORTUNITY"), white
 * rounded cards with a soft shadow, photo cards with a floating label, a blue-to-violet call-to-action slide and a
 * big "Thank you." close. The palette and typefaces are fixed (Claude's theme is ignored).
 * Slides: cover → about → insight (verified stats only) → gaps (from the lead's SWOT) → how we help → one per
 * service → why us → call to action → thank you.
 * Input: BrochureData (src/design/brochure-data.js) plus the optional `gaps` and `about.more`.
 */
const M = 128;
const C = { paper: '#f4f5fa', ink: '#0a0f2c', blue: '#2b45d6', text: '#40465f', muted: '#5f6684', line: '#dfe3f2', soft: '#e4e8fb', softLine: '#cdd5f6', cyan: '#3fc4f2', violet: '#8a7bff' };
const A = (f) => `asset:brochure/growth/${f}`;
const PAPER = A('paper.jpg'), CTA_BG = A('cta.jpg'), GLOW = A('glow.png'), SHADOW = A('shadow.png'), SPHERE = A('sphere.png');
const INK_LOGO = 'asset:brochure/sig/codeace-ink.png';
const ASSET = (id) => { const a = ASSETS.find((x) => x.id === id); return a ? { src: a.src, alt: a.description } : null; };
const isCutout = (img) => !!img && /^asset:/.test(img.src) && ASSETS.some((a) => a.src === img.src && a.kind === 'cutout');
const shift = (els, dy) => { for (const e of els) e.y += dy; return els; };

/** Short label and icon per kind of service (by its name). */
const KINDS = [
  [/web|site|landing|e-?com|store|shop/i, 'Web', 'web'], [/\bai\b|agent|automat|chat|bot/i, 'AI', 'chat'], [/erp|crm|software|dashboard|billing/i, 'ERP', 'dashboard'],
  [/\bseo\b|\baeo\b|\bgeo\b|search|google|rank/i, 'Search', 'search'], [/social|instagram|marketing|ads|brand/i, 'Social', 'like'], [/shopify|cart|checkout/i, 'Shop', 'cart'],
];
const kindOf = (sv) => { const s = `${sv.name || ''}`; const k = KINDS.find(([re]) => re.test(s)); return k ? { label: k[1], icon: k[2] } : { label: String(sv.name || 'Service').split(/\s+/)[0], icon: 'bolt' }; };
/** The floating label on a service photo (the reference's "Speed · SEO · Security"). */
const TAGS = { Web: 'Speed · SEO · Security', AI: 'Always-on replies', ERP: 'One central dashboard', Search: 'Local + AI search', Social: 'Scrolls into enquiries', Shop: 'Checkout that converts' };
/** The catalogue photo per kind of service, when none was chosen. */
const PHOTOS = { Web: 'web-mockup', AI: 'robot', ERP: 'erp-laptop', Search: 'seo-report', Social: 'phone-instagram', Shop: 'web-mockup' };

class GrowthBuilder extends Builder {
  /** Bold Inter headline; `highlight` is drawn in Codeace blue. Shrinks to `lines`. */
  head({ text, highlight = '', x, y, w, size, lines = 2, color = C.ink, hl = C.blue, align = 'left', lh = 1.08 }) {
    let sz = size;
    const txt = String(text || '').replace(/\s*\n\s*/g, ' ').trim();
    const probe = () => T({ font: 'IB7', size: sz, ls: sz * -0.03, lh });
    while (this.wrap(probe(), txt, w).length > lines && sz > size * 0.62) sz -= 3;
    const r = this.rich({ text: txt, highlight: highlight && txt.includes(highlight) ? highlight : '', x, y, w, font: 'IB7', size: sz, lh, ls: sz * -0.03, color, hl, align });
    return r;
  }
  body({ text, x, y, w, size = 26, color = C.text, maxH = 300, font = 'IR', lh = 1.55, align = 'left' }) {
    return this.fitIn(T({ text: String(text || ''), x, y, w, font, size, lh, color, align }), maxH);
  }
  /** "02 — THE OPPORTUNITY" */
  eyebrow(text, x, y, color = C.blue, align = 'left', w = 1200) {
    return T({ text: String(text).toUpperCase(), x, y, w, h: 30, font: 'JM5', size: 21, ls: 4.2, lh: 1.2, color, align });
  }
  /** Soft shadow under a card (shadow.png: the shape sits at 20,26 350×210 in a 390×260 canvas). */
  shadow(x, y, w, h, opacity = 1) {
    const sx = w / 350, sy = h / 210;
    return I({ src: SHADOW, x: Math.round(x - 20 * sx), y: Math.round(y + 8 - 26 * sy), w: Math.round(390 * sx), h: Math.round(260 * sy), fit: 'fill', opacity });
  }
  card(x, y, w, h, { radius = 22, fill = WHITE, stroke = '#e8ebf6', shadow = true } = {}) {
    return [...(shadow ? [this.shadow(x, y, w, h)] : []), R({ x, y, w, h, radius, fill, stroke, sw: 1.5 })];
  }
  /** A white pill with an icon and a label (the floating badges). */
  badge({ text, icon = 'check', x, y, size = 22, align = 'left' }) {
    const t = T({ text, font: 'IS', size, lh: 1.2, color: C.ink });
    const tw = Math.ceil(this.width(t, text)), ih = Math.round(size * 1.25), h = Math.round(size * 2.6), w = 26 + ih + 14 + tw + 30;
    const bx = align === 'right' ? x - w : x;
    return { w, h, els: [this.shadow(bx, y, w, h, 0.9), R({ x: bx, y, w, h, radius: h / 2, fill: WHITE, stroke: '#e6e9f5', sw: 1.5 }),
      R({ x: bx + 18, y: y + (h - ih - 12) / 2, w: ih + 12, h: ih + 12, radius: (ih + 12) / 2, fill: C.soft }),
      ICON({ name: icon, x: bx + 24, y: y + (h - ih) / 2, w: ih, h: ih, color: C.blue }),
      Object.assign(t, { x: bx + 26 + ih + 14, y: y + (h - size * 1.2) / 2, w: tw + 8, h: Math.ceil(size * 1.2) })] };
  }
  /** Logo top left and "CLIENT · 02" top right. */
  chrome(label, n, { dark = false } = {}) {
    const lh = 60;
    return [
      I({ src: dark ? LOGO.src : INK_LOGO, x: M, y: 50, w: Math.round(lh * LOGO.ratio), h: lh, ha: 'left' }),
      T({ text: `${label} · ${pad2(n)}`, x: W - M - 900, y: 66, w: 900, h: 28, font: 'JM5', size: 20, ls: 3.6, lh: 1.2, color: dark ? '#d9ddff' : C.muted, align: 'right' }),
    ];
  }
}

/** BrochureData → editable pages in the Codeace Growth look. */
export function growthDesign(input) {
  const d = normalizeData(input);
  const b = new GrowthBuilder();
  const client = d.client.name, brand = d.brand.name;
  const label = client.toUpperCase().slice(0, 34);
  const services = d.services;
  const gaps = (input.gaps?.items || []).filter((g) => g && g.title).slice(0, 4);
  const slides = [];
  let section = 0;
  const next = (what) => `${pad2(++section)} — ${what}`;
  const paper = (els) => page(C.paper, els, PAPER);

  // ---- cover: the offer on the left, the blue panel with a visual and floating badges on the right
  slides.push(() => {
    const c = d.cover, els = [];
    const year = new Date().getFullYear();
    const tag = `${c.tag || 'Growth proposal'} · ${year}`;
    els.push(I({ src: INK_LOGO, x: M, y: 50, w: Math.round(66 * LOGO.ratio), h: 66, ha: 'left' }));
    const pill = b.pill({ text: tag, x: M, y: 0, font: 'JM5', size: 19, ls: 3.4, upper: true, fg: C.blue, bg: C.soft, border: C.softLine, bw: 1.5, padX: 26, padY: 12 });
    // "Digital Growth Solutions for <client>" when the title is the generic one, else the written title
    const generic = !c.title || /digital\s+growth/i.test(c.title);
    const titleText = generic ? `Digital Growth Solutions for ${client}` : String(c.title).replace(/\s*\n\s*/g, ' ');
    const title = b.head({ text: titleText, highlight: generic ? client : c.highlight, x: M, y: 0, w: 900, size: 100, lines: generic ? 4 : 3 });
    const sub = c.subtitle ? b.body({ text: c.subtitle, x: M, y: 0, w: 860, size: 26, lh: 1.55, color: C.text, maxH: 130 }) : null;
    const chips = b.pillRow((c.chips || []).slice(0, 6), { x: M, y: 0, maxW: 900, gap: 14, font: 'IS', size: 20, ls: 0, upper: false, fg: C.ink, bg: WHITE, border: '#dfe3f2', bw: 1.5, padX: 22, padY: 12 });
    const blockH = pill.h + 40 + title.h + (sub ? 34 + sub.h : 0) + (chips.h ? 44 + chips.h : 0);
    let y = Math.max(196, Math.round((H - blockH) / 2) + 20);
    shift(pill.els, y); y += pill.h + 40;
    shift(title.els, y); y += title.h;
    els.push(...pill.els, ...title.els);
    if (sub) { sub.y = y + 34; y = sub.y + sub.h; els.push(sub); }
    if (chips.h) { shift(chips.els, y + 44); els.push(...chips.els); }
    // right: outline, glow, blue squircle, visual, dots and badges
    const sx = 1170, sy = 250, sw = 640, sh = 650;
    els.push(R({ x: sx - 70, y: sy - 60, w: sw + 140, h: sh + 150, radius: 190, fill: 'none', stroke: '#c9d0f2', sw: 2, opacity: 0.9 }),
      I({ src: GLOW, x: sx - 160, y: sy - 120, w: sw + 320, h: sh + 300, fit: 'fill', opacity: 0.9 }),
      R({ x: sx, y: sy, w: sw, h: sh, radius: 150, fill: C.blue, gradient: { angle: 135, stops: [[0, '#3a50e2', 1], [1, '#5e48ec', 1]] } }));
    const hero = c.heroImage;
    if (hero && isCutout(hero)) els.push(I({ ...hero, x: sx - 40, y: sy - 140, w: sw + 80, h: H - (sy - 140), fit: 'contain', va: 'bottom' }));
    else {
      const img = hero || ASSET('web-mockup');
      els.push(I({ ...img, x: sx + 34, y: sy + 34, w: sw - 68, h: sh - 68, fit: 'cover', radius: 118 }));
    }
    els.push(R({ shape: 'ellipse', x: sx - 2, y: sy + 80, w: 22, h: 22, fill: C.cyan }), R({ shape: 'ellipse', x: sx + sw + 70, y: sy + 380, w: 14, h: 14, fill: C.violet }));
    const floats = (c.floats || ['More enquiries', 'Visibility & growth']).slice(0, 2);
    if (floats[0]) els.push(...b.badge({ text: floats[0], icon: 'growth', x: sx + sw + 50, y: sy + 120, align: 'right' }).els);
    if (floats[1]) els.push(...b.badge({ text: floats[1], icon: 'search', x: sx - 40, y: sy + sh - 110 }).els);
    return paper(els);
  });

  // ---- about the agency
  if (d.about) slides.push((n) => {
    const ab = d.about, els = [...b.chrome(label, n)];
    els.push(b.eyebrow(next('Who we are'), M, 140));
    const short = ab.heading && ab.heading.replace(/\s+/g, ' ').length <= 30;
    const head = b.head({ text: short ? ab.heading : 'About Us', highlight: short ? ab.highlight : '', x: M, y: 182, w: 880, size: 84, lines: 2 });
    els.push(...head.els);
    const lead = b.body({ text: ab.body, x: M, y: 0, w: 860, size: 34, lh: 1.4, font: 'IM', color: C.ink, maxH: 290 });
    const more = ab.more || ab.credential?.text || '';
    const body = more ? b.body({ text: more, x: M, y: 0, w: 860, size: 25, lh: 1.6, color: C.text, maxH: 200 }) : null;
    const tags = b.pillRow((ab.tags || []).slice(0, 5), { x: M, y: 0, maxW: 860, gap: 14, font: 'IS', size: 20, ls: 0, upper: false, fg: C.ink, bg: WHITE, border: '#dfe3f2', bw: 1.5, padX: 22, padY: 12 });
    const top = 182 + head.h, total = lead.h + (body ? 32 + body.h : 0) + (tags.h ? 40 + tags.h : 0);
    let y = Math.max(top + 70, Math.round(top + (930 - top - total) / 2));
    lead.y = y; y += lead.h; els.push(lead);
    if (body) { body.y = y + 32; y = body.y + body.h; els.push(body); }
    if (tags.h) { shift(tags.els, y + 40); els.push(...tags.els); }
    // visual: outline, glow, the 3D chart (or the chosen image), a "trusted since" badge
    const vx = 1060, vy = 230, vw = 700, vh = 720;
    els.push(R({ x: vx, y: vy, w: vw, h: vh, radius: 220, fill: 'none', stroke: '#c9d0f2', sw: 2 }), I({ src: GLOW, x: vx + 40, y: vy + 60, w: vw - 80, h: vh - 80, fit: 'fill' }));
    const img = ab.image || ASSET('coin');
    els.push(isCutout(img) ? I({ ...img, x: vx + 90, y: vy + 40, w: vw - 180, h: vh - 120, fit: 'contain' }) : I({ ...img, x: vx + 70, y: vy + 70, w: vw - 140, h: vh - 160, fit: 'cover', radius: 40 }));
    if (ab.credential?.title) els.push(...b.badge({ text: ab.credential.title, icon: 'shield', x: vx + 20, y: vy + vh - 150 }).els);
    return paper(els);
  });

  // ---- the shift in their market (only with verified figures)
  if (d.insight) slides.push((n) => {
    const ins = d.insight, els = [...b.chrome(label, n)];
    els.push(b.eyebrow(next('The opportunity'), M, 140));
    const head = b.head({ text: ins.heading, highlight: ins.highlight, x: M, y: 182, w: W - 2 * M, size: 84, lines: 2 });
    els.push(...head.els);
    const k = ins.stats.length, gap = 28, cw = (W - 2 * M - gap * (k - 1)) / k, cy = Math.max(330, 182 + head.h + 70), ch = 300;
    ins.stats.forEach((st, i) => {
      const x = M + i * (cw + gap);
      els.push(...b.card(x, cy, cw, ch), T({ text: st.value, x: x + 44, y: cy + 46, w: cw - 70, h: 116, font: 'IB7', size: k > 3 ? 92 : 108, lh: 1.05, ls: -3, color: C.blue }),
        b.body({ text: st.label, x: x + 44, y: cy + 176, w: cw - 88, size: 25, lh: 1.45, color: C.text, maxH: 100 }));
    });
    if (ins.statement) {
      const st = b.body({ text: ins.statement, x: M + 36, y: cy + ch + 74, w: 1500, size: 30, lh: 1.5, font: 'IR', color: C.ink, maxH: 140 });
      els.push(R({ x: M, y: st.y - 4, w: 6, h: st.h + 8, radius: 3, fill: C.blue }), st);
    }
    return paper(els);
  });

  // ---- where the client loses customers today (from the lead's SWOT)
  if (gaps.length) slides.push((n) => {
    const g = input.gaps, els = [...b.chrome(label, n)];
    els.push(b.eyebrow(next('Where you lose customers'), M, 140));
    const head = b.head({ text: g.heading || `Where ${client} loses customers today`, highlight: g.highlight, x: M, y: 182, w: W - 2 * M, size: 76, lines: 2 });
    els.push(...head.els);
    let y = 182 + head.h + 30;
    if (g.note) { const note = b.body({ text: g.note, x: M, y, w: 1300, size: 26, color: C.text, maxH: 90 }); els.push(note); y += note.h; }
    const cols = gaps.length === 3 ? 3 : 2, gap = 28, cw = (W - 2 * M - gap * (cols - 1)) / cols, rows = Math.ceil(gaps.length / cols);
    const top = Math.max(y + 56, 400), room = Math.floor((990 - top - gap * (rows - 1)) / rows);
    // measure first: the cards are as tall as the longest text needs (at least 200), never taller than the room
    const parts = gaps.map((it) => {
      const t = b.fitIn(T({ text: it.title, x: 0, y: 0, w: cw - 168, font: 'IS', size: 30, lh: 1.25, color: C.ink }), 80);
      const p = it.text ? b.body({ text: it.text, x: 0, y: 0, w: cw - 168, size: 23, lh: 1.5, color: C.text, maxH: room - t.h - 92 }) : null;
      return { t, p, need: 40 + t.h + (p ? 12 + p.h : 0) + 44 };
    });
    const ch = Math.min(room, Math.max(200, ...parts.map((x) => x.need)));
    const y0 = top + Math.round(Math.max(0, 990 - top - (rows * ch + gap * (rows - 1))) * 0.42); // centred, a little high
    parts.forEach(({ t, p }, i) => {
      const x = M + (i % cols) * (cw + gap), cy = y0 + Math.floor(i / cols) * (ch + gap);
      Object.assign(t, { x: x + 128, y: cy + 40 });
      els.push(...b.card(x, cy, cw, ch), R({ x: x + 40, y: cy + 40, w: 64, h: 64, radius: 16, fill: C.soft }),
        T({ text: pad2(i + 1), x: x + 40, y: cy + 58, w: 64, h: 28, font: 'JM5', size: 22, color: C.blue, align: 'center' }), t);
      if (p) els.push(Object.assign(p, { x: x + 128, y: cy + 40 + t.h + 12 }));
    });
    return paper(els);
  });

  // ---- how we help: one card per service
  if (d.approach) slides.push((n) => {
    const ap = d.approach, els = [...b.chrome(label, n)];
    els.push(b.eyebrow(next('What we do'), M, 140));
    const head = b.head({ text: ap.heading, highlight: ap.highlight, x: M, y: 182, w: W - 2 * M, size: 84, lines: 2 });
    els.push(...head.els);
    if (ap.body) els.push(b.body({ text: ap.body, x: M, y: 182 + head.h + 30, w: 1340, size: 28, lh: 1.5, color: C.text, maxH: 140 }));
    const k = services.length, perRow = k <= 5 ? k : Math.ceil(k / 2), rows = Math.ceil(k / perRow), gap = 26;
    const cw = (W - 2 * M - gap * (perRow - 1)) / perRow, ch = rows === 1 ? 330 : 250, top = rows === 1 ? 600 : 450;
    services.forEach((sv, i) => {
      const x = M + (i % perRow) * (cw + gap), y = top + Math.floor(i / perRow) * (ch + gap), kd = kindOf(sv);
      const small = rows > 1 || perRow > 4;
      els.push(...b.card(x, y, cw, ch), T({ text: pad2(i + 1), x: x + 30, y: y + 28, w: 80, h: 24, font: 'JM5', size: 18, color: C.muted }),
        R({ x: x + 30, y: y + 66, w: 58, h: 58, radius: 15, fill: C.blue, gradient: { angle: 135, stops: [[0, '#3a50e2', 1], [1, '#5e48ec', 1]] } }),
        ICON({ name: kd.icon, x: x + 44, y: y + 80, w: 30, h: 30, color: WHITE }));
      const nm = b.fitIn(T({ text: sv.name, x: x + 30, y: y + (small ? 142 : 150), w: cw - 56, font: 'IB7', size: small ? 28 : 32, lh: 1.15, ls: -0.6, color: C.ink }), small ? 70 : 76);
      els.push(nm, b.body({ text: sv.summary, x: x + 30, y: nm.y + nm.h + 12, w: cw - 56, size: small ? 20 : 22, lh: 1.45, color: C.text, maxH: ch - (nm.y - y) - nm.h - 36 }));
    });
    return paper(els);
  });

  // ---- one slide per service: the case on the left, benefits as cards, a photo card on the right
  services.forEach((sv, i) => slides.push((n) => {
    const els = [...b.chrome(label, n)], kd = kindOf(sv);
    els.push(b.eyebrow(`Service ${pad2(i + 1)} — ${kd.label}`, M, 140));
    const head = b.head({ text: serviceSlideTitle(sv), x: M, y: 182, w: 1020, size: 84, lines: 2 });
    els.push(...head.els);
    const text = [sv.lead, sv.body].filter(Boolean).join(' ');
    const para = b.body({ text, x: M, y: 0, w: 880, size: 27, lh: 1.55, color: C.text, maxH: 300 });
    const ben = (sv.benefits || []).slice(0, 4), bw = 430, bh = 104, gap = 20;
    const benH = ben.length ? Math.ceil(ben.length / 2) * (bh + gap) - gap : 0;
    const top = 182 + head.h, room = 1000 - top;
    let y = top + Math.max(56, Math.round((room - para.h - (benH ? 50 + benH : 0)) / 2) - 10);
    para.y = y; y += para.h + 50; els.push(para);
    ben.forEach((t, j) => {
      const x = M + (j % 2) * (bw + gap), cy = y + Math.floor(j / 2) * (bh + gap);
      els.push(...b.card(x, cy, bw, bh, { radius: 18 }), R({ x: x + 24, y: cy + (bh - 42) / 2, w: 42, h: 42, radius: 11, fill: C.blue }),
        ICON({ name: 'check-bold', x: x + 33, y: cy + (bh - 24) / 2, w: 24, h: 24, color: WHITE }),
        b.body({ text: t, x: x + 84, y: 0, w: bw - 108, size: 21, lh: 1.35, font: 'IM', color: C.ink, maxH: bh - 20 }));
      const last = els[els.length - 1];
      last.y = cy + (bh - last.h) / 2;
    });
    // photo card
    const px = 1110, py = 300, pw = 1792 - px, ph = 650;
    const img = sv.image || (PHOTOS[kd.label] && ASSET(PHOTOS[kd.label]));
    els.push(I({ src: GLOW, x: px - 120, y: py - 100, w: pw + 240, h: ph + 200, fit: 'fill', opacity: 0.8 }), b.shadow(px, py, pw, ph));
    if (img && !isCutout(img)) els.push(I({ ...img, x: px, y: py, w: pw, h: ph, fit: 'cover', radius: 36 }));
    else {
      els.push(R({ x: px, y: py, w: pw, h: ph, radius: 36, fill: C.blue, gradient: { angle: 135, stops: [[0, '#3a50e2', 1], [1, '#6a4cf0', 1]] } }));
      if (img) els.push(I({ ...img, x: px + 50, y: py + 30, w: pw - 100, h: ph - 120, fit: 'contain' }));
      else els.push(R({ x: px + pw / 2 - 110, y: py + ph / 2 - 150, w: 220, h: 220, radius: 56, fill: WHITE, opacity: 0.14 }), ICON({ name: kd.icon, x: px + pw / 2 - 60, y: py + ph / 2 - 100, w: 120, h: 120, color: WHITE }));
    }
    const tag = sv.tag || TAGS[kd.label];
    if (tag) els.push(...b.badge({ text: tag, icon: kd.icon, x: px + 30, y: py + ph - 96, size: 21 }).els);
    return paper(els);
  }));

  // ---- why this agency: a team photo, the case and four proof figures
  if (d.whyUs) slides.push((n) => {
    const wy = d.whyUs, els = [...b.chrome(label, n)], stats = wy.stats || [];
    els.push(b.eyebrow(next(`Why ${brand}`), M, 140));
    const short = wy.heading && wy.heading.replace(/\s+/g, ' ').length <= 30;
    const head = b.head({ text: short ? wy.heading : 'Why Choose Us', highlight: short ? wy.highlight : '', x: M, y: 182, w: W - 2 * M, size: 84, lines: 1 });
    els.push(...head.els);
    const py = 182 + head.h + 60, pw = 560, ph = 1000 - py;
    const photo = wy.image && !isCutout(wy.image) ? wy.image : ASSET('team-table');
    els.push(b.shadow(M, py, pw, ph), I({ ...photo, x: M, y: py, w: pw, h: ph, fit: 'cover', radius: 36 }),
      ...b.badge({ text: `Your digital growth partner`, icon: 'users', x: M + 28, y: py + ph - 96, size: 21 }).els);
    const rx = M + pw + 70, rw = W - M - rx;
    const body = b.body({ text: wy.body, x: rx, y: py - 6, w: rw, size: 26, lh: 1.55, color: C.text, maxH: stats.length ? 250 : 600 });
    els.push(body);
    const gap = 24, cw = (rw - gap) / 2, top = body.y + body.h + 44, ch = Math.min(200, Math.floor((1000 - top - gap) / 2));
    stats.forEach((st, i) => {
      const x = rx + (i % 2) * (cw + gap), y = top + Math.floor(i / 2) * (ch + gap);
      els.push(...b.card(x, y, cw, ch), T({ text: st.value, x: x + 38, y: y + Math.round(ch * 0.2), w: cw - 60, h: 84, font: 'IB7', size: 76, lh: 1.05, ls: -2, color: C.blue }),
        b.body({ text: st.label, x: x + 38, y: y + Math.round(ch * 0.2) + 96, w: cw - 70, size: 22, lh: 1.4, color: C.text, maxH: ch - Math.round(ch * 0.2) - 104 }));
    });
    return paper(els);
  });

  // ---- call to action on the blue gradient
  slides.push((n) => {
    const c = d.cta, els = [...b.chrome(label, n, { dark: true })];
    els.push(R({ x: 520, y: 130, w: 880, h: 840, radius: 210, fill: 'none', stroke: WHITE, sw: 2, opacity: 0.16 }),
      R({ shape: 'ellipse', x: 1440, y: 214, w: 22, h: 22, fill: C.cyan }), R({ shape: 'ellipse', x: 600, y: 816, w: 14, h: 14, fill: WHITE, opacity: 0.85 }));
    const eb = b.eyebrow(c.eyebrow || 'Next step', 0, 0, '#dfe3ff', 'center', W);
    const head = b.head({ text: c.heading, x: 210, y: 0, w: W - 420, size: 108, lines: 3, color: WHITE, hl: WHITE, align: 'center', lh: 1.06 });
    const body = c.body ? b.body({ text: c.body, x: 460, y: 0, w: W - 920, size: 28, lh: 1.5, color: '#e6e9ff', align: 'center', maxH: 130 }) : null;
    const btnText = T({ text: c.buttonLabel || 'Book a Free Strategy Call', font: 'IS', size: 30, lh: 1.2, color: C.blue });
    const tw = Math.ceil(b.width(btnText, btnText.text)), bh = 92, bw = 56 + tw + 20 + 30 + 50;
    const total = 30 + 34 + head.h + (body ? 34 + body.h : 0) + 60 + bh;
    let y = Math.round((H - total) / 2);
    eb.y = y; y += 64;
    shift(head.els, y); y += head.h;
    els.push(eb, ...head.els);
    if (body) { body.y = y + 34; y = body.y + body.h; els.push(body); }
    const bx = (W - bw) / 2, by = y + 60;
    els.push(R({ x: bx, y: by, w: bw, h: bh, radius: bh / 2, fill: WHITE }), Object.assign(btnText, { x: bx + 56, y: by + (bh - 36) / 2, w: tw + 8, h: 36 }),
      ICON({ name: 'play', x: bx + 56 + tw + 20, y: by + (bh - 30) / 2, w: 30, h: 30, color: C.blue }));
    return page('#2b3fcf', els, CTA_BG);
  });

  // ---- thank you
  slides.push(() => {
    const cl = d.closing, els = [];
    els.push(R({ x: M, y: 128, w: W - 2 * M, h: 1.5, fill: C.line }), I({ src: INK_LOGO, x: M, y: 162, w: Math.round(64 * LOGO.ratio), h: 64, ha: 'left' }),
      T({ text: (d.cover.tag || 'Digital growth solutions').toUpperCase(), x: W - M - 900, y: 182, w: 900, h: 28, font: 'JM5', size: 20, ls: 3.6, lh: 1.2, color: C.muted, align: 'right' }),
      R({ x: M, y: 262, w: 1040, h: 1.5, fill: C.line }));
    // disc with a glossy sphere
    const cx = 1500, cy = 560, r = 236;
    els.push(R({ x: cx - r - 110, y: cy - r - 86, w: 2 * r + 220, h: 2 * r + 186, radius: 190, fill: 'none', stroke: '#c9d0f2', sw: 2 }),
      I({ src: GLOW, x: cx - r - 80, y: cy - r - 40, w: 2 * r + 160, h: 2 * r + 160, fit: 'fill' }),
      R({ shape: 'ellipse', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: C.blue, gradient: { angle: 135, stops: [[0, '#3c55e8', 1], [1, '#6a45ee', 1]] } }),
      I({ src: SPHERE, x: cx - 105, y: cy - 105, w: 210, h: 210, fit: 'fill' }), R({ shape: 'ellipse', x: cx - r - 110, y: cy - r - 70, w: 20, h: 20, fill: C.cyan }));
    const head = b.rich({ text: cl.heading || 'Thank you.', highlight: cl.heading ? cl.highlight || '' : 'you.', x: M - 8, y: 380, w: 1100, font: 'IB7', size: 200, lh: 1.02, ls: -9, color: C.ink, hl: C.blue });
    els.push(...head.els, b.body({ text: `Let’s build what’s next for ${client}.`, x: M, y: 380 + head.h + 26, w: 1000, size: 30, lh: 1.4, color: C.text, maxH: 90 }));
    els.push(R({ x: M, y: 832, w: W - 2 * M, h: 1.5, fill: C.line }));
    const cols = [['Phone', cl.phone], [cl.address ? 'Studio' : 'Web', cl.address || cl.website], ['Email', cl.email]].filter((c) => c[1]);
    const xs = cols.length === 3 ? [M, 535, 1430] : [M, 760, 1430];
    cols.forEach(([k, v], i) => {
      const w = (i + 1 < cols.length ? xs[i + 1] : W - M) - xs[i] - 40;
      els.push(T({ text: k.toUpperCase(), x: xs[i], y: 868, w, h: 26, font: 'JM5', size: 18, ls: 3.4, lh: 1.2, color: C.muted }),
        b.body({ text: v, x: xs[i], y: 906, w, size: 26, lh: 1.35, font: 'IM', color: k === 'Email' ? C.blue : C.ink, maxH: 76 }));
    });
    return paper(els);
  });

  return { pages: slides.map((fn, i) => fn(i + 1, slides.length)) };
}
