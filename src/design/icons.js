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
};
