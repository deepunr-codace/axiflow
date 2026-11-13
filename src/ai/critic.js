/*
 * Stage 5 of the SWOT pipeline: Check (owner's SWOT fix guide, 2026-11-13, sections 5.5 and 6.4).
 * After postScript(), a separate call (claude-sonnet-5-5 on the Anthropic API, no tools, ~2,000 tokens) gives a verdict
 * on every SWOT point and every solution "problem" against the same verified facts and evidence the writer had.
 * Then, in code: unsupported points are dropped, overstated ones are replaced by the critic's fix. A quadrant may end
 * with fewer than two points: it stays short and is never padded with template text. The verdicts are stored with the
 * document (content.swot_check) so the review screen can show what was removed or reworded.
 */
import { SWOT_KEYS } from './script.js';

export const CRITIC_MODEL = 'claude-sonnet-5-5';

// The guide's critic prompt (6.4), word for word.
export const CRITIC_SYSTEM = `You check a SWOT against its sources. You receive <verified_facts>, <evidence> and the SWOT JSON.
For every SWOT point and every solution "problem", give a verdict:
- supported: the cited items say this.
- overstated: the items support only a weaker claim (e.g. "many" when they show 2; "not visible on
  Google" when one search came back empty). Give the strongest wording they do support as "fix".
- unsupported: no cited item says it, or it contradicts a verified fact.
Do not add points. Return JSON only:
{"checks": [{"path": "swot.weaknesses[0]", "verdict": "supported|overstated|unsupported", "fix": ""}]}`;

export const CRITIC_SCHEMA = {
  type: 'object', required: ['checks'], additionalProperties: false,
  properties: { checks: { type: 'array', items: { type: 'object', required: ['path', 'verdict', 'fix'], additionalProperties: false,
    properties: { path: { type: 'string' }, verdict: { type: 'string', enum: ['supported', 'overstated', 'unsupported'] }, fix: { type: 'string' } } } } },
};

/** The fact lines exactly as the writer saw them (script.js context()), so both read the same ground truth. */
export const factLines = (facts) => (facts || []).map((f) => `${f.id}. ${f.kind && f.kind !== 'seen' ? `(${f.kind === 'not_checked' ? 'not checked' : f.kind}) ` : ''}${f.text} (${f.source})`).join('\n');

/** What the critic is shown: the sources and the SWOT with its refs (paths match the checks it returns). */
export function criticPrompt(content, sources = {}) {
  const refsOf = (k, text) => (content.swot_refs || []).find((r) => r.quadrant === k && r.text === text) || {};
  const swot = { summary: content.swot?.summary || '' };
  for (const [k] of SWOT_KEYS) swot[k] = (content.swot?.[k] || []).map((text) => { const r = refsOf(k, text); return { text, refs: r.refs || [], basis: r.basis || 'evidence' }; });
  const solutions = (content.solutions || []).map((s) => ({ service: s.service, problem: s.problem }));
  return `<verified_facts>
${factLines(sources.facts) || 'none'}
</verified_facts>

<evidence>
${JSON.stringify({ evidence: sources.evidence || [], competitors: sources.competitors || [] })}
</evidence>

<swot>
${JSON.stringify({ swot, solutions })}
</swot>

Give a verdict for every point in swot.strengths, swot.weaknesses, swot.opportunities, swot.threats (paths such as "swot.weaknesses[0]") and for every solutions[i].problem (paths such as "solutions[0].problem").`;
}

/**
 * Applies the verdicts in code. Returns { content, check } where check = { status: 'checked', model, at, checks,
 * removed: [{ path, text }], changed: [{ path, from, to }] }. An overstated point with an empty fix is dropped.
 */
export function applyCritic(content, checks, { model = CRITIC_MODEL } = {}) {
  const out = structuredClone(content);
  const removed = [], changed = [];
  const verdict = new Map();
  for (const c of checks || []) if (c && typeof c.path === 'string') verdict.set(c.path.replace(/\s+/g, ''), c);
  const refs = out.swot_refs || [];
  for (const [k] of SWOT_KEYS) {
    const keep = [];
    (out.swot?.[k] || []).forEach((text, i) => {
      const v = verdict.get(`swot.${k}[${i}]`);
      const r = refs.find((x) => x.quadrant === k && x.text === text);
      if (v?.verdict === 'unsupported' || (v?.verdict === 'overstated' && !String(v.fix || '').trim())) { removed.push({ path: `swot.${k}[${i}]`, text }); if (r) r.removed = true; return; }
      if (v?.verdict === 'overstated') {
        const to = String(v.fix).trim().replace(/\s*\[(?:[VE]\d{1,3}(?:\s*,\s*)?)+\]/g, '');
        changed.push({ path: `swot.${k}[${i}]`, from: text, to });
        if (r) r.text = to;
        keep.push(to); return;
      }
      keep.push(text);
    });
    if (out.swot) out.swot[k] = keep; // fewer than two is fine: kept short, never padded
  }
  out.swot_refs = refs.filter((r) => !r.removed);
  out.solutions = (out.solutions || []).flatMap((s, i) => {
    const v = verdict.get(`solutions[${i}].problem`);
    if (v?.verdict === 'unsupported' || (v?.verdict === 'overstated' && !String(v.fix || '').trim())) { removed.push({ path: `solutions[${i}]`, text: `${s.service}: ${s.problem}` }); return []; }
    if (v?.verdict === 'overstated') { changed.push({ path: `solutions[${i}].problem`, from: s.problem, to: String(v.fix).trim() }); return [{ ...s, problem: String(v.fix).trim() }]; }
    return [s];
  });
  const check = { status: 'checked', model, at: new Date().toISOString(), checks: (checks || []).map((c) => ({ path: c.path, verdict: c.verdict, fix: c.fix || '' })), removed, changed };
  return { content: { ...out, swot_check: check }, check };
}

/**
 * Runs the critic on a cleaned SWOT. When it cannot run (no API key, spend limit, an error) the SWOT is kept and marked
 * "not checked" with the reason: it is a human's call in the CRM's Approve SWOT step, and nothing is filled in.
 */
export async function checkSwot(content, sources, { leadId = null } = {}) {
  const { runJson } = await import('./claude.js');
  try {
    const r = await runJson({ purpose: 'swot_critic', leadId, system: CRITIC_SYSTEM, prompt: criticPrompt(content, sources), schema: CRITIC_SCHEMA,
      effort: 'low', maxTokens: 2000, force: { provider: 'anthropic', model: CRITIC_MODEL } });
    return applyCritic(content, r?.checks || []).content;
  } catch (e) {
    return { ...content, swot_check: { status: 'not_checked', reason: String(e.message || e).slice(0, 300), at: new Date().toISOString() } };
  }
}
