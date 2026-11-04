import { all } from './db.js';
import { nowISO } from './util.js';
import { rest, inList, firstOf, atomicKeys, crmHost, readOnly } from './atomic.js';

/*
 * Live view of the team CRM for the Leads page. Every request reads straight from the CRM
 * (GET only), so the page shows what the telecaller sees right now.
 * A lead = a CRM company with its contacts; contacts without a company are listed on their own.
 */

const get = (path) => rest('GET', path);
async function readAll(path) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await get(`${path}${path.includes('?') ? '&' : '?'}offset=${from}&limit=1000`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const CLOSED = new Set(['won', 'lost']);
const personName = (c) => [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim();
function salesName(sales, id) {
  const p = sales.get(id);
  if (!p) return null;
  const n = personName(p);
  return n && n !== 'Pending Pending' ? n : p.email || null;
}
const contactView = (c) => ({
  id: c.id, name: personName(c) || 'No name', title: c.title || null, status: c.status || null,
  email: firstOf(c.email_jsonb, 'email') || null, phone: c.phone_e164 || firstOf(c.phone_jsonb, 'number') || null,
  whatsapp: c.whatsapp_number || null, is_primary: !!c.is_primary, do_not_contact: !!c.do_not_contact,
  lead_stage: c.lead_stage || null, last_outcome: c.last_outcome || null, last_attempt_at: c.last_attempt_at || null,
  next_attempt_at: c.next_attempt_at || null, retry_count: c.retry_count || 0, last_seen: c.last_seen || null,
});
const dealView = (d) => ({
  id: d.id, name: d.name, stage: d.stage, amount: d.amount, archived: !!d.archived_at, closed: !!d.archived_at || CLOSED.has(d.stage),
  expected_closing_date: d.expected_closing_date || null, updated_at: d.updated_at,
});

/** AxiFlow leads that came from the CRM, by page key (co-<id> / ct-<id>). */
async function linkedByKey() {
  const rows = await all(`SELECT id, stage, external_id FROM leads WHERE external_id LIKE 'atomic:%' ORDER BY id DESC`);
  const m = new Map();
  for (const r of rows) {
    const [, kind, id] = String(r.external_id).match(/^atomic:(co|ct):(\d+)$/) || [];
    if (kind && !m.has(`${kind}-${id}`)) m.set(`${kind}-${id}`, { id: r.id, stage: r.stage });
  }
  return m;
}

/** Every lead in the CRM, newest first. */
export async function crmLeads() {
  if (!atomicKeys()) return { connected: false, leads: [] };
  const [companies, contacts, deals, salesRows, linked] = await Promise.all([
    readAll('companies?select=id,name,sector,website,city,state_abbr,phone_number,email,whatsapp_number,lead_date,created_at,sales_id&order=created_at.desc'),
    readAll('contacts?select=*&order=id.asc'),
    readAll('deals?select=id,name,company_id,contact_ids,stage,amount,archived_at,expected_closing_date,updated_at&order=updated_at.desc'),
    get('sales?select=id,first_name,last_name,email').catch(() => []),
    linkedByKey(),
  ]);
  const sales = new Map(salesRows.map((r) => [r.id, r]));
  const byCo = new Map();
  for (const c of contacts) {
    const k = c.company_id ?? `c${c.id}`;
    if (!byCo.has(k)) byCo.set(k, []);
    byCo.get(k).push(c);
  }
  const dealsByCo = new Map();
  for (const d of deals) {
    if (!dealsByCo.has(d.company_id)) dealsByCo.set(d.company_id, []);
    dealsByCo.get(d.company_id).push(d);
  }
  const row = (co, cts) => {
    const main = cts.find((c) => c.is_primary) || cts[0] || null;
    const ds = co ? dealsByCo.get(co.id) || [] : deals.filter((d) => (d.contact_ids || []).includes(main?.id));
    const deal = ds.find((d) => !d.archived_at && !CLOSED.has(d.stage)) || ds[0] || null;
    const mc = main ? contactView(main) : null;
    return {
      key: co ? `co-${co.id}` : `ct-${main.id}`, company_id: co?.id ?? null,
      name: co?.name || mc?.name || 'No name', sector: co?.sector || null,
      city: [co?.city, co?.state_abbr].filter(Boolean).join(', ') || null, website: co?.website || null,
      contact: mc, contacts: cts.length,
      email: mc?.email || co?.email || null,
      phone: mc?.whatsapp || mc?.phone || co?.whatsapp_number || co?.phone_number || null,
      deal: deal ? dealView(deal) : null, deals: ds.length,
      owner: salesName(sales, co?.sales_id ?? main?.sales_id),
      lead_date: co?.lead_date || co?.created_at?.slice(0, 10) || main?.first_seen?.slice(0, 10) || null,
      axiflow: linked.get(co ? `co-${co.id}` : `ct-${main.id}`) || null,
    };
  };
  const leads = companies.map((co) => row(co, byCo.get(co.id) || []));
  for (const [k, cts] of byCo) if (typeof k === 'string') leads.push(row(null, cts));
  return { connected: true, read_only: readOnly(), host: crmHost(), at: nowISO(), leads };
}

/** One CRM lead with its contacts, deals, notes, tasks and brochures. `key` is co-<id> or ct-<id>. */
export async function crmLead(key) {
  if (!atomicKeys()) throw new Error('CRM not connected');
  const [, kind, raw] = String(key).match(/^(co|ct)-(\d+)$/) || [];
  if (!kind) throw new Error('Unknown lead');
  const id = Number(raw);
  const co = kind === 'co' ? (await get(`companies?select=*&id=eq.${id}`))[0] : null;
  const contacts = kind === 'co' ? await get(`contacts?select=*&company_id=eq.${id}&order=id.asc`) : await get(`contacts?select=*&id=eq.${id}`);
  if (!co && !contacts.length) throw new Error('This lead is no longer in the CRM');
  const cids = contacts.map((c) => c.id);
  const deals = co
    ? await get(`deals?select=*&company_id=eq.${id}&order=updated_at.desc`)
    : await get(`deals?select=*&contact_ids=cs.{${cids.join(',')}}&order=updated_at.desc`);
  const dids = deals.map((d) => d.id);
  const [contactNotes, dealNotes, tasks, brochures, salesRows] = await Promise.all([
    cids.length ? get(`contact_notes?select=*&contact_id=${inList(cids)}&order=date.desc&limit=200`) : [],
    dids.length ? get(`deal_notes?select=*&deal_id=${inList(dids)}&order=date.desc&limit=200`) : [],
    cids.length ? get(`tasks?select=*&contact_id=${inList(cids)}&order=due_date.desc&limit=200`) : [],
    co ? get(`brochures?select=*&company_id=eq.${id}&order=id.desc`).catch(() => []) : [],
    get('sales?select=id,first_name,last_name,email').catch(() => []),
  ]);
  const sales = new Map(salesRows.map((r) => [r.id, r]));
  const cname = new Map(contacts.map((c) => [c.id, personName(c) || 'Contact']));
  const dname = new Map(deals.map((d) => [d.id, d.name]));
  const notes = [
    ...contactNotes.map((n) => ({ on: cname.get(n.contact_id), kind: 'contact', text: n.text, date: n.date, status: n.status || null, by: salesName(sales, n.sales_id), attachments: n.attachments || [] })),
    ...dealNotes.map((n) => ({ on: dname.get(n.deal_id), kind: 'deal', text: n.text, date: n.date, status: null, by: salesName(sales, n.sales_id), attachments: n.attachments || [] })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const linked = (await linkedByKey()).get(key) || null;
  return {
    key, read_only: readOnly(), host: crmHost(), at: nowISO(),
    company: co ? {
      id: co.id, name: co.name, sector: co.sector, size: co.size, website: co.website, phone: co.phone_number, email: co.email, whatsapp: co.whatsapp_number,
      address: [co.address, co.city, co.state_abbr, co.zipcode, co.country].filter(Boolean).join(', ') || null,
      description: co.description, pitch_point: co.pitch_point, lead_date: co.lead_date, created_at: co.created_at, linkedin_url: co.linkedin_url,
      owner: salesName(sales, co.sales_id),
    } : null,
    contacts: contacts.map(contactView), deals: deals.map(dealView), notes,
    tasks: tasks.map((t) => ({ id: t.id, type: t.type, text: t.text, due_date: t.due_date, done_date: t.done_date, on: cname.get(t.contact_id) })),
    brochures: brochures.map((b) => ({ id: b.id, title: b.title, url: b.brochure_url, status: b.status })),
    axiflow: linked,
  };
}
