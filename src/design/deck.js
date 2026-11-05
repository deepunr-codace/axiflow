import { W, H, WHITE, NORMAL, mix, T, R, I, ICON, page, pad2, ring, stack, block, Builder } from './deck-kit.js';
import { resolveTheme, normalizeData, serviceVisual, serviceSlideTitle, contentToData, LOGO } from './brochure-data.js';
import { withFonts } from './fonts.js';

/*
 * "Codeace Growth Deck" (classic design): the owner's brochure template (Downloads/files/brochure-template,
 * 2026-11-05) rebuilt as editable pages for the design engine. Same 1920×1080 slides, positions, colours
 * and fonts as its CSS (brochure.module.css): Unbounded for headings (UM/US), Hanken Grotesk for text (HR/HM/HS).
 * Input: BrochureData (src/design/brochure-data.js), from the AI pipeline or contentToData().
 */
const PAD = 128, FOOT = 160, ROW = H - PAD - FOOT; // content area 792 high

/** Colours each slide background gives its content (the template's .bgPaper/.bgPrimary/.bgInk/.bgAccent). */
function tones(t) {
  return {
    paper: { bg: t.paper, heading: t.ink, muted: mix(t.ink, 74, t.paper), eyebrow: t.primary, hl: t.primary, line: mix(t.ink, 14, t.paper), card: WHITE, cardLine: mix(t.ink, 12, t.paper), pillBg: t.primary, pillFg: WHITE, ghost: mix(t.primary, 35, t.paper) },
    primary: { bg: t.primary, heading: WHITE, muted: mix(WHITE, 84, t.primary), eyebrow: t.accent, hl: t.accent, line: mix(WHITE, 30, t.primary), card: mix(WHITE, 8, t.primary), cardLine: mix(WHITE, 22, t.primary), pillBg: t.accent, pillFg: t.onAccent, ghost: mix(WHITE, 35, t.primary) },
    ink: { bg: t.ink, heading: WHITE, muted: mix(WHITE, 68, t.ink), eyebrow: t.accent, hl: t.accent, line: mix(WHITE, 22, t.ink) },
    accent: { bg: t.accent, heading: t.onAccent, muted: mix(t.onAccent, 85, t.accent), eyebrow: t.onAccent, hl: t.primary },
  };
}

class ClassicBuilder extends Builder {
  footer(tone, label, n, total) {
    const o = { font: 'HM', size: 24, ls: 2, color: tone.muted, y: H - 64 - 32, h: 32 };
    return [T({ ...o, text: label.toUpperCase(), x: PAD, w: 1200 }), T({ ...o, text: `${pad2(n)} / ${pad2(total)}`, x: W - PAD - 300, w: 300, align: 'right' })];
  }
  eyebrow(tone, text, x, y, w = 1000) {
    return T({ text: String(text).toUpperCase(), x, y, w, h: 32, font: 'HS', size: 24, ls: 3, color: tone.eyebrow });
  }
}

const logoOf = (d) => d.brand.logo || { src: LOGO.src };

/** BrochureData → editable pages (classic design). */
/** theme.fonts = a font pairing id (src/design/fonts.js); without one the deck keeps Unbounded + Hanken Grotesk. */
export function classicDesign(input) {
  return withFonts(input?.theme?.fonts, () => buildClassic(input));
}
function buildClassic(input) {
  const d = normalizeData(input);
  const b = new ClassicBuilder();
  const t = resolveTheme('classic', d.theme), tone = tones(t);
  const footLabel = `${d.brand.name} × ${d.client.name}`;
  const services = d.services;
  const slides = [];
  const chapters = {};
  let chapter = 0;
  const ch = (k, label) => (chapters[k] = `${pad2(++chapter)} — ${label}`);
  if (d.about) ch('about', d.about.eyebrow || 'About Us');
  if (d.insight) ch('insight', d.insight.eyebrow || 'The Opportunity');
  if (d.approach) ch('approach', d.approach.eyebrow || 'How We Help');
  if (d.whyUs) ch('why', d.whyUs.eyebrow || 'Why Choose Us');

  // ---- cover
  slides.push(() => {
    const c = d.cover, els = [];
    [[640, 0.14], [800, 0.095], [960, 0.05]].forEach(([r, op]) => els.push(ring(1456, 1080, r, WHITE, 1.5, op)));
    if (c.heroImage) {
      els.push(R({ x: 1112, y: 168, w: 688, h: 912 + 344, radius: 344, fill: t.ink }));
      els.push(I({ ...c.heroImage, x: 1016, y: 180, w: 880, h: 900, fit: 'contain', va: 'bottom' }));
    }
    if (c.badge) {
      els.push(R({ shape: 'ellipse', x: 1584, y: 120, w: 208, h: 208, fill: t.accent }));
      const badge = b.fit(T({ text: c.badge, x: 1612, y: 0, w: 152, font: 'US', size: 24, lh: 1.2, align: 'center', color: t.onAccent, rot: -12 }));
      while (badge.h > 140 && badge.size > 16) { badge.size -= 2; b.fit(badge); }
      badge.y = 224 - badge.h / 2;
      els.push(badge);
    }
    els.push(I({ src: logoOf(d).src, x: PAD, y: PAD, w: Math.round(78 * LOGO.ratio), h: 78, ha: 'left' }));
    let size = 120, lines;
    const probe = T({ font: 'US', size, ls: -4 });
    for (;;) { lines = b.wrap(probe, c.title, 900); if (lines.length <= 3 || size <= 84) break; size -= 6; Object.assign(probe, { size, ls: -size / 30 }); }
    const blocks = [];
    if (c.tag) { const pill = b.pill({ text: c.tag, x: PAD, y: 0, fg: t.onAccent, bg: t.accent }); blocks.push(block(pill.els, pill.h)); }
    const title = b.rich({ text: lines.join('\n'), highlight: c.highlight, x: PAD, y: 0, w: 900, size, lh: 1, ls: probe.ls, color: WHITE, hl: t.accent });
    const sub = b.fitIn(T({ text: c.subtitle || '', x: PAD, y: 0, w: 720, size: 28, lh: 1.5, color: tone.primary.muted }), 210);
    blocks.push(block(title.els, title.h), block([sub], sub.h));
    const chips = b.pillRow(c.chips || [], { x: PAD, y: 0, maxW: 880, font: 'HM', upper: false, ls: 0, fg: WHITE, border: mix(WHITE, 50, t.primary) });
    const mainH = blocks.reduce((s, x) => s + x.h, 0) + 32 * (blocks.length - 1);
    const gap = (H - 2 * PAD - 78 - mainH - chips.h) / 2;
    stack(blocks, PAD + 78 + gap, 32);
    block(chips.els, chips.h).place(H - PAD - chips.h);
    els.push(...blocks.flatMap((x) => x.els), ...chips.els);
    return page(t.primary, els);
  });

  // ---- about
  if (d.about) slides.push((n, total) => {
    const ab = d.about, tn = tone.paper, els = [...b.footer(tn, footLabel, n, total)];
    const head = b.rich({ text: ab.heading, highlight: ab.highlight, x: PAD, y: 0, w: 1000, size: 68, lh: 1.08, ls: -2, color: tn.heading, hl: tn.hl });
    const body = b.fitIn(T({ text: ab.body || '', x: PAD, y: 0, w: 920, size: 28, lh: 1.55, color: tn.muted }), 260);
    const top = [block([b.eyebrow(tn, chapters.about, PAD, 0)], 32), block(head.els, head.h), block([body], body.h)];
    stack(top, PAD, 28);
    els.push(...top.flatMap((x) => x.els));
    const tags = b.pillRow(ab.tags || [], { x: PAD, y: 0, maxW: 1000, font: 'HM', upper: false, ls: 0, fg: t.ink, bg: tn.card, border: tn.cardLine });
    const tagsY = PAD + ROW - tags.h;
    tags.els.forEach((e) => (e.y += tagsY));
    if (ab.credential) {
      const logo = ab.credential.logo;
      const tw = logo ? 488 : 772;
      const cTitle = b.fit(T({ text: ab.credential.title, font: 'HS', size: 28, color: WHITE, w: tw }));
      const cBody = b.fit(T({ text: ab.credential.text, size: 24, lh: 1.4, color: mix(WHITE, 68, t.ink), w: tw }));
      const textH = cTitle.h + 6 + cBody.h;
      const cardH = Math.max(logo ? 95 : 0, textH) + 64;
      const cardY = (tags.h ? tagsY - 24 : PAD + ROW) - cardH;
      const tx = logo ? PAD + 40 + 220 + 32 : PAD + 40;
      els.push(R({ x: PAD, y: cardY, w: 852, h: cardH, radius: 28, fill: t.ink }));
      if (logo) els.push(I({ src: logo.src, x: PAD + 40, y: cardY + (cardH - 95) / 2, w: 220, h: 95 }), R({ x: tx, y: cardY + 32, w: 1, h: cardH - 64, fill: mix(WHITE, 25, t.ink) }));
      const ix = logo ? tx + 32 : tx;
      els.push(Object.assign(cTitle, { x: ix, y: cardY + (cardH - textH) / 2 }), Object.assign(cBody, { x: ix, y: cardY + (cardH - textH) / 2 + cTitle.h + 6 }));
    }
    els.push(...tags.els);
    const px = PAD + 1000 + 104;
    els.push(R({ x: px, y: PAD, w: 560, h: ROW, radius: 40, fill: t.primary }), ring(px + 280, PAD + 400, 200, WHITE, 1.5, 0.14), ring(px + 280, PAD + 400, 270, WHITE, 1.5, 0.095));
    if (ab.image) els.push(I({ ...ab.image, x: px + 48, y: PAD + 72, w: 464, h: 600 }));
    if (ab.imageBadge) { const p = b.pill({ text: ab.imageBadge, x: px + 40, y: 0, upper: false, ls: 0, fg: t.onAccent, bg: t.accent }); p.els.forEach((e) => (e.y += PAD + ROW - 40 - p.h)); els.push(...p.els); }
    return page(tn.bg, els);
  });

  // ---- insight
  if (d.insight) slides.push((n, total) => {
    const ins = d.insight, tn = tone.ink, els = [];
    if (ins.image) els.push(R({ shape: 'ellipse', x: 1192, y: 228, w: 640, h: 640, fill: 'none', stroke: mix(t.accent, 55, t.ink), sw: 2 }), R({ shape: 'ellipse', x: 1232, y: 268, w: 560, h: 560, fill: t.primary }), I({ ...ins.image, x: 1232, y: 232, w: 560, h: 640, va: 'bottom' }));
    els.push(...b.footer(tn, footLabel, n, total));
    const head = b.rich({ text: ins.heading, highlight: ins.highlight, x: PAD, y: 0, w: 1000, size: 64, lh: 1.08, ls: -2, color: WHITE, hl: tn.hl });
    const top = [block([b.eyebrow(tn, chapters.insight, PAD, 0)], 32), block(head.els, head.h)];
    const topEnd = stack(top, PAD, 28);
    els.push(...top.flatMap((x) => x.els));
    let stY = PAD + ROW;
    if (ins.statement) {
      const st = b.fitIn(T({ text: ins.statement, x: PAD + 44, y: 0, w: 1000 - 88, font: 'HM', size: 30, lh: 1.45, color: WHITE }), 180);
      const stH = st.h + 72; stY = PAD + ROW - stH; st.y = stY + 36;
      els.push(R({ x: PAD, y: stY, w: 1000, h: stH, radius: 28, fill: t.primary }), st);
    }
    const stats = ins.stats, small = stats.length > 3, vSize = small ? 80 : 104;
    const sw = (1000 - 40 * (stats.length - 1)) / stats.length;
    const labels = stats.map((s) => b.fit(T({ text: s.label, w: sw, size: 26, lh: 1.4, color: tn.muted })));
    const statsH = 1 + 24 + vSize + 16 + Math.max(...labels.map((l) => l.h));
    const sy = topEnd + (stY - topEnd - statsH) / 2;
    stats.forEach((s, i) => {
      const x = PAD + i * (sw + 40);
      els.push(R({ x, y: sy, w: sw, h: 1, fill: tn.line }), T({ text: s.value, x, y: sy + 25, w: sw + 20, h: vSize, font: 'US', size: vSize, lh: 1, ls: small ? -3 : -4, color: t.accent }), Object.assign(labels[i], { x, y: sy + 25 + vSize + 16 }));
    });
    return page(tn.bg, els);
  });

  // ---- approach (services index)
  if (d.approach) slides.push((n, total) => {
    const ap = d.approach, tn = tone.primary, els = [...b.footer(tn, footLabel, n, total)];
    const head = b.rich({ text: ap.heading, highlight: ap.highlight, x: PAD, y: 0, w: 680, size: 64, lh: 1.08, ls: -2, color: WHITE, hl: tn.hl });
    const body = b.fitIn(T({ text: ap.body || '', x: PAD, y: 0, w: 680, size: 28, lh: 1.5, color: tn.muted }), 230);
    const top = [block([b.eyebrow(tn, chapters.approach, PAD, 0, 680)], 32), block(head.els, head.h), block([body], body.h)];
    stack(top, PAD, 28);
    els.push(...top.flatMap((x) => x.els));
    if (ap.image) els.push(I({ ...ap.image, x: PAD, y: PAD + ROW - 280, w: 680, h: 280, fit: 'cover', radius: 28 }));
    const lx = PAD + 680 + 104, lw = 880;
    const compact = services.length > 5, padY = compact ? 18 : 26;
    const rows = services.map((sv, i) => {
      const name = b.fit(T({ text: sv.name, font: 'US', size: compact ? 30 : 32, lh: 1.15, ls: -1, color: WHITE, x: lx + 64 + 28, w: lw - 64 - 28 - 28 - 40 }));
      const sum = compact || !sv.summary ? null : b.fit(T({ text: sv.summary, size: 24, lh: 1.4, color: tn.muted, x: name.x, w: name.w }));
      const textH = name.h + (sum ? 6 + sum.h : 0);
      return { name, sum, h: Math.max(textH, 35) + 2 * padY + 1, textH, i };
    });
    let y = PAD + (ROW - rows.reduce((s, r) => s + r.h, 0) - 1) / 2;
    for (const r of rows) {
      els.push(R({ x: lx, y, w: lw, h: 1, fill: tn.line }));
      const mid = y + 1 + padY + Math.max(r.textH, 35) / 2;
      els.push(T({ text: pad2(r.i + 1), x: lx, y: mid - 17, w: 64, h: 35, font: 'UM', size: 28, color: t.accent }));
      r.name.y = mid - r.textH / 2; els.push(r.name);
      if (r.sum) { r.sum.y = r.name.y + r.name.h + 6; els.push(r.sum); }
      els.push(ICON({ name: 'arrow-bar', x: lx + lw - 40, y: mid - 10, w: 40, h: 20, color: t.accent }));
      y += r.h;
    }
    els.push(R({ x: lx, y, w: lw, h: 1, fill: tn.line }));
    return page(tn.bg, els);
  });

  // ---- one slide per service
  services.forEach((sv, idx) => slides.push((n, total) => {
    const tn = idx % 2 === 1 ? tone.primary : tone.paper;
    const els = [...b.footer(tn, footLabel, n, total)];
    const pill = b.pill({ text: `Service ${pad2(idx + 1)} / ${pad2(services.length)}`, x: PAD, y: 0, fg: tn.pillFg, bg: tn.pillBg });
    const head = b.rich({ text: serviceSlideTitle(sv), x: PAD, y: 0, w: 860, size: 64, lh: 1.08, ls: -2, color: tn.heading, hl: tn.hl });
    // benefits first (bottom aligned): the copy above gets the room that is left
    const cards = (sv.benefits || []).map((tx) => b.fit(T({ text: tx, font: 'HM', size: 24, lh: 1.35, color: tn.heading, w: 418 - 2 - 48 - 40 - 16 })));
    const rowHs = [];
    for (let i = 0; i < cards.length; i += 2) rowHs.push(Math.max(...cards.slice(i, i + 2).map((c) => Math.max(40, c.h + 4))) + 44 + 2);
    const gridH = rowHs.reduce((s, h) => s + h, 0) + 24 * Math.max(0, rowHs.length - 1);
    const gy = PAD + ROW - gridH;
    const lead = T({ text: sv.lead || '', x: PAD, y: 0, w: 860, font: 'HM', size: 28, lh: 1.4, color: tn.heading });
    const body = T({ text: sv.body || '', x: PAD, y: 0, w: 860, size: 24, lh: 1.55, color: tn.muted });
    const room = gy - 32 - (PAD + pill.h + 24 + head.h + 24);
    const need = () => b.fit(lead).h + (sv.body ? 24 + b.fit(body).h : 0);
    while (need() > room && (lead.size > 21 || body.size > 18)) {
      if (lead.size > 21) lead.size -= 1;
      if (body.size > 18 && body.size * 1.17 >= lead.size) body.size -= 1;
    }
    const top = [block(pill.els, pill.h), block(head.els, head.h), block([lead], lead.h), ...(sv.body ? [block([body], body.h)] : [])];
    stack(top, PAD, 24);
    els.push(...top.flatMap((x) => x.els));
    cards.forEach((c, i) => {
      const r = Math.floor(i / 2), x = PAD + (i % 2) * (418 + 24);
      const y = gy + rowHs.slice(0, r).reduce((s, h) => s + h + 24, 0);
      els.push(R({ x, y, w: 418, h: rowHs[r], radius: 20, fill: tn.card, stroke: tn.cardLine, sw: 1 }), R({ shape: 'ellipse', x: x + 25, y: y + 23, w: 40, h: 40, fill: t.accent }),
        ICON({ name: 'check-bold', x: x + 34, y: y + 32, w: 22, h: 22, color: t.onAccent }), Object.assign(c, { x: x + 25 + 40 + 16, y: y + 23 + 4 }));
    });
    const vx = PAD + 860 + 104, vy = PAD;
    if (sv.image || sv.accentImage) {
      els.push(T({ text: pad2(idx + 1), x: vx, y: vy, w: 700, h: 240, font: 'US', size: 240, lh: 1, ls: -8, color: tn.ghost, outline: 2 }));
      const at = (x, y, w, h) => ({ x: vx + x, y: vy + y, w, h });
      const L = {
        wide: [at(0, 200, 700, 466), at(400, 24, 300, 350), 'right', 'top', 'center'],
        'wide-low': [at(0, 200, 700, 466), at(340, 352, 360, 418), 'right', 'bottom', 'center'],
        square: [at(160, 180, 540, 540), at(0, 440, 380, 352), 'left', 'bottom', 'center'],
        portrait: [at(260, 180, 440, 553), at(0, 212, 476, 568), 'left', 'bottom', 'top'],
      }[serviceVisual(sv, idx)];
      if (sv.image) els.push(I({ ...sv.image, ...L[0], fit: 'cover', radius: 32, va: L[4] }));
      if (sv.accentImage) els.push(I({ ...sv.accentImage, ...L[1], ha: L[2], va: L[3] }));
    } else {
      els.push(R({ x: vx, y: vy, w: 700, h: ROW, radius: 40, fill: tn.card, stroke: tn.cardLine, sw: 1 }),
        T({ text: pad2(idx + 1), x: vx, y: vy + (ROW - 360) / 2, w: 700, h: 360, font: 'US', size: 360, lh: 1, ls: -12, align: 'center', color: tn.ghost, outline: 3 }));
    }
    return page(tn.bg, els);
  }));

  // ---- why choose us
  if (d.whyUs) slides.push((n, total) => {
    const wy = d.whyUs, tn = tone.ink, els = [...b.footer(tn, footLabel, n, total)];
    const tw = wy.image ? 1000 : 1200;
    const head = b.rich({ text: wy.heading, highlight: wy.highlight, x: PAD, y: 0, w: tw, size: 64, lh: 1.08, ls: -2, color: WHITE, hl: tn.hl });
    const body = b.fitIn(T({ text: wy.body || '', x: PAD, y: 0, w: tw, size: 28, lh: 1.5, color: tn.muted }), 260);
    const top = [block([b.eyebrow(tn, chapters.why, PAD, 0)], 32), block(head.els, head.h), block([body], body.h)];
    stack(top, PAD, 28);
    els.push(...top.flatMap((x) => x.els));
    if (wy.image) els.push(I({ ...wy.image, x: PAD + 1000 + 104, y: PAD, w: 560, h: 532 }));
    const stats = wy.stats;
    const cw = (W - 2 * PAD - 24 * (stats.length - 1)) / Math.max(1, stats.length);
    const chh = 2 + 64 + Math.ceil(64 * 1.1) + 12 + 32, cy = PAD + ROW - chh;
    stats.forEach((s, i) => {
      const x = PAD + i * (cw + 24), first = i === 0;
      els.push(R({ x, y: cy, w: cw, h: chh, radius: 24, fill: first ? t.accent : mix(WHITE, 6, t.ink), stroke: first ? 'none' : mix(WHITE, 12, t.ink), sw: 1 }),
        T({ text: s.value, x: x + 37, y: cy + 33, w: cw - 60, h: 71, font: 'US', size: 64, lh: 1.1, ls: -3, color: first ? t.onAccent : WHITE }),
        T({ text: s.label, x: x + 37, y: cy + 33 + 71 + 12, w: cw - 60, h: 32, font: 'HM', size: 24, color: first ? t.onAccent : tn.muted }));
    });
    return page(tn.bg, els);
  });

  // ---- call to action
  slides.push(() => {
    const c = d.cta, tn = tone.accent, els = [];
    [[520, 0.14], [680, 0.095], [840, 0.05]].forEach(([r, op]) => els.push(ring(960, 540, r, t.onAccent, 1.5, op)));
    const lw = Math.round(69 * LOGO.ratio);
    els.push(R({ x: PAD, y: PAD, w: lw + 80, h: 69 + 36, radius: 52, fill: t.ink }), I({ src: logoOf(d).src, x: PAD + 40, y: PAD + 18, w: lw, h: 69 }));
    const blocks = [];
    if (c.eyebrow) blocks.push(block([T({ text: c.eyebrow.toUpperCase(), x: 360, y: 0, w: 1200, h: 32, font: 'HS', size: 24, ls: 3, align: 'center', color: tn.eyebrow })], 32));
    const head = b.rich({ text: c.heading, highlight: c.highlight, x: 210, y: 0, w: 1500, size: 104, lh: 1.05, ls: -4, color: tn.heading, hl: tn.hl, align: 'center' });
    blocks.push(block(head.els, head.h));
    if (c.body) { const body = b.fitIn(T({ text: c.body, x: 460, y: 0, w: 1000, size: 30, lh: 1.5, align: 'center', color: tn.muted }), 140); blocks.push(block([body], body.h)); }
    const bt = T({ text: c.buttonLabel, font: 'HS', size: 28, color: WHITE });
    const btw = Math.ceil(b.width(bt, c.buttonLabel)) + 112, bth = Math.ceil(28 * NORMAL.HS) + 60;
    Object.assign(bt, { x: (W - btw) / 2 + 56, y: 30, w: btw - 112 + 6, h: Math.ceil(28 * NORMAL.HS) });
    blocks.push(block([R({ x: (W - btw) / 2, y: 0, w: btw, h: bth, radius: bth / 2, fill: t.ink }), bt], bth));
    const totalH = blocks.reduce((s, x) => s + x.h, 0) + 40 * (blocks.length - 1);
    stack(blocks, (H - totalH) / 2, 40);
    els.push(...blocks.flatMap((x) => x.els));
    return page(tn.bg, els);
  });

  // ---- thank you
  slides.push(() => {
    const cl = d.closing, els = [];
    if (cl.backgroundImage) els.push(I({ ...cl.backgroundImage, x: 0, y: 0, w: W, h: H, fit: 'cover' }));
    els.push(ring(1572, 500, 210, WHITE, 2, 0.4), ring(1572, 500, 155, WHITE, 2, 0.25), ring(1572, 500, 100, WHITE, 2, 0.15), R({ shape: 'ellipse', x: 1352 + 368 - 14, y: 280 + 72 - 14, w: 28, h: 28, fill: t.accent }));
    els.push(I({ src: logoOf(d).src, x: PAD, y: PAD, w: Math.round(95 * LOGO.ratio), h: 95, ha: 'left' }));
    const contacts = [['Call', cl.phone, 1], ['Visit', cl.address, 1.7], ['Write', cl.email, 1], ['Web', cl.website, 1]].filter((x) => x[1]);
    const grow = contacts.reduce((s, x) => s + x[2], 0);
    const avail = W - 2 * PAD - 52 * (contacts.length - 1);
    const vals = contacts.map(([, v, g]) => b.fit(T({ text: v, w: (avail * g) / grow, size: 30, lh: 1.4, color: WHITE })));
    const cH = 1 + 24 + 32 + 12 + Math.max(0, ...vals.map((v) => v.h)), cy = H - PAD - cH;
    let x = PAD;
    contacts.forEach(([label, , g], i) => {
      const w = (avail * g) / grow;
      els.push(R({ x, y: cy, w, h: 1, fill: WHITE, opacity: 0.3 }), T({ text: label.toUpperCase(), x, y: cy + 25, w, h: 32, font: 'HS', size: 24, ls: 3, color: t.accent }), Object.assign(vals[i], { x, y: cy + 25 + 32 + 12 }));
      x += w + 52;
    });
    const heading = cl.heading || 'THANK\nYOU.', hl = cl.heading ? cl.highlight : cl.highlight || 'YOU.';
    const title = b.rich({ text: heading, highlight: hl, x: PAD, y: 0, w: 1400, size: 220, lh: 0.92, ls: -8, color: WHITE, hl: t.accent });
    const topY = PAD + 95, room = (contacts.length ? cy : H - PAD) - topY;
    title.els.forEach((e) => (e.y += topY + (room - title.h) / 2));
    els.push(...title.els);
    return page(t.ink, els);
  });

  const total = slides.length;
  return { pages: slides.map((build, i) => build(i + 1, total)) };
}

/** Old entry point: brochure copy (src/ai/brochure.js) → classic deck. */
export function deckDesign(content, settings, { company = '', cover = '' } = {}) {
  return classicDesign(contentToData(content, settings, { company, cover, design: 'classic' }));
}
