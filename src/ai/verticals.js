/*
 * Vertical playbooks (owner, 2026-11-05: "we need creative brochures with premium quality with correct pitch and
 * contents and relevancy according to the business vertical and their needs. the case of proposals also").
 * What Codeace knows about each of the owner's verticals: how its customers buy, what the owner cares about, what
 * their website must do, the angles that work, the objections, the proof, the tone and the look, and stock photo
 * searches. All three Claude jobs get the lead's playbook, so the call, the brochure and the proposal speak the
 * vertical's language. These are guides, not facts about the client: the research and the CRM record come first.
 */
export const PLAYBOOKS = {
  'FMCG & Spices': {
    buyers: 'Households buying for the kitchen; retailers, distributors and NRIs ordering in bulk; gift buyers at festivals.',
    journey: 'They discover a brand through a shop shelf, WhatsApp forward or Instagram reel, check purity and origin, compare pack sizes and price, then reorder by habit. Distributors want a catalogue, MOQ and margins.',
    owner_cares: ['steady repeat orders', 'reaching retailers and distributors beyond the district', 'export and NRI orders', 'standing out from big brands on trust and origin'],
    website_must: ['product catalogue with pack sizes and prices', 'origin and process story (farm, sourcing, grinding, hygiene)', 'retailer / distributor enquiry form with MOQ', 'online order with UPI and COD, WhatsApp order button', 'recipes that use the products', 'certifications (FSSAI, organic) shown clearly', 'reorder and subscription for regulars'],
    angles: ['purity you can trace back to the farm', 'a distributor-ready catalogue that sells while you sleep', 'turning one-time buyers into monthly reorders', 'festival and gift season ordering'],
    objections: [['We sell through shops, not online', 'The site is a catalogue for retailers and distributors first; direct orders are a bonus.'], ['Amazon already sells us', 'Marketplaces own the customer; your site keeps the reorder and the margin.']],
    proof: ['FSSAI / organic certificates', 'years in business and region served', 'retailer count', 'reviews mentioning taste and freshness'],
    tone: 'warm, honest, rooted in place; sensory words about aroma, colour and freshness',
    look: 'earthy spice colours (turmeric, chilli, cardamom green) on a warm light ground; a serif with character for headings',
    fonts: ['caslon-sourceserif', 'dmserif-archivo', 'playfair-work'],
    images: ['indian spices bowls top view', 'spice market colorful', 'cooking with spices kitchen', 'spice packaging jars', 'cardamom pepper plantation kerala'],
  },
  'Clothing & Apparel': {
    buyers: 'Style-aware women and men, wedding and festival shoppers, mothers buying for families, NRIs.',
    journey: 'Inspired on Instagram, they look for the collection, sizes and price, ask on WhatsApp, often visit the store for weddings, and come back for the next season.',
    owner_cares: ['moving new collections fast', 'fewer "price please" DMs and more orders', 'wedding and festival rush', 'returns and sizing questions'],
    website_must: ['collection pages by occasion (wedding, festive, everyday)', 'size guide and fabric details', 'Instagram feed and shoppable looks', 'WhatsApp enquiry per product', 'online payment, COD and easy returns policy', 'store visit booking for bridal / custom work', 'new arrivals and offers that update easily'],
    angles: ['every new collection live on the day it lands', 'from Instagram likes to paid orders', 'bridal appointments booked online', 'a store that sells beyond its street'],
    objections: [['Customers want to touch the fabric', 'The site sends them to the store ready to buy, and books the visit.'], ['Instagram is enough', 'Instagram brings attention; the site answers sizes and prices and takes payment.']],
    proof: ['years and number of collections', 'bridal clients served', 'Instagram following', 'reviews about fit and finish'],
    tone: 'confident, visual, of the moment; short lines; talk about occasions and how people feel wearing it',
    look: 'fashion editorial: generous white space, one bold accent from the collection, a high-contrast serif or a clean geometric sans',
    fonts: ['bodoni-jost', 'playfair-work', 'jost'],
    images: ['fashion boutique clothing rack', 'indian saree fabric detail', 'woman shopping boutique', 'tailor stitching fabric', 'clothing store interior'],
  },
  'Toys & Baby Products': {
    buyers: 'Parents (mostly mothers) aged 25–40, grandparents and relatives buying gifts, schools and play schools.',
    journey: 'They search by age and need, check safety and material, read reviews from other parents, compare with Amazon, and buy for birthdays and milestones.',
    owner_cares: ['being trusted on safety', 'gift and birthday season sales', 'competing with marketplaces', 'repeat buying as the child grows'],
    website_must: ['shop by age and by occasion', 'safety, material and certification on every product', 'gift wrapping and message, delivery date picker', 'parent reviews with photos', 'WhatsApp help for choosing', 'bundles and growing-up subscriptions', 'store locator and click-and-collect'],
    angles: ['the safe choice parents can check in seconds', 'birthday gifts sorted in two minutes', 'growing with the child: from newborn to school', 'a local shop parents trust, open online'],
    objections: [['Parents buy on Amazon', 'They trust a shop they know; the site gives them the same ease plus advice.'], ['Our range changes often', 'Products and stock update from a simple admin.']],
    proof: ['safety certifications (BIS)', 'families served', 'parent reviews', 'school / play school clients'],
    tone: 'warm, reassuring and light; never childish; speak to the parent',
    look: 'soft, friendly colours with one bright accent, rounded shapes; a playful display heading with a clean readable body',
    fonts: ['abril-jost', 'dmserif-archivo', 'jost'],
    images: ['wooden toys colorful', 'baby nursery soft light', 'child playing with toys', 'gift wrapped toy box', 'mother and baby playing'],
  },
  'Wellness & Beauty': {
    buyers: 'Women and men seeking care: salon and spa clients, wellness travellers, patients for Ayurveda, physio or skin treatment, international guests for retreats.',
    journey: 'They search for the treatment and the place, look at photos, therapists or doctors, read reviews, check prices or packages and availability, and book by phone or WhatsApp; retreat guests compare programmes, stay and transfers weeks ahead.',
    owner_cares: ['a full appointment book and fewer no-shows', 'premium positioning (price is not the first question)', 'international and out-of-state guests', 'trust in the doctors, therapists and hygiene'],
    website_must: ['treatments or programmes with duration, benefits and price or package', 'online booking with deposit, or enquiry with preferred dates', 'doctors, therapists and stylists with their qualifications', 'rooms, facilities and the stay (for retreats)', 'before / after and guest stories (with consent)', 'location, transfers and how to reach', 'WhatsApp and call buttons; multilingual for foreign guests'],
    angles: ['rest begins before the guest arrives: booking that feels like the stay', 'a calm, premium first impression that justifies the price', 'booked while you are with a client', 'trusted care shown through the people who give it'],
    objections: [['Our clients come by word of mouth', 'Word of mouth now ends with a search; the site turns that search into a booking.'], ['We are always busy', 'The site fills quiet weekdays and takes deposits that stop no-shows.']],
    proof: ['qualified doctors / therapists and years of practice', 'certifications (AYUSH, NABH where true)', 'guest reviews and ratings', 'international guests served'],
    tone: 'calm, assured, caring; unhurried sentences; sensory but precise; never clinical or hype',
    look: 'quiet luxury: natural greens, sand, deep teal or clay with gold; lots of air; an elegant serif heading',
    fonts: ['playfair-work', 'garamond-franklin', 'caslon-sourceserif', 'bodoni-jost'],
    images: ['ayurveda massage oil treatment', 'spa treatment room calm', 'herbal medicine ingredients bowl', 'yoga meditation nature morning', 'beauty salon interior luxury'],
  },
  'Automotive Parts': {
    buyers: 'Mechanics and garages, fleet owners, vehicle owners looking for a part, dealers in other towns.',
    journey: 'They search by vehicle model and part name or number, check availability and price, call to confirm fitment, and want delivery fast; garages reorder the same parts every week.',
    owner_cares: ['phone calls asking "do you have this part" all day', 'reaching garages and dealers across the state', 'stock moving, not sitting', 'credit customers and reorders'],
    website_must: ['search by vehicle make, model, year and part number', 'stock status and price (or "call for price" for trade)', 'trade / garage login with their prices', 'enquiry and order on WhatsApp with the part photo', 'delivery areas and same-day options', 'brands carried and genuine-part guarantee', 'Google Maps listing that says open now'],
    angles: ['the part, the fit and the price before they call', 'every garage in the district ordering from one page', 'genuine parts customers can check', 'calls turned into orders'],
    objections: [['Our customers just call', 'The site answers the first question so calls become orders, not stock checks.'], ['Too many parts to list', 'We start with the fast movers and the brands; the rest is a search-and-enquire form.']],
    proof: ['brands and OEMs supplied', 'years in trade', 'garages served', 'same-day delivery record'],
    tone: 'direct, practical, no fluff; numbers and specifics; respect for the mechanic\'s time',
    look: 'industrial and solid: charcoal, steel blue, a strong safety-orange or yellow accent; condensed bold headings',
    fonts: ['bebas-plex', 'oswald-franklin', 'franklin'],
    images: ['auto parts warehouse shelves', 'mechanic workshop car engine', 'car brake disc closeup', 'tyres stacked garage', 'mechanic tools workbench'],
  },
  'Home Decor, Furniture & Building Materials': {
    buyers: 'Families building or renovating a home, architects and interior designers, contractors, NRIs building in Kerala.',
    journey: 'They collect ideas for months (Instagram, Pinterest, showroom visits), compare finishes and prices, ask for samples and quotes, and visit the showroom with the family before a big order.',
    owner_cares: ['qualified showroom visits, not price shoppers', 'architects and contractors recommending them', 'NRI clients deciding from abroad', 'showing the full range without a 2-hour visit'],
    website_must: ['range by room and by material, with finishes and sizes', 'project gallery (homes done, with the area)', 'quote and sample request', 'showroom visit booking and video call for NRIs', 'architect / contractor trade page', 'brands carried and warranty', 'visualiser or mood boards where possible'],
    angles: ['the showroom, open every hour for families planning from anywhere', 'from mood board to a booked showroom visit', 'architects send clients because the range is easy to share', 'quotes in a day, not a week'],
    objections: [['People must see the material', 'The site books the visit with the right shortlist, so the visit ends in an order.'], ['Prices change too often', 'Show ranges and ask for a quote; the site captures the lead.']],
    proof: ['homes and projects completed', 'brands and dealerships', 'architects who work with them', 'years in business'],
    tone: 'considered, aspirational but grounded; talk about homes, light, materials and the family who will live there',
    look: 'architectural: warm neutrals, stone, wood and one deep accent; a refined serif or a geometric sans; strong grids',
    fonts: ['jost', 'garamond-franklin', 'dmserif-archivo', 'franklin'],
    images: ['modern living room interior wood', 'furniture showroom', 'kitchen interior design', 'tiles marble texture', 'architect plans home interior'],
  },
  'Jewellery & Accessories': {
    buyers: 'Brides and their families, gift buyers for anniversaries and festivals, NRIs, young professionals buying lightweight daily wear.',
    journey: 'They browse designs for weeks, check gold rate, making charges and purity, look at bridal collections, and visit the showroom (often with family) to buy; trust and hallmarking decide.',
    owner_cares: ['bridal season footfall', 'trust on purity and fair making charges', 'younger buyers who shop online first', 'NRI orders and video-call selection'],
    website_must: ['collections by occasion (bridal, daily, gifts) with weight and price guide', 'today\'s gold rate and making-charge clarity', 'BIS hallmark and certification shown', 'appointment and video-call booking for bridal', 'try-at-home or reserve-in-store', 'gold savings scheme sign-up', 'store locations and trust story'],
    angles: ['bridal shopping that starts at home, with the family', 'trust you can see: hallmark, rate and charges up front', 'young buyers who choose online and buy in store', 'NRI families choosing by video call'],
    objections: [['Jewellery is bought in person', 'Yes: the site books that visit with the designs already chosen.'], ['Showing prices invites comparison', 'Show weights and today\'s rate; clarity is what wins trust.']],
    proof: ['BIS hallmarking', 'years and generations in business', 'bridal clients', 'reviews about trust'],
    tone: 'refined, warm, celebratory; precise about purity; never loud',
    look: 'luxury: deep jewel tones (emerald, maroon, navy) or ivory with gold; high-contrast serif headings',
    fonts: ['bodoni-jost', 'playfair-work', 'garamond-franklin'],
    images: ['gold jewellery necklace closeup', 'indian bridal jewelry', 'jewelry store display', 'diamond ring luxury', 'jeweler crafting gold'],
  },
  Other: {
    buyers: 'Local customers and businesses who search before they call.',
    journey: 'They search, compare two or three options on the phone, check reviews and photos, and call or WhatsApp the one that looks most trustworthy.',
    owner_cares: ['more enquiries', 'looking as good as bigger competitors', 'less time answering the same questions'],
    website_must: ['clear services with prices or packages', 'proof: work done, reviews', 'enquiry form, WhatsApp and call buttons', 'Google Maps listing and local pages', 'fast on mobile'],
    angles: ['found first, trusted fastest', 'questions answered before the call', 'a site that brings enquiries, not just looks'],
    objections: [['We get work by word of mouth', 'Word of mouth ends with a search; the site closes it.']],
    proof: ['years in business', 'clients served', 'reviews'],
    tone: 'clear, friendly, confident',
    look: 'clean and confident; one strong brand colour',
    fonts: ['franklin', 'garamond-franklin', 'dmserif-archivo'],
    images: ['small business owner shop', 'team working office', 'customer service smile'],
  },
};

const WORDS = [
  ['FMCG & Spices', /spice|fmcg|food|grocery|bakery|sweet|snack|tea|coffee|masala|condiment|pickle/i],
  ['Clothing & Apparel', /cloth|apparel|fashion|boutique|garment|textile|saree|wear|tailor/i],
  ['Toys & Baby Products', /toy|baby|kid|child|infant/i],
  ['Wellness & Beauty', /wellness|beauty|salon|spa|clinic|ayurved|physio|health|fitness|yoga|derma|hospital|retreat|resort|therap/i],
  ['Automotive Parts', /auto|car |cars|bike|vehicle|spare|tyre|motor|garage/i],
  ['Home Decor, Furniture & Building Materials', /decor|furniture|interior|tile|hardware|building|cement|paint|sanitary|home|kitchen|granite/i],
  ['Jewellery & Accessories', /jewel|gold|silver|diamond|accessor|watch/i],
];
/** The vertical for a lead from any text about it (industry, company name, CRM description). */
export const verticalFor = (...texts) => (WORDS.find(([, re]) => re.test(texts.filter(Boolean).join(' '))) || ['Other'])[0];
export const playbookFor = (vertical) => PLAYBOOKS[vertical] || PLAYBOOKS.Other;

/** The playbook as a prompt section. */
export function playbookSection(vertical) {
  const p = playbookFor(vertical);
  return `<vertical_playbook vertical="${vertical}">
Codeace's knowledge of this vertical. Use it to choose the angle, the features and the words; confirm and sharpen it with this business's own research and CRM record (the business's facts always win, and never present the playbook as facts about the client).
- Their customers: ${p.buyers}
- How customers buy: ${p.journey}
- What the owner cares about: ${p.owner_cares.join('; ')}
- What their website must do: ${p.website_must.join('; ')}
- Angles that work: ${p.angles.join('; ')}
- Objections and honest answers: ${p.objections.map(([o, a]) => `"${o}" → ${a}`).join(' | ')}
- Proof that persuades (only if true for this business or for Codeace): ${p.proof.join('; ')}
- Tone: ${p.tone}
- Look: ${p.look}; font pairings that suit: ${p.fonts.join(', ')}
</vertical_playbook>`;
}
