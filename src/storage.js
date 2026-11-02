import fs from 'node:fs';
import path from 'node:path';

/*
 * Uploaded files (editor images, imported template pages, cover photos). Designs refer to them as
 * "upload:<key>"; readUpload() returns the bytes for the PDF renderer and the /api/design/file route.
 * Where they live, in order of preference:
 *  1. Supabase Storage (SUPABASE_URL + SUPABASE_SECRET_KEY): private bucket SUPABASE_BUCKET (default
 *     "axiflow-uploads"), created on first use. Only the server reads it, with the secret key.
 *  2. Vercel Blob (BLOB_READ_WRITE_TOKEN), under "uploads/<key>" (the previous setup).
 *  3. Locally: DATA_DIR/uploads/<key>.
 */
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const UPLOADS = path.join(DATA_DIR, 'uploads');

const SB_URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SB_BUCKET = () => process.env.SUPABASE_BUCKET || 'axiflow-uploads';
export const usingSupabase = () => !!(SB_URL() && SB_KEY());
export const usingBlob = () => !usingSupabase() && !!process.env.BLOB_READ_WRITE_TOKEN;
export const storageName = () => (usingSupabase() ? 'Supabase Storage' : usingBlob() ? 'Vercel Blob' : 'local folder');

const safeKey = (key) => {
  const k = String(key || '').replace(/\\/g, '/');
  if (!/^[\w./-]+$/.test(k) || k.includes('..') || k.startsWith('/')) throw new Error('Bad file name');
  return k;
};

// ------------------------------------------------------------ Supabase Storage (REST)
const sbHeaders = (extra = {}) => ({ apikey: SB_KEY(), authorization: `Bearer ${SB_KEY()}`, ...extra });
let bucketReady = null;
/** Creates the private bucket once per process if it does not exist yet. */
function ensureBucket() {
  if (!bucketReady) bucketReady = (async () => {
    const r = await fetch(`${SB_URL()}/storage/v1/bucket/${SB_BUCKET()}`, { headers: sbHeaders() });
    if (r.ok) return;
    const c = await fetch(`${SB_URL()}/storage/v1/bucket`, {
      method: 'POST', headers: sbHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ id: SB_BUCKET(), name: SB_BUCKET(), public: false, file_size_limit: 15 * 1024 * 1024 }),
    });
    if (!c.ok && c.status !== 409) throw new Error(`Supabase Storage: could not create bucket (${c.status} ${(await c.text()).slice(0, 160)})`);
  })().catch((e) => { bucketReady = null; throw e; });
  return bucketReady;
}
const objectUrl = (k) => `${SB_URL()}/storage/v1/object/${SB_BUCKET()}/${k.split('/').map(encodeURIComponent).join('/')}`;

async function sbPut(k, buf, contentType) {
  await ensureBucket();
  const r = await fetch(objectUrl(k), { method: 'POST', headers: sbHeaders({ 'content-type': contentType || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }), body: buf });
  if (!r.ok) throw new Error(`Supabase Storage upload failed (${r.status} ${(await r.text()).slice(0, 160)})`);
}
async function sbGet(k) {
  const r = await fetch(objectUrl(k), { headers: sbHeaders() });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

// ------------------------------------------------------------ Vercel Blob (previous setup)
let blobApi = null;
const blob = async () => (blobApi ||= await import('@vercel/blob'));
async function blobGet(k) {
  try {
    const { head } = await blob();
    const meta = await head(`uploads/${k}`);
    const r = await fetch(meta.url);
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch { return null; }
}

// ------------------------------------------------------------ public API
export async function saveUpload(key, buf, contentType) {
  const k = safeKey(key);
  if (usingSupabase()) await sbPut(k, buf, contentType);
  else if (usingBlob()) {
    const { put } = await blob();
    await put(`uploads/${k}`, buf, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true });
  } else {
    const file = path.join(UPLOADS, k);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
  }
  remember(k, buf);
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
  let buf = null;
  if (usingSupabase()) {
    buf = await sbGet(k).catch(() => null);
    // files saved before the switch are still in Blob: read them from there
    if (!buf && process.env.BLOB_READ_WRITE_TOKEN) buf = await blobGet(k);
  } else if (usingBlob()) buf = await blobGet(k);
  else {
    const file = path.join(UPLOADS, k);
    if (path.resolve(file).startsWith(path.resolve(UPLOADS) + path.sep) && fs.existsSync(file)) buf = fs.readFileSync(file);
  }
  return buf ? remember(k, buf) : null;
}
