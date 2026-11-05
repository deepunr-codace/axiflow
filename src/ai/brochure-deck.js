import { getSettings } from '../settings.js';
import { ASSETS, agencyFacts } from '../design/brochure-data.js';
import { PROMPT_VERSION, buildMessages, systemPrompt, contextLayer, taskLayer, BROCHURE_SCHEMA, parseModelOutput, toBrochureData } from './brochure-deck-core.js';
export * from './brochure-deck-core.js';

/*
 * AI brochure engine for the Growth Deck / Editorial designs, ported from the owner's template package
 * (Downloads/files (1)/brochure-template/components/brochure/ai: brief.ts, schemas.ts, prompt/layers.ts,
 * prompt/assemble.ts, brochure-ai.ts, generate.ts; docs/PROMPTS.md), 2026-11-05.
 *
 * Claude (Claude mode, on GitHub) invents the concept, writes the copy and picks the palette, images and layouts;
 * the brief supplies the facts (names, contact details, numbers, image files) and code merges those in.
 * deckJob() = the brochure-stage prompt plus the concepts → draft → critique → repair process for one session;
 * postDeck() = the guard rails (stats not in the brief removed, unknown image ids dropped, highlights checked).
 * Without Claude the brochure is the rule-based copy (contentToData).
 */

// =============================================================== the brief
/** BrochureBrief from a tool document's input (CRM lead) + Tool settings. */
export function buildBrief(input, { design = '', research = null, settings = getSettings() } = {}) {
  const a = settings.agency || {};
  const { facts, stats, market } = agencyFacts(settings);
  const svcIds = input.services?.length ? input.services : settings.brochure.services.map((x) => x.id);
  const services = settings.brochure.services.filter((x) => svcIds.includes(x.id)).map((x) => ({ name: x.name, notes: x.help_bullet || '' }));
  const notes = [input.notes, research?.business_summary, research?.what_they_sell && `Sells: ${research.what_they_sell}`, research?.target_customers && `Customers: ${research.target_customers}`, research?.online_presence && `Online today: ${research.online_presence}`]
    .filter(Boolean).join('\n').slice(0, 3000);
  return {
    agency: { name: a.name || 'Codeace', facts, stats, phone: a.phone, address: a.address, email: a.email, website: String(a.website || '').replace(/^https?:\/\//, '') },
    client: { name: input.company, industry: input.industry || 'Local business', location: input.city || '', notes: notes || undefined, ...(research?.pain_points?.length ? { goals: research.pain_points.slice(0, 4).map(String) } : {}) },
    services,
    marketStats: market.map((m) => ({ value: m.value, label: m.label, source: m.source || 'agency' })),
    assets: ASSETS.map(({ id, kind, orientation, description, src }) => ({ id, kind, orientation, description, src })),
    creativity: ['balanced', 'bold', 'wild'].includes(settings.brochure_ai?.creativity) ? settings.brochure_ai.creativity : 'bold',
    design: design || undefined,
  };
}

// The in-app staged pipeline (concepts → brochure → critique → repair with runJson) was removed (owner, 2026-11-05:
// "remove old logics"); Claude mode runs the same process in one session (deckJob below).

/** The assembled prompts of every stage for a brief, for review (Tool settings → "See the AI prompts"). */
export function promptPreview(brief) {
  const stub = '{"…":"the draft brochure JSON"}';
  return ['concepts', 'brochure', 'critique', 'repair'].map((stage) => {
    const b = buildMessages(stage, { brief, concept: { name: '<chosen concept>', bigIdea: '…', whyItFits: '…', voice: '…', sampleHeadlines: [], risk: '…' }, draftJson: stub, issues: [{ path: 'services.0.lead', message: 'example' }] });
    return { stage, system: b.system, messages: b.messages };
  });
}

/**
 * The deck brochure as one job (Claude mode): the brochure-stage system prompt, plus the staged process
 * (concepts → draft → self-critique → repair) as instructions, since Claude Code works through it in one session.
 * postDeck() applies the same parse + truth checks as the in-app pipeline.
 */
export function deckJob(brief) {
  const creativity = brief.creativity ?? 'bold';
  return {
    kind: 'deck', purpose: 'brochure_deck', schema: BROCHURE_SCHEMA, maxTokens: 16000,
    system: systemPrompt('brochure', creativity),
    prompt: [contextLayer(brief), taskLayer('brochure'), `<process>
Work in these steps before you write the file:
1. Concepts: propose three genuinely different concepts that frame the agency's services through the client's world; pick the strongest.
2. Draft: write the full brochure on that concept.
3. Critique: score the draft 1–5 for specificity, coherence, freshness, clarity and truthfulness (only brief facts); list the weakest fields.
4. Repair: fix those fields and anything over the <layout_contract> limits. The validator lists layout problems; fix every one.
</process>`].join('\n\n'),
    brief,
    prompt_version: PROMPT_VERSION,
  };
}
export const postDeck = (output, brief) => toBrochureData(parseModelOutput(output), brief);
