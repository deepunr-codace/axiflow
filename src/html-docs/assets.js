import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fonts and images of the HTML templates (assets/html-docs), inlined as data URIs so Chromium fetches nothing. */
export const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'html-docs');
const MIME = { woff2: 'font/woff2', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
const cache = new Map();
export function dataUri(rel) {
  if (!cache.has(rel)) {
    const buf = fs.readFileSync(path.join(DIR, rel));
    cache.set(rel, `data:${MIME[rel.split('.').pop()] || 'application/octet-stream'};base64,${buf.toString('base64')}`);
  }
  return cache.get(rel);
}
export const img = (name) => dataUri(`img/${name}`);
/** A generated @font-face file with {{font:file}} placeholders → CSS with the fonts inlined. */
export function fontCss(file) {
  const key = `css:${file}`;
  if (!cache.has(key)) cache.set(key, fs.readFileSync(path.join(DIR, 'fonts', file), 'utf8').replace(/\{\{font:([\w.-]+)\}\}/g, (_, f) => dataUri(`fonts/${f}`)));
  return cache.get(key);
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Text with line breaks kept (\n → <br>). */
export const br = (s) => esc(s).replace(/\n/g, '<br>');
