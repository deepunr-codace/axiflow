import { websiteTypeLabel } from '../website-type.js';

/*
 * The decided offer for a brochure (brochure fix guide 2026-11-13, section 6.1 "Deciding the offer"). The client chose
 * a website type in the CRM; that choice wins over anything else (the SWOT strategy used to contradict it: "the store is
 * built, don't suggest a rebuild" next to "build a Shopify store"). Code settles the offer from the type and what the
 * website is today, and the writer sells exactly that. The website status comes from the verified facts
 * (src/pipeline/enrich.js collectFacts: "Built with …", the sitemap's products, prices / stock on product pages).
 */

/** What the website is today: none | dead | shopify | store (another platform) | content | unknown. */
export function websiteStatus({ website, facts, audit } = {}) {
  if (!String(website || '').trim()) return { status: 'none', why: 'the CRM has no website for this business' };
  const list = Array.isArray(facts) ? facts : [];
  const web = list.filter((f) => f.area === 'website');
  if (audit?.unreachable || web.some((f) => f.kind === 'not_checked' && /could not be read by AxiFlow/.test(f.text))) {
    return { status: 'dead', why: `the website could not be read${audit?.error ? ` (${audit.error})` : ''}` };
  }
  if (!list.length) return { status: 'unknown', why: 'the website was not checked' };
  const built = web.find((f) => /^Built with /.test(f.text))?.text || '';
  const all = list.map((f) => f.text).join('\n');
  const platform = built.replace(/^Built with /, '').replace(/\s*\(from the page code.*$/, '');
  if (/shopify/i.test(built)) return { status: 'shopify', platform, why: built };
  const storePlatform = /woocommerce|magento|opencart|prestashop|bigcommerce|wix|squarespace|ecwid|dukaan|instamojo/i.test(built);
  const sells = /products? in "|out of stock|prices shown on|lists [\d,]+ products?/i.test(all) || list.some((f) => f.area === 'catalogue' && f.kind === 'seen' && /product/i.test(f.text));
  if (storePlatform && sells) return { status: 'store', platform, why: `${built}; it sells products online` };
  if (sells && /cart|checkout|add to cart/i.test(all)) return { status: 'store', platform, why: 'it sells products online' };
  return { status: 'content', platform, why: built || 'a website without an online shop' };
}

/** The package for a website type (no prices: they belong in the proposal). */
const PACKAGE_OF = { 'business-website': ['website'], 'ecommerce-store': ['ecommerce'], 'shopify-store': ['ecommerce'], 'landing-page': ['landing'], 'website-seo': ['website', 'seo'] };
export function packageText(websiteType, status, settings) {
  const ids = (PACKAGE_OF[websiteType] || []).map((id) => (id === 'website' && websiteType === 'business-website' && ['content', 'store', 'shopify', 'unknown'].includes(status) ? 'redesign' : id));
  const pk = ids.map((id) => (settings?.packages || []).find((p) => p.id === id)).filter(Boolean);
  if (!pk.length) return '';
  return `${pk.map((p) => `${p.name}, about ${p.timeline}: ${(p.includes || []).join(', ')}`).join('; plus ')}. Timelines only from this; no prices in the brochure.`;
}

/**
 * { text, package, status, why } or { blocked } when the website type is not set (the brochure is then not written:
 * the telecaller sets the type in the CRM, then Try again).
 */
export function decideOffer({ websiteType, website, facts, audit, settings } = {}) {
  const label = websiteTypeLabel(websiteType);
  if (!label) return { blocked: 'No website type is set for this lead in the CRM (Business website, E-commerce store, Shopify store, Website + SEO or Landing page). Set it on the deal, then press Try again. Nothing was written.' };
  const st = websiteStatus({ website, facts, audit });
  const site = String(website || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const on = st.platform ? ` (now on ${st.platform})` : '';
  const T = {
    fresh: `Build a ${label.toLowerCase()} for the business from scratch${st.status === 'dead' ? `: the current website${site ? ` ${site}` : ''} cannot be reached` : ''}.`,
    toShopify: `Move the online store ${site}${on} to Shopify: products, customers, URLs and SEO carried over, then the growth features.`,
    reShopify: `Rework the Shopify store ${site}: theme, collections, apps, speed and SEO, then the growth features. It stays on Shopify; no re-platforming.`,
    toCustom: `Rebuild the online store ${site}${on} as a custom e-commerce build with the growth features.`,
    startSelling: `Start selling online: a new ${label.toLowerCase()} alongside or replacing the current website ${site}.`,
    redesign: `Redesign the website ${site} around enquiries; keep what already ranks.`,
    seo: `Rebuild the website ${site} to rank, plus the SEO plan.`,
    landing: `A campaign landing page alongside the current website ${site}.`,
  };
  let text;
  if (st.status === 'none' || st.status === 'dead') text = T.fresh;
  else if (websiteType === 'shopify-store') text = st.status === 'shopify' ? T.reShopify : st.status === 'store' ? T.toShopify : T.startSelling;
  else if (websiteType === 'ecommerce-store') text = st.status === 'store' || st.status === 'shopify' ? T.toCustom : T.startSelling;
  else if (websiteType === 'business-website') text = T.redesign;
  else if (websiteType === 'website-seo') text = T.seo;
  else if (websiteType === 'landing-page') text = T.landing;
  else text = T.fresh;
  return { text: `${text} (CRM website type: ${label}; website today: ${st.why}.)`, package: packageText(websiteType, st.status, settings), status: st.status, why: st.why };
}
