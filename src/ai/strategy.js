/*
 * One strategy per lead (owner, 2026-11-05: correct pitch, relevant to the business and its needs, in the
 * brochure and the proposal). The first Claude job for a lead (usually the call script) works out the lead's
 * needs, the one angle, the offer and the proof, and returns it as `strategy`. AxiFlow keeps it on the lead
 * (leads.strategy_json) and gives it to every later job, so the call, the brochure and the proposal tell one story.
 * Every job also gets a quality review to run before it answers, and returns its own scores (`review`).
 */
const str = { type: 'string' };
const strs = { type: 'array', items: str };
const int = { type: 'integer' };
export const STRATEGY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['needs', 'angle', 'offer', 'proof', 'tone', 'avoid'],
  properties: {
    needs: { ...strs, description: '2-4 needs of this business, in its own terms' },
    angle: { ...str, description: 'the one idea the whole pitch is built on' },
    offer: { ...str, description: 'what Codeace proposes first, in one sentence' },
    proof: { ...strs, description: 'true proof points to use (the business\'s or Codeace\'s)' },
    tone: str,
    avoid: { ...strs, description: 'what not to say to this business' },
  },
};
export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['relevance', 'specificity', 'consistency', 'premium', 'facts', 'notes'],
  properties: { relevance: int, specificity: int, consistency: int, premium: int, facts: int, notes: str },
};

/** Adds strategy + review to a job's output schema (both soft: a missing one never fails the job). */
export function withStrategy(schema, { review = true } = {}) {
  if (!schema || schema.type !== 'object' || schema.properties?.strategy) return schema;
  if (!review) return { ...schema, properties: { ...schema.properties, strategy: STRATEGY_SCHEMA }, required: [...(schema.required || []), 'strategy'] };
  return { ...schema, properties: { ...schema.properties, strategy: STRATEGY_SCHEMA, review: REVIEW_SCHEMA }, required: [...(schema.required || []), 'strategy', 'review'] };
}

export function strategySection(strategy) {
  if (!strategy) {
    return `<strategy>
No strategy has been agreed for this lead yet. Before writing, work it out from the research, the CRM record and the vertical playbook, and return it as "strategy": the business's real needs (2-4, in their terms), the one angle the pitch is built on, the first offer, the true proof points, the tone, and what to avoid saying. Later documents for this lead will follow it.
</strategy>`;
  }
  return `<strategy>
The agreed strategy for this lead (used by the call script and every other document for it). Build on it so everything tells one story: the same needs, angle, offer and tone. Sharpen it only where the research clearly shows something better, and return it as "strategy".
${JSON.stringify(strategy, null, 1)}
</strategy>`;
}

const KIND = { script: 'call script', brochure: 'brochure', proposal: 'proposal' };
export function qualitySection(kind) {
  return `<quality_review>
Before you answer, review the ${KIND[kind] || 'document'} as the agency's creative director would, and score each point from 1 to 10:
- relevance: fits this vertical and how its customers buy (the playbook), not a generic small business;
- specificity: names this business's own offerings, customers, place and situation; nothing could be pasted into another client's document;
- consistency: follows the strategy (needs, angle, offer, tone) from start to end;
- premium: reads and looks like a top studio made it: confident, concrete, no clichés or filler, a deliberate typeface and palette;
- facts: nothing invented about the client or Codeace; numbers only from the brief or the research.
Rewrite every part that scores below 8, then score again. Return the final scores and one line of notes as "review".
</quality_review>`;
}

/** The strategy from a Claude answer, cleaned (or null). */
export function cleanStrategy(s) {
  if (!s || typeof s !== 'object' || !s.angle) return null;
  const list = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 6) : []);
  return { needs: list(s.needs), angle: String(s.angle).slice(0, 400), offer: String(s.offer || '').slice(0, 400), proof: list(s.proof), tone: String(s.tone || '').slice(0, 200), avoid: list(s.avoid) };
}
export function cleanReview(r) {
  if (!r || typeof r !== 'object') return null;
  const n = (v) => Math.max(1, Math.min(10, Math.round(Number(v) || 0))) || null;
  return { relevance: n(r.relevance), specificity: n(r.specificity), consistency: n(r.consistency), premium: n(r.premium), facts: n(r.facts), notes: String(r.notes || '').slice(0, 300) };
}
