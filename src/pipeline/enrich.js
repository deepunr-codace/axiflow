import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { addColumns, update } from '../db.js';

// Stage 1 of the SWOT guide: the verified facts of a lead (collectFacts below)
addColumns('leads', { facts_json: 'TEXT', facts_at: 'TEXT', site_fingerprint: 'TEXT' });

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Blocks SSRF: website URLs come from public forms, so never fetch internal addresses. */
async function assertPublicHost(url) {
  const { hostname, protocol } = new URL(url);
  if (!/^https?:$/.test(protocol)) throw new Error('Only http(s) URLs are audited');
  const addrs = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Refusing to audit a private/internal address');
}

async function safeFetch(url, hops = 0, method = 'GET') {
  await assertPublicHost(url);
  const res = await fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; CodeaceAudit/1.0)' },
  });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && hops < 5) {
    return safeFetch(new URL(res.headers.get('location'), url).toString(), hops + 1, method);
  }
  return { res, finalUrl: url };
}

/*
 * Contact details on the website (found live 2026-11-13: Thread Stories' SWOT and brochure said "no phone or email on
 * the contact page", while threadstories.in/contact-us/ lists both; the check read only the home page, which has
 * neither, and said "no WhatsApp button / no contact form", which Claude turned into a site-wide claim). The home page
 * and the contact page are both read now, and what they list is passed on as checked facts.
 */
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const BAD_MAIL = /\.(png|jpe?g|gif|webp|svg)$|@(sentry|example|domain|email)\.|wixpress|sentry\.io/i;
/** Phone numbers, one per number however it is written (+91 99301 06755 = +919930106755). */
const uniquePhones = (list) => { const seen = new Set(); return list.filter((p) => { const k = String(p).replace(/\D/g, '').slice(-10); if (seen.has(k)) return false; seen.add(k); return true; }); };
export function contactDetails(html) {
  const text = strip(html);
  const phones = new Set(), emails = new Set();
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) phones.add(decodeURIComponent(m[1]).replace(/[^\d+]/g, ''));
  // numbers in the visible text only (page data holds long ids): +country numbers and Indian mobiles / landlines
  for (const m of text.matchAll(/(?:\+\d{1,3}[\s-]?)?(?:\(?0?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}/g)) {
    const raw = m[0].trim(), d = raw.replace(/\D/g, '');
    if (/^\+/.test(raw) ? d.length >= 10 && d.length <= 14 : /^(91)?[6-9]\d{9}$/.test(d) || /^0\d{9,10}$/.test(d)) phones.add(raw.replace(/\s+/g, ' '));
  }
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) emails.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi)) emails.add(m[0].toLowerCase());
  const uniqPhones = uniquePhones([...phones]);
  return {
    phones: uniqPhones.slice(0, 4),
    emails: [...emails].filter((e) => !BAD_MAIL.test(e)).slice(0, 4),
    whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp/i.test(html),
    form: /<form[\s>]/i.test(html) && /(name|email|message|phone)/i.test(html),
    social: socialLinks(html),
  };
}
/**
 * The business's own social pages linked on the site (SWOT guide 2026-11-13, input bugs: the CRM has only a LinkedIn
 * column, so Instagram / Facebook / YouTube / LinkedIn are read from the website). Share and tracking links are skipped.
 */
const SOCIAL = { instagram: /(^|\.)instagram\.com$/i, facebook: /(^|\.)(facebook\.com|fb\.com)$/i, youtube: /(^|\.)(youtube\.com|youtu\.be)$/i, linkedin: /(^|\.)linkedin\.com$/i };
export function socialLinks(html) {
  const out = {};
  for (const m of String(html).matchAll(/href=["']((?:https?:)?\/\/[^"'\s>]+)["']/gi)) {
    const u = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
    if (/sharer|[?&]share|\/share\b|\/tr\b|\/plugins\/|\/intent\/|\/dialog\/|\/embed\//i.test(u)) continue;
    let host = '';
    try { host = new URL(u).hostname; } catch { continue; }
    // the query is noise (tracking) except on Facebook's profile.php?id=…, where it is the page itself
    for (const [k, re] of Object.entries(SOCIAL)) if (!out[k] && re.test(host)) out[k] = /\/profile\.php/i.test(u) ? u.replace(/#.*$/, '').replace(/&amp;/g, '&') : u.replace(/[?#].*$/, '');
  }
  return out;
}
/** The site's contact page: a same-site link that says "contact", else the usual paths. */
function contactLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    if (!/contact|reach us|get in touch/i.test(`${m[1]} ${strip(m[2])}`)) continue;
    try { const u = new URL(m[1], base); if (u.hostname === new URL(base).hostname) out.push(u.toString()); } catch { /* skip */ }
  }
  for (const p of ['/contact', '/contact-us', '/pages/contact']) out.push(new URL(p, base).toString());
  return [...new Set(out)];
}
/** Told to every writer with the website check (SWOT, brochure, proposal). */
export const WEBSITE_CHECK_RULE = 'The website check is AxiFlow\'s own reading of the home page and the contact page. Never write that the business has no phone number, email, WhatsApp or contact form unless the website check says it was not found there; if your own browsing seems to disagree, the website check wins.';

/*
 * Stage 1 of the SWOT pipeline: Collect (owner's SWOT fix guide, 2026-11-13, section 5.1). Everything a script can read
 * from the CRM record and the website is collected by code: free, fast, repeatable and never hallucinated. Up to six
 * pages are read (home, contact, about, up to three category / service pages from the main menu) plus robots.txt and
 * the sitemap, at most three at once, with the SSRF guard, the 10-second timeout and the 5-redirect limit of safeFetch().
 * Each fact gets an id (V1, V2…), an area, a kind and its source:
 *   kind "seen"        something the code read on a page or in the CRM;
 *   kind "absent"      something the code looked for in named places and did not find (the text says where);
 *   kind "not_checked" a page that could not be read: never reported as missing.
 * A site that shows almost no text without a browser (script-rendered) gets a "facts limited" fact and no absences.
 */
const PAGE_LIMIT = 1_500_000;
const AI_IMAGE = /chatgpt|dall[-_ ]?e|midjourney|stable[-_]?diffusion|firefly|gemini[-_]generated|ai[-_]generated/i;
const STOCK_IMAGE = /shutterstock|istock|gettyimages|depositphotos|adobestock|freepik|pexels|unsplash|(^|[-_])stock([-_.]|$)/i;
const CARD = 'li.product, .type-product, .product-card, .product-item, .grid-product, .product-grid-item, .card-wrapper.product-card-wrapper';
const SKIP_MENU = /^(#|javascript:|mailto:|tel:)|\/(cart|basket|checkout|my-account|account|login|signin|register|wishlist|search)(\/|$|\?)/i;

async function getPage(url) {
  const t0 = Date.now();
  try {
    const { res, finalUrl } = await safeFetch(url);
    const html = (await res.text()).slice(0, PAGE_LIMIT);
    return { url, finalUrl, status: res.status, html, ms: Date.now() - t0, ok: res.status < 400 };
  } catch (e) {
    return { url, finalUrl: url, status: 0, html: '', ms: Date.now() - t0, ok: false, error: e.message };
  }
}
/** Runs fn over items with at most n at once (the guide: fetch at most three pages at once). */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const sameHost = (u, base) => { try { return new URL(u).hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, ''); } catch { return false; } };
const abs = (href, base) => { try { const u = new URL(href, base); u.hash = ''; return u.toString(); } catch { return null; } };
const pathOf = (u) => { try { return new URL(u).pathname; } catch { return u; } };
const rupees = (text) => [...String(text).matchAll(/(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d{1,2})?)/gi)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => n > 0);
const fmt = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const clip = (s, n = 90) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** What one HTML page shows, read with cheerio. */
function readPage(html, url) {
  const $ = cheerio.load(html);
  const text = (() => { const c = $('body').clone(); c.find('script, style, noscript, template, svg').remove(); return c.text().replace(/\s+/g, ' ').trim(); })();
  const types = new Set();
  $('script[type="application/ld+json"]').each((_, e) => {
    const walk = (v) => { if (!v || typeof v !== 'object') return; if (Array.isArray(v)) return v.forEach(walk); const t = v['@type']; (Array.isArray(t) ? t : t ? [t] : []).forEach((x) => types.add(String(x))); if (v['@graph']) walk(v['@graph']); };
    try { walk(JSON.parse($(e).text())); } catch { /* broken JSON-LD */ }
  });
  const images = $('img').toArray().map((e) => {
    const src = $(e).attr('src') || $(e).attr('data-src') || $(e).attr('data-lazy-src') || String($(e).attr('srcset') || '').split(' ')[0] || '';
    return { name: decodeURIComponent(src.split('?')[0].split('/').pop() || ''), alt: $(e).attr('alt'), src };
  }).filter((x) => x.name && !/^data:/.test(x.src));
  const links = $('a[href]').toArray().map((a) => ({ href: abs($(a).attr('href'), url), text: clip($(a).text(), 60), inFooter: $(a).closest('footer').length > 0 })).filter((l) => l.href);
  // the main menu: the nav with the most links, its first list's top-level items, in order
  let nav = null, most = 0;
  for (const n of $('header nav, nav, [role="navigation"]').toArray()) { const c = $(n).find('a').length; if (c > most) { most = c; nav = n; } }
  if (!nav) nav = $('header').first()[0] || null;
  const menu = [];
  if (nav) {
    const ul = $(nav).find('ul').first();
    const tops = ul.length ? ul.children('li').toArray().map((li) => ($(li).children('a').first().length ? $(li).children('a').first() : $(li).find('a').first())) : $(nav).find('a').toArray().map((a) => $(a));
    for (const a of tops) {
      const t = clip(a.text(), 40), h = abs(a.attr('href') || '', url);
      if (t && !menu.some((m) => m.text.toLowerCase() === t.toLowerCase())) menu.push({ text: t, href: h });
    }
  }
  // product cards, each under the nearest section heading before it in the page
  const cards = [];
  let section = '';
  $(`h1, h2, h3, ${CARD}`).each((_, e) => {
    const el = $(e);
    if (/^h[1-3]$/i.test(e.tagName)) { if (!el.closest(CARD).length) section = clip(el.text(), 60); return; }
    if (el.parents(CARD).length) return; // a card inside a card
    const name = clip(el.find('.woocommerce-loop-product__title, .product-title, .card__heading, h2, h3, a[title]').first().text() || el.find('a').first().attr('title') || el.find('a').first().text(), 70);
    const oos = /\b(outofstock|out-of-stock|sold-out|soldout)\b/i.test(el.attr('class') || '') || /out of stock|sold out/i.test(el.text());
    const key = `${section}|${name}`;
    if (name && !cards.some((c) => c.key === key)) cards.push({ key, name, oos, section, price: rupees(el.text())[0] || null });
  });
  return {
    $, text, title: clip($('title').first().text(), 120), description: clip($('meta[name="description"]').attr('content') || '', 200),
    h1: $('h1').toArray().map((e) => clip($(e).text(), 80)).filter(Boolean), og: $('meta[property^="og:"]').length > 0,
    viewport: $('meta[name="viewport"]').length > 0, generator: $('meta[name="generator"]').attr('content') || '',
    types: [...types], images, links, menu, cards, prices: rupees(text),
    contact: contactDetails(html),
    tracking: { gtm: [...new Set(html.match(/GTM-[A-Z0-9]{4,}/g) || [])], ga: [...new Set(html.match(/\bG-[A-Z0-9]{6,}\b|\bUA-\d{4,}-\d+\b/g) || [])], pixel: /fbq\(|connect\.facebook\.net\/[^"']*fbevents|facebook\.com\/tr\b/i.test(html) },
    platform: [/wp-content|wp-includes/i.test(html) && 'WordPress', /woocommerce/i.test(html) && 'WooCommerce', /cdn\.shopify\.com|Shopify\.theme/i.test(html) && 'Shopify', /static\.wixstatic\.com|wix\.com/i.test(html) && 'Wix', /squarespace/i.test(html) && 'Squarespace', /webflow/i.test(html) && 'Webflow', /elementor/i.test(html) && 'Elementor'].filter(Boolean),
    year: (() => { const m = html.match(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i); return m ? Number(m[1]) : null; })(),
  };
}

/** The sitemap: from robots.txt, else /sitemap.xml, else /sitemap_index.xml; an index's children are read too (max 5). */
async function readSitemap(base, robotsText) {
  const fromRobots = [...String(robotsText || '').matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const tried = [];
  for (const u of [...fromRobots, new URL('/sitemap.xml', base).toString(), new URL('/sitemap_index.xml', base).toString()]) {
    if (tried.includes(u)) continue;
    tried.push(u);
    const p = await getPage(u);
    if (!p.ok || !/<(urlset|sitemapindex)\b/i.test(p.html)) continue;
    const $ = cheerio.load(p.html, { xml: true });
    const kindOf = (name, loc) => (/product[-_]?cat|product-category|categor|collections/i.test(name) ? 'category' : /product/i.test(name) ? 'product' : /post|blog|article|news/i.test(name) ? 'blog' : /service/i.test(name) ? 'service'
      : /\/(product|products)\//i.test(loc) ? 'product' : /\/(product-category|category|collections)\//i.test(loc) ? 'category' : /\/(blog|blogs|news|article|articles)\//i.test(loc) || /\/20\d\d\/\d\d\//.test(loc) ? 'blog' : /\/services?\//i.test(loc) ? 'service' : 'page');
    const counts = {}, newest = {};
    const addLoc = (loc, lastmod, hint) => { const k = kindOf(hint || '', loc); counts[k] = (counts[k] || 0) + 1; if (lastmod && (!newest[k] || lastmod > newest[k])) newest[k] = lastmod; };
    let skipped = 0;
    if ($('sitemapindex').length) {
      const kids = $('sitemap').toArray().map((e) => ({ loc: $(e).find('loc').text().trim(), lastmod: $(e).find('lastmod').text().trim() })).filter((k) => k.loc);
      const order = (k) => (/product[-_]?sitemap|products/i.test(k.loc) ? 0 : /post|blog/i.test(k.loc) ? 1 : /cat|collection/i.test(k.loc) ? 2 : /page/i.test(k.loc) ? 3 : 4);
      const pick = [...kids].sort((a, b) => order(a) - order(b)).slice(0, 5);
      skipped = kids.length - pick.length;
      await pool(pick, 3, async (k) => {
        const c = await getPage(k.loc);
        if (!c.ok) { skipped++; return; }
        const $c = cheerio.load(c.html, { xml: true });
        $c('url').each((_, e) => addLoc($c(e).find('loc').text().trim(), $c(e).find('lastmod').text().trim(), k.loc.split('/').pop()));
      });
    } else {
      $('url').each((_, e) => addLoc($(e).find('loc').text().trim(), $(e).find('lastmod').text().trim(), ''));
    }
    return { url: p.finalUrl, counts, newest, skipped, tried };
  }
  return { url: null, counts: null, newest: {}, skipped: 0, tried };
}

/**
 * Stage 1: the verified facts of a lead. lead = { website, company? }; crm = the live CRM record (crmLead()) when there
 * is one. Returns { facts, audit, pages, fingerprint, limited, collected_at }; `audit` keeps the shape of the old
 * website check (findings, contact…) for scoring and the prompts that still use it.
 */
export async function collectFacts(lead, { crm = null } = {}) {
  const facts = [];
  const fact = (area, kind, text, source) => facts.push({ area, kind, text, source });
  const collected_at = new Date().toISOString();
  // the CRM's own contact details (the guide: "plus the CRM company and contact fields")
  const co = crm?.company;
  const routes = (x) => [x?.phone && `phone ${x.phone}`, x?.email && `email ${x.email}`, x?.whatsapp && `WhatsApp ${x.whatsapp}`].filter(Boolean).join('; ');
  if (routes(co)) fact('contact', 'seen', `CRM: ${routes(co)} (the company record)`, 'crm:companies');
  for (const ct of crm?.contacts || []) if (routes(ct)) fact('contact', 'seen', `CRM: ${routes(ct)} (contact ${ct.name})`, 'crm:contacts');

  const url = lead?.website ? normalizeSite(lead.website) : '';
  if (!url) {
    fact('website', 'absent', 'The CRM has no website for this business', 'crm:companies');
    return finishFacts({ facts, collected_at, pages: [], fingerprint: null, limited: false,
      audit: { has_website: false, findings: [{ severity: 'high', text: "No website found. Customers searching on Google can't find you or contact you online" }], issues: 1 } });
  }
  const home = await getPage(url);
  if (!home.ok) {
    fact('website', 'not_checked', `The website ${url} could not be read by AxiFlow (${home.error || `HTTP ${home.status}`}); nothing on it was checked`, url);
    return finishFacts({ facts, collected_at, pages: [{ url, kind: 'home', status: home.status }], fingerprint: null, limited: false,
      audit: { has_website: true, url, unreachable: true, error: home.error || `HTTP ${home.status}`, findings: [{ severity: 'high', text: home.status ? `Website returns an error (HTTP ${home.status}). Visitors see a broken page` : 'Website could not be reached. Customers may be seeing an error' }], issues: 1 } });
  }
  const base = home.finalUrl;
  const H = readPage(home.html, base);
  const limited = H.text.length < 500;
  const absent = (area, text, source) => { if (!limited) fact(area, 'absent', text, source); };

  // the other pages: contact, about, up to three category / service pages from the main menu, robots.txt
  const contactUrl = contactLinks(home.html, base).find((u) => u !== base) || null;
  const aboutUrl = H.links.find((l) => sameHost(l.href, base) && /about|our[-\s]?story|who[-\s]?we[-\s]?are|founders?/i.test(`${pathOf(l.href)} ${l.text}`))?.href || null;
  const fetched = new Set([base, base.replace(/\/$/, '')]);
  const menuPages = H.menu.filter((m) => m.href && sameHost(m.href, base) && !SKIP_MENU.test(m.href) && !fetched.has(m.href) && !fetched.has(m.href.replace(/\/$/, ''))
    && pathOf(m.href) !== '/' && !/contact|about|blog|news/i.test(`${pathOf(m.href)} ${m.text}`)).slice(0, 3);
  const jobs = [
    ...(contactUrl ? [{ kind: 'contact', url: contactUrl }] : []),
    ...(aboutUrl && aboutUrl !== contactUrl ? [{ kind: 'about', url: aboutUrl }] : []),
    ...menuPages.map((m) => ({ kind: 'category', url: m.href, label: m.text })),
    { kind: 'robots', url: new URL('/robots.txt', base).toString() },
  ];
  const got = await pool(jobs, 3, async (j) => ({ ...j, page: await getPage(j.url) }));
  const pages = [{ url: base, kind: 'home', status: home.status }, ...got.map((g) => ({ url: g.page.finalUrl, kind: g.kind, status: g.page.status, label: g.label }))];
  const read = got.filter((g) => g.page.ok && g.kind !== 'robots').map((g) => ({ ...g, R: readPage(g.page.html, g.page.finalUrl) }));
  for (const g of got.filter((x) => !x.page.ok && x.kind !== 'robots')) fact('website', 'not_checked', `The ${g.kind} page ${g.url} could not be read (${g.page.error || `HTTP ${g.page.status}`}); not checked`, g.url);
  const C = read.find((g) => g.kind === 'contact');
  const robots = got.find((g) => g.kind === 'robots');
  const sitemap = await readSitemap(base, robots?.page.ok ? robots.page.html : '');

  // contact routes on the site
  const contactSrc = C ? C.page.finalUrl : base;
  const where = C ? `the home page and the contact page (${pathOf(C.page.finalUrl)})` : 'the home page (no contact page found)';
  const phones = uniquePhones([...H.contact.phones, ...(C?.R.contact.phones || [])]);
  const emails = [...new Set([...H.contact.emails, ...(C?.R.contact.emails || [])])];
  if (phones.length || emails.length) fact('contact', 'seen', `${[phones.length && `Phone ${phones.join(', ')}`, emails.length && `email ${emails.join(', ')}`].filter(Boolean).join(' and ')} on ${where}`, contactSrc);
  else absent('contact', `No phone number or email on ${where}`, contactSrc);
  const wa = H.contact.whatsapp || C?.R.contact.whatsapp;
  if (wa) fact('contact', 'seen', `A WhatsApp link or button on ${where}`, contactSrc); else absent('contact', `No WhatsApp link or button on ${where}`, contactSrc);
  const form = H.contact.form || C?.R.contact.form;
  if (form) fact('contact', 'seen', `An enquiry / contact form on ${where}`, contactSrc); else absent('contact', `No enquiry or contact form on ${where}`, contactSrc);

  // the site itself
  if (limited) fact('website', 'seen', `The home page shows only ${H.text.length} characters of text without a browser: the site needs a browser to read, so the facts are limited (absences are not reported)`, base);
  if (H.menu.length) fact('website', 'seen', `Main menu order: ${H.menu.slice(0, 14).map((m) => m.text).join(', ')}${H.menu.length > 14 ? ', …' : ''}`, base);
  // the generator tag names the platform with its version ("WordPress 7.0.8"): it replaces the bare name
  const gen = clip(H.generator, 40);
  const platform = [...(gen ? [gen] : []), ...H.platform.filter((p) => !gen.toLowerCase().startsWith(p.toLowerCase()))];
  if (platform.length) fact('website', 'seen', `Built with ${platform.join(', ')} (from the page code${gen ? ' and its generator tag' : ''})`, base);

  // catalogue from the sitemap
  if (sitemap.counts) {
    const NOUN = { product: ['product page', 'product pages'], category: ['category page', 'category pages'], blog: ['blog post', 'blog posts'], service: ['service page', 'service pages'], page: ['other page', 'other pages'] };
    const parts = Object.entries(sitemap.counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${(NOUN[k] || [k, `${k}s`])[n === 1 ? 0 : 1]}`);
    fact('catalogue', 'seen', `The sitemap lists ${parts.join(', ')}${sitemap.skipped ? ` (${sitemap.skipped} more sitemap files not counted)` : ''}`, sitemap.url);
    if (!sitemap.counts.service && !sitemap.counts.product && !limited) fact('catalogue', 'absent', `No product or service pages in the sitemap (${sitemap.url})`, sitemap.url);
  } else absent('catalogue', `No sitemap found (checked ${sitemap.tried.map(pathOf).join(', ')})`, base);

  // prices and stock: the home page and the category pages
  const shop = [{ name: 'the home page', R: H, src: base }, ...read.filter((g) => g.kind === 'category').map((g) => ({ name: `the "${g.label}" page`, R: g.R, src: g.page.finalUrl }))];
  for (const s of shop) {
    if (s.R.prices.length) fact('offer', 'seen', `${s.R.prices.length} prices shown on ${s.name}, from ${fmt(Math.min(...s.R.prices))} to ${fmt(Math.max(...s.R.prices))}`, s.src);
    if (s.R.cards.length) {
      const bySection = {};
      for (const c of s.R.cards) (bySection[c.section || 'products'] ||= []).push(c);
      for (const [sec, list] of Object.entries(bySection)) {
        const out = list.filter((c) => c.oos);
        if (out.length) fact('offer', 'seen', `${out.length} of ${list.length} products in "${sec}" on ${s.name} marked out of stock: ${out.slice(0, 4).map((c) => c.name).join('; ')}`, s.src);
      }
    }
  }

  // images: names and alt text, on every page read
  const imgs = [{ R: H, src: base }, ...read.map((g) => ({ R: g.R, src: g.page.finalUrl }))].flatMap((p) => p.R.images.map((i) => ({ ...i, page: p.src })));
  const uniq = [...new Map(imgs.map((i) => [i.name.replace(/-\d+x\d+(?=\.\w+$)/, ''), i])).values()];
  if (uniq.length) {
    const noAlt = uniq.filter((i) => !String(i.alt || '').trim()).length;
    fact('images', 'seen', `${uniq.length} different images on the ${1 + read.length} pages read; ${noAlt} have no alt text`, base);
    const ai = uniq.filter((i) => AI_IMAGE.test(i.name));
    if (ai.length) fact('images', 'seen', `${ai.length} of ${uniq.length} images have file names from an AI image tool, e.g. ${ai.slice(0, 2).map((i) => i.name).join(', ')}${ai.some((i) => /chatgpt/i.test(i.name)) ? ' (ChatGPT)' : ''}`, ai[0].page);
    const stock = uniq.filter((i) => STOCK_IMAGE.test(i.name));
    if (stock.length) fact('images', 'seen', `${stock.length} images have stock-photo file names, e.g. ${stock[0].name}`, stock[0].page);
    const generic = uniq.filter((i) => /^(img|image|dsc|photo|whatsapp[-_ ]image|screenshot)[-_ ]?\d/i.test(i.name));
    if (generic.length) fact('images', 'seen', `${generic.length} images keep camera or WhatsApp file names (e.g. ${generic[0].name}), which say nothing to search engines`, generic[0].page);
  }

  // title, meta description, H1 per page read; duplicates
  const seoPages = [{ name: 'Home page', R: H, src: base }, ...read.map((g) => ({ name: `${g.kind === 'category' ? `"${g.label}"` : g.kind[0].toUpperCase() + g.kind.slice(1)} page`, R: g.R, src: g.page.finalUrl }))];
  for (const p of seoPages) {
    fact('seo', p.R.title && p.R.description && p.R.h1.length ? 'seen' : 'absent', // "absent" only when something is missing
      `${p.name}: title ${p.R.title ? `"${p.R.title}"` : 'missing'}; meta description ${p.R.description ? `"${clip(p.R.description, 80)}"` : 'missing'}; ${p.R.h1.length ? `${p.R.h1.length} H1${p.R.h1.length > 1 ? 's' : ''} ("${p.R.h1[0]}")` : 'no H1'}`, p.src);
  }
  const dup = (key) => { const m = {}; for (const p of seoPages) if (p.R[key]) (m[p.R[key]] ||= []).push(p.name); return Object.entries(m).filter(([, v]) => v.length > 1); };
  for (const [v, names] of dup('title')) fact('seo', 'seen', `The same title "${clip(v, 60)}" on ${names.join(' and ')}`, base);
  for (const [v, names] of dup('description')) fact('seo', 'seen', `The same meta description on ${names.join(' and ')}: "${clip(v, 60)}"`, base);
  const types = [...new Set(seoPages.flatMap((p) => p.R.types))];
  if (types.length) fact('seo', 'seen', `Structured data (JSON-LD) types on the pages read: ${types.slice(0, 12).join(', ')}`, base);
  else absent('seo', `No JSON-LD structured data on the home page or the ${read.length} other pages checked`, base);
  if (!H.og) absent('seo', 'No social preview (og:) tags on the home page', base);

  // tracking
  const allHtml = [home.html, ...read.map((g) => g.page.html)].join('\n');
  const T = { gtm: [...new Set(allHtml.match(/GTM-[A-Z0-9]{4,}/g) || [])], ga: [...new Set(allHtml.match(/\bG-[A-Z0-9]{6,}\b|\bUA-\d{4,}-\d+\b/g) || [])], pixel: /fbq\(|connect\.facebook\.net\/[^"']*fbevents|facebook\.com\/tr\b/i.test(allHtml) };
  const tr = [T.gtm.length && `Google Tag Manager (${T.gtm.join(', ')})`, T.ga.length && `Google Analytics (${T.ga.join(', ')})`, T.pixel && 'a Meta (Facebook) Pixel'].filter(Boolean);
  if (tr.length) fact('tracking', 'seen', `Tracking code on the pages read: ${tr.join('; ')}`, base);
  else absent('tracking', `No Google Analytics, Tag Manager or Meta Pixel code on the home page or the ${read.length} other pages checked`, base);

  // blog
  const blogLink = [...H.menu.map((m) => ({ href: m.href, text: m.text })), ...H.links.filter((l) => l.inFooter)].find((l) => l.href && /\bblog\b|\/blogs?\/|\bnews\b|journal|articles?\b/i.test(`${pathOf(l.href)} ${l.text}`));
  const blogNewest = sitemap.newest?.blog;
  if (blogLink) fact('content', 'seen', `A blog link ("${blogLink.text}", ${pathOf(blogLink.href)}) in the ${H.menu.some((m) => m.href === blogLink.href) ? 'main menu' : 'footer'}${blogNewest ? `; newest post in the sitemap: ${blogNewest.slice(0, 10)}` : ''}`, base);
  else absent('content', `No blog link in the home page menu or footer${sitemap.counts?.blog ? ` (the sitemap lists ${sitemap.counts.blog} blog posts${blogNewest ? `, newest ${blogNewest.slice(0, 10)}` : ''})` : ''}`, base);
  if (blogNewest && !blogLink) fact('content', 'seen', `Newest blog post date in the sitemap: ${blogNewest.slice(0, 10)}`, sitemap.url);

  // social links on the site
  const social = { ...(C?.R.contact.social || {}), ...H.contact.social };
  const SOCIAL_NAME = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', linkedin: 'LinkedIn' };
  for (const [k, u] of Object.entries(social)) fact('social', 'seen', `${SOCIAL_NAME[k] || k} page linked on the website: ${u}`, base);
  if (!Object.keys(social).length) absent('social', `No Instagram, Facebook, YouTube or LinkedIn links on ${where}`, base);

  // technical basics
  const https = base.startsWith('https://');
  fact('technical', https ? 'seen' : 'absent', https ? 'The site is served over HTTPS' : 'The site is not served over HTTPS', base);
  if (!H.viewport) absent('technical', 'No mobile viewport tag on the home page', base);
  fact('technical', 'seen', `The home page HTML loaded in ${(home.ms / 1000).toFixed(1)} s from AxiFlow's server (one measurement, not a speed test)`, base);
  if (H.year) fact('technical', 'seen', `Footer year: © ${H.year}`, base);
  if (home.html.length > 1_000_000) fact('technical', 'seen', `The home page HTML is ${(home.html.length / 1e6).toFixed(1)} MB`, base);
  if (robots?.page.ok) {
    const blocksAll = /user-agent:\s*\*[\s\S]*?^\s*disallow:\s*\/\s*$/im.test(robots.page.html);
    fact('technical', 'seen', `robots.txt is present${blocksAll ? ' and blocks all crawlers (Disallow: /)' : ''}${sitemap.url ? '' : '; it names no sitemap'}`, robots.page.finalUrl);
  } else if (robots && robots.page.status === 404) absent('technical', 'No robots.txt (404)', robots.url);
  // up to 20 internal links from the home page, checked with HEAD requests (3 at once)
  const toCheck = [...new Set(H.links.map((l) => l.href).filter((h) => h && sameHost(h, base) && !SKIP_MENU.test(h) && !fetched.has(h) && !pages.some((p) => p.url === h)))].slice(0, 20);
  const heads = await pool(toCheck, 3, async (h) => { try { const { res } = await safeFetch(h, 0, 'HEAD'); return { h, status: res.status }; } catch (e) { return { h, status: 0 }; } });
  const broken = heads.filter((x) => [404, 410].includes(x.status) || x.status >= 500);
  if (heads.length) fact('technical', 'seen', broken.length ? `${broken.length} of ${heads.length} internal links on the home page answer an error: ${broken.slice(0, 4).map((b) => `${pathOf(b.h)} (${b.status})`).join(', ')}` : `All ${heads.filter((x) => x.status && x.status < 400).length} internal links on the home page checked (HEAD) answer without an error${heads.some((x) => !x.status || x.status === 405 || x.status === 403) ? ' (some could not be checked)' : ''}`, base);

  // the old website check (findings), from the same pages: scoring, the package choice and the prompts still use it
  const findings = [];
  const add = (severity, text) => findings.push({ severity, text });
  if (!https) add('high', 'No HTTPS. Browsers show a "Not secure" warning to visitors');
  if (!H.viewport) add('high', 'Not mobile-friendly. Most visitors are on phones');
  if (home.ms > 3000) add('medium', `Slow to load (${(home.ms / 1000).toFixed(1)}s). Visitors leave after about 3s`);
  if (!H.title) add('medium', 'Missing page title. Hurts Google ranking');
  if (!H.description || H.description.length < 20) add('medium', 'No meta description. Google shows a random snippet');
  if (!H.h1.length) add('low', 'No main heading (H1). Weak SEO structure');
  if (!H.og) add('low', 'No social preview tags. Links look plain on WhatsApp/Facebook');
  if (phones.length || emails.length) add('info', `Contact details on the website (checked: ${where}): ${[phones.length && `phone ${phones.join(', ')}`, emails.length && `email ${emails.join(', ')}`].filter(Boolean).join('; ')}`);
  else add('medium', `No phone number or email found on ${where}`);
  if (!wa) add('low', `No WhatsApp chat button or link on ${where}. Easy enquiries are being missed`);
  if (!form) add('low', `No enquiry form on ${where}`);
  if (Object.keys(social).length) add('info', `Social pages linked on the website (checked: ${where}): ${Object.entries(social).map(([k, u]) => `${k} ${u}`).join('; ')}`);
  if (H.year && H.year < new Date().getFullYear() - 1) add('medium', `Footer says © ${H.year}. The site looks outdated`);
  if (home.html.length > 1_000_000) add('low', 'Very heavy page. Wastes mobile data and slows loading');
  const order = { info: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const audit = { has_website: true, url, final_url: base, status: home.status, load_ms: home.ms, https, title: H.title, footer_year: H.year, findings,
    issues: findings.filter((f) => f.severity !== 'info').length, contact: { phones, emails, whatsapp: !!wa, form: !!form, social, page: C?.page.finalUrl || null } };
  const fingerprint = crypto.createHash('sha1').update(H.text).digest('hex').slice(0, 16);
  return finishFacts({ facts, collected_at, pages, fingerprint, limited, audit });
}
const normalizeSite = (u) => { const t = String(u).trim(); return /^https?:\/\//i.test(t) ? t : `https://${t}`; };
/** Ids in order (V1, V2…). */
function finishFacts(r) {
  r.facts = r.facts.map((f, i) => ({ id: `V${i + 1}`, ...f }));
  return r;
}
/** Stores the facts on the lead (leads.facts_json, facts_at, site_fingerprint). */
export async function saveFacts(leadId, r) {
  if (!leadId || !r?.facts) return;
  await update('leads', leadId, { facts_json: r.facts, facts_at: r.collected_at, site_fingerprint: r.fingerprint || null });
}

/**
 * The old website check, kept for its callers (scoring, the package choice, re-audit): the `audit` part of
 * collectFacts(). Each finding: { severity: 'high'|'medium'|'low'|'info', text } ('info' = a checked fact, not a problem).
 */
export async function auditWebsite(url) {
  return (await collectFacts({ website: url })).audit;
}

/** Choose the package to pitch. */
export function recommendPackage(lead, audit, packages) {
  const ids = new Set(packages.map((p) => p.id));
  if (lead.service && ids.has(lead.service)) return lead.service;
  const ind = String(lead.industry || '').toLowerCase();
  if (/shop|store|retail|fashion|boutique|ecom|jewel/.test(ind) && ids.has('ecommerce')) return 'ecommerce';
  if (!audit?.has_website || audit?.unreachable) return ids.has('website') ? 'website' : packages[0].id;
  const high = audit.findings.filter((f) => f.severity === 'high').length;
  if (high >= 1 && ids.has('redesign')) return 'redesign';
  if (ids.has('seo')) return 'seo';
  return packages[0].id;
}
