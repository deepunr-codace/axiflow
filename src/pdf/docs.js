import { get } from '../db.js';
import { getSettings } from '../settings.js';
import { BASE_URL } from '../util.js';
import { brochurePdf, proposalPdf } from './pdf.js';
import { fallbackPitch } from '../ai/pitchmaker.js';
import { fallbackProposalContent } from '../ai/proposal.js';
import * as tools from '../tools.js';

const slug = (s) => String(s || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'client';
const parse = (j) => { try { return j ? JSON.parse(j) : null; } catch { return null; } };

/** A lead's brochure PDF: its designed brochure (Brochure tool) when there is one, else the built-in layout. */
export async function buildBrochureFor(lead) {
  const doc = await tools.latestLeadDoc('brochure', lead.id);
  if (doc?.design) return tools.docPdf(doc);
  const audit = parse(lead.audit_json);
  return brochurePdf({
    lead, audit,
    pitch: parse(lead.pitch_json) || fallbackPitch(lead, audit),
    research: parse(lead.research_json),
    settings: getSettings(),
    bookingUrl: `${BASE_URL}/book/${lead.token}`,
    designUrl: lead.design_version ? `${BASE_URL}/d/${lead.token}` : null,
  });
}

export async function buildProposalFor(proposal) {
  if (proposal.doc_id) {
    const doc = await tools.getDoc(proposal.doc_id);
    if (doc?.status === 'ready' && doc.design) return tools.docPdf(doc);
  }
  const lead = await get(`SELECT * FROM leads WHERE id = :id`, { id: proposal.lead_id });
  const content = parse(proposal.content_json) || fallbackProposalContent(lead, JSON.parse(proposal.items_json));
  return proposalPdf({ lead, proposal, content, settings: getSettings() });
}

export const brochureUrl = (lead) => `${BASE_URL}/pdf/brochure/${lead.token}.pdf`;
export const proposalUrl = (p) => `${BASE_URL}/pdf/proposal/${p.token}.pdf`;

/** Attachment descriptors for sendToLead (email attaches the bytes; WhatsApp sends the link as a document). */
export const brochureAttachment = (lead) => ({ filename: `${slug(lead.company)}-website-plan.pdf`, url: brochureUrl(lead), build: () => buildBrochureFor(lead) });
export const proposalAttachment = (lead, p) => ({ filename: `${slug(lead.company)}-proposal-${p.id}.pdf`, url: proposalUrl(p), build: () => buildProposalFor(p) });
