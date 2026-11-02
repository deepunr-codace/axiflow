import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Shared brand bits for the brochure and proposal PDFs: Poppins fonts, colours taken
 * from the agency's own design files, and the illustration assets cropped from them.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSETS = path.join(ROOT, 'assets');
const FONTS = path.join(ASSETS, 'fonts');

export const BLUE = '#2d4bd8';
export const GREEN = '#00bf63';
export const INK = '#141413';
export const GREY = '#4b4f5c';
export const RULE = '#d7dcf3';
export const TINT = '#eaecf8';
export const FOOT_L = '#5271ff';
export const FOOT_R = '#758cc2';

export function registerFonts(doc) {
  const have = (f) => fs.existsSync(path.join(FONTS, f));
  const map = { PB: 'Poppins-Bold.ttf', PS: 'Poppins-SemiBold.ttf', PM: 'Poppins-Medium.ttf', PR: 'Poppins-Regular.ttf' };
  const fb = { PB: 'Helvetica-Bold', PS: 'Helvetica-Bold', PM: 'Helvetica', PR: 'Helvetica' };
  for (const [k, f] of Object.entries(map)) {
    if (have(f)) doc.registerFont(k, path.join(FONTS, f));
    else doc.registerFont(k, fb[k]);
  }
}

export const asset = (name) => {
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const p = path.join(ASSETS, 'brochure', `${name}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
};
export const assetPath = (rel) => (fs.existsSync(path.join(ASSETS, rel)) ? path.join(ASSETS, rel) : null);

/** Agency wordmark: 8-point asterisk + name, drawn in vector so it works on any background. */
export function wordmark(doc, x, y, name, { size = 18, color = '#ffffff' } = {}) {
  const r = size * 0.55;
  const cx = x + r, cy = y + r;
  doc.save().lineWidth(size * 0.13).lineCap('round').strokeColor(color);
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 4) * i;
    doc.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r).lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r).stroke();
  }
  doc.restore();
  doc.font('PM').fontSize(size).fillColor(color).text(name, cx + r + size * 0.45, cy - size * 0.68, { lineBreak: false });
}

export function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** Poppins covers Latin + rupee; strip anything else (emoji, CJK) that would render as boxes. */
export const clean = (s) => String(s ?? '').replace(/[^\u0000-ɏ₹–—‘’“”…•]/g, '').replace(/[ \t]+/g, ' ').trim();

export const poss = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
