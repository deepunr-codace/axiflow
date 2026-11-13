import crypto from 'node:crypto';
import { addColumns, get, update } from '../db.js';
import { getSettings } from '../settings.js';
import { websiteTypeLabel } from '../website-type.js';
import { decideOffer } from './offer.js';

/*
 * Stage 1 of the designed brochure: the brief (brochure fix guide 2026-11-13, section 6.1). Everything the writer needs,
 * in one short plain-text brief built by code: the business, the decided offer and package, the verified facts (V-ids),
 * the research evidence (E-ids), the approved SWOT (S-ids), the CRM record and call notes, the last rejection reason and
 * the client's images (I-ids). It is stored on the lead (leads.brief_json), so the proposal and the "Copy brief for
 * Claude" button reuse it. Nothing here calls an AI: it reads what earlier stages stored (facts, research, SWOT, images).
 */
addColumns('leads', { brief_json: 'TEXT', brief_at: 'TEXT' });

const parse = (j) => { if (j == null || typeof j === 'object') return j ?? null; try { return JSON.parse(j); } catch { return null; } };
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return String(u || '').slice(0, 40); } };
const site = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const SWOT_KEYS = [['strengths', 'S'], ['weaknesses', 'W'], ['opportunities', 'O'], ['threats', 'T']];

/** The CRM's own rejection reason for the last brochure, when the CRM has such a field (brochures.rejection_reason). */
export function rejectionOf(brochures) {
  const row = (brochures || []).find((b) => b.status === 'not_approved');
  const reason = row && (row.rejection_reason || row.reject_reason || row.reason || '');
  return row ? { reason: String(reason || '').trim(), at: row.updated_at || row.created_at || null } : null;
}

/**
 * The brief as plain text, from parts already in hand. Returns { text, ids, chars, hash }.
 * parts: { lead, crm, facts, research, swot, offer, images, rejection }
 */
export function briefText({ lead = {}, crm = null, facts = [], research = null, swot = null, offer = null, images = [], rejection = null } = {}) {
  const ids = new Set();
  const out = [];
  const co = crm?.company || {};
  const name = co.name || lead.company || 'the business';
  const city = lead.city || co.address?.split(',').slice(-2, -1)[0]?.trim() || '';

  // BUSINESS: one or two lines (what they sell, where, to whom)
  const desc = co.business_description || research?.business_summary || co.description || '';
  const sells = (research?.what_they_sell || []).slice(0, 6).join(', ');
  out.push('BUSINESS', [`${name}${city ? `, ${city}` : ''}${desc ? `: ${clip(desc, 260)}` : ''}`,
    sells && `Sells: ${clip(sells, 200)}.`, research?.target_customers && `Customers: ${clip(research.target_customers, 160)}.`,
    lead.website || co.website ? `Website: ${site(co.website || lead.website)}.` : 'No website.'].filter(Boolean).join(' '));

  // OFFER and PACKAGE: decided in code (src/brochure/offer.js)
  if (offer?.text) out.push('', 'OFFER (decided: sell exactly this)', offer.text.replace(/\s*\(CRM website type:.*\)\s*$/, ''), `[CRM website type: ${websiteTypeLabel(lead.website_type) || 'not set'}; website today: ${offer.why || offer.status}]`);
  if (offer?.package) out.push('', 'PACKAGE', offer.package);

  // VERIFIED FACTS: all of them, with their ids
  if (facts?.length) {
    out.push('', 'VERIFIED FACTS (checked by AxiFlow\'s code; "not checked" = that page could not be read, not evidence of absence)');
    for (const f of facts) { ids.add(f.id); out.push(`${f.id} ${f.kind && f.kind !== 'seen' ? `(${f.kind === 'not_checked' ? 'not checked' : f.kind}) ` : ''}${clip(f.text, 170)} (${String(f.source || '').startsWith('crm:') ? 'CRM' : host(f.source)})`); }
  }

  // EVIDENCE: the research items after the gate, with their ids
  const ev = (research?.evidence || []).slice(0, 14);
  if (ev.length) {
    out.push('', 'EVIDENCE (web research, each from a page the research run opened)');
    for (const e of ev) { ids.add(e.id); out.push(`${e.id} ${e.kind === 'not_found_after_check' ? '(not found after a check) ' : ''}${clip(e.fact, 170)} (${host(e.source_url)})`); }
    for (const c of (research?.competitors || []).slice(0, 3)) out.push(`Competitor: ${clip(c.name, 40)} (${host(c.url)}): ${clip(c.difference, 120)}`);
  }

  // SWOT: the approved one, every point on its own line with its S-id and the ids it rests on; never cut
  if (swot?.swot) {
    out.push('', 'SWOT (approved by the team)');
    const refsOf = (k, text) => (swot.swot_refs || []).find((r) => r.quadrant === k && r.text === text)?.refs || [];
    for (const [k, L] of SWOT_KEYS) {
      (swot.swot[k] || []).forEach((p, i) => { const id = `S-${L}${i + 1}`; ids.add(id); const r = refsOf(k, p); out.push(`${id} ${p}${r.length ? ` [${r.join(', ')}]` : ''}`); });
    }
    (swot.solutions || []).forEach((x, i) => { const id = `S-X${i + 1}`; ids.add(id); out.push(`${id} ${x.service}: ${x.problem} → ${x.how}`); });
  } else out.push('', 'SWOT', 'No approved SWOT yet: write only from the facts and evidence above.');

  // CRM: contacts, call notes, team notes, open tasks; a contradiction is said out loud with the side that wins
  if (crm) {
    out.push('', 'CRM');
    for (const ct of (crm.contacts || []).slice(0, 3)) out.push(`Contact: ${ct.name}${ct.title ? ` (${ct.title})` : ''}${ct.lead_stage ? `, call stage ${ct.lead_stage}` : ''}${ct.last_outcome ? `, last call ${ct.last_outcome}` : ''}`);
    for (const d of (crm.deals || []).slice(0, 2)) out.push(`Deal: stage ${d.stage}`);
    const said = (crm.contacts || []).some((c) => /interested|meeting/i.test(`${c.lead_stage} ${c.last_outcome}`) && !/not_interested/i.test(`${c.lead_stage} ${c.last_outcome}`));
    if (said && (crm.deals || []).some((d) => /not.?interested|lost/i.test(d.stage || ''))) out.push('Note: the deal stage disagrees with the call stage. The brochure is made because the lead said interested on the call: that wins.');
    const calls = (crm.calls || []).filter((c) => c.outcome || String(c.notes || '').trim().length >= 4).slice(0, 5);
    out.push(calls.length ? calls.map((c) => `Call ${String(c.date || '').slice(0, 10)}${c.by ? ` (${c.by})` : ''}: ${c.outcome || 'no result'}${String(c.notes || '').trim() ? `: ${clip(c.notes, 200)}` : ''}`).join('\n') : 'Call notes: none yet.');
    const notes = (crm.notes || []).filter((n) => String(n.text || '').trim().length >= 4 && !/AxiFlow|Call script from|SWOT analysis|Pitch point:|^Brochure ready for|^Proposal ready for/i.test(n.text)).slice(0, 4);
    for (const n of notes) out.push(`Team note ${String(n.date || '').slice(0, 10)}: ${clip(n.text, 220)}`);
    for (const t of (crm.tasks || []).filter((x) => !x.done_date).slice(0, 3)) out.push(`Open task: ${clip(t.text, 140)}`);
  }

  // LAST REJECTION: only when this is a new version after "not approved"
  if (rejection) out.push('', 'LAST REJECTION', rejection.reason ? `The last brochure was not approved: ${clip(rejection.reason, 300)}` : 'The last brochure was not approved (no reason given in the CRM).');

  // IMAGES: from the client's own website
  if (images?.length) {
    out.push('', 'IMAGES (from the client\'s own website)');
    for (const i of images) { ids.add(i.id); out.push(`${i.id} ${i.kind}, ${i.w}x${i.h} ${i.orientation}${i.alt ? `, "${clip(i.alt, 80)}"` : ''}${i.ai ? ' (file name suggests an AI image: prefer real photos)' : ''}`); }
  } else out.push('', 'IMAGES', 'None usable on the client\'s website: use the photo-free layouts.');

  const text = out.join('\n');
  return { text, ids: [...ids], chars: text.length, hash: crypto.createHash('sha1').update(text).digest('hex').slice(0, 16) };
}

/**
 * The brief for a lead. Parts already in hand are used as they are (buildClaudeJob passes the CRM record, facts,
 * research, SWOT and images it has); the rest is read from what earlier stages stored. Stored on the lead.
 * Returns { text, ids, chars, hash, offer, images }.
 */
export async function buildBrief(leadId, parts = {}) {
  const lead = await get(`SELECT * FROM leads WHERE id = :id`, { id: leadId });
  if (!lead) throw new Error('Lead not found');
  let crm = parts.crm;
  if (crm === undefined) {
    const m = /^atomic:(co|ct):(\d+)$/.exec(lead.external_id || '');
    crm = m ? await (await import('../crm-leads.js')).crmLead(`${m[1]}-${m[2]}`).catch(() => null) : null;
  }
  const facts = parts.facts ?? parse(lead.facts_json) ?? [];
  const research = parts.research !== undefined ? parts.research : parse(lead.research_json);
  let swot = parts.swot;
  if (swot === undefined) {
    const row = await get(`SELECT content_json FROM docs WHERE lead_id = :id AND kind = 'script' AND status = 'ready' AND approved_at IS NOT NULL ORDER BY id DESC LIMIT 1`, { id: leadId }).catch(() => null);
    swot = parse(row?.content_json);
  }
  const website = crm?.company ? crm.company.website || '' : lead.website || '';
  const images = parts.images ?? await (await import('./images.js')).leadImages(leadId, website).catch(() => []);
  const offer = parts.offer ?? decideOffer({ websiteType: lead.website_type, website, facts, audit: parts.audit, settings: getSettings() });
  const rejection = parts.rejection !== undefined ? parts.rejection : rejectionOf(crm?.brochures);
  const b = briefText({ lead: { ...lead, website }, crm, facts, research, swot: swot?.swot ? swot : null, offer: offer?.blocked ? null : offer, images, rejection });
  await update('leads', leadId, { brief_json: { text: b.text, ids: b.ids, hash: b.hash }, brief_at: new Date().toISOString() }).catch(() => {});
  return { ...b, offer, images };
}
