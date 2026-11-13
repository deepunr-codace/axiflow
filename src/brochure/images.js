import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { addColumns, get, update } from '../db.js';

/*
 * The client's own pictures for the brochure (brochure fix guide 2026-11-13, sections 6.1 and 8: every brochure shipped
 * with dark gradients where the photos go). collectImages() reads the home page and two or three category pages of the
 * client's website, keeps the logo, one or two hero / brand images and up to 10 product photos, downloads them into
 * AxiFlow's storage (so the PDF never depends on the client's server) and describes each one. The list is stored on the
 * lead (leads.images_json) and reused for 30 days while the website stays the same.
 */
addColumns('leads', { images_json: 'TEXT', images_at: 'TEXT' });

// --- fetching with the same SSRF guard as the website check (src/pipeline/enrich.js): never internal addresses
function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function assertPublic(url) {
  const { hostname, protocol } = new URL(url);
  if (!/^https?:$/.test(protocol)) throw new Error('only http(s)');
  const addrs = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('private address');
}
const UA = 'Mozilla/5.0 (compatible; CodeaceAudit/1.0)';
async function safeGet(url, { hops = 0, timeout = 12000 } = {}) {
  await assertPublic(url);
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': UA } });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && hops < 5) return safeGet(new URL(res.headers.get('location'), url).toString(), { hops: hops + 1, timeout });
  return { res, url };
}

// --- image size from the file header (JPEG, PNG, WebP), no dependencies
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'png' };
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const f = buf.toString('ascii', 12, 16);
    if (f === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, type: 'webp' };
    if (f === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, type: 'webp' }; }
    if (f === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), type: 'webp' };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), type: 'jpg' };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// --- finding candidates in the pages
const SKIP = /\.svg(\?|$)|\.gif(\?|$)|sprite|icon|favicon|payment|visa|mastercard|paypal|razorpay|\bupi\b|gpay|phonepe|paytm|badge|loader|spinner|placeholder|blank\.|pixel|avatar|emoji|flag/i;
const AI_NAME = /gemini|dall[-_ ]?e|midjourney|chatgpt|openai|firefly|leonardo|stable[-_]?diffusion|ai[-_]generated|ideogram/i;
/** The original file of a resized copy: WordPress "-300x300" and Shopify "_600x" / width= parameters removed. */
export function originalUrl(u) {
  try {
    const x = new URL(u);
    x.pathname = x.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp)$)/i, '');
    if (/shopify|myshopify|\/cdn\/shop\//.test(x.host + x.pathname)) {
      x.pathname = x.pathname.replace(/_(\d{2,4}x\d{0,4}|\d{0,4}x\d{2,4}|small|medium|large|grande|compact|thumb|pico|icon)(@\dx)?(?=\.(jpe?g|png|webp)$)/i, '');
      for (const k of ['width', 'height', 'crop']) x.searchParams.delete(k);
    }
    return x.toString();
  } catch { return u; }
}
const largestSrc = (srcset) => String(srcset || '').split(',').map((s) => s.trim().split(/\s+/)).filter((p) => p[0])
  .map(([url, d]) => ({ url, w: parseFloat(d) || 0 })).sort((a, b) => b.w - a.w)[0]?.url || '';
function candidates(html, pageUrl, pageKind) {
  const $ = cheerio.load(html);
  const abs = (u) => { try { return new URL(String(u).trim().replace(/^\/\//, 'https://'), pageUrl).toString(); } catch { return null; } };
  const out = [];
  if (pageKind === 'home') {
    const og = $('meta[property="og:image"], meta[name="og:image"]').attr('content');
    if (og) out.push({ url: abs(og), kind: 'hero', alt: $('meta[property="og:title"]').attr('content') || '', page: pageUrl });
  }
  $('img, source').each((_, el) => {
    const e = $(el);
    const src = largestSrc(e.attr('srcset') || e.attr('data-srcset')) || e.attr('data-src') || e.attr('data-lazy-src') || e.attr('data-original') || e.attr('src') || '';
    const url = src && !src.startsWith('data:') ? abs(src) : null;
    if (!url) return;
    const alt = e.attr('alt') || e.closest('picture').find('img').attr('alt') || '';
    const cls = `${e.attr('class') || ''} ${e.attr('id') || ''} ${e.parent().attr('class') || ''}`;
    const inHeader = e.closest('header, .header, #header, .site-header, nav').length > 0;
    const logo = /logo/i.test(`${url} ${alt} ${cls}`) || (inHeader && pageKind === 'home' && !out.some((c) => c.kind === 'logo'));
    const product = e.closest('.product, .products, li.product, .product-card, .card--product, .grid__item, .product-item, .collection, [class*="product"]').length > 0;
    out.push({ url, kind: logo ? 'logo' : product ? 'product' : 'photo', alt, page: pageUrl });
  });
  return out;
}
function categoryLinks(html, base) {
  const $ = cheerio.load(html);
  const host = new URL(base).host;
  const seen = new Set();
  const out = [];
  $('a[href]').each((_, a) => {
    let u;
    try { u = new URL($(a).attr('href'), base); } catch { return; }
    if (u.host !== host) return;
    const path = u.pathname.toLowerCase();
    if (!/\/(collections?|product-category|category|categories|shop|catalog|products?)\/[^/]+/.test(path) || /\/products?\/[^/]+\/?$/.test(path) && !/collections/.test(path)) return;
    const key = u.origin + u.pathname;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out.slice(0, 3);
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k).catch(() => null); } }));
  return out;
}
async function download(url) {
  const { res } = await safeGet(url, { timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > 12e6) throw new Error('too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 12e6) throw new Error('too large');
  const size = imageSize(buf);
  if (!size) throw new Error('not a JPEG, PNG or WebP picture');
  return { buf, ...size };
}

/**
 * The client's pictures: [{ id: 'I1', kind: logo|hero|product|photo, w, h, orientation, alt, name, page, ai, src }]
 * (src = "upload:brochure-img/<lead>/<hash>.<ext>"). Photos under 600 px on the short side, icons, payment logos,
 * SVG and duplicates are left out. Errors give an empty list (a brochure without pictures, as before).
 */
export async function collectImages(website, { leadId = 0, max = 14 } = {}) {
  const site = String(website || '').trim();
  if (!site) return [];
  const homeUrl = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  let home;
  try {
    const r = await safeGet(homeUrl);
    if (!r.res.ok) return [];
    home = { url: r.url, html: await r.res.text() };
  } catch { return []; }
  const pages = [{ url: home.url, html: home.html, kind: 'home' }];
  const cats = await pool(categoryLinks(home.html, home.url), 3, async (u) => { const r = await safeGet(u); return r.res.ok ? { url: r.url, html: await r.res.text(), kind: 'category' } : null; });
  pages.push(...cats.filter(Boolean));
  const seen = new Set();
  const list = [];
  for (const p of pages) {
    for (const c of candidates(p.html, p.url, p.kind)) {
      const url = originalUrl(c.url);
      const key = url.replace(/[?#].*$/, '');
      if (seen.has(key) || (SKIP.test(key) && c.kind !== 'logo')) continue;
      seen.add(key);
      list.push({ ...c, url, fallback: c.url !== url ? c.url : null });
    }
  }
  // the logo first, then hero, then products (in page order), then other photos; at most ~30 downloads
  const order = { logo: 0, hero: 1, product: 2, photo: 3 };
  const picked = list.filter((c, i) => c.kind !== 'logo' || list.findIndex((x) => x.kind === 'logo') === i).sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 30);
  const got = await pool(picked, 4, async (c) => {
    let d, used = c.url;
    try { d = await download(c.url); } catch (e) { if (!c.fallback) throw e; d = await download(c.fallback); used = c.fallback; }
    // a huge original (found on Thread Stories: 4536 × 8064 camera files) would make the PDF several MB per photo:
    // the page's own resized copy is used instead when it is still large enough
    if (Math.max(d.w, d.h) > 2400 && c.fallback && c.fallback !== used) {
      const small = await download(c.fallback).catch(() => null);
      if (small && Math.min(small.w, small.h) >= 600) { d = small; used = c.fallback; }
    }
    return { ...c, ...d, url: used };
  });
  const hashes = new Set();
  const keep = [];
  const counts = { logo: 0, hero: 0, product: 0, photo: 0 };
  const limit = { logo: 1, hero: 2, product: 10, photo: 3 };
  const { saveUpload } = await import('../storage.js');
  for (const g of got) {
    if (!g) continue;
    const short = Math.min(g.w, g.h);
    if (g.kind === 'logo' ? short < 40 : short < 600) continue;
    const kind = g.kind === 'photo' && !counts.hero && Math.max(g.w, g.h) >= 1000 ? 'hero' : g.kind; // the first large photo is the brand image
    if (counts[kind] >= limit[kind] || keep.length >= max) continue;
    const hash = crypto.createHash('sha1').update(g.buf).digest('hex').slice(0, 16);
    if (hashes.has(hash)) continue;
    hashes.add(hash);
    const key = `brochure-img/${Number(leadId) || 0}/${hash}.${g.type}`;
    try { await saveUpload(key, g.buf, g.type === 'png' ? 'image/png' : g.type === 'webp' ? 'image/webp' : 'image/jpeg'); } catch { continue; }
    counts[kind]++;
    const name = decodeURIComponent(new URL(g.url).pathname.split('/').pop() || '');
    keep.push({ kind, w: g.w, h: g.h, orientation: g.w > g.h * 1.15 ? 'landscape' : g.h > g.w * 1.15 ? 'portrait' : 'square', alt: String(g.alt || '').trim().slice(0, 140), name: name.slice(0, 100), page: g.page, ai: AI_NAME.test(name), src: `upload:${key}`,
      url: g.url }); // the client's own copy: the GitHub runner loads it for the designed brochure's visual review
  }
  return keep.map((x, i) => ({ id: `I${i + 1}`, ...x }));
}

/** The lead's pictures: stored ones when fresh (30 days, same website), else collected now and stored. */
export async function leadImages(leadId, website) {
  const site = String(website || '').trim();
  if (!site) return [];
  const row = leadId ? await get(`SELECT images_json, images_at FROM leads WHERE id = :id`, { id: leadId }).catch(() => null) : null;
  let stored = null;
  try { stored = row?.images_json ? JSON.parse(row.images_json) : null; } catch { stored = null; }
  if (stored?.website === site && row.images_at && Date.now() - new Date(row.images_at).getTime() < 30 * 86400000) return stored.images || [];
  const images = await collectImages(site, { leadId });
  if (leadId) await update('leads', leadId, { images_json: { website: site, images }, images_at: new Date().toISOString() }).catch(() => {});
  return images;
}

/**
 * Photos for the four areas of the CodeAce Growth Brochure (cover and closing: wide; challenge card and idea picture:
 * tall), real photos before AI-named ones, each picture used once. Returns { photos: { cover, challenge, ideas, cta },
 * alt: { … } } with upload: keys; areas without a fitting picture are left out (they keep the dark gradient).
 */
export function pickPhotos(images) {
  const pool = (images || []).filter((x) => x.kind !== 'logo').sort((a, b) => (a.ai - b.ai) || (b.w * b.h - a.w * a.h));
  const used = new Set();
  // the cover prefers the brand image; the other areas prefer product photos (found on Thread Stories: the site's
  // share image was a crystal tree, a poor picture for the challenge card of a saree store)
  const take = (pref, kinds) => {
    const score = (x) => (pref.includes(x.orientation) ? 0 : 1) * 10 + Math.max(0, kinds.indexOf(x.kind) < 0 ? kinds.length : kinds.indexOf(x.kind));
    const x = pool.filter((y) => !used.has(y.id)).sort((a, b) => score(a) - score(b))[0];
    if (x) used.add(x.id);
    return x || null;
  };
  const slots = {
    cover: take(['landscape', 'square'], ['hero', 'product', 'photo']),
    challenge: take(['portrait', 'square'], ['product', 'photo', 'hero']),
    ideas: take(['portrait', 'square'], ['product', 'photo', 'hero']),
    cta: take(['landscape', 'square'], ['product', 'hero', 'photo']),
  };
  const photos = {}, alt = {};
  for (const [k, x] of Object.entries(slots)) if (x) { photos[k] = x.src; alt[k] = x.alt || ''; }
  return { photos, alt };
}
