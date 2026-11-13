import { addColumns, all, update } from './db.js';
import { getState, setState } from './settings.js';

/*
 * Website type (owner, 2026-11-10): when a lead turns Interested in the team CRM, the CRM asks which website the
 * client wants. The CRM keeps it in the deal's `categories` and also posts it here (POST /api/axicore/package), so
 * it is known even when the user may not update the deal. Brochures use it to pick their template
 * (automation.website_templates.<type>) and Claude gets guidance for that kind of build.
 */
export const WEBSITE_TYPES = {
  'business-website': {
    label: 'Business website',
    notes: 'A company or service website whose job is enquiries: clear offer per service, proof (work, reviews, credentials), local search (Google Business, location pages), WhatsApp and call buttons, an enquiry form that reaches the team fast, and simple content updates.',
  },
  'ecommerce-store': {
    label: 'E-commerce store',
    notes: 'A custom online store: product catalogue with variants and stock, search and filters, cart and checkout, Indian payment options (UPI, cards, COD), shipping and order tracking, offers and coupons, abandoned-cart and order messages on WhatsApp/email, an admin to manage products and orders, and SEO for product and category pages.',
  },
  'shopify-store': {
    label: 'Shopify store',
    notes: 'A store built on Shopify: theme design to the brand, product and collection setup, payments (Razorpay/UPI, COD), shipping rules, the right apps (reviews, WhatsApp, upsell, subscriptions), speed and SEO tuning, product imports, and handover so the team can run it. Talk about launch speed and running costs, not custom code.',
  },
  // owner, 2026-11-13: "add a Website + Seo category" (its brochure: CodeAce Website & SEO)
  'website-seo': {
    label: 'Website + SEO',
    notes: 'A business website together with search work: the site built to rank (fast, mobile, clear service pages, structured data), Google Search and Maps (Google Business Profile, location pages, local reviews), readiness for AI answers (AEO / GEO), tracking (GA4, Search Console, Microsoft Clarity), and for growth a monthly SEO retainer. Frame it around being found by the customers already searching, then turning those visits into enquiries.',
  },
  'landing-page': {
    label: 'Landing page',
    notes: 'One focused page for a campaign or offer: one promise, one call to action, proof near the button, a short form or WhatsApp click, fast load on mobile, tracking (Meta/Google pixels, analytics) and A/B-ready sections. Frame everything around turning ad clicks into leads.',
  },
};

export const isWebsiteType = (v) => Object.prototype.hasOwnProperty.call(WEBSITE_TYPES, v);
export const websiteTypeLabel = (v) => WEBSITE_TYPES[v]?.label || '';
/** The website type among a deal's categories, if any. */
export const websiteTypeOf = (categories) => (Array.isArray(categories) ? categories : []).find(isWebsiteType) || null;

addColumns('leads', { website_type: 'TEXT' });

/** Stores the type for a CRM deal / company: on the AxiFlow lead when it exists, and in a small map for leads not imported yet. */
export async function rememberWebsiteType({ dealId = null, companyId = null, type, by = '' }) {
  if (!isWebsiteType(type)) throw new Error('Unknown website type');
  const map = await getState('website_types', {});
  const entry = { type, at: new Date().toISOString(), by: String(by).slice(0, 80) };
  if (Number(companyId)) map[`co:${Number(companyId)}`] = entry;
  if (Number(dealId)) map[`deal:${Number(dealId)}`] = entry;
  await setState('website_types', map);
  const leads = await all(`SELECT id, website_type FROM leads WHERE crm_removed_at IS NULL AND ((:co > 0 AND (crm_company_id = :co OR external_id = :ext)) OR (:deal > 0 AND crm_deal_id = :deal))`,
    { co: Number(companyId) || 0, deal: Number(dealId) || 0, ext: `atomic:co:${Number(companyId) || 0}` });
  for (const l of leads) if (l.website_type !== type) await update('leads', l.id, { website_type: type });
  return leads.length;
}

/** The lead's website type: its own column, else what the CRM posted for its company or deal. */
export async function websiteTypeFor(lead) {
  if (!lead) return null;
  if (isWebsiteType(lead.website_type)) return lead.website_type;
  const map = await getState('website_types', {});
  const hit = (lead.crm_deal_id && map[`deal:${lead.crm_deal_id}`]) || (lead.crm_company_id && map[`co:${lead.crm_company_id}`]) || null;
  return hit && isWebsiteType(hit.type) ? hit.type : null;
}

/** Prompt section for Claude: what this kind of website needs, so the brochure (or proposal) sells that build. */
export function websiteTypeSection(type) {
  const t = WEBSITE_TYPES[type];
  if (!t) return '';
  return `<website_type>
The client chose this in the CRM when they became interested: ${t.label}.
Build the whole story around this kind of website (the services, the plan and the call to action), not a generic website offer.
What this build involves: ${t.notes}
</website_type>`;
}
