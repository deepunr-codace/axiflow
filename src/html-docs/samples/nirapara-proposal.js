// The reference proposal's content (Downloads/Nirapara Shopify Store Proposal — CodeAce.pdf, 2026-11-11), word for word.
// Used for the template preview, the exactness check against that PDF, and as the example given to Claude.
export const NIRAPARA_PROPOSAL = {
  eyebrow: 'Shopify Store Proposal · November 2026',
  title: 'Shopify Store Development & Ecommerce Growth Proposal',
  summary: {
    paragraphs: [
      "Nirapara is one of Kerala's most trusted food brands. Since 1976 its rice products, puttu podi, appam powder, spices, masalas and pickles have reached supermarkets, local stores, Blinkit, Instamart, Amazon and the GCC. Availability is not the problem. Preference is.",
      'Today nirapara.com shows products and recipes, but has no price, cart or checkout, and its banners send visitors to Blinkit. We propose a Shopify brand store that turns this content into direct orders and gives Nirapara its own customers, data and offers, while keeping every existing channel.',
    ],
    approach_label: 'Our approach',
    approach: 'From third option\nto first choice.',
    stats: [{ value: '5 weeks', label: 'to store launch' }, { value: '14', label: 'growth ideas built in' }, { value: 'India + GCC', label: 'storefronts' }],
    closing: 'The new store sells baskets, not single packs: recipe kits, monthly boxes, subscriptions and hampers. A QR code on every retail pack links shelf buyers back to the brand with rewards and batch purity reports.',
  },
  scope: {
    intro: 'We will build a new Shopify brand store for Nirapara: mobile-first, in English and Malayalam, designed to sell full kitchen baskets and to win the shelf in every store Nirapara already sits in.',
    items: [
      { title: 'Discovery & Store Strategy', text: 'Review the catalogue, pricing, marketplace parity and current site, then set the store plan, basket rules and launch priorities.' },
      { title: 'Custom UI/UX Design', text: "A premium, mobile-first design in Nirapara's brand, in English and Malayalam, built around dishes and recipes." },
      { title: 'Shopify Store Setup & Configuration', text: 'Store settings, UPI, cards, wallets and COD, shipping rules, taxes, policies, and Shopify Markets for India and the GCC.' },
      { title: 'Custom Theme Development', text: 'A fast Shopify theme with reusable sections the brand team can update without developers.' },
      { title: 'Catalogue & Recipe Commerce', text: 'Every product with pack sizes and prices, shop by dish, shop-this-recipe buttons and ready kits.' },
      { title: 'Growth Feature Integrations', text: 'Bundles, subscriptions, loyalty, photo reviews, WhatsApp journeys and abandoned-cart recovery.' },
      { title: 'Pack QR & Purity Reports', text: 'A unique code on every retail pack, a scan landing page, rewards and batch quality reports that prove purity.', dark: true },
      { title: 'SEO, Migration & Performance', text: 'Move all recipes and blog posts with 301 redirects so no ranking is lost; schema, metadata, a Google Shopping feed and speed optimisation.' },
      { title: 'Testing & Launch', text: 'Test mobile layouts, checkout, UPI and COD payments, QR scans, WhatsApp flows and GCC orders before launch.' },
      { title: 'Training & Support', text: 'Shopify admin training, documentation, final handover and 90 days of post-launch support.' },
    ],
  },
  structure: {
    intro: 'A clear structure that lets families shop by product or by dish, keeps every existing recipe URL, and gives the pack QR, quality and gifting journeys their own homes.',
    pages: ['Home', 'Shop All Products', 'Shop by Dish: Sambar, Fish Curry, Puttu', 'Spices & Masalas', 'Rice, Puttu Podi & Appam', 'Pickles, Pastes & Ready Mixes', 'Kits & Kerala Kitchen Box', 'Subscribe & Save', 'Gifting, Hampers & Corporate',
      'Recipes with Shop-the-Recipe', 'Scan & Earn: pack QR rewards', 'Quality & Batch Purity Reports', 'Our Story: Since 1976', 'Dealer & Bulk Enquiry (B2B)', 'Where to Buy', 'Blog, FAQs & Contact', 'GCC Storefront (UAE and Gulf)', 'Shipping, Returns, Privacy & Terms'],
    note_bold: 'Every page in English and Malayalam.',
    note: 'Product pages carry pack sizes, ingredients, recipes that use the product, reviews and a link to the latest batch report.',
  },
  features: [
    { title: 'Storefront & Catalogue', cards: [
      { title: 'Home Page & Essential Pages', tone: 'grey', points: ["Editorial hero on Nirapara's heritage since 1976", 'Bestsellers, kits and festive collections', 'Shop-by-dish and recipe sections', 'Pack QR and purity trust sections', 'Footer with where-to-buy, dealer enquiry and policies'] },
      { title: 'Category & Product Listing Pages', tone: 'grey', points: ['Shop by product type or by dish', 'Filters for category, pack size and price', 'Sorting by bestselling, newest and price', 'Consistent product photos, prices and stock states'] },
      { title: 'Product Detail Pages', tone: 'dark', points: ['Image gallery, pack sizes and quantity controls', 'Ingredients, nutrition, storage and usage information', 'Recipes that use this product, with add-to-cart', 'Reviews, pincode delivery check and latest batch report', '"Frequently bought together" and kit suggestions'] },
    ] },
    { title: 'Recipes, Bundles & Offers', cards: [
      { title: 'Recipe Commerce', tone: 'red', points: ['Shop this recipe: every ingredient to cart in one tap', 'Ready kits: Puttu Breakfast, Sadya and Fish Curry', 'Existing recipes, blog and contests made shoppable', 'Short cooking videos on recipe and product pages'] },
      { title: 'Bundles & Kits', tone: 'grey', points: ['Monthly Kerala Kitchen Box: rice, podi, spices and oil', 'Breakfast, curry masala and pickle combos', 'Festive boxes: Onam Sadya, Vishu, Ramadan and Eid, Christmas', 'Pre-order windows with early-bird offers'] },
      { title: 'Promotions & Offers', tone: 'grey', points: ['Announcement bar and campaign banners', 'Minimum order value and free-shipping progress bar', 'Automatic discounts and a first-order offer', 'Same MRP as marketplaces; savings come from bundles'] },
    ] },
    { title: 'Pack QR, Rewards & Purity', image: 'asset:html-docs/img/sample-phone.webp', image_alt: 'Phone showing a Nirapara pack QR scan: Scan, earn, cook.', cards: [
      { title: 'Buy Anywhere, Earn Here', tone: 'red', points: ['A unique code inside every retail pack', 'Scan for points, contest entries or a free recipe kit', 'Works for shop, Blinkit and supermarket buyers'] },
      { title: 'Batch Purity Reports', tone: 'grey', points: ["Scan the pack to see that batch's lab checks", 'Quality page with certifications and process', 'Answers "is it pure?" with proof'] },
      { title: 'Customer Data & Insights', tone: 'dark', points: ['Every scan adds a known customer with WhatsApp opt-in', 'Scan reports by product, town and store', 'Reorder reminders sent before the pack runs out'] },
    ], note: "Pack QR codes follow Nirapara's packaging print schedule. We supply the code system and artwork specifications for the print team." },
    { title: 'Retention, Gifting & B2B', cards: [
      { title: 'Subscriptions & Repeat', tone: 'grey', points: ['Subscribe and save 5 to 10%', 'Skip or pause anytime', 'WhatsApp reminder with one-tap reorder'] },
      { title: 'Loyalty & Reviews', tone: 'grey', points: ['Points for orders, reviews and recipe photos', 'Monthly Star Recipe rewards', 'Referral rewards and photo reviews'] },
      { title: 'WhatsApp & Engagement', tone: 'red', points: ['Order and delivery updates', 'Abandoned-cart recovery messages', 'WhatsApp recipe club and ordering', 'Back-in-stock and email sign-ups'] },
      { title: 'Gifting, B2B & GCC', tone: 'dark', points: ['Premium hampers with custom messages', 'Corporate and bulk order flow', 'Dealer enquiries stored in Shopify', 'GCC storefront in local currency'] },
    ], note: { bold: 'Why it matters.', text: 'Rice, podi, oil and masalas are monthly staples. Subscriptions, rewards and timely WhatsApp reminders turn one order into a regular, and the GCC storefront serves families abroad who cannot find Nirapara on local shelves.' } },
    { title: 'Checkout, SEO & Security', cards: [
      { title: 'Checkout, Payments & Shipping', tone: 'grey', points: ['Mobile-first, one-page checkout', 'UPI, cards, wallets and COD through Razorpay or Cashfree', 'Pincode delivery check and Shiprocket shipping', 'Prepaid reward to cut cash-on-delivery returns', 'Order confirmation with tracking details'] },
      { title: 'SEO, Migration & Analytics', tone: 'red', points: ['301 redirects from every current recipe and product URL', 'Product and recipe SEO, schema, metadata and sitemap', 'Google Shopping feed', 'GA4, Meta and Google Ads tracking with a monthly report'] },
      { title: 'Security, Accounts & Order Tracking', tone: 'dark', points: ['SSL, spam and bot protection', 'Basic fraud-prevention settings', 'Customer accounts with orders and reward points', 'Shipment tracking and order notifications'] },
    ] },
  ],
  timeline: {
    intro: 'The core store goes live in 5 weeks from sign-off. Growth features follow once real order data comes in.',
    steps: [
      { label: 'Week 1', title: 'Discovery & Design', text: 'Kick-off, catalogue and pricing review, sitemap, home and product page designs.' },
      { label: 'Week 2', title: 'Design Approval & Store Setup', text: 'Design sign-off, Shopify setup, payments and shipping configured, theme build begins.' },
      { label: 'Week 3', title: 'Catalogue & Recipe Commerce', text: 'Products, kits, shop by dish, recipe-to-cart and content migration.' },
      { label: 'Week 4', title: 'Integrations & Pack QR', text: 'Pack QR and purity pages, WhatsApp, reviews, analytics and SEO redirects.' },
      { label: 'Week 5', title: 'Testing, Training & Launch', text: 'Mobile and checkout testing, admin training and go-live.' },
    ],
    after: [
      { label: 'After launch · Months 1 to 3', title: 'First 90 Days', text: 'Bundles, subscriptions, WhatsApp journeys and the first festive campaign.' },
      { label: 'Month 4 onward', title: 'Scale', text: 'Loyalty, GCC storefront, corporate gifting, content and SEO growth.' },
    ],
  },
  investment: {
    intro: 'Module-wise pricing for the 5-week store build.',
    retainer_bold: 'Post-launch growth.',
    retainer: 'Phase 2 (first 90 days) and Phase 3 (scale) run as a monthly retainer, quoted separately.',
    note: 'Excludes the Shopify plan, app subscriptions, domain, WhatsApp messaging charges, ad spend, photography, video and pack printing.',
  },
  deliverables: {
    items: ['Shopify brand store in English and Malayalam', 'India and GCC storefronts', 'Recipe-to-cart, kits and bundles', 'Pack QR rewards and purity pages', 'Subscriptions, loyalty and WhatsApp journeys', 'SEO-safe migration with redirects', 'Admin training and usage guide', '90 days of post-launch support'],
    note: 'All deliverables are handed over with full access and ownership on completion.',
  },
  terms: [
    'Payment in three stages: 33.33% advance to begin, 33.33% after design approval and 33.34% before launch and handover. All prices exclude GST.',
    'Pricing covers the agreed scope. Additional features or changes need separate estimation and approval.',
    'The Shopify plan, apps, WhatsApp messaging, transaction fees and subscriptions are paid by Nirapara unless specifically included.',
    "Store pricing follows Nirapara's own retail and marketplace agreements.",
    "Pack QR rollout follows Nirapara's packaging print schedule.",
    'Timelines depend on client approvals, content, required access and any group IT or data approvals.',
  ],
  closing: "Let's Make Nirapara the First Choice, Not the Third.",
  photos: { cover: 'asset:html-docs/img/sample-cover.webp', strip: 'asset:html-docs/img/sample-strip.webp' },
};
// The reference's investment rows (prices were placeholders there).
export const NIRAPARA_ITEMS = ['Discovery & Store Strategy', 'Custom UI/UX Design (English & Malayalam)', 'Shopify Setup & Theme Development', 'Catalogue, Recipe Commerce & Content Migration', 'Pack QR Rewards & Purity Report System', 'Subscriptions, Loyalty & WhatsApp Integrations', 'GCC Storefront & Shipping Setup', 'SEO, Migration & Performance'];
