import { newId } from './model.js';
import { measureText, scratchDoc, pricingRows, PRICING } from './render-pdf.js';
import { poss } from '../pdf/brand.js';

/*
 * Built-in "Axilume Default" templates: turn structured copy (written by the AI or the
 * template fallback) into editable pages. Layout copies the owner's reference PDFs.
 */
const BLUE = '#2d4bd8', WHITE = '#ffffff', INK = '#141413', GREY = '#4b4f5c', RULE = '#d7dcf3';

const T = (o) => ({ id: newId(), type: 'text', font: 'PR', color: WHITE, align: 'left', lh: 1.4, ls: 0, list: '', gap: 8, h: 40, opacity: 1, ...o });
const R = (o) => ({ id: newId(), type: 'shape', shape: 'rect', fill: WHITE, stroke: 'none', sw: 1, radius: 0, gradient: null, opacity: 1, ...o });
const I = (o) => ({ id: newId(), type: 'image', fit: 'cover', radius: 0, opacity: 1, ...o });
const ICON = (o) => ({ id: newId(), type: 'icon', color: WHITE, opacity: 1, ...o });
const page = (w, h, color, elements, image = '') => ({ id: newId(), w, h, bg: { color, image }, elements });

/** Sets e.h to the measured text height and returns the element. */
function fit(doc, e) { e.h = Math.ceil(measureText(doc, e)); return e; }

// ================================================================ brochure
const BW = 1440, BH = 810;
const accentBar = (x, y) => R({ x, y, w: 108, h: 18, gradient: { angle: 90, stops: [[0, WHITE, 1], [0.35, WHITE, 0.9], [1, WHITE, 0.25]] } });
const heading = (doc, text, x, y, w, size = 64) => fit(doc, T({ text, x, y, w, font: 'PB', size, lh: 1.28, ls: -size * 0.03 }));
const body = (doc, paras, x, y, w, size = 21) => fit(doc, T({ text: (paras || []).filter(Boolean).join('\n\n'), x, y, w, size, lh: 1.42 }));
const bullets = (doc, items, x, y, w, size = 21) => fit(doc, T({ text: (items || []).filter(Boolean).join('\n'), x, y, w, size, lh: 1.42, list: 'icon', gap: Math.round(size * 0.95) }));
const arrow = (x, y) => ICON({ name: 'arrow-circle', x, y, w: 60, h: 60 });

export function brochureDesign(content, settings, { cover = '' } = {}) {
  const doc = scratchDoc();
  const a = settings.agency;
  const pages = [];
  const brand = (a.name || '').split(' ')[0] || a.name;

  // 1. cover
  {
    let ts = 80;
    const title = T({ text: content.cover_title, x: 81, y: 200, w: 650, font: 'PB', size: ts, lh: 1.24, ls: -ts * 0.03 });
    while (ts > 50 && measureText(doc, title) > 300) { ts -= 4; Object.assign(title, { size: ts, ls: -ts * 0.03 }); }
    fit(doc, title);
    const sub = fit(doc, T({ text: content.cover_subtitle, x: 83, y: Math.max(title.y + title.h + 34, 470), w: 600, size: 21, lh: 1.42 }));
    pages.push(page(BW, BH, BLUE, [
      R({ x: 760, y: 0, w: 560, h: 760, gradient: { angle: 180, stops: [[0, WHITE, 1], [0.55, '#cfd8ff', 1], [1, BLUE, 1]] } }),
      cover ? I({ src: cover, x: 760, y: 0, w: 680, h: 810, fit: 'contain' }) : I({ src: 'asset:brochure/help.jpg', x: 790, y: 110, w: 500, h: 700, fit: 'fill' }),
      ICON({ name: 'asterisk', x: 85, y: 82, w: 22, h: 22 }),
      T({ text: brand, x: 116, y: 78, w: 300, h: 30, font: 'PM', size: 20, lh: 1.3 }),
      title, sub, arrow(81, Math.min(Math.max(sub.y + sub.h + 34, 640), 720)),
    ]));
  }
  // 2. about
  {
    const h = heading(doc, 'About Us', 118, 150, 560);
    const p = body(doc, content.about, 118, h.y + h.h + 50, 570, 20);
    pages.push(page(BW, BH, BLUE, [
      I({ src: 'asset:brochure/about.jpg', x: 790, y: 70, w: 650, h: 740, fit: 'fill' }),
      R({ x: 81, y: 80, w: 640, h: 648, radius: 18, fill: 'none', stroke: WHITE, sw: 1.5 }),
      h, accentBar(118, h.y + h.h + 16), p, arrow(118, Math.min(p.y + p.h + 30, 650)),
    ]));
  }
  // 3. digital shift
  {
    const h = heading(doc, content.shift_title, 720, 150, 640);
    pages.push(page(BW, BH, BLUE, [
      I({ src: 'asset:brochure/shift.jpg', x: 60, y: 0, w: 600, h: 810, fit: 'fill' }),
      h, accentBar(720, h.y + h.h + 16), body(doc, content.shift_paragraphs, 720, h.y + h.h + 58, 640),
    ]));
  }
  // 4. how we help
  {
    const h = heading(doc, 'How We Help You Grow', 81, 150, 740);
    const intro = body(doc, [content.help_intro], 81, h.y + h.h + 58, 560);
    pages.push(page(BW, BH, BLUE, [
      I({ src: 'asset:brochure/help.jpg', x: 850, y: 76, w: 526, h: 734, fit: 'fill' }),
      h, accentBar(81, h.y + h.h + 16), intro, bullets(doc, content.help_bullets, 81, intro.y + intro.h + 36, 720),
    ]));
  }
  // 5..n services
  for (const sv of content.services || []) {
    const left = sv.text_side === 'left';
    const x = left ? 81 : 664, w = left ? 620 : 700;
    const title = fit(doc, T({ text: sv.name, x, y: 120, w, font: 'PB', size: 60, lh: 1.27, ls: -1.8 }));
    let z = 21, p, b;
    do {
      p = body(doc, sv.paragraphs, x, title.y + title.h + 36, w - 20, z);
      b = bullets(doc, sv.bullets, x, Math.max(p.y + p.h + 34, 500), w, z);
      z -= 1;
    } while (z >= 16 && b.y + b.h > 780);
    pages.push(page(BW, BH, BLUE, [
      I({ src: `asset:brochure/${sv.asset}.jpg`, x: left ? 800 : 0, y: 0, w: 640, h: 810, fit: 'fill' }),
      title, p, b,
    ]));
  }
  // why choose us
  {
    const h = heading(doc, 'Why Choose Us', 720, 120, 640);
    const els = [I({ src: 'asset:brochure/why.jpg', x: 60, y: 0, w: 600, h: 560, fit: 'fill' }), h, accentBar(720, h.y + h.h + 16), body(doc, content.why_paragraphs, 720, h.y + h.h + 58, 640)];
    const bw = (BW - 162 - 150) / 4;
    (content.stats || []).slice(0, 4).forEach((st, i) => {
      const x = 81 + i * (bw + 50);
      els.push(R({ x, y: 614, w: bw, h: 116, fill: 'none', stroke: WHITE, sw: 1.2 }));
      els.push(T({ text: st.value, x, y: 628, w: bw, h: 64, font: 'PM', size: 50, lh: 1.25, align: 'center' }));
      els.push(T({ text: st.label, x, y: 690, w: bw, h: 28, size: 20, lh: 1.3, align: 'center' }));
    });
    pages.push(page(BW, BH, BLUE, els));
  }
  // call to action
  {
    const t = fit(doc, T({ text: content.cta_title, x: 220, y: 200, w: 1000, font: 'PB', size: 74, lh: 1.24, ls: -2.2, align: 'center' }));
    pages.push(page(BW, BH, '#071941', [
      t, fit(doc, T({ text: content.cta_text, x: 300, y: Math.max(t.y + t.h + 26, 430), w: 840, size: 23, lh: 1.4, align: 'center' })),
      T({ text: content.cta_button || 'Book a Free Strategy Call', x: 470, y: 556, w: 500, h: 32, font: 'PM', size: 22, lh: 1.4, align: 'center' }),
    ], 'asset:brochure/cta-bg.jpg'));
  }
  // thank you
  pages.push(page(BW, BH, '#071941', [
    T({ text: 'THANK\nYOU.', x: 199, y: 226, w: 900, h: 350, font: 'PB', size: 150, lh: 1.02, ls: -4 }),
    T({ text: a.phone || '', x: 232, y: 654, w: 240, h: 26, font: 'PM', size: 17, lh: 1.4 }),
    T({ text: a.address || '', x: 491, y: 654, w: 520, h: 26, font: 'PM', size: 17, lh: 1.4 }),
    T({ text: a.email || '', x: 1063, y: 654, w: 220, h: 26, font: 'PM', size: 17, lh: 1.4 }),
  ], 'asset:brochure/thanks-bg.jpg'));

  return { pages };
}

// ================================================================ proposal
const PW = 595.28, PH = 841.89, M = 60, CW = PW - 2 * M, BOTTOM = PH - 60;
const footer = () => [R({ x: 0, y: PH - 8, w: 162, h: 8, fill: '#5271ff' }), R({ x: 162, y: PH - 8, w: PW - 162, h: 8, fill: '#758cc2' })];
const card = (y) => R({ x: 30, y, w: PW - 60, h: PH - y - 30, radius: 22, fill: '#f4f6fb', gradient: { angle: 180, stops: [[0, '#f4f6fb', 1], [1, '#c8d8f2', 1]] } });

class Flow {
  constructor(doc, pages, title) { this.doc = doc; this.pages = pages; this.title = title; this.newPage(); }
  newPage() {
    this.els = [...footer()];
    this.pages.push(page(PW, PH, '#ffffff', this.els));
    this.y = 60;
    if (this.title) {
      const t = fit(this.doc, T({ text: this.title, x: M, y: this.y, w: CW, font: 'PB', size: 30, lh: 1.3, color: INK }));
      this.els.push(t, R({ x: M, y: t.y + t.h + 10, w: CW, h: 1, fill: RULE }));
      this.y = t.y + t.h + 34;
    }
    this.list = null;
  }
  need(h) { if (this.y + h > BOTTOM) this.newPage(); }
  text(text, { font = 'PR', size = 15, x = M, w = CW, after = 16, lh = 1.45 } = {}) {
    this.list = null;
    const e = T({ text, x, y: this.y, w, font, size, lh, color: INK });
    const h = measureText(this.doc, e);
    this.need(Math.min(h, 140));
    e.y = this.y; e.h = Math.ceil(h);
    this.els.push(e);
    this.y += e.h + after;
    return e;
  }
  /** Adds one bullet; consecutive bullets share one list element until a page break. */
  bullet(text, { x = M + 30, w = CW - 30, gap = 6 } = {}) {
    const probe = T({ text, x, w, size: 15, lh: 1.45, list: 'dot', gap, color: INK });
    const h = measureText(this.doc, probe);
    if (this.y + h > BOTTOM) this.newPage();
    if (!this.list) {
      this.list = T({ text: '', x, y: this.y, w, size: 15, lh: 1.45, list: 'dot', gap, color: INK, h: 0 });
      this.els.push(this.list);
    } else this.y += gap;
    this.list.text = this.list.text ? `${this.list.text}\n${text}` : text;
    this.list.h = Math.ceil(measureText(this.doc, this.list));
    this.y = this.list.y + this.list.h;
  }
  endList(after = 14) { if (this.list) { this.list = null; this.y += after; } }
  gap(h) { this.endList(0); this.y += h; }
}

export function proposalDesign(content, items, settings, { preparedFor }) {
  const doc = scratchDoc();
  const a = settings.agency, p = settings.proposal;
  const brand = (a.name || '').split(' ')[0] || a.name;
  const pages = [];

  // cover
  {
    const top = 470;
    const title = fit(doc, T({ text: content.title, x: M, y: top + 38, w: CW, font: 'PB', size: 54, lh: 1.2, color: INK }));
    const ry = Math.max(title.y + title.h + 20, top + 230);
    pages.push(page(PW, PH, '#5b6bd6', [
      ICON({ name: 'asterisk', x: 42, y: 46, w: 20, h: 20 }), T({ text: brand, x: 70, y: 43, w: 200, h: 26, font: 'PM', size: 18, lh: 1.3 }),
      card(top), title,
      R({ x: M, y: ry, w: CW / 2 - 20, h: 1.5, fill: '#6c8cff' }), R({ x: M + CW / 2 + 20, y: ry, w: CW / 2 - 20, h: 1.5, fill: '#6c8cff' }),
      ICON({ name: 'star4', x: M + CW / 2 - 9, y: ry - 8.25, w: 18, h: 18, color: '#2f5bff' }),
      T({ text: 'Prepared For:', x: M, y: ry + 24, w: CW / 2 - 20, h: 22, size: 14, lh: 1.4, color: GREY }),
      T({ text: 'Prepared By:', x: M + CW / 2 + 20, y: ry + 24, w: CW / 2 - 20, h: 22, size: 14, lh: 1.4, color: GREY }),
      T({ text: preparedFor, x: M, y: ry + 46, w: CW / 2 - 20, h: 24, font: 'PM', size: 16, lh: 1.4, color: INK }),
      T({ text: a.name, x: M + CW / 2 + 20, y: ry + 46, w: CW / 2 - 20, h: 24, font: 'PM', size: 16, lh: 1.4, color: INK }),
      ...footer(),
    ], 'asset:proposal-cover-bg.jpg'));
  }

  let f = new Flow(doc, pages, 'Executive Summary');
  for (const para of content.executive_summary || []) f.text(para, { after: 18 });

  f = new Flow(doc, pages, 'Project Scope');
  if (content.scope_intro) f.text(content.scope_intro, { after: 22 });
  (content.scope || []).forEach((sc, i) => {
    f.need(64);
    f.text(`${i + 1}. ${sc.title}`, { font: 'PB', after: 4 });
    f.text(sc.description, { x: M + 14, w: CW - 14, after: 14 });
  });

  if (content.structure?.length) {
    f = new Flow(doc, pages, 'Website Structure');
    if (content.structure_intro) f.text(content.structure_intro, { after: 18 });
    for (const s of content.structure) f.bullet(s, { gap: 4 });
  }

  if (content.features?.length) {
    f = new Flow(doc, pages, 'Detailed Features');
    content.features.forEach((sec, i) => {
      f.endList(10);
      f.need(100);
      f.text(`${i + 1}. ${sec.section}`, { font: 'PB', size: 18, after: 6 });
      for (const g of sec.groups || []) {
        f.endList(8);
        f.need(56);
        if (g.title) f.text(g.title, { font: 'PB', x: M + 18, w: CW - 18, after: 4 });
        for (const b of g.bullets || []) f.bullet(b, { x: M + 46, w: CW - 46 });
      }
    });
    f.endList();
  }

  // investment
  {
    f = new Flow(doc, pages, 'Investment');
    f.text('Module wise pricing breakdown', { after: 22 });
    const rows = pricingRows(items, settings).length;
    f.els.push({ id: newId(), type: 'pricing', x: M - 4, y: f.y, w: CW + 8, h: rows * PRICING.minRow, opacity: 1 });
    if (p.investment_note) f.els.push(fit(doc, T({ text: `Note: ${p.investment_note}`, x: M, y: BOTTOM - 70, w: CW, size: 15, lh: 1.45, color: INK })));
  }

  f = new Flow(doc, pages, 'Deliverables');
  for (const d of content.deliverables || []) f.bullet(d, { x: M + 26, w: CW - 26, gap: 8 });
  f.endList(10);
  if (p.deliverables_note) f.text(p.deliverables_note);

  f = new Flow(doc, pages, 'Terms & Conditions');
  for (const t of [p.payment_terms, ...(p.terms || [])].filter(Boolean)) f.bullet(t, { x: M + 26, w: CW - 26, gap: 18 });

  // contact
  {
    const ct = 500;
    const els = [
      fit(doc, T({ text: content.closing_title || `Let's Build\n${poss(preparedFor)} New Website`, x: M, y: 56, w: CW, font: 'PB', size: 30, lh: 1.3 })),
      card(ct),
      T({ text: 'Have Questions? Contact Us', x: M, y: ct + 34, w: CW, h: 36, font: 'PB', size: 26, lh: 1.3, color: INK }),
      R({ x: M, y: ct + 84, w: CW, h: 1, fill: RULE }),
    ];
    [['Phone', a.phone, 'phone'], ['Email', a.email, 'mail'], ['Website', (a.website || '').replace(/^https?:\/\//, ''), 'web'], ['Location', a.address, 'pin']].forEach(([k, v, ic], i) => {
      const x = M + 8 + (i % 2) * (CW / 2), y = ct + 104 + Math.floor(i / 2) * 96;
      els.push(R({ shape: 'ellipse', x, y, w: 28, h: 28, fill: '#2f5bff' }), ICON({ name: ic, x: x + 5, y: y + 5, w: 18, h: 18 }));
      els.push(T({ text: k, x, y: y + 36, w: CW / 2 - 24, h: 22, size: 14, lh: 1.4, color: GREY }));
      els.push(fit(doc, T({ text: v || '', x, y: y + 56, w: CW / 2 - 24, font: 'PM', size: i === 3 ? 12 : 15, lh: 1.35, color: INK })));
    });
    els.push(...footer());
    pages.push(page(PW, PH, '#5b6bd6', els, 'asset:proposal-cover-bg.jpg'));
  }
  return { pages };
}
