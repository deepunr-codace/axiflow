import Anthropic from '@anthropic-ai/sdk';
import { get, insert } from '../db.js';
import { getSettings } from '../settings.js';
import { nowISO, tzParts, zonedToUtc } from '../util.js';

/**
 * Thin wrapper over the Claude API (ANTHROPIC_API_KEY), used by the API engine of the tools, the editor assistant and
 * the manager. The only provider: OpenRouter (and its free models) was removed on 2026-11-13 (owner: "remove all free
 * ai from our axiflow(openrouter)").
 * - every call is logged to ai_calls with an estimated cost
 * - a daily USD budget and a concurrency limit protect the account
 * - server-side refusal fallback is enabled (fallbacks: "default")
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
// USD per 1M tokens (input, output). Web search is billed per search.
const PRICES = {
  'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-1': [10, 50], 'claude-opus-5': [5, 25],
};
const WEB_SEARCH_USD = 0.01;

export class AiError extends Error {}

let client = null;
const api = () => (client ??= new Anthropic());
/** Keys saved in Integrations (src/keys.js) change process.env: the next call builds a client with the new key. */
export function resetClient() { client = null; }

const anthropicKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
/** The provider: always the Claude API (kept as a function for the callers that show it). */
export const aiProvider = () => 'anthropic';
export const activeModel = (s = getSettings()) => s.ai.model;

export function aiEnabled() {
  const s = getSettings();
  return !!s.ai.enabled && anthropicKey();
}

export async function aiStatus() {
  const s = getSettings();
  const provider = aiProvider(s);
  return {
    enabled: aiEnabled(),
    provider,
    key_set: anthropicKey(),
    keys: { anthropic: anthropicKey() },
    model: activeModel(s),
    spent_today_usd: Number((await spentToday(s)).toFixed(4)),
    daily_budget_usd: s.ai.daily_budget_usd,
  };
}

/** True while today's AI spend is under the daily limit (the Claude mode fallback checks it before switching to the API). */
export const budgetLeft = async (s = getSettings()) => (await spentToday(s)) < s.ai.daily_budget_usd;
async function spentToday(s) {
  const { date } = tzParts(new Date(), s.schedule.timezone);
  const since = zonedToUtc(date, '00:00', s.schedule.timezone);
  return (await get(`SELECT COALESCE(SUM(cost_usd),0) v FROM ai_calls WHERE created_at >= :since`, { since })).v;
}

// --- concurrency limiter
let active = 0;
const waiting = [];
async function limited(fn) {
  const max = Math.max(1, getSettings().ai.max_concurrent || 2);
  if (active >= max) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally {
    active--;
    waiting.shift()?.();
  }
}

function cost(model, inTok, outTok, searches) {
  const [pi, po] = PRICES[model] || PRICES['claude-opus-5-5'];
  return (inTok * pi + outTok * po) / 1e6 + searches * WEB_SEARCH_USD;
}

async function logCall({ leadId, purpose, model, usage, ms, status, error }) {
  const base = String(model).replace(/^anthropic\//, '').replace(/(\d+)\.(\d+)$/, '$1-$2');
  await insert('ai_calls', {
    lead_id: leadId ?? null, purpose, model,
    input_tokens: usage.in, output_tokens: usage.out, web_searches: usage.ws,
    cost_usd: usage.cost ?? cost(base, usage.in, usage.out, usage.ws), ms, status, error: error?.slice(0, 500), created_at: nowISO(),
  });
}

function addUsage(acc, u) {
  if (!u) return;
  acc.in += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  acc.out += u.output_tokens || 0;
  acc.ws += u.server_tool_use?.web_search_requests || 0;
}

/**
 * force = { provider, model }: the Claude engines of Claude mode (src/claude-worker.js) run with that model and do not
 * need "Use AI" switched on; the daily budget still applies.
 */
async function preflight(force = null) {
  const s = getSettings();
  if (force?.provider) {
    if (force.provider !== 'anthropic') throw new AiError(`Unknown AI provider ${force.provider}`);
    if (force.model) s.ai.model = force.model;
    if (!anthropicKey()) throw new AiError('No Anthropic API key (add it on the AI page)');
    if (await spentToday(s) >= s.ai.daily_budget_usd) throw new AiError(`Daily AI budget of $${s.ai.daily_budget_usd} reached`);
    return s;
  }
  if (!aiEnabled()) throw new AiError(!s.ai.enabled ? 'AI is turned off (AI page)' : 'No Anthropic API key (add it on the AI page)');
  if (await spentToday(s) >= s.ai.daily_budget_usd) throw new AiError(`Daily AI budget of $${s.ai.daily_budget_usd} reached`);
  return s;
}

function describeError(e) {
  if (e instanceof Anthropic.RateLimitError) return 'rate limited by the API';
  if (e instanceof Anthropic.AuthenticationError) return 'invalid API key';
  if (e instanceof Anthropic.APIError) return `API error ${e.status ?? ''}: ${e.message}`;
  return e.message;
}

/**
 * Free-text call, optionally with server tools (web_search / web_fetch). Streams so long
 * outputs don't hit HTTP timeouts, and resumes `pause_turn` from long server-tool loops.
 * Returns { text, sources }.
 */
// (The backup provider for the in-app AI, ai.backup_provider, went with OpenRouter on 2026-11-13: one provider only.)
export const runText = (args) => runTextOnce({ ...args, force: args.force || null });
export const runJson = (args) => runJsonOnce({ ...args, force: args.force || null });

async function runTextOnce({ purpose, leadId, system, prompt, tools, effort = 'medium', maxTokens = 32000, force = null }) {
  const s = await preflight(force);
  return limited(async () => {
    const t0 = Date.now();
    const usage = { in: 0, out: 0, ws: 0 };
    const messages = [{ role: 'user', content: prompt }];
    const texts = [];
    const sources = new Map();
    const blocks = []; // every content block of every turn (SWOT guide 5.2: the research gate needs the URLs the run saw)
    try {
      let final;
      for (let i = 0; i < 6; i++) {
        final = await api().beta.messages.stream({
          model: s.ai.model,
          max_tokens: maxTokens,
          system,
          messages,
          ...(tools?.length ? { tools } : {}),
          output_config: { effort },
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
        }).finalMessage();
        addUsage(usage, final.usage);
        blocks.push(...final.content);
        for (const b of final.content) {
          if (b.type === 'text') texts.push(b.text);
          if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
            for (const r of b.content) if (r.url) sources.set(r.url, r.title || r.url);
          }
        }
        if (final.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: final.content });
      }
      if (final.stop_reason === 'refusal') throw new AiError(`declined (${final.stop_details?.category || 'policy'})`);
      await logCall({ leadId, purpose, model: final.model || s.ai.model, usage, ms: Date.now() - t0, status: 'ok' });
      return { text: texts.join('\n').trim(), sources: [...sources].map(([url, title]) => ({ url, title })), message: { content: blocks, stop_reason: final.stop_reason, model: final.model } };
    } catch (e) {
      const msg = e instanceof AiError ? e.message : describeError(e);
      await logCall({ leadId, purpose, model: s.ai.model, usage, ms: Date.now() - t0, status: 'error', error: msg });
      throw new AiError(msg);
    }
  });
}

/** Schema-constrained JSON call (structured outputs). Returns the parsed object. */
/**
 * messages: a whole conversation after the system prompt ([{ role: 'user'|'assistant', content }]) instead of one prompt.
 * temperature / model / timeoutMs are accepted for older callers and not used.
 */
async function runJsonOnce({ purpose, leadId, system, prompt, messages = null, schema, effort = 'low', maxTokens = 16000, temperature, model, timeoutMs, force = null }) {
  const s = await preflight(force);
  return limited(async () => {
    const t0 = Date.now();
    const usage = { in: 0, out: 0, ws: 0 };
    try {
      // Streamed so large outputs (template fills, long proposals) never hit the SDK's 10-minute non-streaming guard.
      const res = await api().beta.messages.stream({
        model: s.ai.model,
        max_tokens: maxTokens,
        system,
        messages: messages || [{ role: 'user', content: prompt }],
        output_config: { effort, format: { type: 'json_schema', schema } },
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
      }).finalMessage();
      addUsage(usage, res.usage);
      if (res.stop_reason === 'refusal') throw new AiError(`declined (${res.stop_details?.category || 'policy'})`);
      if (res.stop_reason === 'max_tokens') throw new AiError('response truncated (max_tokens)');
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const data = JSON.parse(text);
      await logCall({ leadId, purpose, model: res.model || s.ai.model, usage, ms: Date.now() - t0, status: 'ok' });
      return data;
    } catch (e) {
      const msg = e instanceof AiError ? e.message : e instanceof SyntaxError ? 'invalid JSON from model' : describeError(e);
      await logCall({ leadId, purpose, model: s.ai.model, usage, ms: Date.now() - t0, status: 'error', error: msg });
      throw new AiError(msg);
    }
  });
}

/** Helper for strict JSON schemas: every property required, no extras. */
export function obj(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
export const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
export const arr = (items, description) => ({ type: 'array', items, ...(description ? { description } : {}) });
