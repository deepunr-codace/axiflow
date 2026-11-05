import { getSettings } from '../settings.js';
import { PAIRINGS } from '../design/fonts.js';
import { runJson, aiEnabled, obj, str, arr } from './claude.js';
import { managerSystem } from './playbook.js';
import { poss } from '../pdf/brand.js';

/*
 * AI Proposal Generator: writes the document text (summary, scope, structure, detailed features,
 * deliverables). Prices never come from here; the Investment table uses the editable line items.
 */
const SCHEMA = obj({
  title: str('document title, 2-4 words, e.g. "Website Development Proposal" or "Shopify Store Proposal"'),
  executive_summary: arr(str('2-3 sentences'), 'exactly 3 paragraphs: who the client is, what we propose, what it enables later'),
  scope_intro: str('one or two sentences'),
  scope: arr(obj({ title: str('3-5 words'), description: str('one or two sentences') }), '8-10 numbered work items in delivery order (planning, design, build, content, integrations, SEO, testing, training/support)'),
  structure_intro: str('one or two sentences'),
  structure: arr(str('page name'), '12-18 pages/sections of the website, in menu order'),
  features: arr(obj({
    section: str('e.g. "Storefront & Catalog Experience"'),
    groups: arr(obj({ title: str(), bullets: arr(str('max 10 words'), '4-7 bullets') }), '2-3 groups'),
  }), '5-8 feature sections, specific to this business'),
  deliverables: arr(str(), '5-7 items'),
  closing_title: str('two lines separated by \\n, e.g. "Let\'s Build\\n<Company>\'s Online Store"'),
});

export function templateProposal(input, items) {
  const s = getSettings();
  const pkg = s.packages.find((p) => p.id === input.package) || s.packages[0];
  const c = input.company;
  const eco = /ecom|store|shop/i.test(pkg.id + pkg.name);
  return {
    title: eco ? 'Online Store Proposal' : 'Website Development Proposal',
    executive_summary: [
      `${c} is a ${input.industry ? input.industry.toLowerCase() + ' ' : ''}business${input.city ? ` based in ${input.city}` : ''}. ${input.website ? 'Its current website introduces the business but does not yet turn visitors into enquiries.' : 'It does not yet have a website that brings in customers.'}`,
      `We propose designing and building a ${pkg.name.toLowerCase()} that presents ${c} professionally, works perfectly on mobile, and makes it easy for customers to get in touch${eco ? ' and buy online' : ''}.`,
      `Beyond today's needs, the new site gives ${c} a platform for launching offers, publishing content and running digital marketing campaigns as the business grows.`,
    ],
    scope_intro: `We will deliver a modern, mobile-first ${pkg.name.toLowerCase()} for ${c}, built for speed, search visibility and easy management.`,
    scope: [
      { title: 'Planning & Strategy', description: 'Define the site structure, customer journey, required features and project roadmap.' },
      { title: 'Custom UI/UX Design', description: `Create a premium, mobile-first interface in line with ${poss(c)} brand identity.` },
      { title: 'Development', description: 'Build the approved design as a fast, responsive and easy-to-manage website.' },
      { title: 'Content Setup', description: 'Structure pages, services, images and copy with clear calls to action.' },
      { title: 'Integrations', description: 'Connect WhatsApp, enquiry forms, maps, analytics and any required third-party tools.' },
      { title: 'SEO & Performance Setup', description: 'Optimise page structure, URLs, metadata, images, speed and mobile performance.' },
      { title: 'Testing & Launch', description: 'Test every page, form and integration before going live on your domain.' },
      { title: 'Training & Support', description: `Provide admin training, documentation and ${s.proposal.support_days} days of post-launch support.` },
    ],
    structure_intro: 'A clear, scalable structure that makes it easy for customers to find what they need and for search engines to index every page.',
    structure: eco
      ? ['Home', 'Shop', 'Product Collections', 'Individual Product Pages', 'Offers', 'About', 'Reviews', 'Blog', 'Contact', 'FAQs', 'Shipping Policy', 'Return & Refund Policy', 'Privacy Policy', 'Terms & Conditions']
      : ['Home', 'About', 'Services', 'Individual Service Pages', 'Gallery', 'Testimonials', 'Blog', 'Contact', 'FAQs', 'Privacy Policy', 'Terms & Conditions'],
    features: [
      { section: 'Home Page & Essential Pages', groups: [
        { title: 'Home Page', bullets: [`Hero section presenting ${c}`, 'Key services and offers at a glance', 'Trust section with reviews and credentials', 'Clear calls to action on every screen'] },
        { title: 'Essential Pages', bullets: ['About, Services and Contact pages', 'FAQs, Privacy and Terms pages', 'Google Maps and opening hours'] },
      ] },
      { section: 'Enquiries & WhatsApp', groups: [
        { title: 'WhatsApp Integration', bullets: ['Floating WhatsApp chat icon on all pages', 'Pre-filled messages for quick enquiries', 'Click-to-call on mobile'] },
        { title: 'Forms', bullets: ['Enquiry and callback forms', 'Instant email notification of new leads', 'Spam protection'] },
      ] },
      { section: 'SEO, Speed & Security', groups: [
        { title: 'Search Visibility', bullets: ['Clean URLs, titles and meta descriptions', 'Local SEO setup for Google Maps', 'Analytics and Search Console connected'] },
        { title: 'Performance & Security', bullets: ['Fast loading on mobile data', 'SSL and secure hosting', 'Regular backups'] },
      ] },
    ],
    deliverables: [`Fully functional ${pkg.name.toLowerCase()} on your domain`, 'Mobile-first custom design', 'WhatsApp, forms and analytics integrations', 'SEO-friendly setup and secure foundation', 'Admin access and training', `${s.proposal.support_days} days of post-launch support`],
    closing_title: `Let's Build\n${poss(c)} ${eco ? 'Online Store' : 'New Website'}`,
  };
}

/** The AI job for a proposal document (in-app or Claude mode). Prices never come from it. */
export function proposalJob(input, items, research = null) {
  const base = templateProposal(input, items);
  const s = getSettings();
  const pkg = s.packages.find((p) => p.id === input.package) || s.packages[0];
  return {
      kind: 'proposal', purpose: 'proposal_doc', effort: s.ai.effort_writing, schema: SCHEMA, maxTokens: 20000,
      system: managerSystem('write a client proposal document'),
      prompt: `Write the proposal document for this client. Do not mention prices anywhere (the pricing table is added separately).

Client: ${input.company} · Industry: ${input.industry || 'unknown'} · City: ${input.city || 'unknown'} · Website: ${input.website || 'none'}
Package being proposed: ${pkg.name}: ${pkg.includes.join(', ')}. Timeline: ${pkg.timeline}. Post-launch support: ${s.proposal.support_days} days.
Line items quoted (names only): ${items.map((i) => i.name).join('; ')}
Our team's notes and the client's requirements: <untrusted>${input.notes || 'none'}</untrusted>
Research: <untrusted>${research ? JSON.stringify({ summary: research.business_summary, sells: research.what_they_sell, customers: research.target_customers, online: research.online_presence }) : 'none'}</untrusted>

Follow this structure and tone (a real example from our agency): ${JSON.stringify(base)}. Make the features specific to what this business sells and how its customers behave.`,
  };
}
/** The answer merged over the standard proposal, keeping only the schema's fields. */
export function postProposal(content, input, items) {
  const base = templateProposal(input, items);
  const keep = Object.fromEntries(Object.entries(content || {}).filter(([k, v]) => k in base && v != null && v !== ''));
  const fonts = PAIRINGS[content?.font_pairing] ? { font_pairing: content.font_pairing } : {}; // the typefaces Claude chose
  return { ...base, ...keep, ...fonts };
}

/** Without Claude: the standard proposal for the package (the in-app AI writer was removed, owner 2026-11-05). */
export async function writeProposalDoc(input, items, research = null) {
  return { content: templateProposal(input, items), source: 'template' };
}
