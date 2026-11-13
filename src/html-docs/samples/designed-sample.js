// A short sample of the designed brochure (template preview and sample PDF only): a made-up boutique, no photos, four
// pages composed from the CodeAce design system. Real brochures are written per lead from the brief.
export const DESIGNED_SAMPLE = {
  story: 'A boutique that is loved in its street can sell to the whole state.',
  theme: 'ivory-maroon', fonts: 'playfair-manrope', doc_name: 'Growth Brochure',
  images: [],
  pages: [
    { name: 'Cover', html: `<section class="page cover--type"><div class="cover"><p class="eyebrow">Shopify store growth brochure</p>
<h1 class="h-display">From Window Shoppers<br>To Paid Orders</h1><p class="lead">A store that answers questions on fabric, size and delivery before the shopper leaves.</p>
<div class="stats"><div class="stat"><strong>5 weeks</strong><span>to launch on Shopify</span></div><div class="stat"><strong>8</strong><span>growth ideas</span></div></div></div></section>` },
    { name: 'The challenge', html: `<section class="page"><div class="head"><p class="eyebrow">01 · The challenge</p><h2 class="h-display">Loved Locally,<br>Hard to Find</h2>
<p class="lead">Shoppers find the boutique on Instagram, then <strong>leave to ask a question</strong> nobody answers fast.</p></div>
<div class="grid-3"><div class="card"><span class="num">01</span><h3>On search</h3><p>The shop does not show for the fabrics it sells best.</p></div>
<div class="card"><span class="num">02</span><h3>On the product page</h3><p>No size guide, so questions go to direct messages.</p></div>
<div class="card card--accent"><span class="num">03</span><h3>After the order</h3><p>No reminder to come back for the festival collection.</p></div></div></section>` },
    { name: 'How we fix it', html: `<section class="page"><div class="head"><p class="eyebrow">02 · The plan</p><h2 class="h-display">Question In,<br>Order Out</h2>
<p class="lead">Each gap gets one fix the team can run without help.</p></div>
<div class="split"><div class="split__row"><p>Shoppers ask about fabric in direct messages</p><p>A WhatsApp button on every product</p></div>
<div class="split__row"><p>Festival buyers cannot find the right edit</p><p>Collections by occasion, ready before the season</p></div>
<div class="split__row"><p>Out-of-stock pieces end the visit</p><p>Back-in-stock alerts that bring the buyer back</p></div></div></section>` },
    { name: 'What we build', html: `<section class="page page--dark"><div class="head"><p class="eyebrow">03 · Delivery</p><h2 class="h-display">Live on Shopify<br>in Five Weeks</h2>
<p class="lead">We move the store, connect payments and shipping, and hand it to your team.</p></div>
<div class="row"><ul class="checklist"><li>Theme in your brand</li><li>Products and photos moved</li><li>UPI, card and COD payments</li><li>Shipping rates and tracking</li><li>WhatsApp on every product</li><li>Reviews after delivery</li></ul>
<p class="statement">Your next step: a 30-minute call to map the move.</p></div></section>` },
  ],
};
