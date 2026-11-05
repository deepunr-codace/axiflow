import { registerSchema, run, get } from './db.js';
import { saveUpload } from './storage.js';

/*
 * Stock photos for brochures (owner, 2026-11-05: images that fit each vertical; Pexels + Unsplash, free licences).
 * Before a brochure job is sent, AxiFlow searches with queries from the vertical playbook and the business, and adds
 * the results to the image catalogue Claude picks from (ids "px-…" / "us-…", src "stock:<id>"). Only the photos
 * Claude chooses are downloaded (about 1600 px wide), saved to our storage and recorded with their photographer,
 * so the editor and PDF always have the file and there is a licence record.
 * Keys: PEXELS_API_KEY, UNSPLASH_ACCESS_KEY (Integrations → Keys). Without keys nothing changes.
 */
registerSchema(`
CREATE TABLE IF NOT EXISTS stock_images (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  src TEXT NOT NULL,
  photographer TEXT,
  photographer_url TEXT,
  page_url TEXT,
  query TEXT,
  doc_id INTEGER,
  created_at TEXT NOT NULL
);`);

export const stockReady = () => !!(process.env.PEXELS_API_KEY || process.env.UNSPLASH_ACCESS_KEY);
const orient = (w, h) => (w / h > 1.25 ? 'landscape' : h / w > 1.25 ? 'portrait' : 'square');
const T = (ms) => AbortSignal.timeout(ms);

async function pexels(query, per) {
  const r = await fetch(`${process.env.PEXELS_API_URL || 'https://api.pexels.com'}/v1/search?query=${encodeURIComponent(query)}&per_page=${per}`, { headers: { authorization: process.env.PEXELS_API_KEY }, signal: T(10000) });
  if (!r.ok) throw new Error(`Pexels answered ${r.status}`);
  return ((await r.json()).photos || []).map((p) => ({
    id: `px-${p.id}`, source: 'pexels', w: p.width, h: p.height, alt: p.alt || query,
    url: `${p.src.original}?auto=compress&cs=tinysrgb&w=1600`, photographer: p.photographer, photographer_url: p.photographer_url, page_url: p.url, query,
  }));
}
async function unsplash(query, per) {
  const r = await fetch(`${process.env.UNSPLASH_API_URL || 'https://api.unsplash.com'}/search/photos?query=${encodeURIComponent(query)}&per_page=${per}&content_filter=high`, { headers: { authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, 'accept-version': 'v1' }, signal: T(10000) });
  if (!r.ok) throw new Error(`Unsplash answered ${r.status}`);
  return ((await r.json()).results || []).map((p) => ({
    id: `us-${p.id}`, source: 'unsplash', w: p.width, h: p.height, alt: p.alt_description || p.description || query,
    url: `${p.urls.raw}&w=1600&q=72&fm=jpg&fit=max`, photographer: p.user?.name, photographer_url: p.user?.links?.html, page_url: p.links?.html, download: p.links?.download_location, query,
  }));
}

/**
 * Candidates for a brochure: per query a few results from each configured source, deduplicated.
 * Returns { assets: catalogue entries for the job, map: id → download info (kept in the job context) }.
 */
export async function stockCandidates(queries, { perQuery = 4 } = {}) {
  if (!stockReady()) return { assets: [], map: {}, errors: [] };
  const errors = [];
  const tasks = [];
  for (const q of [...new Set(queries.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 8)) {
    if (process.env.PEXELS_API_KEY) tasks.push(pexels(q, perQuery).catch((e) => { errors.push(e.message); return []; }));
    if (process.env.UNSPLASH_ACCESS_KEY) tasks.push(unsplash(q, Math.max(2, perQuery - 1)).catch((e) => { errors.push(e.message); return []; }));
  }
  const map = {};
  for (const list of await Promise.all(tasks)) for (const p of list) if (!map[p.id]) map[p.id] = p;
  const assets = Object.values(map).slice(0, 40).map((p) => ({
    id: p.id, kind: 'photo', orientation: orient(p.w, p.h), src: `stock:${p.id}`,
    description: `${String(p.alt).slice(0, 140)} (stock photo, ${p.source}; search "${p.query}")`,
  }));
  return { assets, map: Object.fromEntries(assets.map((a) => [a.id, map[a.id]])), errors: [...new Set(errors)] };
}

/** Downloads a chosen photo once and returns its "upload:" source (reused when the same photo comes again). */
export async function saveStock(c, docId) {
  const have = await get(`SELECT src FROM stock_images WHERE id = :id`, { id: c.id }).catch(() => null);
  if (have) return have.src;
  const r = await fetch(c.url, { signal: T(20000) });
  if (!r.ok) throw new Error(`${c.source} image ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const key = `stock/${c.id}.jpg`;
  await saveUpload(key, buf, 'image/jpeg');
  if (c.download && process.env.UNSPLASH_ACCESS_KEY) fetch(c.download, { headers: { authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }, signal: T(8000) }).catch(() => {}); // Unsplash API rule: report the download
  const src = `upload:${key}`;
  await run(`INSERT INTO stock_images (id, source, src, photographer, photographer_url, page_url, query, doc_id, created_at) VALUES (:id, :source, :src, :ph, :phu, :page, :q, :doc, :now) ON CONFLICT (id) DO NOTHING`,
    { id: c.id, source: c.source, src, ph: c.photographer || null, phu: c.photographer_url || null, page: c.page_url || null, q: c.query || null, doc: docId ?? null, now: new Date().toISOString() });
  return src;
}

/**
 * Replaces every "stock:<id>" source inside a value (BrochureData, a design) with the saved file.
 * A photo that cannot be downloaded is dropped (the layout then leaves the frame out or uses its fallback).
 */
export async function materializeStock(value, map, docId) {
  const ids = new Set();
  JSON.stringify(value, (_k, v) => { if (typeof v === 'string' && v.startsWith('stock:')) ids.add(v.slice(6)); return v; });
  if (!ids.size) return value;
  const saved = {};
  await Promise.all([...ids].map(async (id) => { try { if (map?.[id]) saved[id] = await saveStock(map[id], docId); } catch { /* dropped below */ } }));
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== DROP);
    if (v && typeof v === 'object') {
      if (typeof v.src === 'string' && v.src.startsWith('stock:') && !saved[v.src.slice(6)]) return DROP;
      const o = {};
      for (const [k, x] of Object.entries(v)) { const w = walk(x); if (w !== DROP) o[k] = w; }
      return o;
    }
    if (typeof v === 'string' && v.startsWith('stock:')) return saved[v.slice(6)] || '';
    return v;
  };
  return walk(value);
}
const DROP = Symbol('drop');

/** Live test of the photo keys. */
export async function testStock() {
  const out = [];
  if (process.env.PEXELS_API_KEY) out.push(await pexels('spa', 1).then((r) => `Pexels OK (${r.length} result)`).catch((e) => e.message));
  if (process.env.UNSPLASH_ACCESS_KEY) out.push(await unsplash('spa', 1).then((r) => `Unsplash OK (${r.length} result)`).catch((e) => e.message));
  return { ok: out.length > 0 && out.every((x) => /OK/.test(x)), detail: out.join(' · ') || 'No photo keys set' };
}
