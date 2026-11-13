/*
 * The rendered pages of a Codeace HTML document → the classic editor's design model (owner, 2026-11-12: "use classic
 * editor always. but i need my same pdf structure and styles"). Runs in a browser page: in the admin ("Open in
 * classic editor") and on the server in Chromium (src/html-docs/to-design.js, when a document is made).
 * Pure DOM: returns { pages, fonts, images } where texts carry a font key "Family|weight|italic" and pictures a PNG /
 * JPEG data URL; the caller turns keys into font codes (font importer) and data URLs into uploads.
 *   boxes        → shapes (fill, linear gradient, radial approximated, outline, single-side rules as thin bars)
 *   photos, img  → images (re-encoded); inline SVG icons → small PNG images
 *   texts        → text boxes (size, colour, letter spacing, line height, alignment, a bold part in another colour)
 *   [data-pricing] (the proposal's price table) → a live pricing element in the CodeAce look
 */
export const PT = 0.75; // CSS px → the design model's points (1123 px wide = 842 pt)
export const WEIGHT_NAME = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

export function rgbHex(c) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(c || '');
  if (!m) return { hex: null, a: 0 };
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { hex: '#' + [m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, '0')).join(''), a };
}
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
function gradientOf(layer) {
  const m = /^(linear|radial)-gradient\((.*)\)$/s.exec(layer.trim());
  if (!m) return null;
  const parts = splitTop(m[2]);
  let angle = 180;
  if (m[1] === 'linear') {
    if (/^-?[\d.]+deg$/.test(parts[0])) angle = parseFloat(parts.shift());
    else if (/^to /.test(parts[0])) angle = ({ 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to bottom right': 135, 'to bottom left': 225, 'to top left': 315 })[parts.shift()] ?? 180;
  } else { if (!/^rgb|^#|^transparent/.test(parts[0])) parts.shift(); angle = 215; } // radial: a diagonal from the bright corner
  const stops = parts.map((p, i) => { const c = rgbHex(p); const pm = /([\d.]+)%\s*$/.exec(p); return [pm ? parseFloat(pm[1]) / 100 : parts.length > 1 ? i / (parts.length - 1) : 0, c.hex || '#000000', c.a]; });
  return stops.length >= 2 ? { angle, stops: stops.slice(0, 6) } : null;
}
/** A picture → a JPEG (or PNG when it has transparency) data URL no wider than max px. */
export async function reencode(url, max = 2400) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
  const w0 = img.naturalWidth || 64, h0 = img.naturalHeight || 64;
  const k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const alpha = /^data:image\/(png|svg)/.test(url) && (() => { const d = g.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) return true; return false; })();
  return alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
}
const fontKey = (cs, weight) => { const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const w = weight || Math.round(Number(cs.fontWeight) / 100) * 100 || 400; return `${fam}|${w}|${cs.fontStyle === 'italic' ? 1 : 0}`; };

/** Converts every [data-page] of the document. onlyPage = a page number to convert just that one. */
export async function convertPages(fdoc, { onlyPage = null, shots = false } = {}) {
  let shotN = 0;
  const win = fdoc.defaultView;
  const fonts = new Set();
  const pending = [];
  const pages = [];
  for (const pg of fdoc.querySelectorAll('[data-page]')) {
    if (onlyPage && String(pg.dataset.page) !== String(onlyPage)) continue;
    const pr = pg.getBoundingClientRect();
    const X = (v) => Math.round((v - pr.left) * PT * 10) / 10, Y = (v) => Math.round((v - pr.top) * PT * 10) / 10, S = (v) => Math.round(v * PT * 10) / 10;
    const pcs = win.getComputedStyle(pg);
    const elements = [];
    const pageBg = rgbHex(pcs.backgroundColor);
    const boxOf = (el, cs, r) => {
      const out = [];
      const radius = S(parseFloat(cs.borderTopLeftRadius) || 0);
      const bg = rgbHex(cs.backgroundColor);
      const base = { x: X(r.left), y: Y(r.top), w: S(r.width), h: S(r.height) };
      if (el !== pg && bg.a > 0.01) out.push({ type: 'shape', shape: 'rect', ...base, fill: bg.hex, opacity: bg.a, radius });
      const layers = cs.backgroundImage && cs.backgroundImage !== 'none' ? splitTop(cs.backgroundImage) : [];
      const url = layers.find((l) => /^url\(/.test(l));
      if (url) {
        const src = /^url\(["']?(.*?)["']?\)$/s.exec(url)?.[1];
        const pos = cs.backgroundPosition.split(' ');
        const ha = /100%|right/.test(pos[0]) ? 'right' : /^0%|left/.test(pos[0]) ? 'left' : 'center';
        const va = /100%|bottom/.test(pos[1] || '') ? 'bottom' : /^0%|top/.test(pos[1] || '') ? 'top' : 'center';
        if (src) { const e = { type: 'image', ...base, src, fit: cs.backgroundSize === 'contain' ? 'contain' : 'cover', radius, ha, va }; out.push(e); pending.push(e); }
      }
      for (const l of layers.filter((x) => !/^url\(/.test(x)).reverse()) { const g = gradientOf(l); if (g) out.push({ type: 'shape', shape: 'rect', ...base, fill: g.stops[0][1], gradient: g, radius }); }
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ s, w: parseFloat(cs[`border${s}Width`]) || 0, c: rgbHex(cs[`border${s}Color`]), st: cs[`border${s}Style`] }));
      const live = sides.filter((x) => x.w > 0 && x.st !== 'none' && x.c.a > 0.01);
      if (live.length === 4 && live.every((x) => x.w === live[0].w && x.c.hex === live[0].c.hex)) out.push({ type: 'shape', shape: 'rect', ...base, fill: 'none', stroke: live[0].c.hex, sw: S(live[0].w), radius });
      else for (const x of live) {
        const bw = S(x.w);
        const bar = x.s === 'Top' ? { x: base.x, y: base.y, w: base.w, h: bw } : x.s === 'Bottom' ? { x: base.x, y: base.y + base.h - bw, w: base.w, h: bw } : x.s === 'Left' ? { x: base.x, y: base.y, w: bw, h: base.h } : { x: base.x + base.w - bw, y: base.y, w: bw, h: base.h };
        out.push({ type: 'shape', shape: 'rect', ...bar, fill: x.c.hex, opacity: x.c.a, radius: 0 });
      }
      return out;
    };
    // CSS ::before decorations with no text (bullets, short rules, timeline dots, a big circle): a shape where the
    // browser puts them (absolute: from the containing box; otherwise at the start of the element's content)
    const beforeOf = (el, cs, r) => {
      const b = win.getComputedStyle(el, '::before');
      if (!b || b.content === 'none' || b.content === 'normal' || (b.content !== '""' && b.content !== "''") || b.display === 'none') return [];
      const w = parseFloat(b.width), h0 = parseFloat(b.height);
      let x, y, w2 = w, h = h0;
      if (b.position === 'absolute') {
        const cbEl = cs.position !== 'static' ? el : el.offsetParent || el;
        const cb = cbEl.getBoundingClientRect(), ccs = cbEl === el ? cs : win.getComputedStyle(cbEl);
        const L = cb.left + (parseFloat(ccs.borderLeftWidth) || 0), T = cb.top + (parseFloat(ccs.borderTopWidth) || 0);
        const W = cbEl.clientWidth, Hh = cbEl.clientHeight;
        const px = (v, base) => (v === 'auto' ? null : v.endsWith('%') ? (parseFloat(v) / 100) * base : parseFloat(v));
        const l = px(b.left, W), rt = px(b.right, W), t = px(b.top, Hh), bt = px(b.bottom, Hh);
        if (!Number.isFinite(w2) && l != null && rt != null) w2 = W - l - rt;
        if (!Number.isFinite(h) && t != null && bt != null) h = Hh - t - bt;
        x = L + (l != null ? l : rt != null ? W - rt - w2 : 0);
        y = T + (t != null ? t : bt != null ? Hh - bt - h : 0);
      } else {
        x = r.left + (parseFloat(cs.borderLeftWidth) || 0) + parseFloat(cs.paddingLeft);
        y = r.top + (parseFloat(cs.borderTopWidth) || 0) + parseFloat(cs.paddingTop);
      }
      if (!(w2 > 0) || !(h > 0)) return [];
      const rad = b.borderTopLeftRadius.endsWith('%') ? (parseFloat(b.borderTopLeftRadius) / 100) * Math.min(w2, h) : parseFloat(b.borderTopLeftRadius) || 0;
      const bg = rgbHex(b.backgroundColor), bw = parseFloat(b.borderTopWidth) || 0, bc = rgbHex(b.borderTopColor);
      const round = rad >= Math.min(w2, h) / 2 - 0.5 && Math.abs(w2 - h) < 0.5;
      const base = { type: 'shape', shape: round ? 'ellipse' : 'rect', x: X(x), y: Y(y), w: S(w2), h: S(h), radius: round ? 0 : S(rad) };
      return [{ ...base, fill: bg.a > 0.01 ? bg.hex : 'none', opacity: bg.a > 0.01 ? bg.a : 1, stroke: bw > 0 && bc.a > 0.01 ? bc.hex : 'none', sw: S(bw) }];
    };
    const textOf = (el, cs) => {
      let hl = '', hlf = '';
      const parts = [];
      for (const n of el.childNodes) {
        if (n.nodeType === 3) parts.push(n.textContent.replace(/\s+/g, ' '));
        else if (n.nodeName === 'BR') parts.push('\n');
        else if (n.nodeType === 1) {
          if (n.namespaceURI === 'http://www.w3.org/2000/svg') continue; // an icon in the line: drawn as a picture
          const t = String(n.innerText ?? n.textContent ?? '').replace(/\s+/g, ' ');
          const ncs = win.getComputedStyle(n);
          const c = rgbHex(ncs.color).hex;
          const heavier = Number(ncs.fontWeight) > Number(cs.fontWeight);
          // a phrase in another colour and/or bolder: **marked**, with the highlight colour and its own font
          if (/^(B|STRONG|EM|I|SPAN)$/.test(n.nodeName) && c && (c !== rgbHex(cs.color).hex || heavier)) {
            hl = c; parts.push(`**${t}**`);
            if (heavier) { hlf = fontKey(ncs); fonts.add(hlf); }
          } else parts.push(t);
        }
      }
      // non-breaking hyphens and spaces → plain ones (the classic renderer keeps Latin text only)
      let t = parts.join('').replace(/[‐‑]/g, '-').replace(/ /g, ' ').replace(/ *\n */g, '\n').trim();
      if (cs.textTransform === 'uppercase') t = t.toUpperCase();
      return { t, hl, hlf };
    };
    const walk = async (el) => {
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.classList?.contains('hdd-sel')) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (el.hasAttribute?.('data-pricing')) { // the price table: a live element, so the Prices dialog keeps working
        const tcs = win.getComputedStyle(el.querySelector('div > div') || el);
        ['400', '600', '700'].forEach((w) => fonts.add(fontKey(tcs, Number(w))));
        elements.push({ type: 'pricing', look: 'codeace', x: X(r.left), y: Y(r.top), w: S(r.width), h: S(r.height), size: S(parseFloat(tcs.fontSize) || 15), font: fontKey(tcs, 400), fontm: fontKey(tcs, 600), fontb: fontKey(tcs, 700) });
        return;
      }
      // a box that clips a decoration sticking out of it (a big circle in a rounded panel): the classic model cannot
      // clip, so on the server its background is captured as one picture (shots); its contents are still converted
      const before = beforeOf(el, cs, r);
      const bx = { x: X(r.left), y: Y(r.top), w: S(r.width), h: S(r.height) };
      const clips = /hidden|clip/.test(cs.overflow) && before.some((s) => s.x < bx.x - 1 || s.y < bx.y - 1 || s.x + s.w > bx.x + bx.w + 1 || s.y + s.h > bx.y + bx.h + 1);
      // data-ax-bg: the template asks for its background as a picture (layered or radial gradients the model cannot draw)
      if ((clips || el.hasAttribute?.('data-ax-bg')) && shots) {
        el.setAttribute('data-ax-shot', String(shotN));
        elements.push({ type: 'image', ...bx, src: `shot:${shotN++}`, fit: 'fill', radius: S(parseFloat(cs.borderTopLeftRadius) || 0) });
      } else {
        elements.push(...boxOf(el, cs, r));
        if (!clips) elements.push(...before); // in the browser a clipped decoration is left out rather than spilling over
      }
      if (el.tagName === 'IMG') {
        const parent = el.parentElement, pcs2 = win.getComputedStyle(parent);
        const radius = S(parseFloat(cs.borderTopLeftRadius) || (pcs2.overflow === 'hidden' ? parseFloat(pcs2.borderTopLeftRadius) : 0) || 0);
        const e = { type: 'image', x: X(r.left), y: Y(r.top), w: S(r.width), h: S(r.height), src: el.currentSrc || el.src, fit: cs.objectFit === 'contain' ? 'contain' : 'cover', radius };
        elements.push(e); pending.push(e);
        return;
      }
      if (el.tagName.toLowerCase() === 'svg') { // an icon: drawn as a small picture at 4× for sharpness
        const svg = el.cloneNode(true);
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', String(r.width * 4)); svg.setAttribute('height', String(r.height * 4));
        const e = { type: 'image', x: X(r.left), y: Y(r.top), w: S(r.width), h: S(r.height), src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`, fit: 'contain', radius: 0 };
        elements.push(e); pending.push(e);
        return;
      }
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText) {
        const { t, hl, hlf } = textOf(el, cs);
        if (!t) return;
        const size = parseFloat(cs.fontSize);
        const lhPx = cs.lineHeight === 'normal' ? size * 1.36 : parseFloat(cs.lineHeight);
        const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
        const contentW = r.width - bl - (parseFloat(cs.borderRightWidth) || 0) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        let x = r.left + bl + parseFloat(cs.paddingLeft), y = r.top + bt + parseFloat(cs.paddingTop), w = contentW;
        let align = /center/.test(cs.textAlign) ? 'center' : /right|end/.test(cs.textAlign) ? 'right' : 'left';
        const rg = fdoc.createRange(); rg.selectNodeContents(el);
        const tr = rg.getBoundingClientRect();
        if (/flex/.test(cs.display)) { // flex boxes with a text (the asterisk tile): place by the text itself
          y = tr.top - (lhPx - tr.height) / 2;
          if (/center/.test(cs.justifyContent)) align = 'center';
        }
        // room to spare: the classic renderer measures with its own copy of the font, a hair wider than the
        // browser's, so a box exactly as wide as its text would wrap one word early
        const lineW = Math.max(0, ...[...rg.getClientRects()].map((q) => q.width));
        const lines = Math.round(tr.height / lhPx), given = t.split('\n').length;
        // a text the browser wrapped keeps the browser's width (so the same words go on each line); a text on lines of
        // its own gets a little room, as the classic font may measure a hair wider
        if (lines > given) w = contentW + 1;
        // lines that never wrap in the page (white-space: nowrap; the big display headings) get more room: the classic
        // renderer has no optical sizes, and Inter's text cut is several percent wider than its display cut
        else if (/nowrap|pre/.test(cs.whiteSpace)) w = Math.max(w, lineW * 1.12 + 6);
        else w = Math.max(w, lineW * 1.03 + 6);
        if (align === 'center') x -= (w - contentW) / 2;
        else if (align === 'right') x -= w - contentW;
        const col = rgbHex(cs.color);
        const k = fontKey(cs);
        fonts.add(k);
        elements.push({ type: 'text', x: X(x), y: Y(y), w: S(w), h: S(Math.max(tr.height, lhPx)), text: t, font: k, size: S(size), color: col.hex || '#111111', opacity: col.a, align, lh: Math.round((lhPx / size) * 100) / 100, ls: cs.letterSpacing === 'normal' ? 0 : S(parseFloat(cs.letterSpacing)), ...(hl ? { hl } : {}), ...(hlf ? { hlf } : {}) });
        for (const svg of el.querySelectorAll('svg')) await walk(svg); // icons inside the line (check marks)
        return;
      }
      for (const c of el.children) await walk(c);
    };
    if (shots && pg.hasAttribute('data-ax-bg')) { // the page's background captured as one picture on the server
      pg.setAttribute('data-ax-shot', String(shotN));
      elements.push({ type: 'image', x: 0, y: 0, w: S(pr.width), h: S(pr.height), src: `shot:${shotN++}`, fit: 'fill', radius: 0 });
    } else elements.push(...boxOf(pg, pcs, pr)); // the page's own photo / gradient
    for (const c of pg.children) await walk(c);
    pages.push({ n: Number(pg.dataset.page), role: pg.dataset.role || '', w: S(pr.width), h: S(pr.height), bg: { color: pageBg.a > 0 ? pageBg.hex : '#ffffff', image: '' }, elements });
  }
  // pictures: PNG / JPEG data URLs only (the upload accepts those), each source once
  const done = new Map();
  for (const e of pending) {
    if (e.src.startsWith('shot:')) continue; // captured by the server after this
    if (!done.has(e.src)) done.set(e.src, /^data:image\/(png|jpeg)/.test(e.src) && e.src.length < 4.2e6 ? Promise.resolve(e.src) : reencode(e.src, 2400).catch(() => ''));
    e.src = await done.get(e.src);
  }
  for (const p of pages) p.elements = p.elements.filter((e) => e.type !== 'image' || e.src);
  return { pages, fonts: [...fonts], images: [...new Set(pending.map((e) => e.src).filter((s) => s && !s.startsWith('shot:')))] };
}
/** "Manrope|600|0" → the importer's font name "Manrope-SemiBold". */
export const fontName = (key) => { const [fam, w, it] = key.split('|'); return { name: `${fam.replace(/\s+/g, '')}-${WEIGHT_NAME[w] || 'Regular'}${it === '1' ? 'Italic' : ''}`, bold: Number(w) >= 700, italic: it === '1', weight: Number(w) }; };
/** Swaps font keys and picture data URLs for codes and uploads (maps from the caller). */
export function finish({ pages }, fontCodes, srcs) {
  const code = (k) => fontCodes[k] || (Number(k?.split('|')[1]) >= 600 ? 'IS' : Number(k?.split('|')[1]) >= 500 ? 'IM' : 'IR');
  return {
    pages: pages.map((p) => ({
      ...(p.role ? { id: `${p.role}-${Math.random().toString(36).slice(2, 8)}` } : {}), w: p.w, h: p.h, bg: p.bg,
      elements: p.elements.map((e) => (e.type === 'text' ? { ...e, font: code(e.font), ...(e.hlf ? { hlf: code(e.hlf) } : {}) } : e.type === 'pricing' ? { ...e, font: code(e.font), fontm: code(e.fontm), fontb: code(e.fontb) } : e.type === 'image' ? { ...e, src: srcs[e.src] || '' } : e)).filter((e) => e.type !== 'image' || e.src),
    })),
  };
}
