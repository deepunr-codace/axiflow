import Anthropic from '@anthropic-ai/sdk';
import { get, insert } from '../db.js';
import { getSettings } from '../settings.js';
import { nowISO, tzParts, zonedToUtc, BASE_URL } from '../util.js';

/**
 * Thin wrapper over the AI provider used by the pitch maker, the manager and the tools.
 * Providers: Anthropic (Claude API, ANTHROPIC_API_KEY) or OpenRouter (OPENROUTER_API_KEY, OpenAI-style
 * chat completions with structured outputs and the "web" plugin). settings.ai.provider: auto | anthropic | openrouter
 * (auto = Anthropic when its key is set, otherwise OpenRouter).
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

const anthropicKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const openrouterKey = () => !!process.env.OPENROUTER_API_KEY;

/** Which provider runs the calls: the setting, or (auto) whichever key is present. */
export function aiProvider(s = getSettings()) {
  const want = s.ai.provider || 'auto';
  if (want === 'anthropic' || want === 'openrouter') return want;
  return anthropicKey() ? 'anthropic' : openrouterKey() ? 'openrouter' : 'anthropic';
}
const keyFor = (p) => (p === 'openrouter' ? openrouterKey() : anthropicKey());
/** OpenRouter model id: the setting, or the Claude model mapped to OpenRouter's naming (claude-opus-5-5 → anthropic/claude-opus-5.5). */
const orModel = (s) => s.ai.openrouter_model || `anthropic/${String(s.ai.model).replace(/-(\d+)-(\d+)$/, '-$1.$2')}`;
export const activeModel = (s = getSettings()) => (aiProvider(s) === 'openrouter' ? orModel(s) : s.ai.model);

export function aiEnabled() {
  const s = getSettings();
  return !!s.ai.enabled && keyFor(aiProvider(s));
}

export async function aiStatus() {
  const s = getSettings();
  const provider = aiProvider(s);
  return {
    enabled: aiEnabled(),
    provider,
    key_set: keyFor(provider),
    keys: { anthropic: anthropicKey(), openrouter: openrouterKey() },
    model: activeModel(s),
    spent_today_usd: Number((await spentToday(s)).toFixed(4)),
    daily_budget_usd: s.ai.daily_budget_usd,
  };
}

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

async function preflight() {
  const s = getSettings();
  if (!aiEnabled()) throw new AiError(!s.ai.enabled ? 'AI is turned off in Settings' : `No API key for ${aiProvider(s)} (set ${aiProvider(s) === 'openrouter' ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY'})`);
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
export async function runText({ purpose, leadId, system, prompt, tools, effort = 'medium', maxTokens = 32000 }) {
  const s = await preflight();
  if (aiProvider(s) === 'openrouter') {
    const web = (tools || []).some((t) => /web_search|web_fetch/.test(t.type || t.name || ''));
    // OpenRouter bills web search separately, so free models (":free") cannot use it on an account without credits:
    // fail fast and let the caller use its no-AI fallback instead of a model guessing "research" from memory.
    if (web && /:free$/.test(orModel(s))) throw new AiError('Web research needs OpenRouter credits (free models cannot search the web)');
    return limited(() => orRun({ s, purpose, leadId, system, prompt, effort, maxTokens, web }));
  }
  return limited(async () => {
    const t0 = Date.now();
    const usage = { in: 0, out: 0, ws: 0 };
    const messages = [{ role: 'user', content: prompt }];
    const texts = [];
    const sources = new Map();
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
      return { text: texts.join('\n').trim(), sources: [...sources].map(([url, title]) => ({ url, title })) };
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
 * temperature / model (OpenRouter model override) / timeoutMs are optional; temperature is only sent to OpenRouter.
 */
export async function runJson({ purpose, leadId, system, prompt, messages = null, schema, effort = 'low', maxTokens = 16000, temperature, model, timeoutMs }) {
  const s = await preflight();
  if (aiProvider(s) === 'openrouter') return limited(async () => (await orRun({ s, purpose, leadId, system, prompt, messages, effort, maxTokens, schema, temperature, modelOverride: model, timeoutMs })).data);
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

// ------------------------------------------------------------------ OpenRouter
const OR_URL = `${(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`;

function orError(status, body) {
  const m = body?.error?.message || body?.error || '';
  if (status === 401) return 'invalid OpenRouter API key';
  if (status === 402) return 'OpenRouter credits used up (add credits at openrouter.ai)';
  if (status === 429) return 'rate limited by OpenRouter';
  return `OpenRouter error ${status}: ${String(m).slice(0, 200)}`;
}

/** JSON from a model reply, tolerating a ```json fence around it. */
function parseJson(text) {
  try { return JSON.parse(text); } catch { /* try fenced or embedded */ }
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text) || /(\{[\s\S]*\})/.exec(text);
  if (m) return JSON.parse(m[1]);
  throw new SyntaxError('no JSON');
}

/**
 * One OpenRouter chat completion. schema → structured output (strict JSON schema); web → the "web" plugin
 * (search results come back as url_citation annotations). Returns { text, data, sources }.
 */
async function orRun({ s, purpose, leadId, system, prompt, messages = null, effort, maxTokens, schema = null, web = false, temperature, modelOverride, timeoutMs = 280000 }) {
  const t0 = Date.now();
  const model = modelOverride || orModel(s);
  const usage = { in: 0, out: 0, ws: 0 };
  try {
    const body = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...(messages || [{ role: 'user', content: prompt }])],
      ...(typeof temperature === 'number' ? { temperature } : {}),
      reasoning: { effort: ['low', 'medium', 'high'].includes(effort) ? effort : 'medium', exclude: true },
      usage: { include: true },
      // require_parameters: only route to providers that honour response_format (some free endpoints ignore it)
      ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'output', strict: true, schema } }, provider: { require_parameters: true } } : {}),
      ...(web ? { plugins: [{ id: 'web', max_results: Math.max(1, Math.min(10, s.ai.web_search_max_uses || 5)) }] } : {}),
    };
    const r = await fetch(OR_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json', 'HTTP-Referer': BASE_URL, 'X-Title': 'AxiFlow' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(10000, Math.min(280000, timeoutMs || 280000))),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok || res.error) throw new AiError(orError(r.status === 200 ? res.error?.code || 500 : r.status, res));
    const choice = res.choices?.[0] || {};
    usage.in = res.usage?.prompt_tokens || 0;
    usage.out = res.usage?.completion_tokens || 0;
    if (typeof res.usage?.cost === 'number') usage.cost = res.usage.cost;
    if (web) usage.ws = 1;
    if (choice.finish_reason === 'length') throw new AiError('response truncated (max_tokens)');
    const text = typeof choice.message?.content === 'string' ? choice.message.content
      : (choice.message?.content || []).map((p) => p.text || '').join('');
    const sources = new Map();
    for (const a of choice.message?.annotations || []) if (a.type === 'url_citation' && a.url_citation?.url) sources.set(a.url_citation.url, a.url_citation.title || a.url_citation.url);
    const data = schema ? parseJson(text) : null;
    await logCall({ leadId, purpose, model: res.model || model, usage, ms: Date.now() - t0, status: 'ok' });
    return { text: String(text || '').trim(), data, sources: [...sources].map(([url, title]) => ({ url, title })) };
  } catch (e) {
    const msg = e instanceof AiError ? e.message : e instanceof SyntaxError ? 'invalid JSON from model' : e.name === 'TimeoutError' ? 'OpenRouter timed out' : e.message;
    await logCall({ leadId, purpose, model, usage, ms: Date.now() - t0, status: 'error', error: msg });
    throw new AiError(msg);
  }
}

/** Helper for strict JSON schemas: every property required, no extras. */
export function obj(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
export const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
export const arr = (items, description) => ({ type: 'array', items, ...(description ? { description } : {}) });
