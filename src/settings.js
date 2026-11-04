import { get, all, run } from './db.js';

export const DEFAULT_SETTINGS = {
  agency: {
    name: 'Axilume',
    sender_name: 'Arjun',
    email: 'hello@axilume.com',
    phone: '+91 8296 93 8296',
    website: 'https://axilume.com',
    address: 'Sahya Building, Gov Cyberpark, Kozhikode, Kerala, India',
    review_link: 'https://g.page/r/your-google-review-link',
    portfolio: [
      { name: 'Spice Route Restaurant', result: 'Online orders up 3x in 4 months' },
      { name: 'Apex Physio Clinic', result: '120+ appointment bookings per month from Google' },
      { name: 'Urban Threads', result: 'Shopify store launched in 3 weeks, ₹8L GMV in Q1' },
    ],
  },
  schedule: { enabled: true, daily_time: '09:00', timezone: 'Asia/Kolkata', sweep_minutes: 15 },
  sending: {
    window_start: '09:00',
    window_end: '19:00',
    send_days: [1, 2, 3, 4, 5, 6],
    daily_cap_email: 100,
    daily_cap_whatsapp: 50,
    throttle_ms: 1500,
    channel_priority: ['whatsapp', 'email'],
    default_country_code: '91',
  },
  sequence: { follow_up_1_days: 3, follow_up_2_days: 4, close_after_days: 5, proposal_reminder_days: 3, invoice_reminder_days: 3 },
  automation: {
    dry_run: false,
    auto_approve_brochure: false,
    auto_send_booking_link: true,
    auto_proposal_after_meeting: true,
    // Tools that run by themselves in the pipeline (designed documents from the default templates)
    auto_tools: { script: true, brochure: true, proposal: true },
    proposal_needs_ok: true, // an automatic proposal waits on Today until someone presses Send
    min_score: 25,
    daily_digest: true,
  },
  /**
   * Team CRM: Atomic CRM on its own Supabase project (src/atomic.js; keys CRM_SUPABASE_URL + CRM_SUPABASE_SECRET_KEY).
   * stages: CRM deal stage value → what AxiFlow does (interested | proposal | won | lost | nurture | not_interested | ignore).
   * A new deal in a stage without an entry counts as interested. write_stages: AxiFlow stage → CRM deal stage to set.
   */
  atomic: {
    enabled: true,
    read_only: true, // only read from the CRM; nothing is written back until this is switched off
    poll_seconds: 60,
    deal_means_consent: false, // true = an open deal counts as WhatsApp/email consent for the intro
    stages: { opportunity: 'interested', interested: 'interested', 'proposal-sent': 'proposal', 'send-proposal': 'proposal', 'in-negociation': 'ignore', won: 'won', lost: 'lost', delayed: 'nurture', 'not-interested': 'not_interested' },
    write_stages: { proposal_sent: 'proposal-sent', won: 'won', lost: 'lost' },
    notes: true, // deal notes: call script, brochure, replies, proposal, meetings
    call_tasks: true, // call requests become CRM tasks on the contact
    pitch_point: true, // the call script's pitch point goes to companies.pitch_point
    brochures_table: true, // brochure links go to the CRM's brochures table (and pending requests are answered)
  },
  billing: { currency: 'INR', tax_label: 'GST', tax_pct: 18, advance_pct: 50, invoice_prefix: 'AWS' },
  meeting: { slots: ['11:00', '15:00', '17:30'], days_ahead: 7, duration_min: 30, meet_link: 'https://meet.google.com/your-room' },
  packages: [
    { id: 'landing', name: 'Landing Page', price: 15000, timeline: '1 week', includes: ['1 high-converting page', 'Lead form + WhatsApp button', 'Mobile-first design', 'Basic SEO'] },
    { id: 'website', name: 'Business Website', price: 45000, timeline: '3 weeks', includes: ['Up to 8 pages', 'Custom design', 'Contact & enquiry forms', 'Google Maps & WhatsApp chat', 'On-page SEO + Analytics', 'Speed optimised'] },
    { id: 'redesign', name: 'Website Redesign', price: 40000, timeline: '3 weeks', includes: ['Modern redesign of existing site', 'Content migration', 'Mobile & speed fixes', 'SEO-safe redirects'] },
    { id: 'ecommerce', name: 'E-commerce Store', price: 95000, timeline: '5 weeks', includes: ['Product catalogue & cart', 'Payment gateway (UPI/cards)', 'Order & inventory admin', 'Shipping integration', 'SEO + Analytics'] },
    { id: 'webapp', name: 'Custom Web Application', price: 180000, timeline: '8-10 weeks', includes: ['Requirement workshop', 'Custom dashboard & roles', 'API integrations', 'Cloud deployment', '3 months support'] },
    { id: 'seo', name: 'SEO & Performance Boost', price: 15000, timeline: '2 weeks', includes: ['Technical SEO audit & fixes', 'Meta tags & schema', 'Core Web Vitals tuning', 'Google Business Profile setup'] },
  ],
  care_plan: { name: 'Care Plan (hosting, backups, updates)', monthly: 3000, months: 3 },
  milestones: ['Discovery & sitemap', 'UI design', 'Development', 'Content & SEO setup', 'Client review', 'Launch'],
  ai: {
    enabled: true,
    provider: 'auto', // auto | anthropic | openrouter (auto: Anthropic if ANTHROPIC_API_KEY is set, else OpenRouter)
    model: 'claude-opus-5-5',
    openrouter_model: '', // empty: the Claude model above on OpenRouter (anthropic/claude-opus-5.5)
    effort_research: 'high',
    effort_writing: 'medium',
    effort_light: 'low',
    web_search_max_uses: 8,
    daily_budget_usd: 15,
    max_concurrent: 2,
    design_enabled: true,
    auto_send_ai_replies: false,
  },
  /**
   * Twenty CRM field mapping (used by POST /webhooks/twenty, fed by n8n).
   * Values are dot-paths into the Twenty record; the first path that has a value wins.
   * Check the names against your workspace (Settings → Developers → API playground).
   */
  twenty: {
    object: 'company',
    fields: {
      company: ['name'],
      contact_name: ['contactName', 'contactPerson', 'name.firstName'],
      email: ['email', 'emails.primaryEmail', 'contactEmail'],
      phone: ['phone', 'phones.primaryPhoneNumber', 'contactPhone'],
      phone_country: ['phones.primaryPhoneCountryCode'],
      website: ['website', 'domainName.primaryLinkUrl', 'domainName'],
      city: ['city', 'address.addressCity'],
      industry: ['industry'],
      budget: ['budget', 'budget.amountMicros'],
      notes: ['notes', 'remarks'],
      interested: ['interested', 'interestStatus'],
      wa_opt_in: ['whatsappOptIn', 'waOptIn'],
      email_opt_in: ['emailOptIn'],
      do_not_contact: ['doNotContact', 'dnc'],
      call_outcome: ['callOutcome'],
      call_notes: ['callNotes'],
      callback_at: ['callbackAt'],
      proposal_decision: ['proposalDecision'],
      decline_reason: ['declineReason'],
    },
  },
  /**
   * AI Brochure Generator: the agency's own copy (from its reference brochure). The AI tailors
   * it per client. {{company}}, {{industry}}, {{industry_lower}}, {{city}} are filled in.
   * `asset` = illustration in assets/brochure; `text_side` = which half the text sits on.
   */
  brochure: {
    cover_title: 'Digital Growth Solutions for {{company}}',
    cover_subtitle: 'From website to automation, ERP, SEO, and social media - tailored digital services to elevate your visibility, bookings, and growth.',
    about: [
      'Axilume is a next-gen digital transformation company helping businesses grow through smart technology, strategic marketing, and seamless digital experiences.',
      'Backed by CodeAce, a multi-million dollar global technology firm trusted since 2018, we bring together deep expertise in software development, automation, SEO, and branding - empowering modern businesses to scale faster, operate smarter, and engage customers better.',
    ],
    shift_title: 'The Digital Shift in {{industry}}',
    shift_paragraphs: [
      'In today’s digital-first world, most people look online before choosing a service, and many will move on if they can’t find your business or book instantly.',
      'Your social media presence matters too: customers trust brands that stay active on Instagram & YouTube.',
      'Many businesses try going digital on their own, but without the right expertise or strategy, real visibility and growth remain out of reach.',
    ],
    help_intro: 'We don’t just build websites or run ads, we create smart, scalable systems that help {{company}} attract, convert, and retain customers with ease.',
    services: [
      {
        id: 'website', name: 'Website Development', asset: 'website', text_side: 'right',
        help_bullet: 'Modern & interactive websites that engage and convert',
        paragraphs: [
          'We create visually rich, interactive websites that do more than just look good, they connect with your audience and elevate your brand experience. Built for speed, SEO, and security, every site is crafted to perform across devices and platforms.',
          'Be it a simple business website, a dynamic eCommerce store, or a fully custom web application, we deliver web experiences that attract, convert, and scale with your growth.',
        ],
        bullets: ['Modern, responsive, mobile-first designs', 'High-converting layouts with clear CTAs', 'Custom animations and interactive elements', 'SEO-ready, lightning-fast, and built to scale'],
      },
      {
        id: 'automation', name: 'AI Agents & Automations', asset: 'automation', text_side: 'left',
        help_bullet: 'Simplify bookings with smart automation agents',
        paragraphs: [
          'We build custom AI agents tailored to your business and workflow, designed to automate routine tasks, manage customer queries, and streamline every step of the user journey.',
          'From instant responses to bookings and follow-ups, our agents save time, reduce manual work, and deliver a faster, smoother, and more satisfying experience for your customers.',
        ],
        bullets: ['Engage customers the moment they show interest', 'Respond instantly, even outside business hours', 'Automate follow-ups, bookings, and FAQs effortlessly', 'Focus on service, while your AI handles the rest'],
      },
      {
        id: 'erp', name: 'ERP Systems', asset: 'erp', text_side: 'right',
        help_bullet: 'Streamline operations through custom ERP solutions',
        paragraphs: [
          'We develop custom ERP systems to simplify your day-to-day operations, tailored for service businesses and beyond. From appointments and billing to staff management and CRM, everything runs from one clean, central dashboard.',
          'No more juggling tools or spreadsheets. With everything in one place, you get faster workflows, fewer errors, and more time to focus on your clients and growth.',
        ],
        bullets: ['Stay organised with all operations in one system', 'Save time and reduce errors with smart automation', 'Deliver better service with instant access to client data', 'Scale smoothly with streamlined operations'],
      },
      {
        id: 'seo', name: 'Search Engine Optimization', asset: 'seo', text_side: 'left',
        help_bullet: 'Strategic SEO to boost visibility and local discovery',
        paragraphs: [
          'We’ve helped businesses generate millions in revenue through strategy-driven SEO, boosting visibility, traffic, and conversions through proven organic growth.',
          'We apply the same expertise to help you rank higher on Google, attract nearby clients, and turn searches into steady bookings. From your website to your Google profile, we optimise every touchpoint.',
        ],
        bullets: ['Strong technical foundation for better indexing and performance', 'Answer & Generative Engine Optimization for AI-driven search', 'Geo-targeted strategies to dominate local search and Maps results', 'Conversion-focused content to turn traffic into bookings'],
      },
      {
        id: 'social', name: 'Social Media Marketing', asset: 'social', text_side: 'right',
        help_bullet: 'Social media marketing that builds trust and repeat business',
        paragraphs: [
          'We don’t just post, we build your brand. From content creation to campaign execution, we craft strategies that grow your visibility, engage your audience, and drive real results.',
          'Whether it’s Instagram, YouTube Shorts, or Facebook, we help you stay relevant, consistent, and ahead of the competition, turning scrolls into bookings and followers into loyal clients.',
        ],
        bullets: ['Build brand presence on Instagram, YouTube & Facebook', 'Engage followers with creative, consistent content', 'Promote offers and drive direct bookings', 'Grow with data-backed strategy and planning'],
      },
    ],
    why_paragraphs: [
      'We’re not just a service provider, we’re your digital growth partner. With deep expertise across tech, automation, and marketing, we deliver end-to-end solutions that are tailored, scalable, and results-driven.',
      'From small businesses to multi-brand enterprises, clients trust us for our clarity, commitment, and outcomes.',
    ],
    stats: [
      { value: '100+', label: 'Brands Empowered' }, { value: '₹50+ Cr', label: 'Growth Generated' },
      { value: '120+', label: 'Team of Experts' }, { value: '8+', label: 'Years of Proven Results' },
    ],
    cta_title: 'Let’s turn your digital goals into real growth.',
    cta_text: 'Whether it’s building your website, automating bookings, or scaling your reach, we’re here to make it happen.',
    cta_button: 'Book a Free Strategy Call',
  },
  /** AI Proposal Generator: fixed terms and the module split used to break a package price into line items. */
  proposal: {
    support_days: 90,
    payment_terms: 'Payment will be collected in three stages: 33.33% advance to begin the project, 33.33% after design approval, and 33.34% before launch and final handover. All prices exclude GST.',
    terms: [
      'Pricing covers only the scope in this proposal. Anything extra is a change request.',
      'Third-Party Integrations: Custom API integrations (logistics, etc.) require separate scoping/quotation. Timelines cannot be guaranteed due to external dependencies.',
    ],
    investment_note: 'Excludes domain, hosting, server setup, SSL, and third-party subscriptions.',
    deliverables_note: 'All final deliverables will be handed over with full access and ownership upon project completion.',
    modules: [
      { name: 'Planning & Strategy', share: 6 },
      { name: 'Custom UI/UX Design', share: 13 },
      { name: 'Development', share: 48 },
      { name: 'Content Management', share: 6 },
      { name: 'Third-Party Integrations', share: 15 },
      { name: 'SEO & Performance Optimisation', share: 12 },
    ],
  },
  /** The two marketing pipes for leads that are not (yet) interested. */
  marketing: {
    nurture: [
      { after_days: 0, theme: 'Friendly intro and an offer of a free website check-up', fallback: "We help local businesses get more enquiries from Google and WhatsApp. If you'd like, we can do a free 10-minute check-up of your online presence. No strings attached." },
      { after_days: 5, theme: 'One practical tip for their industry about what customers expect online', fallback: "Quick tip: over 70% of customers check a business on their phone before calling. A fast, mobile-friendly page with a WhatsApp button is the single biggest win for most businesses." },
      { after_days: 12, theme: 'Short case study / social proof from a similar business', fallback: 'One of our clients, a local clinic, went from 5 to 120+ online bookings a month after a simple website refresh. Happy to share how.' },
      { after_days: 21, theme: 'Offer: free homepage concept designed for them', fallback: "We'd be happy to design a free homepage concept for your business, so you can see exactly what it could look like before deciding anything." },
      { after_days: 35, theme: 'Polite final check-in: should we stay in touch?', fallback: "I don't want to clutter your inbox. Should I check back in a few months, or is now a good time to talk about your website?" },
    ],
    reengage: [
      { after_days: 30, theme: 'No-pressure check-in with one useful, non-salesy tip', fallback: "No sales pitch, just a useful tip: make sure your Google Business Profile has your latest hours, photos and a website link. It's free and brings real enquiries." },
      { after_days: 90, theme: 'Seasonal / festival campaign idea or new offer', fallback: 'With the festive season coming up, many businesses are adding a simple offers page to capture enquiries. If that is ever useful, we can set one up in a week.' },
      { after_days: 180, theme: 'Final friendly check-in, door left open', fallback: "It's been a while! If your plans for a website have changed, we're here. Otherwise, wishing you a great year ahead." },
    ],
  },
};

export const DEFAULT_TEMPLATES = [
  {
    key: 'intro', label: 'Cold intro (brochure)', wa_template_name: 'ws_intro',
    subject: '{{company}}: a quick idea to win more customers online',
    email_body: `Hi {{first_name}},

I'm {{sender_name}} from {{agency_name}}. We took a quick look at {{company}}'s online presence and put together a short personalised plan for you, including a homepage concept (PDF attached):

{{brochure_link}}

The main thing we spotted: {{top_issue}}

We help businesses like yours turn their website into a steady source of enquiries. Our recommendation for you is the {{package_name}} package.

If you'd like to talk it through, just reply to this email or pick a 30-minute slot here: {{booking_link}}

Best,
{{sender_name}}
{{agency_name}} · {{agency_phone}}`,
    wa_body: `Hi {{first_name}}, this is {{sender_name}} from {{agency_name}}. We prepared a personalised website plan for {{company}}: {{brochure_link}}
Main thing we noticed: {{top_issue}}. Reply YES to chat, or STOP to opt out.`,
  },
  {
    key: 'follow_up_1', label: 'Follow-up 1', wa_template_name: 'ws_follow_up_1',
    subject: 'Re: {{company}}: a quick idea to win more customers online',
    email_body: `Hi {{first_name}},

Just bringing this back to the top of your inbox. Did you get a chance to look at the plan we made for {{company}}?

{{brochure_link}}

Happy to answer any questions on a quick call: {{booking_link}}

{{sender_name}}`,
    wa_body: `Hi {{first_name}}, just checking you saw the website plan for {{company}}: {{brochure_link}}. Happy to answer questions. Reply YES to chat.`,
  },
  {
    key: 'follow_up_2', label: 'Follow-up 2 (last)', wa_template_name: 'ws_follow_up_2',
    subject: 'Should I close your file, {{first_name}}?',
    email_body: `Hi {{first_name}},

I haven't heard back, so I'll assume now isn't the right time. I'll close your file for now.

If things change, the plan for {{company}} is still here: {{brochure_link}}. You can also book a call at any time: {{booking_link}}

All the best,
{{sender_name}}`,
    wa_body: `Hi {{first_name}}, last note from {{agency_name}}. If a new website for {{company}} isn't a priority now, no worries. The plan stays here: {{brochure_link}}`,
  },
  {
    key: 'booking', label: 'Reply → booking link', wa_template_name: 'ws_booking',
    subject: "Let's find a time, {{first_name}}",
    email_body: `Hi {{first_name}},

Thanks for getting back to us! Please pick a 30-minute slot that suits you:

{{booking_link}}

We'll walk through ideas for {{company}} and answer any questions.

{{sender_name}}`,
    wa_body: `Thanks {{first_name}}! Please pick a 30-min call slot for {{company}} here: {{booking_link}}`,
  },
  {
    key: 'meeting_confirmed', label: 'Meeting confirmed', wa_template_name: 'ws_meeting_confirmed',
    subject: 'Confirmed: {{agency_name}} × {{company}}, {{meeting_time}}',
    email_body: `Hi {{first_name}},

Your call is confirmed for {{meeting_time}}.
Join link: {{meeting_link}}

Talk soon,
{{sender_name}}`,
    wa_body: `Confirmed {{first_name}}! Our call for {{company}} is at {{meeting_time}}. Link: {{meeting_link}}`,
  },
  {
    key: 'proposal', label: 'Proposal', wa_template_name: 'ws_proposal',
    subject: 'Your proposal from {{agency_name}}: {{package_name}}',
    email_body: `Hi {{first_name}},

Thanks for your time. Your proposal for {{company}} is attached (PDF):

{{proposal_link}}

Total: {{amount}}. To go ahead, simply reply YES and we'll send the advance invoice.

{{sender_name}}`,
    wa_body: `Hi {{first_name}}, your proposal for {{company}} is attached ({{amount}}). To go ahead, just reply YES.`,
  },
  {
    key: 'proposal_reminder', label: 'Proposal reminder', wa_template_name: 'ws_proposal_reminder',
    subject: 'Any questions on the proposal, {{first_name}}?',
    email_body: `Hi {{first_name}},

Just checking in on the proposal for {{company}}: {{proposal_link}}

Happy to adjust the scope if needed. To go ahead, just reply YES.

{{sender_name}}`,
    wa_body: `Hi {{first_name}}, any questions on the proposal for {{company}}? {{proposal_link}}`,
  },
  {
    key: 'payment_request', label: 'Advance invoice', wa_template_name: 'ws_payment_request',
    subject: 'Welcome aboard! Advance invoice {{invoice_number}}',
    email_body: `Hi {{first_name}},

Thank you for choosing {{agency_name}}! 🎉

To kick off the project, please pay the advance of {{amount}}:
{{payment_link}}

{{sender_name}}`,
    wa_body: `Welcome aboard {{first_name}}! 🎉 Please pay the advance of {{amount}} to start {{company}}'s project: {{payment_link}}`,
  },
  {
    key: 'payment_reminder', label: 'Payment reminder', wa_template_name: 'ws_payment_reminder',
    subject: 'Reminder: invoice {{invoice_number}}',
    email_body: `Hi {{first_name}},

A friendly reminder that invoice {{invoice_number}} ({{amount}}) is still pending:
{{payment_link}}

{{sender_name}}`,
    wa_body: `Hi {{first_name}}, friendly reminder: invoice {{invoice_number}} ({{amount}}) is pending: {{payment_link}}`,
  },
  {
    key: 'onboarding', label: 'Onboarding brief request', wa_template_name: 'ws_onboarding',
    subject: 'Payment received. Tell us about {{company}}',
    email_body: `Hi {{first_name}},

We've received your payment, thank you!

Please fill in this short project brief (about 5 minutes) so we can start:
{{onboarding_link}}

{{sender_name}}`,
    wa_body: `Payment received, thank you {{first_name}}! Please fill this 5-min project brief so we can start: {{onboarding_link}}`,
  },
  {
    key: 'kickoff', label: 'Project kickoff', wa_template_name: 'ws_kickoff',
    subject: "We've started on {{company}}'s project 🚀",
    email_body: `Hi {{first_name}},

Thanks for the brief. Your project is officially underway!

Track progress live here: {{status_link}}

We'll update you at every milestone.

{{sender_name}}`,
    wa_body: `We've started {{company}}'s project 🚀 Track progress live: {{status_link}}`,
  },
  {
    key: 'milestone_update', label: 'Milestone update', wa_template_name: 'ws_milestone_update',
    subject: '{{company}} project update: {{milestone}} ✅',
    email_body: `Hi {{first_name}},

Good news: "{{milestone}}" is complete. Overall progress: {{progress}}.

Live status: {{status_link}}

{{sender_name}}`,
    wa_body: `Update for {{company}}: "{{milestone}}" is complete ✅ ({{progress}}). Status: {{status_link}}`,
  },
  {
    key: 'final_invoice', label: 'Delivery + final invoice', wa_template_name: 'ws_final_invoice',
    subject: '{{company}} is live! Final invoice {{invoice_number}}',
    email_body: `Hi {{first_name}},

Your project is complete and live! 🎉

The final balance of {{amount}} can be paid here:
{{payment_link}}

{{sender_name}}`,
    wa_body: `{{company}}'s project is live 🎉 Final balance {{amount}}: {{payment_link}}`,
  },
  {
    key: 'thank_you', label: 'Thank you + review request', wa_template_name: 'ws_thank_you',
    subject: 'Thank you, {{first_name}}! One small favour?',
    email_body: `Hi {{first_name}},

Thank you for trusting {{agency_name}} with {{company}}'s project. It was a pleasure!

If you're happy with the result, a quick review would mean a lot to us:
{{review_link}}

Your Care Plan keeps the site updated, backed up and secure. Just reply any time you need changes.

{{sender_name}}`,
    wa_body: `Thank you {{first_name}}! If you're happy with {{company}}'s new site, a quick review would mean a lot: {{review_link}}`,
  },
];

DEFAULT_TEMPLATES.push(
  {
    key: 'nurture_touch', label: 'Marketing: nurture touch', wa_template_name: 'ws_nurture',
    subject: '{{touch_subject}}',
    email_body: `Hi {{first_name}},

{{touch_body}}

{{sender_name}}
{{agency_name}} · {{agency_phone}}`,
    wa_body: 'Hi {{first_name}}, {{sender_name}} from {{agency_name}} here. {{touch_body}}',
  },
  {
    key: 'reengage_touch', label: 'Marketing: re-engage touch', wa_template_name: 'ws_reengage',
    subject: '{{touch_subject}}',
    email_body: `Hi {{first_name}},

{{touch_body}}

{{sender_name}}
{{agency_name}}`,
    wa_body: 'Hi {{first_name}}, {{touch_body}}. {{sender_name}}, {{agency_name}}',
  },
  {
    key: 'custom', label: 'Personal reply (AI draft / manual)', wa_template_name: 'ws_custom',
    subject: '{{touch_subject}}',
    email_body: '{{touch_body}}\n\n{{sender_name}}\n{{agency_name}}',
    wa_body: '{{touch_body}}',
  },
);

const OUTDATED = ['short personalised brochure for you', 'accept it online in one click', 'View & accept:', 'adjust the scope if needed. Just reply here.'];

export async function seedDefaults() {
  for (const t of DEFAULT_TEMPLATES) {
    const cur = await get(`SELECT email_body, wa_body FROM templates WHERE key = :key`, { key: t.key });
    if (cur && OUTDATED.some((o) => `${cur.email_body} ${cur.wa_body}`.includes(o))) {
      await run(`UPDATE templates SET subject=:subject, email_body=:email_body, wa_body=:wa_body WHERE key=:key`,
        { key: t.key, subject: t.subject, email_body: t.email_body, wa_body: t.wa_body });
    }
  }
  for (const t of DEFAULT_TEMPLATES) {
    await run(`INSERT INTO templates (key,label,subject,email_body,wa_body,wa_template_name)
         VALUES (:key,:label,:subject,:email_body,:wa_body,:wa_template_name) ON CONFLICT (key) DO NOTHING`, t);
  }
  if (!(await get(`SELECT 1 AS one FROM settings WHERE key='app'`))) {
    await run(`INSERT INTO settings (key,value) VALUES ('app', :v) ON CONFLICT (key) DO NOTHING`, { v: JSON.stringify(DEFAULT_SETTINGS) });
  }
  // Rename: replace the old placeholder brand only where it was never edited.
  const s = await loadSettings();
  const a = s.agency;
  const D = DEFAULT_SETTINGS.agency;
  const renamed = {
    ...(['WebStream Studio', 'Axilume Web Studio'].includes(a.name) ? { name: D.name } : {}),
    ...(['hello@webstream.example', 'hello@axilume.example'].includes(a.email) ? { email: D.email } : {}),
    ...(['https://webstream.example', 'https://axilume.example'].includes(a.website) ? { website: D.website } : {}),
    ...(a.phone === '+91 98765 43210' ? { phone: D.phone } : {}),
    ...(a.address === 'Bengaluru, India' ? { address: D.address } : {}),
  };
  if (Object.keys(renamed).length || s.billing.invoice_prefix === 'WS') {
    await saveSettings({ agency: renamed, ...(s.billing.invoice_prefix === 'WS' ? { billing: { invoice_prefix: 'AWS' } } : {}) });
  }
}

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || typeof over !== 'object' || !base || !over) {
    return over === undefined ? base : over;
  }
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

/*
 * Settings are read on every request, so they are kept in memory: loadSettings() refreshes the copy
 * from the database (the server does it at the start of each request, cron and background jobs do
 * it when they start) and getSettings() returns it synchronously.
 */
let cached = null;
export async function loadSettings() {
  const row = await get(`SELECT value FROM settings WHERE key='app'`);
  cached = deepMerge(DEFAULT_SETTINGS, row ? JSON.parse(row.value) : {});
  return structuredClone(cached);
}
export function getSettings() {
  return structuredClone(cached || DEFAULT_SETTINGS);
}

export async function saveSettings(partial) {
  const merged = deepMerge(await loadSettings(), partial);
  await run(`INSERT INTO settings (key,value) VALUES ('app', :v) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, { v: JSON.stringify(merged) });
  cached = merged;
  return structuredClone(merged);
}

export async function getState(key, fallback = null) {
  const row = await get(`SELECT value FROM settings WHERE key = :key`, { key: 'state:' + key });
  return row ? JSON.parse(row.value) : fallback;
}
export async function setState(key, value) {
  await run(`INSERT INTO settings (key,value) VALUES (:key, :v) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, { key: 'state:' + key, v: JSON.stringify(value) });
}

const TEMPLATE_ORDER = DEFAULT_TEMPLATES.map((t) => t.key);
const orderOf = (k) => { const i = TEMPLATE_ORDER.indexOf(k); return i < 0 ? 999 : i; };
export const getTemplates = async () => (await all(`SELECT * FROM templates`)).sort((a, b) => orderOf(a.key) - orderOf(b.key) || a.key.localeCompare(b.key));
export const getTemplate = async (key) => await get(`SELECT * FROM templates WHERE key = :key`, { key });
