import { img, fontCss, esc } from './assets.js';

/*
 * "CodeAce Website & SEO": Codeace's services brochure (Downloads/CodeAce Website & SEO Brochure (2).pdf, owner
 * 2026-11-13: "add this template"; tailored to each lead, prices from Tool settings, the default brochure for the
 * new "Website + SEO" website type). The PDF is a picture of a printed booklet (a cover, 8 spreads, a back page), so the
 * 18 A4 pages are rebuilt from it: text placed on the PDF's own baselines (its OCR layer), sizes fitted to the measured
 * word widths, rules and boxes measured on the page images, photos cropped from them at full resolution.
 * Fonts: Inter (variable, optical sizes: the big headings get its display cut) and Geist Mono; yellow #EFE659.
 * Words Claude writes per lead: the intro, who we are, the website and SEO texts, the package texts, the highlighted
 * SEO service and package; Codeace's facts (numbers, results, clients, brands) stay as in the brochure.
 */
export const SIZE = { width: 794, height: 1123, paper: { width: '210mm', height: '297mm' }, scale: (210 / 25.4 * 96) / 794 };
export const PHOTOS = []; // the brochure's own pictures (Codeace's team, office, event)

const Y = '#EFE659';
const INK = '#111111';
// Inter / Geist Mono vertical metrics: the top of a line box whose baseline is at `base`
const ASC = { inter: 0.96875, mono: 1.005 }, DESC = { inter: 0.2412, mono: 0.295 };
const topOf = (base, size, lh, fam = 'inter') => Math.round((base - ((lh - (ASC[fam] + DESC[fam]) * size) / 2 + ASC[fam] * size)) * 100) / 100;
const br = (t) => esc(t).replace(/\n/g, '<br>');
const two = (n) => String(n).padStart(2, '0');
const three = (n) => String(n).padStart(3, '0');

/** Absolutely placed text: o = { x, base (first baseline), size, lh, w (box width), weight, mono, ls (em), color, align, right } */
function T(text, o) {
  const fam = o.mono ? 'mono' : 'inter';
  const lh = o.lh || Math.round(o.size * (o.mono ? 1.3 : 1.2));
  const style = [
    // the OCR layer puts a line about 0.11 × size above its real baseline
    `top: ${topOf(o.base + (o.exact ? 0 : 0.11 * o.size), o.size, lh, fam)}px`,
    o.right != null ? `right: ${o.right}px` : `left: ${o.x}px`,
    o.w ? `width: ${o.w}px` : 'white-space: nowrap',
    `font-family: ${o.mono ? "'Geist Mono', ui-monospace, monospace" : "'Inter', system-ui, sans-serif"}`,
    `font-size: ${o.size}px`, `line-height: ${lh}px`, `font-weight: ${o.weight || 400}`,
    o.ls ? `letter-spacing: ${o.ls}em` : '', `color: ${o.color || INK}`, o.align ? `text-align: ${o.align}` : '',
    o.extra || '',
  ].filter(Boolean).join('; ');
  return `<div class="t" style="${style}">${o.html ? text : br(text)}</div>`;
}
const box = (x, y, w, h, style) => `<div style="position: absolute; left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px; ${style}"></div>`;
const rule = (y, x = 72, w = 650, c = 'rgba(17,17,17,0.14)', h = 1) => box(x, y, w, h, `background: ${c}`);
/** White squares over the yellow (the brochure's "pixel" decoration): [x, y, size, opacity] */
const squares = (list, color = '255,255,255') => list.map(([x, y, s, a, h]) => box(x, y, s, h || s, `background: rgba(${color},${a})`)).join('');
const DOTS = (fill, dot) => `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 3px; width: 26px; height: 14px; border-radius: 7px; background: ${fill}; margin-right: 10px; flex: 0 0 26px"><i style="width: 3.4px; height: 3.4px; border-radius: 50%; background: ${dot}"></i><i style="width: 3.4px; height: 3.4px; border-radius: 50%; background: ${dot}"></i><i style="width: 3.4px; height: 3.4px; border-radius: 50%; background: ${dot}"></i></span>`;
/** The tag pill at the top of a page: look 'line' (outline), 'white' (white fill), 'dark' (white fill on the dark page) */
function tag(text, { x = 72, y = 72, look = 'line', size = 13.6 } = {}) {
  const fill = look === 'line' ? 'background: transparent; border: 1.3px solid #111111' : 'background: #FFFFFF; border: 1.3px solid #FFFFFF';
  return `<div style="position: absolute; left: ${x}px; top: ${y}px; height: 31px; box-sizing: border-box; padding: 0 14px 0 11px; border-radius: 16px; ${fill}; display: flex; align-items: center; font-family: 'Inter', sans-serif; font-weight: 500; font-size: ${size}px; color: #111111; white-space: nowrap">${DOTS('#111111', '#FFFFFF')}<span>${esc(text)}</span></div>`;
}
/** Footer: even pages "CodeAce IT Solutions LLP / Services Brochure", odd pages "codeace.com / INDIA | UAE | USA" */
function foot(n, { color = INK, lines = null, page = true } = {}) {
  const l = lines || (n % 2 ? ['codeace.com', 'INDIA | UAE | USA'] : ['CodeAce IT Solutions LLP', 'Services Brochure']);
  return T(l.join('\n'), { x: 72, base: 1052, size: 12, lh: 17, mono: true, color })
    + (page ? T(`Page ${two(n)}`, { right: 72, base: 1069, size: 12, lh: 17, mono: true, color, align: 'right' }) : '');
}
const PAGE = "position: relative; width: 794px; height: 1123px; overflow: hidden; box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; color: #111111";
// a layered gradient background is captured as a picture in the classic design (data-ax-bg, public/html-convert.js)
const page = (n, bg, inner) => `<div class="pg" data-page="${n}"${/gradient/.test(bg) ? ' data-ax-bg' : ''} style="${PAGE}; ${bg}">\n${inner}\n</div>`;
const YELLOW_DOWN = `background-color: ${Y}; background-image: radial-gradient(70% 45% at 100% 100%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 100%), linear-gradient(180deg, ${Y} 0%, ${Y} 34%, #F1E96C 58%, #F7F2B0 86%, #FAF7C9 100%)`;
const YELLOW_UP = `background-color: ${Y}; background-image: radial-gradient(55% 35% at 100% 0%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 100%), linear-gradient(180deg, #F2EEA9 0%, #F0E77E 30%, #F0E77A 70%, #F0E885 100%)`;
const DARK = 'background-color: #0B0B0B; background-image: radial-gradient(85% 60% at 100% 100%, #6A6B66 0%, #3A3B38 30%, #161616 62%, #0B0B0B 100%)';
const check = (c = INK) => `<svg width="15" height="12" viewBox="0 0 15 12" fill="none" aria-hidden="true"><path d="M1.5 6.3 5.4 10 13.5 1.8" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const kmoney = (n) => (n % 1000 === 0 ? `₹${n / 1000}k` : money(n));
/** The brochure's "6 months" / "6-month" follow the retainer length set in Tool settings. */
const mo = (t, c) => String(t || '').replace(/\b6(?=[- ]months?\b)/g, String(c.prices?.retainer_months || 6));

// ------------------------------------------------------------------ pages
function cover(c, d) {
  const items = (d.cover.items || []).slice(0, 3);
  return page(1, YELLOW_DOWN, `
${squares([[554, 0, 80, 0.25], [634, 0, 80, 0.6], [714, 0, 80, 0.9], [634, 80, 80, 0.25], [714, 80, 80, 0.55], [554, 160, 80, 0.08], [714, 160, 80, 0.15]])}
<img src="${img('codeace-dark.png')}" alt="CodeAce IT Solutions LLP" style="position: absolute; left: 72px; top: 72px; height: 55px; width: auto">
${tag(d.cover.tag, { y: 189, size: 14 })}
${T(d.cover.title, { x: 64, base: 364, size: 99, lh: 96, ls: -0.06 })}
${T(d.cover.tagline, { x: 72, base: 639, size: 20.5, lh: 27, weight: 600 })}
${[800, 868, 936, 1004].map((y) => rule(y, 72, 211, 'rgba(17,17,17,0.3)')).join('')}
${items.map((t, i) => T(two(i + 1), { x: 72, base: 828 + 68 * i, size: 14, mono: true }) + T(t, { x: 116, base: 829 + 68 * i, size: 16.2, lh: 19, weight: 500, w: 160 })).join('\n')}
<img src="${img('seo-building.jpg')}" alt="" style="position: absolute; left: 363px; top: 760px; width: 431px; height: 270px; object-fit: cover; display: block">
${c.client ? T(`Prepared for ${c.client}`, { x: 72, base: 1052, size: 12, lh: 17, mono: true }) : ''}
${T('codeace.com', { x: 72, base: 1069, size: 12, lh: 17, mono: true })}
${T('INDIA | UAE | USA', { right: 72, base: 1069, size: 12, lh: 17, mono: true, align: 'right' })}`);
}

const TOC = [['Introduction', 4], ['Who We Are', 5], ['Website Development', 6], ['Website Capabilities', 7], ['Google SEO & AI Search', 8], ['SEO Services Breakdown', 9],
  ['More Ways to Grow', 10], ['Results That Matter', 11], ['Our Work', 12], ['Brands We Have Worked With', 13], ['Website & SEO Packages', 14], ['SEO Retainer', 16]];
function tocRows(list, start) {
  const ys = [500, 563, 627, 690, 754, 818, 881];
  return ys.map((y) => rule(y, 72, 650, 'rgba(17,17,17,0.22)')).join('')
    + list.map(([label, p], i) => T(`(${three(start + i)})`, { x: 72, base: ys[i] + 38, size: 14, mono: true })
      + T(label, { x: 144, base: ys[i] + 37, size: 20, weight: 500 })
      + T(`Page ${two(p)}`, { right: 72, base: ys[i] + 38, size: 14, mono: true, align: 'right' })).join('\n');
}
function toc1(c, d) {
  return page(2, YELLOW_DOWN, `
${T('Table Of', { x: 56, base: 177, size: 152, lh: 150, ls: -0.06 })}
${squares([[344, 240, 76, 0.85], [420, 240, 76, 0.55], [344, 316, 76, 0.25], [496, 316, 76, 0.15]])}
${T(d.toc.lead, { x: 72, base: 350, size: 20.7, lh: 30, w: 400, color: '#1E1E1E' })}
${tocRows(TOC.slice(0, 6), 1)}
${foot(2)}`);
}
function toc2(c, d) {
  return page(3, YELLOW_DOWN, `
${squares([[0, 240, 56, 0.0], [200, 240, 76, 0.6], [276, 240, 40, 0.25], [200, 316, 76, 0.15]])}
${T('Contents', { x: 56, base: 177, size: 152, lh: 150, ls: -0.06 })}
${tocRows(TOC.slice(6), 7)}
${foot(3)}`);
}

function intro(c, d) {
  const stats = (d.intro.stats || []).slice(0, 3);
  return page(4, 'background: #FFFFFF', `
${tag('(001) Introduction')}
${T(d.intro.title, { x: 64, base: 224, size: 98.5, lh: 110, ls: -0.06 })}
<div style="position: absolute; left: 533px; top: 164px; width: 40px; height: 19px; border-radius: 10px; background: #DEDEDB; display: flex; align-items: center; justify-content: center; gap: 3.5px"><i style="width: 4px; height: 4px; border-radius: 50%; background: #FFFFFF"></i><i style="width: 4px; height: 4px; border-radius: 50%; background: #FFFFFF"></i><i style="width: 4px; height: 4px; border-radius: 50%; background: #FFFFFF"></i></div>
${T(d.intro.text, { x: 72, base: 320, size: 20.5, lh: 30, w: 620, color: '#1E1E1E' })}
${[630, 743, 856, 969].map((y) => rule(y, 72, 650, '#DCDCDC')).join('')}
${stats.map((s, i) => {
    const y = 630 + 113 * i;
    // the yellow square sits under the first digit, its bottom just below the baseline
    const value = `<span style="position: relative; display: inline-block"><i style="position: absolute; left: -17px; top: 36px; width: 30px; height: 26px; background: linear-gradient(45deg, ${Y} 0%, rgba(239,230,89,0.55) 100%)"></i><span style="position: relative">${esc(s.value)}</span></span>`;
    return T(s.label, { x: 72, base: y + 79, size: 16.6 })
      + T(value, { right: 72, base: y + 75, size: 66, lh: 70, ls: -0.06, align: 'right', html: true });
  }).join('\n')}
${foot(4)}`);
}

function who(c, d) {
  const items = (d.who.items || []).slice(0, 4);
  return page(5, 'background: #FFFFFF', `
<div style="position: absolute; left: 474px; top: 0; width: 320px; height: 440px; background: linear-gradient(180deg, ${Y} 0%, ${Y} 44%, #F3ED90 62%, #F8F5C2 82%, rgba(255,255,255,0) 100%)"></div>
${squares([[434, 0, 40, 0.45], [394, 80, 40, 0.88], [434, 80, 40, 0.65], [434, 200, 40, 0.82], [474, 440, 80, 0.55], [554, 440, 40, 0.85]], '239,230,89')}
${tag('(002) Who We Are')}
${T(d.who.title, { x: 72, base: 184, size: 43, lh: 46, ls: -0.04 })}
${T(d.who.text, { x: 72, base: 366, size: 17, lh: 24, w: 330, color: '#2A2A2A' })}
${[580, 666, 752].map((y) => rule(y, 72, 309, '#D9D9D9') + rule(y, 413, 309, '#D9D9D9')).join('')}
${items.map((t, i) => {
    const x = i % 2 ? 413 : 72, y = 580 + 86 * Math.floor(i / 2);
    return T(`(${two(i + 1)})`, { x, base: y + 32, size: 14, mono: true }) + T(t, { x, base: y + 61, size: 20, weight: 500 });
  }).join('\n')}
${T(d.who.stat.label, { x: 72, base: 896, size: 17, lh: 24, w: 130 })}
${T(d.who.stat.value, { right: 72, base: 939, size: 168.6, lh: 170, ls: -0.06, align: 'right' })}
${foot(5)}`);
}

/**
 * Numbered rows: (001) mono, title, text (the website / capability pages). A flowing list: a row grows with its text
 * (the lead's own words), keeping the brochure's gaps (rule to title baseline 40, title to text 29, text lines 24, last
 * line to the next rule 26).
 */
function rows(list, { top, start = 1, titleSize = 20.4, textW = 578 }) {
  const row = (it, i) => `<div style="position: relative; border-top: 1px solid #DCDCDC; padding: 19.8px 0 20.1px 72px">
<div style="position: absolute; left: 0; top: 23.5px; font-family: 'Geist Mono', monospace; font-size: 14px; line-height: 18.2px; color: ${INK}">(${three(start + i)})</div>
<div style="font-size: ${titleSize}px; line-height: 24px; font-weight: 600; color: ${INK}">${esc(it.title)}</div>
<div style="margin-top: 6.2px; width: ${textW}px; font-size: 16px; line-height: 24px; color: #4A4A4A">${esc(it.text)}</div></div>`;
  return `<div style="position: absolute; left: 72px; top: ${top}px; width: 650px; border-bottom: 1px solid #DCDCDC">${list.map(row).join('')}</div>`;
}
function website(c, d) {
  const w = d.website;
  return page(6, 'background: #FFFFFF', `
${tag('(003) Website Development')}
${rows((w.items || []).slice(0, 3), { top: 140 })}
<div style="position: absolute; left: 0; top: 560px; width: 330px; height: 140px; background: linear-gradient(90deg, #F2EC90 0%, #F5F0A6 45%, rgba(255,255,255,0) 100%)"></div>
${squares([[188, 560, 72, 0.45], [188, 632, 72, 0.7]], '239,230,89')}
${T(w.lead, { x: 72, base: 620, size: 20.5, lh: 30, w: 440, color: '#1E1E1E' })}
${T(w.title, { x: 62, base: 808, size: 90.8, lh: 88.5, ls: -0.06 })}
${foot(6)}`);
}

function capabilities(c, d) {
  const k = d.capabilities;
  const items = (k.items || []).slice(0, 3);
  return page(7, 'background: #FFFFFF', `
<div style="position: absolute; left: 534px; top: 0; width: 260px; height: 500px; background: linear-gradient(180deg, ${Y} 0%, ${Y} 55%, #F4EF9B 75%, rgba(255,255,255,0) 100%)"></div>
${squares([[406, 64, 64, 0.16], [470, 0, 64, 0.5], [470, 64, 64, 0.32], [470, 192, 64, 0.2], [470, 372, 64, 0.28], [534, 500, 64, 0.2], [598, 500, 64, 0.12], [598, 564, 64, 0.07]], '239,230,89')}
${tag('(004) Website Capabilities')}
${T(k.stat.label, { x: 72, base: 317, size: 17.3, lh: 25, w: 140 })}
${T(k.stat.value, { x: 222, base: 400, size: 276, lh: 280, ls: -0.07 })}
${T(k.stat.text, { x: 232, base: 506, size: 17, lh: 24, w: 312, color: '#2A2A2A' })}
${rows(items, { top: 640, start: 4, titleSize: 20.2 })}
${foot(7)}`);
}

function seo(c, d) {
  const s = d.seo;
  const items = (s.items || []).slice(0, 6);
  const hi = Math.max(0, Math.min(items.length - 1, Number(s.highlight) || 0));
  // rows step right 48 px each; the highlighted row (a taller band) stays under the one before it
  const tops = [168, 231, 294, 357, 428, 490];
  return page(8, DARK, `
${tag(s.tag, { look: 'white' })}
${tops.map((y, i) => i === hi ? '' : rule(y, 0, 794, 'rgba(255,255,255,0.10)')).join('')}${rule(553, 0, 794, 'rgba(255,255,255,0.10)')}
${box(0, tops[hi], 794, (tops[hi + 1] || 553) - tops[hi], 'background: #F2EC9C')}
${items.map((t, i) => {
    const x = 72 + 48 * (i < hi ? i : i === hi ? Math.max(0, i - 1) : i - 1);
    const on = i === hi, base = (on ? tops[i] + 40 : tops[i] + 36);
    const col = on ? INK : '#D8D8D8';
    return T(`(${three(i + 1)})`, { x, base, size: 14, mono: true, color: on ? INK : '#9A9A9A' })
      + T(t, { x: x + 60, base, size: on ? 19 : 18.4, weight: on ? 600 : 400, color: on ? INK : '#F2F2F2' })
      + T('—', { right: 74, base, size: 18, color: on ? INK : 'rgba(255,255,255,0.55)', align: 'right' });
  }).join('\n')}
${T(s.title, { x: 62, base: 913, size: 69.7, lh: 68, ls: -0.06, color: '#FFFFFF' })}
${foot(8, { color: '#E8E8E8' })}`);
}

function breakdown(c, d) {
  const b = d.breakdown;
  const list = (b.rows || []).slice(0, 6);
  const ys = [178, 258, 336, 416, 495, 574, 653];
  return page(9, YELLOW_UP, `
${squares([[714, 0, 80, 0.5], [634, 60, 80, 0.3]])}
${tag(b.tag)}
${T('Service area', { x: 72, base: 162, size: 13, mono: true })}${T("What's included", { x: 306, base: 162, size: 13, mono: true })}
${rule(178, 72, 650, '#1E1E1E', 1.4)}${ys.slice(1, 6).map((y) => rule(y, 72, 650, 'rgba(17,17,17,0.16)')).join('')}${rule(653, 72, 650, '#1E1E1E', 1.4)}
${list.map((r, i) => T(r.area, { x: 72, base: ys[i] + 33, size: 17, lh: 23, weight: 600, w: 200 }) + T(r.text, { x: 306, base: ys[i] + 33, size: 16.2, lh: 24, w: 416, color: '#2A2A2A' })).join('\n')}
${T(b.quote, { right: 72, base: 829, size: 34.7, lh: 40.5, ls: -0.03, w: 470, align: 'right' })}
${foot(9)}`);
}

function more(c, d) {
  const m = d.more;
  // a flowing list (texts of any length): the brochure's baseline gaps (number → title 26, title → text 29, text lines
  // 23, last line → next number 49) turned into margins from the fonts' metrics
  const items = `<div style="position: absolute; left: 72px; top: ${topOf(352, 13.3, 16, 'mono')}px; width: 225px">${(m.items || []).slice(0, 4).map((it, i) => `
<div style="font-family: 'Geist Mono', monospace; font-size: 13.3px; line-height: 16px; margin-bottom: 4.3px">${two(i + 1)}</div>
<div style="font-size: 19px; line-height: 23px; font-weight: 600; margin-bottom: 6.8px">${esc(it.title)}</div>
<div style="font-size: 16.8px; line-height: 23px; color: #1E1E1E; margin-bottom: 30.9px">${esc(it.text)}</div>`).join('')}</div>`;
  return page(10, `background-color: ${Y}; background-image: linear-gradient(180deg, ${Y} 0%, ${Y} 55%, #F4EFA0 85%, #F8F4BE 100%)`, `
<img src="${img('seo-team.jpg')}" alt="" style="position: absolute; left: 331px; top: 0; width: 463px; height: 1123px; object-fit: cover; display: block">
${tag(m.tag, { look: 'white' })}
${T(m.title, { x: 72, base: 173, size: 29, lh: 31.5, ls: -0.04 })}
${items}
${foot(10, { lines: ['CodeAce IT Solutions LLP', 'Page 10'], page: false })}`);
}

function results(c, d) {
  const r = d.results;
  const s = (r.stats || []).slice(0, 2);
  return page(11, YELLOW_UP, `
${squares([[714, 0, 60, 0.75], [654, 0, 60, 0.35], [714, 60, 60, 0.4]])}
${[189, 519, 850].map((y) => box(746, y, 15, 102, 'border: 1.4px solid #222222; border-radius: 8px; box-sizing: border-box')).join('')}
${tag(r.tag)}
${T(r.title, { x: 72, base: 184, size: 43, lh: 46, ls: -0.04 })}
${T(r.main.value, { x: 58, base: 418, size: 180, lh: 180, ls: -0.06 })}
${rule(500, 72, 621, '#1E1E1E')}
${T(r.main.name, { x: 72, base: 534, size: 20.5, weight: 600 })}${T(r.main.label, { x: 398, base: 533, size: 17 })}
${s.map((x, i) => { const L = i ? 398 : 72; return T(x.value, { x: L - 4, base: 718, size: 94.7, lh: 96, ls: -0.06 }) + rule(759, L, i ? 294 : 260, '#1E1E1E') + T(x.name, { x: L, base: 792, size: 20.9, weight: 600 }) + T(x.label, { x: L, base: 817, size: 17 }); }).join('\n')}
<div style="position: absolute; left: 500px; top: 949px; height: 32px; padding: 0 14px 0 11px; border-radius: 16px; background: #FFFFFF; display: flex; align-items: center; font-weight: 500; font-size: 14px; white-space: nowrap">${DOTS('#111111', '#FFFFFF')}<span>${esc(r.pill)}</span></div>
${foot(11)}`);
}

function work(c, d) {
  const w = d.work;
  const ys = [300, 383, 466, 549, 632, 715, 798];
  return page(12, 'background: #FFFFFF', `
${T(w.title, { x: 56, base: 170, size: 141, lh: 140, ls: -0.06 })}
${T(w.sub, { x: 72, base: 264, size: 14, mono: true })}
${ys.map((y) => rule(y, 72, 650, '#DCDCDC')).join('')}
${(w.rows || []).slice(0, 6).map((r, i) => T('—', { x: 72, base: ys[i] + 34, size: 18 }) + T(r.name, { x: 112, base: ys[i] + 34, size: 18.8, weight: 600, w: 200 }) + T(r.text, { x: 324, base: ys[i] + 34, size: 16.6, lh: 24, w: 398, color: '#2A2A2A' })).join('\n')}
<img src="${img('seo-event.jpg')}" alt="" style="position: absolute; left: 73px; top: 881px; width: 148px; height: 102px; object-fit: cover; border-radius: 8px; display: block">
${T(w.caption, { x: 242, base: 957, size: 14.6, lh: 20, w: 210 })}
${foot(12)}`);
}

function brands(c, d) {
  const b = d.brands;
  const ys = [540, 618, 696, 774];
  return page(13, YELLOW_UP, `
${squares([[714, 0, 80, 0.55], [654, 40, 60, 0.3]])}
${tag(b.tag)}
${box(72, 150, 234, 219, 'background: #0D0D0D')}
<img src="${img('seo-office.jpg')}" alt="" style="position: absolute; left: 306px; top: 150px; width: 416px; height: 219px; object-fit: cover; display: block">
${T(b.banner, { x: 104, base: 196, size: 13, mono: true, color: '#EDEDED' })}
${box(547, 315, 153, 72, `background: ${Y}`)}
${T(b.stat.value, { x: 562, base: 353, size: 37, lh: 38, ls: -0.04 })}${T(b.stat.label, { x: 564, base: 375, size: 13.8 })}
${T(b.title, { x: 72, base: 464, size: 43, lh: 46, ls: -0.04 })}
${ys.map((y) => rule(y, 72, 309, 'rgba(17,17,17,0.2)') + rule(y, 413, 309, 'rgba(17,17,17,0.2)')).join('')}
${(b.items || []).slice(0, 6).map((it, i) => { const x = i % 2 ? 413 : 72, y = ys[Math.floor(i / 2)]; return T(it.name, { x, base: y + 33, size: 19, weight: 600 }) + T(it.text, { x, base: y + 57, size: 17 }); }).join('\n')}
${T(b.quote, { right: 72, base: 865, size: 30.5, lh: 36, ls: -0.03, w: 420, align: 'right' })}
${foot(13)}`);
}

function packages(c, d) {
  const p = d.packages;
  const cols = [[72, 197], [298, 199], [524, 198]];
  const rec = p.recommended == null || p.recommended === '' ? -1 : Number(p.recommended); // set for a lead, not in the sample
  return page(14, YELLOW_DOWN, `
${squares([[435, 0, 70, 0.55], [505, 0, 70, 0.3], [435, 70, 70, 0.25]])}
${tag(p.tag)}
${T(p.title, { x: 62, base: 224, size: 99.6, lh: 96, ls: -0.06 })}
${T(p.lead, { x: 72, base: 390, size: 20.5, lh: 30, w: 580, color: '#1E1E1E' })}
<div style="position: absolute; left: 73px; top: 490px; width: 649px; height: 199px; background-color: #EDEDED; background-image: linear-gradient(90deg, #111111 0%, #111111 34%, rgba(17,17,17,0.6) 46%, rgba(17,17,17,0) 62%), url('${img('seo-building.jpg')}'); background-size: auto, 430px auto; background-position: 0 0, right 18px bottom 8px; background-repeat: no-repeat"></div>
${T(p.banner_small, { x: 104, base: 534, size: 13, mono: true, color: '#E5E5E5' })}
${T(p.banner_big, { x: 104, base: 573, size: 29.5, lh: 33, ls: -0.04, color: '#FFFFFF' })}
${box(560, 633, 136, 78, `background: ${Y}`)}
${T('3', { x: 578, base: 673, size: 37, lh: 38 })}${T('Package options', { x: 578, base: 695, size: 13.8 })}
${T(p.fit_title, { x: 72, base: 773, size: 14, mono: true })}
${cols.map(([x, w], i) => (i === rec ? rule(795, x, w, INK, 2) : rule(796, x, w, 'rgba(17,17,17,0.35)'))).join('')}
${(p.cards || []).slice(0, 3).map((k, i) => { const [x] = cols[i]; return T(`(${two(i + 1)}) ${i === rec ? 'Recommended' : `Package ${two(i + 1)}`}`, { x, base: 826, size: 13, mono: true, weight: i === rec ? 600 : 400 }) + T(k.name, { x, base: 863, size: 31, lh: 34, ls: -0.04 }) + T(mo(k.text, c), { x, base: 895, size: 16.9, lh: 24, w: 192, color: '#1E1E1E' }); }).join('\n')}
${foot(14)}`);
}

function options(c, d) {
  const o = d.options;
  const pk = c.prices;
  const hi = Math.max(0, Math.min(2, Number(o.highlight ?? 2)));
  const colX = [475, 565, 666]; // centres of the 01 / 02 / 03 columns
  const ys = [618, 663, 708, 753, 798, 843, 889, 934];
  const mark = (m, on) => m === 'yes' ? check() : m === 'no' ? '—' : esc(m);
  const cell = (m, i, y) => `<div style="position: absolute; left: ${colX[i] - 45}px; top: ${y + 12}px; width: 90px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: ${m === 'no' ? 400 : 600}; font-size: ${m === 'no' ? 17 : 14.5}px; color: ${INK}">${mark(m, i === hi)}</div>`;
  const price = (i) => (pk.packages?.[i]?.price ? money(pk.packages[i].price) : 'On request');
  return page(15, 'background: #FFFFFF', `
${tag(o.tag)}
${[128, 211, 294, 401].map((y) => rule(y, 72, 650, '#DCDCDC')).join('')}
${(o.packages || []).slice(0, 3).map((it, i) => { const y = [128, 211, 294][i]; return T(`(${three(i + 1)})`, { x: 72, base: y + 32, size: 14, mono: true }) + T(it.title, { x: 144, base: y + 33, size: 20.4, weight: 600 }) + T(mo(it.text, c), { x: 144, base: y + 60, size: 16.5, lh: 24, w: 560, color: '#4A4A4A' }); }).join('\n')}
${tag(o.included_tag, { y: 520 })}
${box(colX[hi] - (hi === 2 ? 56 : 45), 575, hi === 2 ? 112 : 90, 423, `background: ${Y}`)}
${T('Included', { x: 72, base: 600, size: 13, mono: true })}${[0, 1, 2].map((i) => T(two(i + 1), { x: colX[i] - 8, base: 600, size: 13, mono: true })).join('')}
${rule(618, 72, 650, '#1E1E1E', 1.4)}${ys.slice(1).map((y) => rule(y, 72, 650, '#DCDCDC')).join('')}${rule(998, 72, 650, '#1E1E1E', 1.4)}
${(o.rows || []).slice(0, 7).map((r, i) => { const y = ys[i]; return T(mo(r.label, c), { x: 72, base: y + 27, size: 16.1 }) + (r.marks || []).slice(0, 3).map((m, j) => cell(m, j, y)).join(''); }).join('\n')}
${T('Investment', { x: 72, base: 971, size: 17.6, weight: 600 })}
${[0, 1].map((i) => T(price(i), { x: colX[i] - 45, w: 90, align: 'center', base: 970, size: 13, mono: true })).join('')}
${T(price(2), { x: colX[2] - 56, w: 112, align: 'center', base: 961, size: 13, mono: true })}${T(`+ ${kmoney(pk.retainer_monthly)}/month`, { x: colX[2] - 56, w: 112, align: 'center', base: 979, size: 11.5, mono: true })}
${foot(15)}`);
}

function retainer(c, d) {
  const r = d.retainer;
  const ys = [195, 272, 349, 426, 503, 580];
  return page(16, YELLOW_DOWN, `
<img src="${img('seo-event.jpg')}" alt="" style="position: absolute; left: 595px; top: 60px; width: 126px; height: 98px; object-fit: cover; border-radius: 8px; display: block">
${tag(r.tag, { look: 'white' })}
${ys.slice(1).concat(657).map((y) => rule(y, 72, 650, 'rgba(17,17,17,0.22)')).join('')}
${(r.rows || []).slice(0, 6).map((x, i) => T('•', { x: 73, base: ys[i] + 31, size: 17 }) + T(x.name, { x: 91, base: ys[i] + 31, size: 17, weight: 600, w: 240 }) + T(x.text, { x: 342, base: ys[i] + 31, size: 16.5, lh: 24, w: 380, color: '#2A2A2A' })).join('\n')}
${squares([[459, 778, 63, 0.55], [522, 778, 63, 0.3], [522, 841, 63, 0.55]])}
${T(r.title, { x: 56, base: 863, size: 124, lh: 119, ls: -0.06 })}
${foot(16)}`);
}

function terms(c, d) {
  const t = d.terms;
  const pk = c.prices;
  const rowsList = [['Monthly fee', `${money(pk.retainer_monthly)} / month`], ['Billing', t.billing], ['Duration', mo(t.duration, c)]];
  return page(17, 'background: #FFFFFF', `
<div style="position: absolute; left: 564px; top: 0; width: 230px; height: 125px; background: linear-gradient(180deg, ${Y} 0%, #F3EE9A 45%, rgba(255,255,255,0) 100%)"></div>
${squares([[508, 0, 56, 0.45], [452, 56, 56, 0.2], [508, 56, 56, 0.32], [564, 120, 56, 0.28], [620, 120, 56, 0.14], [508, 168, 56, 0.2], [620, 176, 56, 0.08]], '239,230,89')}
${tag(t.tag)}
${T('Term', { x: 72, base: 274, size: 12.5, mono: true })}${T('Detail', { x: 272, base: 274, size: 13, mono: true })}
${rule(292, 72, 650, '#1E1E1E', 1.4)}${rule(351, 72, 650, '#DCDCDC')}${rule(410, 72, 650, '#DCDCDC')}${rule(469, 72, 650, '#1E1E1E', 1.4)}
${rowsList.map(([a, b], i) => T(a, { x: 72, base: 326 + 60 * i, size: 17 }) + T(b, { x: 272, base: 326 + 60 * i, size: 17.4, weight: 600 })).join('\n')}
${T(t.stat_label, { x: 72, base: 637, size: 17.3, lh: 25, w: 140 })}
${T(kmoney(pk.retainer_monthly), { x: 220, base: 678, size: 205, lh: 210, ls: -0.07 })}
${T(t.quote, { right: 72, base: 869, size: 34.7, lh: 40.5, ls: -0.03, w: 420, align: 'right' })}
${foot(17)}`);
}

function back(c, d) {
  const k = c.contact;
  const cols = [[72, 'Email', k.email], [297, 'Phone', k.phone], [521, 'Web', k.website]];
  const title = esc(d.back.title).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, `<span style="color: #EFE65D">$1</span>`);
  return page(18, DARK, `
${box(563, 0, 231, 189, `background: ${Y}`)}
${squares([[436, 64, 64, 0.16], [500, 64, 63, 0.3], [500, 0, 63, 0.12], [563, 189, 64, 0.35], [627, 189, 64, 0.22]], '239,230,89')}
<img src="${img('codeace-white.png')}" alt="CodeAce IT Solutions LLP" style="position: absolute; left: 72px; top: 72px; height: 55px; width: auto">
${T(title, { x: 64, base: 310, size: 79, lh: 78, ls: -0.06, color: '#FFFFFF', w: 680, html: true })}
<img src="${img('seo-event.jpg')}" alt="Codeace team" style="position: absolute; left: 72px; top: 610px; width: 650px; height: 260px; object-fit: cover; display: block">
${cols.map(([x, a, b]) => rule(910, x, 201, 'rgba(255,255,255,0.28)') + T(a, { x, base: 936, size: 13, mono: true, color: '#BDBDBD' }) + T(b || '', { x, base: 962, size: 17.2, weight: 500, color: '#FFFFFF' })).join('\n')}
${T('INDIA | UAE | USA', { x: 72, base: 1070, size: 12, lh: 17, mono: true, color: '#D0D0D0' })}
${T('Page 18', { right: 72, base: 1070, size: 12, lh: 17, mono: true, color: '#D0D0D0', align: 'right' })}`);
}

/**
 * The whole document. ctx = { client, title, contact: { email, phone, website }, prices: { packages: [{ price }×3],
 * retainer_monthly, retainer_months } }.
 */
export function brochureSeoHtml(d, ctx) {
  const pages = [cover, toc1, toc2, intro, who, website, capabilities, seo, breakdown, more, results, work, brands, packages, options, retainer, terms, back].map((f) => f(ctx, d));
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(ctx.title || 'CodeAce Website & SEO')}</title>
<style>${fontCss('seo-fonts.css')}</style>
<style>
@page { size: 210mm 297mm; margin: 0 }
html, body { margin: 0; padding: 0; background: #FFFFFF }
.t { position: absolute; margin: 0; font-optical-sizing: auto }
.pg i { display: block }
.pg { page-break-after: always; break-after: page }
.pg:last-child { page-break-after: auto; break-after: auto }
</style>
</head>
<body>
${pages.join('\n')}
</body></html>`;
}
