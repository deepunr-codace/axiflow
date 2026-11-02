import fs from 'node:fs';
import path from 'node:path';

/*
 * Uploaded files (editor images, imported template pages, cover photos).
 *  - On Vercel (BLOB_READ_WRITE_TOKEN set): Vercel Blob, under "uploads/<key>".
 *  - Locally: DATA_DIR/uploads/<key>.
 * Designs refer to them as "upload:<key>"; readUpload() returns the bytes for the PDF renderer and
 * the /api/design/file route.
 */
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const UPLOADS = path.join(DATA_DIR, 'uploads');
export const usingBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const safeKey = (key) => {
  const k = String(key || '').replace(/\\/g, '/');
  if (!/^[\w./-]+$/.test(k) || k.includes('..') || k.startsWith('/')) throw new Error('Bad file name');
  return k;
};

let blobApi = null;
const blob = async () => (blobApi ||= await import('@vercel/blob'));

export async function saveUpload(key, buf, contentType) {
  const k = safeKey(key);
  if (usingBlob()) {
    const { put } = await blob();
    await put(`uploads/${k}`, buf, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true });
  } else {
    const file = path.join(UPLOADS, k);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
  }
  cache.set(k, buf);
  return k;
}

// Small in-memory cache: the same images are drawn again and again (every PDF of a template).
const cache = new Map();
const CACHE_MAX = 40;
function remember(k, buf) {
  cache.set(k, buf);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return buf;
}

export async function readUpload(key) {
  let k;
  try { k = safeKey(key); } catch { return null; }
  if (cache.has(k)) return cache.get(k);
  if (usingBlob()) {
    try {
      const { head } = await blob();
      const meta = await head(`uploads/${k}`);
      const r = await fetch(meta.url);
      if (!r.ok) return null;
      return remember(k, Buffer.from(await r.arrayBuffer()));
    } catch { return null; }
  }
  const file = path.join(UPLOADS, k);
  if (!path.resolve(file).startsWith(path.resolve(UPLOADS) + path.sep) || !fs.existsSync(file)) return null;
  return remember(k, fs.readFileSync(file));
}
