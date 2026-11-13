/**
 * Vector icons shared by the editor (SVG) and the PDF renderer (pdfkit).
 * Drawn in a 24×24 box. `mode` = how the primitives are painted with the element colour.
 */
export const ICONS = {
  asterisk: { mode: 'stroke', sw: 2.6, prims: [{ t: 'path', d: 'M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7' }] },
  'arrow-circle': { mode: 'stroke', sw: 1, prims: [{ t: 'circle', cx: 12, cy: 12, r: 11.3 }, { t: 'path', d: 'M7.2 12h9.6M13 8.2l3.8 3.8-3.8 3.8' }] },
  'arrow-up-left': { mode: 'stroke', sw: 1.6, prims: [{ t: 'path', d: 'M19 19L5 5M5 15V5h10' }] },
  star4: { mode: 'fill', prims: [{ t: 'path', d: 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z' }] },
  phone: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2' }] },
  mail: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M4 6h16v12H4zM4 7l8 6 8-6' }] },
  web: { mode: 'stroke', sw: 1.6, prims: [{ t: 'circle', cx: 12, cy: 12, r: 9 }, { t: 'path', d: 'M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18' }] },
  pin: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z' }, { t: 'circle', cx: 12, cy: 10, r: 2.2 }] },
  check: { mode: 'stroke', sw: 2.2, prims: [{ t: 'path', d: 'M4.5 12.5l5 5 10-11' }] },
  // Editorial deck asterisk (thinner than "asterisk"; lines span 2.5–21.5 of the 24 box).
  spark: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7' }] },
  'check-bold': { mode: 'stroke', sw: 2.6, prims: [{ t: 'path', d: 'M5 12.5l4.5 4.5L19 7.5' }] },
  // Growth Deck services-list arrow (drawn in a 40×20 box; the element's w/h stretch the 24×24 grid).
  'arrow-bar': { mode: 'fill', prims: [{ t: 'path', d: 'M0 8.4h15.6V0l8.4 12-8.4 12v-8.4H0z' }] },
  // Codeace Growth (2026-11-10): service and badge icons, same 1.8 stroke as phone / mail / pin
  chat: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 11h.01M12 11h.01M16 11h.01' }] },
  search: { mode: 'stroke', sw: 1.8, prims: [{ t: 'circle', cx: 10.5, cy: 10.5, r: 6.5 }, { t: 'path', d: 'M15.3 15.3L20.5 20.5' }] },
  dashboard: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z' }] },
  like: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M7 11v9H4v-9zM7 11l4-7c1.7 0 2.6 1.1 2.3 2.8L12.8 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7' }] },
  users: { mode: 'stroke', sw: 1.8, prims: [{ t: 'circle', cx: 9, cy: 8, r: 3.5 }, { t: 'path', d: 'M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .7 3.2 2.5 3.5 5.2' }] },
  shield: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6zM8.5 12l2.5 2.5 4.5-5' }] },
  cart: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M3 4h2.5l2.2 11h10.6l2-8H6.6' }, { t: 'circle', cx: 9, cy: 19.5, r: 1.4 }, { t: 'circle', cx: 17, cy: 19.5, r: 1.4 }] },
  calendar: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4' }] },
  bolt: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M13 2.5L5 13.5h6l-1 8 8-11h-6z' }] },
  growth: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M3 17l6-6 4 4 8-8M15 7h6v6' }] },
  play: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M7 4.5l12 7.5-12 7.5z' }] },
  code: { mode: 'stroke', sw: 1.8, prims: [{ t: 'path', d: 'M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15' }] },
};
