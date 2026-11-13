import { get } from '../db.js';
import { getSettings } from '../settings.js';
import { BASE_URL } from '../util.js';
import * as tools from '../tools.js';

const slug = (s) => String(s || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'client';
const parse = (j) => { try { return j ? JSON.parse(j) : null; } catch { return null; } };

// Only finished documents become PDFs for the client or the CRM (owner, 2026-11-13: "dont generate any default bad
// content at any cost"). The old built-in "website plan" brochure and the built-in proposal are no longer printed:
// found live the same day, the built-in brochure (11 KB) reached the manager before Claude's brochure was ready.
export class NoDocument extends Error {}
/** The lead's finished brochure document (Brochure tool / Claude), or null. */
export async function readyBrochure(lead) {
  const doc = await tools.latestLeadDoc('brochure', lead.id);
  return doc?.design || doc?.content?.html ? doc : null;
}
export async function buildBrochureFor(lead) {
  const doc = await readyBrochure(lead);
  if (!doc) throw new NoDocument(`No finished brochure for ${lead.company} yet`);
  return tools.docPdf(doc);
}
/** A proposal's finished document, or null. */
export async function readyProposalDoc(proposal) {
  const doc = proposal.doc_id ? await tools.getDoc(proposal.doc_id) : null;
  return doc?.status === 'ready' && (doc.design || doc.content?.html) ? doc : null;
}
export async function buildProposalFor(proposal) {
  const doc = await readyProposalDoc(proposal);
  if (!doc) throw new NoDocument(`Proposal #${proposal.id} has no finished document`);
  return tools.docPdf(doc);
}

export const brochureUrl = (lead) => `${BASE_URL}/pdf/brochure/${lead.token}.pdf`;
export const proposalUrl = (p) => `${BASE_URL}/pdf/proposal/${p.token}.pdf`;

/** Attachment descriptors for sendToLead (email attaches the bytes; WhatsApp sends the link as a document). */
export const brochureAttachment = (lead) => ({ filename: `${slug(lead.company)}-website-plan.pdf`, url: brochureUrl(lead), build: () => buildBrochureFor(lead) });
export const proposalAttachment = (lead, p) => ({ filename: `${slug(lead.company)}-proposal-${p.id}.pdf`, url: proposalUrl(p), build: () => buildProposalFor(p) });
