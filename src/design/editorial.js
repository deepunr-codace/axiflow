import { W, H, WHITE, NORMAL, mix, T, R, I, ICON, page, pad2, stack, block, Builder } from './deck-kit.js';
import { resolveTheme, normalizeData, serviceVisual, serviceSlideTitle, contentToData, LOGO } from './brochure-data.js';

/*
 * "Codeace Editorial": the editorial design from the owner's template package (Downloads/files (1),
 * editorial/editorial.module.css + editorial-slides.tsx, 2026-11-05) as editable pages.
 * Colour fields that bleed off the page, photos in capsule and circle frames with cut-outs breaking
 * out of them, Lora display (LR/LM) + Inter text (IR/IM/IS), round text stickers, and a services
 * table of contents with page numbers. Grid: 112 px margins. Input: BrochureData.
 */
const M = 112;

function tones(t) {
  return {
    paper: { bg: t.paper, text: t.ink, muted: mix(t.ink, 72, t.paper), hl: t.primary, line: mix(t.ink, 16, t.paper), chip: mix(t.primary, 10, t.paper) },
    primary: { bg: t.primary, text: WHITE, muted: mix(WHITE, 80, t.primary), hl: t.accent, line: mix(WHITE, 35, t.primary) },
    ink: { bg: t.ink, text: WHITE, muted: mix(WHITE, 66, t.ink), hl: t.accent, line: mix(WHITE, 28, t.ink) },
    accent: { bg: t.accent, text: t.onAccent, muted: mix(t.onAccent, 82, t.accent), hl: t.primary },
  };
}

class EditorialBuilder extends Builder {
  /** Folio at the bottom: "Codeace for Client" … "3 / 12". */
  folio(tone, label, n, total, x = M, w = W - 2 * M) {
    const o = { font: 'IM', size: 20, color: tone.muted, y: H - 56 - 25, h: 25 };
    return [T({ ...o, text: label, x, w: w - 120 }), T({ ...o, text: `${n} / ${total}`, x: x + w - 200, w: 200, align: 'right' })];
  }
  /** Round sticker: disc, text around the edge, spark in the middle. size 280, rotated `turn` degrees. */
  sticker({ x, y, text, bg, fg, turn }) {
    const k = 280 / 300, cx = x + 140, cy = y + 140;
    return [
      R({ shape: 'ellipse', x, y, w: 280, h: 280, fill: bg }),
      ...this.circleText({ text, cx, cy, r: 112 * k, font: 'IS', size: 22 * k, ls: 0, color: fg, turn }),
      ICON({ name: 'spark', x: cx - 45 * k, y: cy - 45 * k, w: 90 * k, h: 90 * k, color: fg }),
    ];
  }
  /** Lora value with the rupee sign set in Inter (Lora has no ₹ glyph). */
  statValue({ value, x, y, size, ls, color, w }) {
    const v = String(value);
    if (!v.startsWith('₹')) return [T({ text: v, x, y, w, h: Math.ceil(size), font: 'LM', size, lh: 1, ls, color })];
    const r = T({ text: '₹', font: 'IM', size: size * 0.86, lh: 1, color });
    const rw = this.width(r, '₹');
    return [Object.assign(r, { x, y: y + size * 0.08, w: Math.ceil(rw) + 6, h: Math.ceil(size) }), T({ text: v.slice(1), x: x + rw + size * 0.04, y, w: w - rw, h: Math.ceil(size), font: 'LM', size, lh: 1, ls, color })];
  }
}

const clip = (v) => (v.length > 22 ? `${v.slice(0, 21)}…` : v);
const stickerText = (a, b) => `${clip(a)}  ✦  ${clip(b)}  ✦  `;
const logoOf = (d) => d.brand.logo || { src: LOGO.src };

/** BrochureData → editable pages (editorial design). */
export function editorialDesign(input) {
  const d = normalizeData(input);
  const b = new EditorialBuilder();
  const t = resolveTheme('editorial', d.theme), tone = tones(t);
  const folio = `${d.brand.name} for ${d.client.name}`;
  const services = d.services;
  const slides = [];

  // ---- cover (paper, colour field on the right)
  slides.push(() => {
    const c = d.cover, tn = tone.paper, els = [R({ x: 1120, y: 0, w: 800, h: H, fill: t.primary })];
    const lw = Math.round(64 * LOGO.ratio);
    els.push(I({ src: logoOf(d).src, x: W - M - lw, y: 96, w: lw, h: 64, ha: 'right' }));
    if (c.heroImage) els.push(I({ ...c.heroImage, x: 952, y: 120, w: 1000, h: 960, va: 'bottom' }));
    if (c.badge) els.push(...b.sticker({ x: 992, y: 128, text: stickerText(c.badge, `Proposal by ${d.brand.name}`), bg: t.accent, fg: t.onAccent, turn: -14 }));
    const topBlocks = [], gaps = [];
    if (c.tag) { const p = b.pill({ text: c.tag, x: M, y: 0, font: 'IM', size: 22, ls: 0, upper: false, fg: tn.text, border: tn.text, bw: 1.5, padX: 22, padY: 10 }); topBlocks.push(block(p.els, p.h)); gaps.push(48); }
    let size = 168;
    const probe = T({ font: 'LM', size, ls: -5 });
    let lines = b.wrap(probe, c.title, 880);
    while (lines.length > 3 && size > 110) { size -= 8; Object.assign(probe, { size, ls: -size / 34 }); lines = b.wrap(probe, c.title, 880); }
    const title = b.rich({ text: lines.join('\n'), highlight: c.highlight, x: M, y: 0, w: 880, font: 'LM', size, lh: 0.94, ls: probe.ls, color: tn.text, hl: tn.hl });
    const sub = b.fitIn(T({ text: c.subtitle || '', x: M, y: 0, w: 720, font: 'IR', size: 28, lh: 1.5, color: tn.muted }), 170);
    topBlocks.push(block(title.els, title.h), block([sub], sub.h)); gaps.push(44);
    stack(topBlocks, M, gaps);
    // bottom: prepared for + chips, bottom aligned at 968
    const pf = T({ text: 'Prepared for', font: 'IR', size: 24, color: tn.muted });
    const pfw = b.width(pf, 'Prepared for ');
    const chips = b.pillRow(c.chips || [], { x: M, y: 0, maxW: 880, gap: 10, font: 'IM', size: 22, ls: 0, upper: false, fg: tn.text, bg: tn.chip, padX: 20, padY: 10 });
    const pfH = Math.ceil(24 * NORMAL.IR);
    const bottomH = pfH + (chips.h ? 20 + chips.h : 0);
    const by = M + 856 - bottomH;
    els.push(...topBlocks.flatMap((x) => x.els), Object.assign(pf, { x: M, y: by, w: Math.ceil(pfw) + 4, h: pfH }),
      T({ text: d.client.name, font: 'IS', size: 24, color: tn.text, x: M + pfw, y: by, w: 880 - pfw, h: pfH }));
    chips.els.forEach((e) => (e.y += by + pfH + 20));
    els.push(...chips.els);
    return page(tn.bg, els);
  });

  // ---- about (primary, accent capsule with the image)
  if (d.about) slides.push((n, total) => {
    const ab = d.about, tn = tone.primary, els = [];
    if (ab.image) els.push(R({ x: 1264, y: 216, w: 544, h: 752, radius: 272, fill: t.accent }), I({ ...ab.image, x: 1296, y: 96, w: 480, h: 760, va: 'top' }));
    const tw = ab.image ? 1056 : 1408;
    const head = b.rich({ text: ab.heading, highlight: ab.highlight, x: M, y: 0, w: tw, font: 'LM', size: 104, lh: 1, ls: -3, color: tn.text, hl: tn.hl });
    const body = b.fitIn(T({ text: ab.body || '', x: M, y: 0, w: 832, font: 'IR', size: 28, lh: 1.55, color: tn.muted }), 260);
    const top = [block(head.els, head.h), block([body], body.h)];
    stack(top, M, 40);
    els.push(...top.flatMap((x) => x.els));
    // bottom: credential + outline chips, bottom at 920
    const chips = b.pillRow(ab.tags || [], { x: M, y: 0, maxW: tw, gap: 10, font: 'IM', size: 22, ls: 0, upper: false, fg: tn.text, border: tn.line, bw: 1.5, padX: 20, padY: 10 });
    let yEnd = H - 160;
    if (chips.h) { chips.els.forEach((e) => (e.y += yEnd - chips.h)); els.push(...chips.els); yEnd -= chips.h + 28; }
    if (ab.credential) {
      const logo = ab.credential.logo;
      const ct = b.fit(T({ text: ab.credential.title, font: 'IS', size: 26, color: tn.text, w: 700 }));
      const cb = b.fit(T({ text: ab.credential.text, font: 'IR', size: 22, color: tn.muted, w: 700 }));
      const th = ct.h + 4 + cb.h, hh = Math.max(logo ? 72 : 0, th), y0 = yEnd - hh;
      let tx = M;
      if (logo) { const lw = Math.round(72 * LOGO.ratio); els.push(I({ src: logo.src, x: M, y: y0 + (hh - 72) / 2, w: lw, h: 72, ha: 'left' })); tx = M + lw + 28; els.push(R({ x: tx, y: y0 + (hh - th) / 2, w: 1.5, h: th, fill: tn.line })); tx += 28; }
      els.push(Object.assign(ct, { x: tx, y: y0 + (hh - th) / 2 }), Object.assign(cb, { x: tx, y: y0 + (hh - th) / 2 + ct.h + 4 }));
    }
    els.push(...b.folio(tn, folio, n, total));
    return page(tn.bg, els);
  });

  // ---- insight (paper)
  if (d.insight) slides.push((n, total) => {
    const ins = d.insight, tn = tone.paper, els = [];
    if (ins.image) els.push(R({ shape: 'ellipse', x: 1376, y: 160, w: 432, h: 432, fill: t.primary }), I({ ...ins.image, x: 1352, y: 96, w: 480, h: 560, va: 'bottom' }));
    const head = b.rich({ text: ins.heading, highlight: ins.highlight, x: M, y: M, w: 1216, font: 'LM', size: 88, lh: 1.04, ls: -2, color: tn.text, hl: tn.hl });
    els.push(...head.els);
    const small = ins.stats.length > 3, vs = small ? 124 : 168;
    const sw = (1120 - 64 * (ins.stats.length - 1)) / ins.stats.length;
    const labels = ins.stats.map((s) => b.fit(T({ text: s.label, font: 'IR', size: 26, lh: 1.4, color: tn.muted, w: Math.min(340, sw) })));
    const statsH = Math.ceil(vs * 0.9) + 16 + Math.max(...labels.map((l) => l.h));
    let stTop = H - 160, stEls = [];
    if (ins.statement) {
      const st = b.fitIn(T({ text: ins.statement, font: 'LR', size: 44, lh: 1.25, ls: -0.5, color: tn.text, x: M + 68, y: 0, w: 1216 - 68 }), 200);
      stTop = H - 160 - st.h; st.y = stTop;
      stEls = [ICON({ name: 'spark', x: M, y: stTop + 6, w: 44, h: 44, color: t.primary }), st];
    }
    const top = M + head.h, sy = top + (stTop - top - statsH) / 2;
    ins.stats.forEach((s, i) => {
      const x = M + i * (sw + 64);
      els.push(...b.statValue({ value: s.value, x, y: sy, size: vs, ls: small ? -4 : -6, color: t.primary, w: sw + 60 }), Object.assign(labels[i], { x, y: sy + Math.ceil(vs * 0.9) + 16 }));
    });
    els.push(...stEls, ...b.folio(tn, folio, n, total));
    return page(tn.bg, els);
  });

  // ---- approach: services as a table of contents (ink)
  const firstService = 1 + (d.about ? 1 : 0) + (d.insight ? 1 : 0) + (d.approach ? 1 : 0) + 1;
  if (d.approach) slides.push((n, total) => {
    const ap = d.approach, tn = tone.ink, els = [];
    const head = b.rich({ text: ap.heading, highlight: ap.highlight, x: M, y: 0, w: 544, font: 'LM', size: 88, lh: 1.04, ls: -2, color: tn.text, hl: tn.hl });
    const body = b.fitIn(T({ text: ap.body || '', x: M, y: 0, w: 544, font: 'IR', size: 26, lh: 1.55, color: tn.muted }), ap.image ? 260 : 500);
    const left = [block(head.els, head.h), block([body], body.h)];
    stack(left, M, 32);
    els.push(...left.flatMap((x) => x.els));
    if (ap.image) els.push(I({ ...ap.image, x: M, y: H - 160 - 300, w: 544, h: 300, fit: 'cover', radius: 150 }));
    const lx = M + 544 + 176, lw = 976, compact = services.length > 5, padY = compact ? 14 : 22, ns = compact ? 42 : 48;
    const rows = services.map((sv, i) => {
      const name = T({ text: sv.name, font: 'LM', size: ns, lh: 1.1, ls: -1, color: tn.text });
      const pg = `p. ${pad2(firstService + i)}`;
      const pgT = T({ text: pg, font: 'IS', size: 24, color: t.accent });
      const pw = Math.ceil(b.width(pgT, pg));
      const nameW = Math.min(Math.ceil(b.width(name, sv.name)) + 6, lw - pw - 80);
      const sum = !compact && sv.summary ? b.fit(T({ text: sv.summary, font: 'IR', size: 22, lh: 1.4, color: tn.muted, w: lw })) : null;
      return { name, nameW, pgT, pw, sum, h: 2 * padY + Math.ceil(ns * 1.1) + (sum ? 8 + sum.h : 0) };
    });
    let y = M + (H - 160 - M - rows.reduce((s, r) => s + r.h, 0)) / 2;
    for (const r of rows) {
      const lineTop = y + padY, base = lineTop + (ns * 1.1 - ns * 1.28) / 2 + ns * 1.006;
      Object.assign(r.name, { x: lx, y: lineTop, w: r.nameW, h: Math.ceil(ns * 1.1) });
      Object.assign(r.pgT, { x: lx + lw - r.pw - 2, y: base - 24 * 0.9688, w: r.pw + 4, h: Math.ceil(24 * NORMAL.IS) });
      const lx0 = lx + r.nameW + 14, lx1 = lx + lw - r.pw - 20;
      els.push(r.name, R({ shape: 'line', x: lx0, y: base - 9 - 1, w: Math.max(40, lx1 - lx0), h: 2, sw: 2, stroke: tn.line, fill: 'none', dash: 'dot' }), r.pgT);
      if (r.sum) { r.sum.x = lx; r.sum.y = lineTop + Math.ceil(ns * 1.1) + 8; els.push(r.sum); }
      y += r.h;
    }
    els.push(...b.folio(tn, folio, n, total));
    return page(tn.bg, els);
  });

  // ---- one slide per service: colour field alternating right / left, tones primary → ink → accent
  services.forEach((sv, idx) => slides.push((n, total) => {
    const tn = tone.paper, right = idx % 2 === 0, visual = serviceVisual(sv, idx);
    const fx = right ? 1120 : 0;
    const field = [[t.primary, mix(WHITE, 22, t.primary), mix(WHITE, 40, t.primary)], [t.ink, mix(WHITE, 18, t.ink), mix(WHITE, 35, t.ink)], [t.accent, mix(t.onAccent, 18, t.accent), mix(t.onAccent, 40, t.accent)]][idx % 3];
    const els = [R({ x: fx, y: 0, w: 800, h: H, fill: field[0] }), R({ shape: 'ellipse', x: fx + 60, y: 200, w: 680, h: 680, fill: 'none', stroke: field[1], sw: 1.5 })];
    if (sv.image || sv.accentImage) {
      const shape = { wide: [80, 340, 640, 400, 200, 'center'], 'wide-low': [80, 340, 640, 400, 200, 'center'], square: [120, 260, 560, 560, 280, 'center'], portrait: [190, 220, 420, 640, 210, 'top'] }[visual];
      if (sv.image) els.push(I({ ...sv.image, x: fx + shape[0], y: shape[1], w: shape[2], h: shape[3], radius: shape[4], fit: 'cover', va: shape[5] }));
      if (sv.accentImage) {
        const top = visual === 'wide-low';
        const ax = right ? fx - 140 : fx + 800 + 140 - 380;
        els.push(I({ ...sv.accentImage, x: ax, y: top ? 72 : H - 72 - 440, w: 380, h: 440, ha: top ? 'center' : right ? 'left' : 'right', va: top ? 'top' : 'bottom' }));
      }
    } else {
      els.push(T({ text: pad2(idx + 1), x: fx, y: (H - 420) / 2, w: 800, h: 420, font: 'LM', size: 420, lh: 1, ls: -16, align: 'center', color: field[2], outline: 3 }));
    }
    // text column, vertically centred between 112 and 920
    const tx = right ? M : 976;
    const kicker = T({ text: `Service ${idx + 1} of ${services.length}`, font: 'IS', size: 22, color: t.primary, x: tx, y: 0, w: 832, h: Math.ceil(22 * NORMAL.IS) });
    const head = b.rich({ text: serviceSlideTitle(sv), x: tx, y: 0, w: 832, font: 'LM', size: 96, lh: 1, ls: -3, color: tn.text, hl: tn.hl });
    const lead = T({ text: sv.lead || '', font: 'IM', size: 30, lh: 1.4, color: tn.text, x: tx, y: 0, w: 832 });
    const body = T({ text: sv.body || '', font: 'IR', size: 24, lh: 1.55, color: tn.muted, x: tx, y: 0, w: 832 });
    const bens = (sv.benefits || []).map((x) => b.fit(T({ text: x, font: 'IM', size: 24, lh: 1.35, color: tn.text, w: 396 - 44 })));
    const rowsB = [];
    for (let i = 0; i < bens.length; i += 2) rowsB.push(Math.max(30, ...bens.slice(i, i + 2).map((x) => x.h)));
    const benH = rowsB.reduce((s, h) => s + h, 0) + 22 * Math.max(0, rowsB.length - 1);
    const fixedH = kicker.h + 20 + head.h + 36 + (bens.length ? 48 + benH : 0);
    const room = H - 160 - M - fixedH;
    const need = () => b.fit(lead).h + (sv.body ? 16 + b.fit(body).h : 0);
    while (need() > room && (lead.size > 22 || body.size > 18)) { if (lead.size > 22) lead.size -= 1; if (body.size > 18 && body.size * 1.25 >= lead.size) body.size -= 1; }
    const blocks = [block([kicker], kicker.h), block(head.els, head.h), block([lead], lead.h), ...(sv.body ? [block([body], body.h)] : [])];
    const gaps = [20, 36, 16];
    const total2 = fixedH + need();
    let end = stack(blocks, M + Math.max(0, (H - 160 - M - total2) / 2), gaps);
    els.push(...blocks.flatMap((x) => x.els));
    if (bens.length) {
      let y = end + 48;
      rowsB.forEach((rh, r) => {
        bens.slice(r * 2, r * 2 + 2).forEach((x, j) => {
          const bx = tx + j * (396 + 40);
          els.push(R({ shape: 'ellipse', x: bx, y: y + 1, w: 30, h: 30, fill: t.accent }), ICON({ name: 'check-bold', x: bx + 6, y: y + 7, w: 18, h: 18, color: t.onAccent }), Object.assign(x, { x: bx + 44, y }));
        });
        y += rh + 22;
      });
    }
    els.push(...(right ? b.folio(tn, folio, n, total, M, 832) : b.folio(tn, folio, n, total, 976, W - M - 976)));
    return page(tn.bg, els);
  }));

  // ---- why us (primary)
  if (d.whyUs) slides.push((n, total) => {
    const wy = d.whyUs, tn = tone.primary, els = [];
    if (wy.image) els.push(I({ ...wy.image, x: W - M - 560, y: 96, w: 560, h: 532 }));
    const head = b.rich({ text: wy.heading, highlight: wy.highlight, x: M, y: 0, w: wy.image ? 1120 : 1408, font: 'LM', size: 88, lh: 1.04, ls: -2, color: tn.text, hl: tn.hl });
    const body = b.fitIn(T({ text: wy.body || '', font: 'IR', size: 26, lh: 1.55, color: tn.muted, x: M, y: 0, w: 832 }), 290);
    const top = [block(head.els, head.h), block([body], body.h)];
    stack(top, M, 32);
    els.push(...top.flatMap((x) => x.els));
    const stats = wy.stats;
    if (stats.length) {
      const cw = (W - 2 * M) / stats.length, sh = 4 + 96 + 14 + Math.ceil(22 * NORMAL.IM), sy = H - 160 - sh;
      stats.forEach((s, i) => {
        const x = M + i * cw, px = i ? 32 : 0;
        if (i) els.push(R({ x, y: sy, w: 1.5, h: sh, fill: tn.line }));
        els.push(...b.statValue({ value: s.value, x: x + px, y: sy + 4, size: 96, ls: -3, color: i === 0 ? t.accent : WHITE, w: cw - px - 16 }),
          T({ text: s.label, font: 'IM', size: 22, color: tn.muted, x: x + px, y: sy + 4 + 96 + 14, w: cw - px - 16, h: Math.ceil(22 * NORMAL.IM) }));
      });
    }
    els.push(...b.folio(tn, folio, n, total));
    return page(tn.bg, els);
  });

  // ---- call to action (accent)
  slides.push(() => {
    const c = d.cta, tn = tone.accent, els = [];
    els.push(...b.sticker({ x: W - M - 280, y: H - M - 280, text: stickerText(`${d.brand.name} × ${d.client.name}`, 'Let’s grow together'), bg: t.primary, fg: WHITE, turn: 12 }));
    const topB = [];
    if (c.eyebrow) topB.push(block([T({ text: c.eyebrow, font: 'IS', size: 26, color: tn.text, x: M, y: 0, w: 1200, h: Math.ceil(26 * NORMAL.IS) })], Math.ceil(26 * NORMAL.IS)));
    let size = 150;
    const probe = T({ font: 'LM', size, ls: -5 });
    while (b.wrap(probe, c.heading, 1440).length > 3 && size > 100) { size -= 8; Object.assign(probe, { size, ls: -size / 30 }); }
    const head = b.rich({ text: c.heading, highlight: c.highlight, x: M, y: 0, w: 1440, font: 'LM', size, lh: 0.98, ls: probe.ls, color: tn.text, hl: tn.hl });
    topB.push(block(head.els, head.h));
    stack(topB, M, 28);
    els.push(...topB.flatMap((x) => x.els));
    const bt = T({ text: c.buttonLabel, font: 'IS', size: 28, color: WHITE });
    const btw = Math.ceil(b.width(bt, c.buttonLabel)) + 104, bth = Math.ceil(28 * NORMAL.IS) + 56;
    let y = H - M - bth;
    els.push(R({ x: M, y, w: btw, h: bth, radius: bth / 2, fill: t.ink }), Object.assign(bt, { x: M + 52, y: y + 28, w: btw - 104 + 6, h: Math.ceil(28 * NORMAL.IS) }));
    if (c.body) { const body = b.fitIn(T({ text: c.body, font: 'IR', size: 30, lh: 1.5, color: tn.muted, x: M, y: 0, w: 760 }), 180); body.y = y - 36 - body.h; els.push(body); }
    return page(tn.bg, els);
  });

  // ---- thank you (ink)
  slides.push(() => {
    const cl = d.closing, tn = tone.ink, els = [];
    if (cl.backgroundImage) els.push(I({ ...cl.backgroundImage, x: 0, y: 0, w: W, h: H, fit: 'cover', opacity: 0.7 }));
    els.push(R({ shape: 'ellipse', x: 1300, y: 150, w: 760, h: 760, fill: t.accent }), ICON({ name: 'spark', x: 1560 - 25, y: 410 - 25, w: 290, h: 290, color: t.onAccent }));
    const lw = Math.round(80 * LOGO.ratio);
    els.push(I({ src: logoOf(d).src, x: M, y: M, w: lw, h: 80, ha: 'left' }));
    const contacts = [['Call', cl.phone, 1], ['Visit', cl.address, 1.8], ['Write', cl.email, 1.5], ['Web', cl.website, 1]].filter((x) => x[1]);
    const grow = contacts.reduce((s, x) => s + x[2], 0);
    const avail = (contacts.length > 3 ? 1240 : 1140) - 64 * (contacts.length - 1);
    const vSize = contacts.length > 3 ? 23 : 28; // the template's 3 contacts fit at 28; four need smaller text left of the disc
    const vals = contacts.map(([, v, g]) => b.fit(T({ text: v, font: 'IR', size: vSize, lh: 1.4, color: WHITE, w: (avail * g) / grow })));
    const lH = Math.ceil(20 * NORMAL.IS);
    const cH = lH + 10 + Math.max(0, ...vals.map((v) => v.h)), cy = H - M - cH;
    let x = M;
    contacts.forEach(([label, , g], i) => {
      const w = (avail * g) / grow;
      els.push(T({ text: label, font: 'IS', size: 20, color: t.accent, x, y: cy, w, h: lH }), Object.assign(vals[i], { x, y: cy + lH + 10 }));
      x += w + 64;
    });
    const heading = cl.heading || 'Thank\nyou.', hl = cl.heading ? cl.highlight : cl.highlight || 'you.';
    const title = b.rich({ text: heading, highlight: hl, x: M, y: 0, w: 1180, font: 'LM', size: 260, lh: 0.88, ls: -9, color: WHITE, hl: t.accent });
    const topY = M + 80, room = (contacts.length ? cy : H - M) - topY;
    title.els.forEach((e) => (e.y += topY + (room - title.h) / 2));
    els.push(...title.els);
    return page(tn.bg, els);
  });

  const total = slides.length;
  return { pages: slides.map((build, i) => build(i + 1, total)) };
}

/** Brochure copy → editorial deck (without the AI pipeline). */
export const editorialFromContent = (content, settings, opts = {}) => editorialDesign(contentToData(content, settings, { ...opts, design: 'editorial' }));
