import { fileURLToPath } from 'node:url';
import { seedDefaults } from './settings.js';
import { createLead, advance } from './pipeline/engine.js';

const DEMO = [
  { company: 'Sharma Sweets', contact_name: 'Rohit Sharma', email: 'rohit@sharmasweets.example', phone: '9876500001', industry: 'Food & sweets shop', city: 'Jaipur', source: 'web_form', interested: 'yes', wa_opt_in: 1, email_opt_in: 1, budget: 40000, notes: 'Wants online orders for Diwali' },
  { company: 'Apex Physiotherapy', contact_name: 'Dr. Meera Iyer', email: 'meera@apexphysio.example', phone: '9876500002', website: 'http://example.com', industry: 'Healthcare clinic', city: 'Chennai', source: 'google_ads', interested: 'yes', wa_opt_in: 1, email_opt_in: 1, budget: 60000 },
  { company: 'Urban Threads Boutique', contact_name: 'Kavya Nair', email: 'kavya@urbanthreads.example', phone: '9876500003', industry: 'Fashion retail', city: 'Kochi', source: 'meta_ads', interested: 'yes', email_opt_in: 1, budget: 120000, service: 'ecommerce' },
  { company: 'Greenleaf Interiors', contact_name: 'Vikram Rao', email: 'vikram@greenleaf.example', phone: '9876500004', website: 'https://example.org', industry: 'Interior design', city: 'Hyderabad', source: 'referral', interested: 'unknown', wa_opt_in: 1, email_opt_in: 1 },
  { company: 'Patel Auto Spares', contact_name: 'Nilesh Patel', phone: '9876500005', industry: 'Automotive', city: 'Surat', source: 'justdial', interested: 'unknown' },
  { company: 'Blue Lotus Yoga', contact_name: 'Anita Desai', email: 'anita@bluelotus.example', industry: 'Fitness', city: 'Pune', source: 'cold_list', interested: 'no', email_opt_in: 1 },
  { company: 'Kumar & Sons Hardware', contact_name: 'Suresh Kumar', email: 'suresh@kumarhardware.example', phone: '9876500007', industry: 'Hardware store', city: 'Lucknow', source: 'indiamart', interested: 'yes', wa_opt_in: 1, budget: 25000 },
  { company: 'TechNova Solutions', contact_name: 'Farhan Ali', email: 'farhan@technova.example', phone: '9876500008', industry: 'IT services', city: 'Bengaluru', source: 'linkedin', interested: 'yes', email_opt_in: 1, wa_opt_in: 1, budget: 250000, service: 'webapp' },
];

export async function seedDemo() {
  seedDefaults();
  const ids = DEMO.map((d) => createLead(d, { source: d.source, autoRun: false }).id);
  for (const id of ids) await advance(id);
  return { created: ids.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedDemo().then((r) => { console.log('Seeded demo leads:', r); process.exit(0); });
}
