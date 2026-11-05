import { getSettings } from '../settings.js';
import { runJson, aiEnabled } from './claude.js';
import { ASSETS, agencyFacts } from '../design/brochure-data.js';
import { PROMPT_VERSION, STAGE_LAYERS, buildMessages, systemPrompt, contextLayer, taskLayer, BROCHURE_SCHEMA, CONCEPTS_SCHEMA, CRITIQUE_SCHEMA, BrochureOutputError, parseConcepts, parseCritique, parseModelOutput, toBrochureData } from './brochure-deck-core.js';
export * from './brochure-deck-core.js';

/*
 * AI brochure engine for the Growth Deck / Editorial designs, ported from the owner's template package
 * (Downloads/files (1)/brochure-template/components/brochure/ai: brief.ts, schemas.ts, prompt/layers.ts,
 * prompt/assemble.ts, brochure-ai.ts, generate.ts; docs/PROMPTS.md), 2026-11-05.
 *
 * The model invents the concept, writes the copy and picks the palette, images and layouts; the brief
 * supplies the facts (names, contact details, numbers, image files) and code merges those in. Stages:
 *   1 concepts  three directions, the model recommends one
 *   2 brochure  full copy + art direction on that concept
 *   3 critique  a critic scores the draft (settings.brochure_ai.critic_model, optional)
 *   4 repair    one round for the critic's notes and text that overflows the layout
 * "single" runs stage 2 (+ 4 for overflow only). Runs through runJson (OpenRouter or Claude, structured
 * output). Guard rails: stats not in the brief are removed, unknown image ids dropped, highlights checked.
 * Any failure → the caller falls back to the rule-based copy (contentToData).
 */
const BUDGET_MS = 240000; // a document job has ~300 s on Vercel

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

// =============================================================== the pipeline
async function call(stage, built, schema, parse, opts, trace) {
  const t0 = Date.now();
  const ask = (messages) => runJson({
    purpose: `brochure_${stage}`, leadId: opts.leadId, system: built.system, messages, schema, effort: 'medium', maxTokens: 16000,
    temperature: opts.temperatures?.[stage], model: stage === 'critique' ? opts.criticModel || undefined : undefined,
    timeoutMs: Math.max(20000, opts.deadline - Date.now()),
  });
  let value;
  try { value = parse(await ask(built.messages)); } catch (e) {
    // one more try when the reply was unusable (invalid JSON or missing parts)
    if (!(e instanceof BrochureOutputError) && !/invalid JSON/i.test(e.message)) throw e;
    if (Date.now() > opts.deadline - 30000) throw e;
    value = parse(await ask([...built.messages, { role: 'user', content: `${e.message} Return the complete JSON matching the schema, with nothing else.` }]));
  }
  trace.push({ stage, ms: Date.now() - t0, layers: STAGE_LAYERS[stage] });
  return value;
}

/**
 * The whole brochure from a brief. Returns { data, design, concept, concepts, critique, issues, removed, trace, source }.
 * Throws when AI is off or the brochure stage fails (callers fall back to the rule-based copy).
 */
export async function generateDeckData(brief, opts = {}) {
  if (!aiEnabled()) throw new Error('AI is off');
  const s = getSettings();
  const staged = (opts.pipeline || s.brochure_ai?.pipeline || 'staged') === 'staged';
  const o = { temperatures: { concepts: 1.1, brochure: 0.9, critique: 0.2 }, criticModel: s.brochure_ai?.critic_model || '', ...opts, deadline: Date.now() + (opts.budgetMs || BUDGET_MS) };
  const trace = [];
  const left = () => o.deadline - Date.now();

  let concepts, concept = opts.concept;
  if (!concept && staged) {
    try { concepts = await call('concepts', buildMessages('concepts', { brief }), CONCEPTS_SCHEMA, parseConcepts, o, trace); concept = concepts.concepts[concepts.chosenIndex]; }
    catch (e) { trace.push({ stage: 'concepts', error: e.message }); }
  }
  const draft = await call('brochure', buildMessages('brochure', { brief, concept }), BROCHURE_SCHEMA, parseModelOutput, o, trace);
  let result = toBrochureData(draft, brief);
  const draftJson = JSON.stringify(draft);

  let critique;
  if (staged && left() > 90000) {
    try { critique = await call('critique', buildMessages('critique', { brief, concept, draftJson }), CRITIQUE_SCHEMA, parseCritique, o, trace); }
    catch (e) { trace.push({ stage: 'critique', error: e.message }); }
  }
  const overflow = result.issues.filter((i) => i.level === 'error' || i.level === 'warning');
  if ((overflow.length || critique?.verdict === 'revise') && opts.repair !== false && left() > 75000) {
    try {
      const repaired = await call('repair', buildMessages('repair', { brief, concept, draftJson, issues: overflow, critique }), BROCHURE_SCHEMA, parseModelOutput, o, trace);
      const next = toBrochureData(repaired, brief);
      if (next.issues.length <= result.issues.length) result = next; // keep the revision unless it made the layout worse
    } catch (e) { trace.push({ stage: 'repair', error: e.message }); }
  }
  return { ...result, concepts, critique, concept: result.concept || concept, trace: { promptVersion: PROMPT_VERSION, stages: trace }, source: 'ai' };
}

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
