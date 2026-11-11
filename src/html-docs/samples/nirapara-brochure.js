// The reference brochure's content (Downloads/Nirapara Ecom Growth Brochure - Premium.pdf, 2026-11-11), word for word.
// Used for the template preview, the exactness check against that PDF, and as the example given to Claude.
export const NIRAPARA_BROCHURE = {
  tag: 'Ecommerce growth plan',
  cover: {
    script_word: 'നിറപറ',
    title: 'From third option to', title_em: 'first choice.',
    subtitle: 'How a brand-owned online store can build demand for Nirapara, win the decision at every shelf, and grow direct orders alongside Blinkit, Instamart, Amazon and supermarkets.',
  },
  challenge: {
    label: 'The challenge', title: 'Everywhere, but not always the first pick',
    lead: 'Nirapara is on the shelf in supermarkets and neighbourhood stores, and online on Blinkit, Instamart, Amazon, Flipkart, BigBasket and Reliance Smart.',
    statement: 'Availability is not the problem. Preference is.',
    rows: [
      { title: 'In the store aisle', points: ['A mother asks for chilli powder and sees five brands at similar prices.', 'She decides in seconds, from habit, a familiar pack or an offer.', "The shopkeeper's suggestion often settles it."] },
      { title: 'On marketplaces', points: ['Every rice, podi and pickle brand sits on one screen.', 'Choice comes down to price, delivery speed and rating.', 'The platform owns the customer, the data and the relationship.'] },
      { title: 'On the current website', points: ['Product pages show the range, but no price, cart or checkout.', 'Homepage banners send visitors to Blinkit.', 'Recipes, blog and contests build love, but nothing turns it into a purchase.'] },
    ],
    gap: 'Nirapara reaches every kitchen, but it does not yet know who buys, why they choose it, or when they will buy again.',
  },
  opportunity: {
    label: 'The opportunity', title: 'Why a brand-owned store changes the game',
    items: [
      { title: 'Create demand first', text: 'Recipes, videos and campaigns make shoppers ask for Nirapara by name, before they reach a shelf or open an app.' },
      { title: 'Offer what others cannot', text: 'Kits, monthly boxes, subscriptions, festive hampers and rewards built around how Kerala families cook.' },
      { title: 'Own the customer', text: 'Email, WhatsApp and purchase history stay with the brand, so repeat orders are planned, not left to chance.' },
      { title: 'Keep more margin', text: 'No marketplace commission on direct orders. The saving funds offers, free shipping and loyalty.' },
      { title: 'Win the offline shelf', text: 'A QR on every pack links each store purchase to the brand, with rewards that bring her back to Nirapara.' },
      { title: 'Test new launches', text: 'Sample and refine new lines, like curry pastes, with real buyers before a full retail rollout.' },
    ],
    approach: { title: 'Complement every channel, compete with none', text: 'The store keeps price parity with marketplace listings and wins on what they cannot match: bundles, subscriptions, hampers, recipe kits and rewards. Shops and quick commerce keep their role for everyday, impulse buying.' },
  },
  journey: {
    label: 'The shelf moment', title: 'Why she picks Nirapara',
    lead: 'She chooses a spice brand in seconds, from memory. The store cannot stand at the shelf, so it wins the choice before she gets there and rewards it after.',
    highlight: 2,
    steps: [
      { title: 'Planning the meal', quote: 'How did Amma make her fish curry?', text: 'Malayalam recipe videos, each tied to one Nirapara product, so the dish and the brand become one memory.' },
      { title: 'Writing the list', quote: 'Fish curry masala, chilli, puttu podi.', text: 'Dish-first naming and a WhatsApp recipe club, so the list says "Nirapara fish curry masala".' },
      { title: 'At the shelf', quote: 'Is it pure? Do I get anything extra?', text: "A QR on every pack shows that batch's quality report and gives points, contest entries or a free recipe kit." },
      { title: 'After cooking', quote: 'That came out well.', text: 'Rewards for reviews and recipe photos, and a reminder before the pack runs out.' },
    ],
    bridge: { title: 'The pack QR is the bridge.', text: 'Every purchase, from a kirana in Kalady to a supermarket in Dubai, becomes a direct relationship, and shows which products, towns and stores are winning.' },
  },
  plan: {
    label: 'The plan', title: 'Fourteen ideas across three goals',
    goals: [
      { name: 'Attract', sub: 'Bring shoppers to Nirapara' },
      { name: 'Convert', sub: 'Turn visits into orders' },
      { name: 'Retain', sub: 'Make every customer a regular', note: 'Pack QR rewards (11) also feed this goal: every scan adds a known customer to WhatsApp and reorder journeys.' },
    ],
  },
  idea_titles: ['Win the basket, not just the click', 'Reach further, earn trust, build loyalty', 'Make buying easy, and Nirapara easy to find', 'Win the shelf you are already on'],
  ideas: [
    { goal: 0, title: 'Recipe-led commerce', points: ['Make the existing recipes, blog and contests shoppable.', 'Shop this recipe: every ingredient to cart in one tap.', 'Ready kits: Puttu Breakfast, Sadya and Fish Curry.'], why: 'Pulls 3 to 4 products into one order.' },
    { goal: 1, title: 'Bundles and combos', points: ['Monthly Kerala Kitchen Box: rice, podi, spices and oil.', 'Breakfast, curry masala and pickle combos.'], why: 'Bundle pricing is hard to compare, so shoppers stop choosing on price alone.' },
    { goal: 2, title: 'Subscription and repeat purchase', points: ['Rice, oil, podi and masalas are monthly staples.', 'Subscribe and save 5 to 10%; skip or pause anytime.', 'WhatsApp reminder with one-tap reorder before the pack runs out.'], why: 'The biggest lever for customer lifetime value.' },
    { goal: 0, title: 'Festive and seasonal campaigns', points: ['Onam Sadya boxes, Vishu, Ramadan and Eid, Christmas and New Year.', 'Pre-order windows with early-bird offers.'], why: 'Builds demand before the season starts.' },
    { goal: 0, title: 'NRI and GCC selling', points: ['The Gulf is already a core market for Nirapara.', 'A UAE and GCC storefront in local currency, plus international shipping.'], why: 'Send Kerala home: a gifting channel for families abroad.' },
    { goal: 1, title: 'Gifting and hampers', points: ['Premium hampers with custom messages.', 'Corporate gifting and bulk orders for Onam and Diwali.'], why: 'Builds on the bulk purchase and dealer enquiries already on the site.' },
    { goal: 1, title: 'Trust and proof', points: ['Verified reviews with photos, plus recipe-contest UGC.', 'Farm-to-pack story: Kalady facility, quality checks, no added colours.', 'Short cooking videos for puttu, appam and palappam.'] },
    { goal: 2, title: 'Loyalty and community', points: ['Points for orders, reviews and recipe submissions.', 'Monthly Star Recipe winners get rewards.', 'Referral rewards and a WhatsApp recipe club.'] },
    { goal: 1, title: 'Conversion basics', intro: 'What the new store must get right from day one.', points: ['Fast, mobile-first experience in English and Malayalam.', 'UPI, cards, wallets and COD with a one-page checkout.', 'Pincode delivery check before checkout.', 'Free-shipping progress bar: add a little more for free delivery.', 'Frequently bought together and cart cross-sell.', 'Small reward for prepaid orders to cut COD returns.'] },
    { goal: 0, title: 'Traffic and SEO', intro: 'Bring buyers straight to product and recipe pages.', points: ['Product and recipe SEO, such as puttu podi recipe and Kerala sambar masala.', 'All current recipe and product URLs redirected, so no ranking is lost.', 'Google Shopping, shoppable Instagram and YouTube.', 'WhatsApp catalogue and abandoned-cart recovery.', 'Pack QR codes that send shelf buyers to the site.'] },
    { goal: 0, new: true, featured: true, title: 'Pack QR: buy anywhere, earn here', short: 'Pack QR rewards', points: ['A unique code inside every retail pack.', 'Scan for points, contest entries or a free recipe kit.', 'Turns shop and Blinkit buyers into known customers.', 'Shows which products, towns and stores are winning.'] },
    { goal: 1, new: true, title: 'Batch purity reports', points: ["Scan the pack to see that batch's lab checks.", 'A Quality page with certifications and process.'], why: 'Answers the first question every mother asks about spices: is it pure?' },
    { goal: 0, new: true, title: 'Dish-first catalogue', points: ['Shop by dish: Sambar, Fish Curry, Chicken Roast, Puttu.', 'Each product owns a dish in her memory, not just a category.'], why: 'Matches how families search and cook.' },
    { goal: 1, new: true, title: 'Malayalam and WhatsApp ordering', short: 'Malayalam and WhatsApp', points: ['Full Malayalam store alongside English.', 'Order or reorder in a WhatsApp chat.'], why: 'Reaches buyers who will never download an app.' },
  ],
  economics: {
    label: 'Order economics', new: true, title: 'Every order is a basket, never a single pack',
    lead: 'One chilli powder pack cannot carry its own packing and courier cost. The store is built so that profitable baskets are the natural way to buy.',
    figures: [
      { value: '₹299', title: 'Minimum order', text: 'Stops loss-making one-pack orders.' },
      { value: '₹599', title: 'Free-shipping threshold', text: 'The progress bar nudges one more item into every cart.' },
      { value: '₹399–999', title: 'Kits and monthly boxes', text: 'Priced as a meal or a month, so shoppers stop comparing per gram.' },
      { value: 'Same MRP', title: 'Price parity', text: 'Protects retail and marketplace partners. The store wins on bundles and rewards.' },
      { value: 'UPI first', title: 'Prepaid reward', text: 'Bonus points on prepaid orders cut cash-on-delivery returns.' },
      { value: 'GCC', title: 'Larger hampers abroad', text: 'Bigger baskets and gifting value cover international shipping.' },
    ],
    note: 'Working figures for discussion. Final values are set after the catalogue, pricing and courier review.',
  },
  delivery: {
    label: 'Delivery', title: 'What we build, and how it rolls out', includes_title: 'The Shopify store includes',
    includes: ['Catalogue with pack sizes, pricing, shop by dish', 'UPI, COD, wallets and one-page checkout', 'Recipe-to-cart and ready kits', 'Pack QR codes, rewards and purity pages', 'Subscriptions and loyalty programme', 'Gifting, bulk and dealer enquiry flows', 'Reviews and user-generated content', 'English and Malayalam; India and GCC storefronts', 'Recipe and blog migration with SEO redirects', 'Analytics, CRM and WhatsApp integration'],
    phases: [
      { when: 'About 10 weeks', title: 'Phase 1 · Launch', text: 'Core store live: catalogue, checkout, recipe-to-cart, pack QR and purity pages, SEO migration and analytics.' },
      { when: 'First 90 days', title: 'Phase 2 · Grow', text: 'Bundles, subscriptions, first festive campaign, reviews, retargeting and WhatsApp journeys.' },
      { when: 'Ongoing', title: 'Phase 3 · Scale', text: 'Loyalty, GCC storefront, corporate gifting, and ongoing content and SEO growth.' },
    ],
  },
  results: {
    label: 'Results and next steps', title: 'How we will measure success',
    metrics: ['Conversion rate', 'Average order value', 'Repeat purchase rate', 'Recipe-to-cart rate', 'Pack QR scans and sign-ups', 'Share of direct orders', 'Cost per acquisition', 'Brand search volume'],
    note: 'Reported monthly. Targets are set together after the first 30 days of live data.',
    next: ['Discovery call to align on goals, products and priorities', 'Catalogue, pricing and marketplace-parity review', 'Detailed proposal with scope, timeline and investment'],
    cta_before: 'Let us make Nirapara the', cta_em: 'first choice', cta_after: ', not the third.',
  },
};
