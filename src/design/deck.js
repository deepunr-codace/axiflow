import { newId } from './model.js';
import { measureText, lineWidth, scratchDoc } from './render-pdf.js';

/*
 * "Codeace Growth Deck": the owner's brochure template (Downloads/files/brochure-template,
 * a Next.js design, 2026-11-05) rebuilt as editable pages for the design engine. Same
 * 1920×1080 slides, positions, colours and fonts as its CSS (brochure.module.css):
 * Unbounded for headings (UM/US), Hanken Grotesk for text (HR/HM/HS).
 * Fed by the same structured copy as the classic layout (src/ai/brochure.js).
 * Images: assets/brochure/deck (the template's sample images; WebP turned into PNG).
 */
const W = 1920, H = 1080, PAD = 128, FOOT = 160, ROW = H - PAD - FOOT; // content area 792 high
const THEME = { primary: '#2d4bd8', ink: '#0b1033', paper: '#f3f4f9', accent: '#d7ff3f' };
const WHITE = '#ffffff';
const IMG = (f) => `asset:brochure/deck/${f}`;
const LOGO = { src: IMG('codeace.png'), ratio: 361 / 156 };
const NORMAL = { HR: 1.303, HM: 1.303, HS: 1.303, UM: 1.24, US: 1.24 }; // CSS line-height: normal

// Fixed agency copy of the template (the AI writes the rest, see contentToDeck).
const DECK = {
  tag: 'Digital Growth Proposal',
  about_heading: 'A next-gen digital transformation company.', about_highlight: 'transformation',
  credential: { title: 'Trusted since 2018', text: 'A multi-million dollar global technology firm.' },
  tags: ['Software Development', 'Automation', 'SEO', 'Branding'],
  insight_stats: [
    { value: '88%', label: 'of people look online before choosing a service' },
    { value: '72%', label: 'will move on if they can’t find your business or book instantly' },
    { value: '60%', label: 'of customers trust brands active on Instagram & YouTube' },
  ],
  approach_heading: 'How We Help\nYou Grow',
  why_heading: 'Not just a provider — your digital growth partner.', why_highlight: 'digital growth partner.',
  cta_eyebrow: 'Let’s begin',
};
const CHIP = { website: 'Website', automation: 'AI Automation', erp: 'ERP', seo: 'SEO', social: 'Social Media' };
const VISUALS = {
  website: { image: 'mockup.jpg', accent: 'bubbles.png', visual: 'wide' },
  automation: { image: 'robot.jpg', accent: 'aihand.png', visual: 'wide' },
  erp: { image: 'laptop.jpg', accent: 'erp3d.png', visual: 'square' },
  seo: { image: 'console.jpg', accent: 'seoguy.png', visual: 'portrait' },
  social: { image: 'phone.jpg', accent: 'socialgirl.png', visual: 'wide-low' },
};

// ------------------------------------------------------------ helpers
/** color-mix(in srgb, a pct%, b) */
function mix(a, pct, b) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v * pct / 100 + y[i] * (1 - pct / 100)).toString(16).padStart(2, '0')).join('');
}
const T = (o) => ({ id: newId(), type: 'text', font: 'HR', color: WHITE, align: 'left', lh: NORMAL[o.font || 'HR'], ls: 0, list: '', gap: 8, h: 40, opacity: 1, outline: 0, rot: 0, ...o });
const R = (o) => ({ id: newId(), type: 'shape', shape: 'rect', fill: WHITE, stroke: 'none', sw: 1, radius: 0, gradient: null, opacity: 1, ...o });
const I = (o) => ({ id: newId(), type: 'image', fit: 'contain', radius: 0, opacity: 1, ha: 'center', va: 'center', ...o });
const ICON = (o) => ({ id: newId(), type: 'icon', color: WHITE, opacity: 1, ...o });
const page = (bg, elements, image = '') => ({ id: newId(), w: W, h: H, bg: { color: bg, image }, elements });
const pad2 = (n) => String(n).padStart(2, '0');
const ring = (cx, cy, r, color, sw, opacity) => R({ shape: 'ellipse', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: 'none', stroke: color, sw, opacity });

/** Colours each slide background gives its content (the template's .bgPaper/.bgPrimary/.bgInk/.bgAccent). */
function tones(t) {
  const onAccent = t.ink;
  return {
    paper: { bg: t.paper, heading: t.ink, muted: mix(t.ink, 74, t.paper), eyebrow: t.primary, hl: t.primary, line: mix(t.ink, 14, t.paper), card: WHITE, cardLine: mix(t.ink, 12, t.paper), pillBg: t.primary, pillFg: WHITE, ghost: mix(t.primary, 35, t.paper) },
    primary: { bg: t.primary, heading: WHITE, muted: mix(WHITE, 84, t.primary), eyebrow: t.accent, hl: t.accent, line: mix(WHITE, 30, t.primary), card: mix(WHITE, 8, t.primary), cardLine: mix(WHITE, 22, t.primary), pillBg: t.accent, pillFg: onAccent, ghost: mix(WHITE, 35, t.primary) },
    ink: { bg: t.ink, heading: WHITE, muted: mix(WHITE, 68, t.ink), eyebrow: t.accent, hl: t.accent, line: mix(WHITE, 22, t.ink) },
    accent: { bg: t.accent, heading: onAccent, muted: mix(onAccent, 85, t.accent), eyebrow: onAccent, hl: t.primary },
  };
}

class Builder {
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
   * A heading with an optional highlighted phrase (accent colour). Wrapped here so the editor and
   * the PDF break lines at the same words; a highlighted line is split into coloured pieces.
   * Returns { els, h }.
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
      return { els: [e], h: e.h };
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
        if (t.trim()) els.push(T({ ...proto, text: t.trim(), x: cx + (this.width(proto, t) - this.width(proto, t.trimStart())), y: y + i * lineH, w: Math.ceil(this.width(proto, t.trim())) + 8, h: Math.ceil(lineH), color: c }));
        cx += tw;
      }
    });
    return { els, h: Math.ceil(lineH * lines.length) };
  }
  /** A pill with text (eyebrow pills, chips, tags). Returns { els, w, h }. */
  pill({ text, x, y, font = 'HS', size = 24, ls = 2, upper = true, fg, bg = 'none', border = 'none', padX = 22, padY = 10 }) {
    const label = upper ? String(text).toUpperCase() : String(text);
    const t = T({ text: label, font, size, ls, color: fg, lh: NORMAL[font] });
    const tw = Math.ceil(this.width(t, label));
    const bw = border === 'none' ? 0 : 1;
    const h = Math.ceil(size * NORMAL[font] + 2 * padY + 2 * bw);
    const w = tw + 2 * padX + 2 * bw;
    Object.assign(t, { x: x + padX + bw, y: y + padY + bw, w: tw + 6, h: Math.ceil(size * NORMAL[font]) });
    return { els: [R({ x, y, w, h, radius: h / 2, fill: bg, stroke: border, sw: bw || 1 }), t], w, h };
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
  footer(tone, label, n, total) {
    const o = { font: 'HM', size: 24, ls: 2, color: tone.muted, y: H - 64 - 32, h: 32 };
    return [T({ ...o, text: label.toUpperCase(), x: PAD, w: 1200 }), T({ ...o, text: `${pad2(n)} / ${pad2(total)}`, x: W - PAD - 300, w: 300, align: 'right' })];
  }
  eyebrow(tone, text, x, y, w = 1000) {
    return T({ text: String(text).toUpperCase(), x, y, w, h: 32, font: 'HS', size: 24, ls: 3, color: tone.eyebrow });
  }
}

/** Stacks blocks vertically with a gap; returns the y after the last one. */
const stack = (blocks, y, gap) => { let cy = y; blocks.forEach((b, i) => { b.place(cy); cy += b.h + (i < blocks.length - 1 ? gap : 0); }); return cy; };
const block = (els, h) => ({ els, h, place(y0) { const dy = y0 - (this.at ?? 0); for (const e of els) e.y += dy; this.at = y0; } });

// ------------------------------------------------------------ the deck
/** content = brochure copy (src/ai/brochure.js); opts.company = the client's name; opts.cover = an uploaded hero photo. */
export function deckDesign(content, settings, { company = '', cover = '' } = {}) {
  const b = new Builder();
  const t = THEME, tone = tones(t);
  const a = settings.agency || {};
  const brand = a.name || 'Codeace';
  const client = company || 'Your Client';
  const footLabel = `${brand} × ${client}`;
  const services = (content.services || []).slice(0, 8);
  const slides = []; // [kind, build(n, total)]
  const chapters = {};
  let chapter = 0;
  const ch = (k, label) => (chapters[k] = `${pad2(++chapter)} — ${label}`);
  ch('about', 'About Us'); ch('insight', 'The Digital Shift'); ch('approach', 'How We Help'); ch('why', 'Why Choose Us');

  // ---- 1. cover
  slides.push(() => {
    const els = [];
    [[640, 0.14], [800, 0.095], [960, 0.05]].forEach(([r, op]) => els.push(ring(1456, 1080, r, WHITE, 1.5, op)));
    els.push(R({ x: 1112, y: 168, w: 688, h: 912 + 344, radius: 344, fill: t.ink }));
    els.push(I({ src: cover || IMG('stylist.png'), x: 1016, y: 180, w: 880, h: 900, fit: 'contain', va: 'bottom' }));
    els.push(R({ shape: 'ellipse', x: 1584, y: 120, w: 208, h: 208, fill: t.accent }));
    const badge = b.fit(T({ text: `For ${client}`, x: 1612, y: 0, w: 152, font: 'US', size: 24, lh: 1.2, align: 'center', color: t.ink, rot: -12 }));
    while (badge.h > 140 && badge.size > 16) { badge.size -= 2; b.fit(badge); }
    badge.y = 224 - badge.h / 2;
    els.push(badge);
    els.push(I({ src: LOGO.src, x: PAD, y: PAD, w: Math.round(78 * LOGO.ratio), h: 78, ha: 'left' }));
    // main block: pill, title, subtitle (gap 32)
    const titleText = String(content.cover_title || 'Digital Growth Solutions').replace(/\s+for\s+.+$/i, '').trim().replace(/([^.!?])$/, '$1.');
    let size = 120, lines;
    const probe = T({ font: 'US', size, ls: -4 });
    for (;;) { lines = b.wrap(probe, titleText, 900); if (lines.length <= 3 || size <= 84) break; size -= 6; Object.assign(probe, { size, ls: -size / 30 }); }
    const pill = b.pill({ text: DECK.tag, x: PAD, y: 0, fg: t.ink, bg: t.accent });
    const title = b.rich({ text: lines.join('\n'), highlight: lines.at(-1), x: PAD, y: 0, w: 900, size, lh: 1, ls: probe.ls, color: WHITE, hl: t.accent });
    const sub = b.fitIn(T({ text: content.cover_subtitle || '', x: PAD, y: 0, w: 720, size: 28, lh: 1.5, color: tone.primary.muted }), 210);
    const chipNames = services.map((s) => CHIP[s.id] || s.name).slice(0, 6);
    const chips = b.pillRow(chipNames, { x: PAD, y: 0, maxW: 880, font: 'HM', upper: false, ls: 0, fg: WHITE, border: mix(WHITE, 50, t.primary) });
    const mainH = pill.h + 32 + title.h + 32 + sub.h;
    const gap = (H - 2 * PAD - 78 - mainH - chips.h) / 2;
    const mainY = PAD + 78 + gap;
    const blocks = [block(pill.els, pill.h), block(title.els, title.h), block([sub], sub.h)];
    stack(blocks, mainY, 32);
    const chipBlock = block(chips.els, chips.h); chipBlock.place(H - PAD - chips.h);
    els.push(...blocks.flatMap((x) => x.els), ...chips.els);
    return page(t.primary, els);
  });

  // ---- 2. about
  slides.push((n, total) => {
    const tn = tone.paper, els = [...b.footer(tn, footLabel, n, total)];
    const eb = b.eyebrow(tn, chapters.about, PAD, 0);
    const head = b.rich({ text: DECK.about_heading, highlight: DECK.about_highlight, x: PAD, y: 0, w: 1000, size: 68, lh: 1.08, ls: -2, color: tn.heading, hl: tn.hl });
    const body = b.fitIn(T({ text: (content.about || [])[0] || '', x: PAD, y: 0, w: 920, size: 28, lh: 1.55, color: tn.muted }), 260);
    const top = [block([eb], 32), block(head.els, head.h), block([body], body.h)];
    stack(top, PAD, 28);
    els.push(...top.flatMap((x) => x.els));
    // credential card + tags, bottom aligned
    const cTitle = T({ text: DECK.credential.title, font: 'HS', size: 28, color: WHITE, w: 488 });
    const cBody = b.fit(T({ text: DECK.credential.text, size: 24, lh: 1.4, color: mix(WHITE, 68, t.ink), w: 488 }));
    b.fit(cTitle);
    const textH = cTitle.h + 6 + cBody.h;
    const cardH = Math.max(95, textH) + 64;
    const tags = b.pillRow(DECK.tags, { x: PAD, y: 0, maxW: 1000, font: 'HM', upper: false, ls: 0, fg: t.ink, bg: tn.card, border: tn.cardLine });
    const tagsY = PAD + ROW - tags.h;
    const cardY = tagsY - 24 - cardH;
    tags.els.forEach((e) => (e.y += tagsY));
    const tx = PAD + 40 + 220 + 32;
    els.push(R({ x: PAD, y: cardY, w: 852, h: cardH, radius: 28, fill: t.ink }),
      I({ src: LOGO.src, x: PAD + 40, y: cardY + (cardH - 95) / 2, w: 220, h: 95 }),
      R({ x: tx, y: cardY + 32, w: 1, h: cardH - 64, fill: mix(WHITE, 25, t.ink) }),
      Object.assign(cTitle, { x: tx + 32, y: cardY + (cardH - textH) / 2 }),
      Object.assign(cBody, { x: tx + 32, y: cardY + (cardH - textH) / 2 + cTitle.h + 6 }),
      ...tags.els);
    // image panel
    const px = PAD + 1000 + 104;
    els.push(R({ x: px, y: PAD, w: 560, h: ROW, radius: 40, fill: t.primary }),
      ring(px + 280, PAD + 400, 200, WHITE, 1.5, 0.14), ring(px + 280, PAD + 400, 270, WHITE, 1.5, 0.095),
      I({ src: IMG('coin.png'), x: px + 48, y: PAD + 72, w: 464, h: 600 }));
    return page(tn.bg, els);
  });

  // ---- 3. insight (the digital shift)
  slides.push((n, total) => {
    const tn = tone.ink, els = [];
    els.push(R({ shape: 'ellipse', x: 1192, y: 228, w: 640, h: 640, fill: 'none', stroke: mix(t.accent, 55, t.ink), sw: 2 }),
      R({ shape: 'ellipse', x: 1232, y: 268, w: 560, h: 560, fill: t.primary }),
      I({ src: IMG('man.png'), x: 1232, y: 232, w: 560, h: 640, va: 'bottom' }));
    els.push(...b.footer(tn, footLabel, n, total));
    const shift = String(content.shift_title || 'The Digital Shift').replace(/\s+in\s+/i, (m) => `${m.trimEnd()}\n`).replace(/\n\s*/, '\n');
    const eb = b.eyebrow(tn, chapters.insight, PAD, 0);
    const head = b.rich({ text: shift, x: PAD, y: 0, w: 1000, size: 64, lh: 1.08, ls: -2, color: WHITE, hl: tn.hl });
    const top = [block([eb], 32), block(head.els, head.h)];
    const topEnd = stack(top, PAD, 28);
    els.push(...top.flatMap((x) => x.els));
    // statement at the bottom
    const paras = content.shift_paragraphs || [];
    const st = b.fitIn(T({ text: paras[2] || paras.at(-1) || '', x: PAD + 44, y: 0, w: 1000 - 88, font: 'HM', size: 30, lh: 1.45, color: WHITE }), 180);
    const stH = st.h + 72, stY = PAD + ROW - stH;
    st.y = stY + 36;
    els.push(R({ x: PAD, y: stY, w: 1000, h: stH, radius: 28, fill: t.primary }), st);
    // stats in the middle (space-between)
    const stats = DECK.insight_stats.slice(0, 4);
    const small = stats.length > 3;
    const sw = (1000 - 40 * (stats.length - 1)) / stats.length;
    const vSize = small ? 80 : 104;
    const labels = stats.map((s) => b.fit(T({ text: s.label, w: sw, size: 26, lh: 1.4, color: tn.muted })));
    const statsH = 1 + 24 + vSize + 16 + Math.max(...labels.map((l) => l.h));
    const sy = topEnd + (stY - topEnd - statsH) / 2;
    stats.forEach((s, i) => {
      const x = PAD + i * (sw + 40);
      els.push(R({ x, y: sy, w: sw, h: 1, fill: tn.line }),
        T({ text: s.value, x, y: sy + 25, w: sw + 20, h: vSize, font: 'US', size: vSize, lh: 1, ls: small ? -3 : -4, color: t.accent }),
        Object.assign(labels[i], { x, y: sy + 25 + vSize + 16 }));
    });
    return page(tn.bg, els);
  });

  // ---- 4. approach (services index)
  slides.push((n, total) => {
    const tn = tone.primary, els = [...b.footer(tn, footLabel, n, total)];
    const eb = b.eyebrow(tn, chapters.approach, PAD, 0, 680);
    const head = b.rich({ text: DECK.approach_heading, x: PAD, y: 0, w: 680, size: 64, lh: 1.08, ls: -2, color: WHITE, hl: tn.hl });
    const body = b.fitIn(T({ text: content.help_intro || '', x: PAD, y: 0, w: 680, size: 28, lh: 1.5, color: tn.muted }), 230);
    const top = [block([eb], 32), block(head.els, head.h), block([body], body.h)];
    stack(top, PAD, 28);
    els.push(...top.flatMap((x) => x.els), I({ src: IMG('team.jpg'), x: PAD, y: PAD + ROW - 280, w: 680, h: 280, fit: 'cover', radius: 28 }));
    const lx = PAD + 680 + 104, lw = 880;
    const compact = services.length > 5;
    const padY = compact ? 18 : 26;
    const rows = services.map((sv, i) => {
      const name = T({ text: sv.name, font: 'US', size: compact ? 30 : 32, lh: 1.15, ls: -1, color: WHITE, x: lx + 64 + 28, w: lw - 64 - 28 - 28 - 40 });
      b.fit(name);
      const sum = compact ? null : b.fit(T({ text: (content.help_bullets || [])[i] || '', size: 24, lh: 1.4, color: tn.muted, x: name.x, w: name.w }));
      const textH = name.h + (sum ? 6 + sum.h : 0);
      return { name, sum, h: Math.max(textH, 35) + 2 * padY + 1, textH, i };
    });
    const totalH = rows.reduce((s, r) => s + r.h, 0) + 1;
    let y = PAD + (ROW - totalH) / 2;
    for (const r of rows) {
      els.push(R({ x: lx, y, w: lw, h: 1, fill: tn.line }));
      const mid = y + 1 + padY + Math.max(r.textH, 35) / 2;
      els.push(T({ text: pad2(r.i + 1), x: lx, y: mid - 17, w: 64, h: 35, font: 'UM', size: 28, color: t.accent }));
      r.name.y = mid - r.textH / 2;
      els.push(r.name);
      if (r.sum) { r.sum.y = r.name.y + r.name.h + 6; els.push(r.sum); }
      els.push(ICON({ name: 'arrow-bar', x: lx + lw - 40, y: mid - 10, w: 40, h: 20, color: t.accent }));
      y += r.h;
    }
    els.push(R({ x: lx, y, w: lw, h: 1, fill: tn.line }));
    return page(tn.bg, els);
  });

  // ---- 5.. one slide per service
  services.forEach((sv, idx) => {
    slides.push((n, total) => {
      const tn = idx % 2 === 1 ? tone.primary : tone.paper;
      const els = [...b.footer(tn, footLabel, n, total)];
      const words = String(sv.name).trim().split(/\s+/);
      const slideTitle = words.length > 1 ? `${words.slice(0, -1).join(' ')}\n${words.at(-1)}` : sv.name;
      const pill = b.pill({ text: `Service ${pad2(idx + 1)} / ${pad2(services.length)}`, x: PAD, y: 0, fg: tn.pillFg, bg: tn.pillBg });
      const head = b.rich({ text: slideTitle, x: PAD, y: 0, w: 860, size: 64, lh: 1.08, ls: -2, color: tn.heading, hl: tn.hl });
      // benefits: 2 columns of cards, bottom aligned (measured first: the copy above gets the room left)
      const benefits = (sv.bullets || []).slice(0, 4);
      const cards = benefits.map((tx) => b.fit(T({ text: tx, font: 'HM', size: 24, lh: 1.35, color: tn.heading, w: 418 - 2 - 48 - 40 - 16 })));
      const rowHs = [];
      for (let i = 0; i < cards.length; i += 2) rowHs.push(Math.max(...cards.slice(i, i + 2).map((c) => Math.max(40, c.h + 4))) + 44 + 2);
      const gridH = rowHs.reduce((s, h) => s + h, 0) + 24 * Math.max(0, rowHs.length - 1);
      const gy = PAD + ROW - gridH;
      // lead + body share the room between the heading and the cards; long copy is set smaller
      const [p1 = '', p2 = ''] = sv.paragraphs || [];
      const lead = T({ text: p1, x: PAD, y: 0, w: 860, font: 'HM', size: 28, lh: 1.4, color: tn.heading });
      const body = T({ text: p2, x: PAD, y: 0, w: 860, size: 24, lh: 1.55, color: tn.muted });
      const room = gy - 32 - (PAD + pill.h + 24 + head.h + 24);
      const need = () => b.fit(lead).h + (p2 ? 24 + b.fit(body).h : 0);
      while (need() > room && (lead.size > 21 || body.size > 18)) {
        if (lead.size > 21) lead.size -= 1;
        if (body.size > 18 && body.size * 1.17 >= lead.size) body.size -= 1;
      }
      const top = [block(pill.els, pill.h), block(head.els, head.h), block([lead], lead.h), ...(p2 ? [block([body], body.h)] : [])];
      stack(top, PAD, 24);
      els.push(...top.flatMap((x) => x.els));
      cards.forEach((c, i) => {
        const r = Math.floor(i / 2), x = PAD + (i % 2) * (418 + 24);
        const y = gy + rowHs.slice(0, r).reduce((s, h) => s + h + 24, 0);
        els.push(R({ x, y, w: 418, h: rowHs[r], radius: 20, fill: tn.card, stroke: tn.cardLine, sw: 1 }),
          R({ shape: 'ellipse', x: x + 25, y: y + 23, w: 40, h: 40, fill: t.accent }),
          ICON({ name: 'check-bold', x: x + 34, y: y + 32, w: 22, h: 22, color: t.ink }),
          Object.assign(c, { x: x + 25 + 40 + 16, y: y + 23 + 4 }));
      });
      // visual column
      const vx = PAD + 860 + 104, vy = PAD;
      const v = VISUALS[sv.id];
      if (v) {
        els.push(T({ text: pad2(idx + 1), x: vx, y: vy, w: 700, h: 240, font: 'US', size: 240, lh: 1, ls: -8, color: tn.ghost, outline: 2 }));
        const at = (x, y, w, h) => ({ x: vx + x, y: vy + y, w, h });
        const layout = {
          wide: [at(0, 200, 700, 466), at(400, 24, 300, 350), 'right', 'top', 'center'],
          'wide-low': [at(0, 200, 700, 466), at(340, 352, 360, 418), 'right', 'bottom', 'center'],
          square: [at(160, 180, 540, 540), at(0, 440, 380, 352), 'left', 'bottom', 'center'],
          portrait: [at(260, 180, 440, 553), at(0, 212, 476, 568), 'left', 'bottom', 'top'],
        }[v.visual];
        els.push(I({ src: IMG(v.image), ...layout[0], fit: 'cover', radius: 32, va: layout[4] }), I({ src: IMG(v.accent), ...layout[1], ha: layout[2], va: layout[3] }));
      } else {
        els.push(R({ x: vx, y: vy, w: 700, h: ROW, radius: 40, fill: tn.card, stroke: tn.cardLine, sw: 1 }),
          T({ text: pad2(idx + 1), x: vx, y: vy + (ROW - 360) / 2, w: 700, h: 360, font: 'US', size: 360, lh: 1, ls: -12, align: 'center', color: tn.ghost, outline: 3 }));
      }
      return page(tn.bg, els);
    });
  });

  // ---- why choose us
  slides.push((n, total) => {
    const tn = tone.ink, els = [...b.footer(tn, footLabel, n, total)];
    const eb = b.eyebrow(tn, chapters.why, PAD, 0);
    const head = b.rich({ text: DECK.why_heading, highlight: DECK.why_highlight, x: PAD, y: 0, w: 1000, size: 64, lh: 1.08, ls: -2, color: WHITE, hl: tn.hl });
    const body = b.fitIn(T({ text: (content.why_paragraphs || []).join(' '), x: PAD, y: 0, w: 1000, size: 28, lh: 1.5, color: tn.muted }), 260);
    const top = [block([eb], 32), block(head.els, head.h), block([body], body.h)];
    stack(top, PAD, 28);
    els.push(...top.flatMap((x) => x.els), I({ src: IMG('team3d.png'), x: PAD + 1000 + 104, y: PAD, w: 560, h: 532 }));
    const stats = (content.stats || []).slice(0, 4);
    const cw = (W - 2 * PAD - 24 * (stats.length - 1)) / Math.max(1, stats.length);
    const ch = 2 + 64 + Math.ceil(64 * 1.1) + 12 + 32;
    const cy = PAD + ROW - ch;
    stats.forEach((s, i) => {
      const x = PAD + i * (cw + 24), first = i === 0;
      els.push(R({ x, y: cy, w: cw, h: ch, radius: 24, fill: first ? t.accent : mix(WHITE, 6, t.ink), stroke: first ? 'none' : mix(WHITE, 12, t.ink), sw: 1 }),
        T({ text: s.value, x: x + 37, y: cy + 33, w: cw - 60, h: 71, font: 'US', size: 64, lh: 1.1, ls: -3, color: first ? t.ink : WHITE }),
        T({ text: s.label, x: x + 37, y: cy + 33 + 71 + 12, w: cw - 60, h: 32, font: 'HM', size: 24, color: first ? t.ink : tn.muted }));
    });
    return page(tn.bg, els);
  });

  // ---- call to action
  slides.push(() => {
    const tn = tone.accent, els = [];
    [[520, 0.14], [680, 0.095], [840, 0.05]].forEach(([r, op]) => els.push(ring(960, 540, r, t.ink, 1.5, op)));
    const lw = Math.round(69 * LOGO.ratio);
    els.push(R({ x: PAD, y: PAD, w: lw + 80, h: 69 + 36, radius: 52, fill: t.ink }), I({ src: LOGO.src, x: PAD + 40, y: PAD + 18, w: lw, h: 69 }));
    const title = String(content.cta_title || 'Let’s turn your digital goals into real growth.');
    const words = title.split(/\s+/);
    const hlText = /real growth\.?/i.test(title) ? title.match(/real growth\.?/i)[0] : words.slice(-2).join(' ');
    const eb = T({ text: DECK.cta_eyebrow.toUpperCase(), x: 360, y: 0, w: 1200, h: 32, font: 'HS', size: 24, ls: 3, align: 'center', color: tn.eyebrow });
    const head = b.rich({ text: title, highlight: hlText, x: 210, y: 0, w: 1500, size: 104, lh: 1.05, ls: -4, color: tn.heading, hl: tn.hl, align: 'center' });
    const body = b.fitIn(T({ text: content.cta_text || '', x: 460, y: 0, w: 1000, size: 30, lh: 1.5, align: 'center', color: tn.muted }), 140);
    const btnLabel = content.cta_button || 'Book a Free Strategy Call';
    const bt = T({ text: btnLabel, font: 'HS', size: 28, color: WHITE });
    const btw = Math.ceil(b.width(bt, btnLabel)) + 112, bth = Math.ceil(28 * NORMAL.HS) + 60;
    Object.assign(bt, { x: (W - btw) / 2 + 56, y: 0, w: btw - 112 + 6, h: Math.ceil(28 * NORMAL.HS) });
    const btn = block([R({ x: (W - btw) / 2, y: -30, w: btw, h: bth, radius: bth / 2, fill: t.ink }), Object.assign(bt, { y: 0 })], bth);
    btn.els[0].y = 0; bt.y = 30;
    const blocks = [block([eb], 32), block(head.els, head.h), block([body], body.h), btn];
    const totalH = blocks.reduce((s, x) => s + x.h, 0) + 40 * (blocks.length - 1);
    stack(blocks, (H - totalH) / 2, 40);
    els.push(...blocks.flatMap((x) => x.els));
    return page(tn.bg, els);
  });

  // ---- thank you
  slides.push(() => {
    const els = [];
    els.push(ring(1572, 500, 210, WHITE, 2, 0.4), ring(1572, 500, 155, WHITE, 2, 0.25), ring(1572, 500, 100, WHITE, 2, 0.15),
      R({ shape: 'ellipse', x: 1352 + 368 - 14, y: 280 + 72 - 14, w: 28, h: 28, fill: t.accent }));
    els.push(I({ src: LOGO.src, x: PAD, y: PAD, w: Math.round(95 * LOGO.ratio), h: 95, ha: 'left' }));
    const contacts = [['Call', a.phone, 1], ['Visit', a.address, 1.7], ['Write', a.email, 1], ['Web', String(a.website || '').replace(/^https?:\/\//, ''), 1]].filter((c) => c[1]);
    const grow = contacts.reduce((s, c) => s + c[2], 0);
    const avail = W - 2 * PAD - 52 * (contacts.length - 1);
    let x = PAD;
    const vals = contacts.map(([, v, g]) => { const w = (avail * g) / grow; return b.fit(T({ text: v, w, size: 30, lh: 1.4, color: WHITE })); });
    const cH = 1 + 24 + 32 + 12 + Math.max(0, ...vals.map((v) => v.h));
    const cy = H - PAD - cH;
    contacts.forEach(([label, , g], i) => {
      const w = (avail * g) / grow;
      els.push(R({ x, y: cy, w, h: 1, fill: WHITE, opacity: 0.3 }), T({ text: label.toUpperCase(), x, y: cy + 25, w, h: 32, font: 'HS', size: 24, ls: 3, color: t.accent }), Object.assign(vals[i], { x, y: cy + 25 + 32 + 12 }));
      x += w + 52;
    });
    const title = b.rich({ text: 'THANK\nYOU.', highlight: 'YOU.', x: PAD, y: 0, w: 1400, size: 220, lh: 0.92, ls: -8, color: WHITE, hl: t.accent });
    const top = PAD + 95, room = (contacts.length ? cy : H - PAD) - top;
    title.els.forEach((e) => (e.y += top + (room - title.h) / 2));
    els.push(...title.els);
    return page(t.ink, els, IMG('closing-bg.jpg'));
  });

  const total = slides.length;
  return { pages: slides.map((build, i) => build(i + 1, total)) };
}
