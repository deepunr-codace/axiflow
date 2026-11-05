import { all } from '../db.js';
import { getSettings } from '../settings.js';
import { runJson, aiEnabled, obj, str, arr } from './claude.js';
import { managerSystem, leadContext } from './playbook.js';

/**
 * AI Proposal Generator. The AI writes the words (summary, scope, timeline, why us).
 * Line items, quantities and prices are computed in code and only shown to the model,
 * so a proposal can never contain an invented price.
 */
const SCHEMA = obj({
  title: str('short proposal title, e.g. "Online store for <company>"'),
  executive_summary: str('3-4 sentences in plain language: their goal, our solution, the outcome'),
  understanding: arr(str('what the client needs, in their words')),
  scope: arr(obj({ item: str(), description: str('one sentence') })),
  deliverables: arr(str()),
  timeline: arr(obj({ phase: str(), duration: str('e.g. "Week 1-2"'), details: str() })),
  why_us: arr(str()),
  assumptions: arr(str('what we need from the client, what is out of scope')),
  next_steps: arr(str('max 3 short steps, the first is replying YES')),
});

/** The old pipeline's proposal text: standard template only (the in-app AI writer was removed, owner 2026-11-05). */
export async function writeProposal(lead, items) {
  const s = getSettings();
  const pkg = s.packages.find((p) => p.id === lead.recommended_package) || s.packages[0];
  return { content: fallbackProposal(lead, items, pkg, s), source: 'template' };
}

function fallbackProposal(lead, items, pkg, s) {
  const weeks = parseInt(pkg.timeline, 10) || 3;
  const split = Math.max(1, Math.round(weeks / 3));
  return {
    title: `${pkg.name} for ${lead.company}`,
    executive_summary: `${lead.company} needs an online presence that brings in enquiries. We will design and build a ${pkg.name.toLowerCase()} that is fast, mobile-first and easy to update, delivered in ${pkg.timeline} at a fixed price.`,
    understanding: ['Look professional and trustworthy online', 'Turn visitors into enquiries and customers', 'Be easy to find on Google and WhatsApp'],
    scope: items.map((i) => ({ item: i.name, description: i.detail })),
    deliverables: [...pkg.includes, 'Handover and a short training session'],
    timeline: [
      { phase: 'Discovery & design', duration: `Week 1${split > 1 ? `-${split}` : ''}`, details: 'Goals, sitemap and homepage design for your approval' },
      { phase: 'Build', duration: `Week ${split + 1}-${Math.max(split + 1, weeks - 1)}`, details: 'Development, content and integrations' },
      { phase: 'Review & launch', duration: `Week ${weeks}`, details: 'Your feedback, final fixes and go-live' },
    ],
    why_us: ['Fixed price and timeline, no surprises', 'You see progress at every milestone', `Local team: ${s.agency.address}`],
    assumptions: ['You provide logo, text and photos (or we can write the content)', 'Two rounds of revisions are included', 'Third-party fees (domain, paid plugins) are billed at cost'],
    next_steps: ['Reply YES to accept', 'Pay the advance', 'Kick-off call'],
  };
}

/** Template proposal text (used for PDFs of proposals created before AI content existed). */
export function fallbackProposalContent(lead, items) {
  const s = getSettings();
  const pkg = s.packages.find((p) => p.id === lead.recommended_package) || s.packages[0];
  return fallbackProposal(lead, items, pkg, s);
}
