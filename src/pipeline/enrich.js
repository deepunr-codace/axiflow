import dns from 'node:dns/promises';
import net from 'node:net';

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

async function safeFetch(url, hops = 0) {
  await assertPublicHost(url);
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; AxilumeAudit/1.0)' },
  });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && hops < 5) {
    return safeFetch(new URL(res.headers.get('location'), url).toString(), hops + 1);
  }
  return { res, finalUrl: url };
}

/**
 * Lightweight website audit used to personalise the brochure and to score the lead.
 * Each finding: { severity: 'high'|'medium'|'low', text }.
 */
export async function auditWebsite(url) {
  if (!url) {
    return {
      has_website: false,
      findings: [{ severity: 'high', text: "No website found. Customers searching on Google can't find you or contact you online" }],
      issues: 1,
    };
  }
  const started = Date.now();
  try {
    const { res, finalUrl } = await safeFetch(url);
    const html = (await res.text()).slice(0, 1_500_000);
    const loadMs = Date.now() - started;
    const findings = [];
    const add = (severity, text) => findings.push({ severity, text });
    const https = finalUrl.startsWith('https://');

    if (res.status >= 400) add('high', `Website returns an error (HTTP ${res.status}). Visitors see a broken page`);
    if (!https) add('high', 'No HTTPS. Browsers show a "Not secure" warning to visitors');
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) add('high', 'Not mobile-friendly. Most visitors are on phones');
    if (loadMs > 3000) add('medium', `Slow to load (${(loadMs / 1000).toFixed(1)}s). Visitors leave after about 3s`);
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || '';
    if (!title) add('medium', 'Missing page title. Hurts Google ranking');
    if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html)) add('medium', 'No meta description. Google shows a random snippet');
    if (!/<h1[\s>]/i.test(html)) add('low', 'No main heading (H1). Weak SEO structure');
    if (!/property=["']og:/i.test(html)) add('low', 'No social preview tags. Links look plain on WhatsApp/Facebook');
    if (!/wa\.me|api\.whatsapp\.com|whatsapp/i.test(html)) add('low', 'No WhatsApp chat button. Easy enquiries are being missed');
    if (!/<form[\s>]/i.test(html)) add('medium', 'No enquiry/contact form. Visitors have no quick way to reach you');
    const yearMatch = html.match(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i);
    const year = yearMatch ? Number(yearMatch[1]) : null;
    if (year && year < new Date().getFullYear() - 1) add('medium', `Footer says © ${year}. The site looks outdated`);
    if (html.length > 1_000_000) add('low', 'Very heavy page. Wastes mobile data and slows loading');

    const order = { high: 0, medium: 1, low: 2 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    return { has_website: true, url, final_url: finalUrl, status: res.status, load_ms: loadMs, https, title, footer_year: year, findings, issues: findings.length };
  } catch (e) {
    return {
      has_website: true,
      url,
      unreachable: true,
      error: e.message,
      findings: [{ severity: 'high', text: 'Website could not be reached. Customers may be seeing an error' }],
      issues: 1,
    };
  }
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
