import { registerSchema, run, all } from './db.js';
import { getSettings, getState } from './settings.js';
import { nowISO } from './util.js';

/*
 * Claude usage tracking (owner, 2026-11-09: "add a setup to track usage"). Every Claude Code run on GitHub sends its
 * numbers back with the result (claude-worker/post.mjs → body.usage); acceptResult records one row per answer here,
 * whether the answer was used, failed or hit the subscription limit. The Usage page reads usageReport().
 * Token counts are Claude Code's own: cache reads are the context re-read on every turn (cheap, but they count),
 * "fresh" tokens are input + cache writes + output. cost_usd is what the same work would cost on the paid API;
 * on the subscription it is the share of the plan's limit, not money spent.
 */
registerSchema(`
CREATE TABLE IF NOT EXISTS claude_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  doc_id INTEGER,
  lead_id INTEGER,
  kind TEXT,
  engine TEXT,
  attempt INTEGER,
  outcome TEXT,
  error TEXT,
  turns INTEGER,
  input_tokens INTEGER,
  cache_write INTEGER,
  cache_read INTEGER,
  output_tokens INTEGER,
  web_searches INTEGER,
  cost_usd REAL,
  ms INTEGER,
  models TEXT,
  run_url TEXT
);
CREATE INDEX IF NOT EXISTS claude_usage_at ON claude_usage (at);
`);

const int = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);

/** One Claude answer: outcome ok | limit | error | late (arrived after the doc stopped waiting). */
export async function recordUsage(doc, body, outcome) {
  const u = body?.usage && typeof body.usage === 'object' ? body.usage : {};
  const models = u.models && typeof u.models === 'object' ? JSON.stringify(u.models).slice(0, 2000) : null;
  await run(`INSERT INTO claude_usage (at, doc_id, lead_id, kind, engine, attempt, outcome, error, turns, input_tokens, cache_write, cache_read,
      output_tokens, web_searches, cost_usd, ms, models, run_url)
    VALUES (:at, :doc_id, :lead_id, :kind, :engine, :attempt, :outcome, :error, :turns, :input, :cache_write, :cache_read,
      :output, :web, :cost, :ms, :models, :run_url)`, {
    at: nowISO(), doc_id: doc?.id ?? null, lead_id: doc?.lead_id ?? null,
    kind: doc?.input?.claude?.job?.kind || doc?.kind || null, engine: doc?.input?.claude?.engine || 'github',
    attempt: int(doc?.input?.claude?.attempts), outcome, error: body?.error ? String(body.error).slice(0, 300) : null,
    turns: int(u.turns), input: int(u.input), cache_write: int(u.cache_write), cache_read: int(u.cache_read), output: int(u.output),
    web: int(u.web_search), cost: Number.isFinite(Number(u.cost_usd)) ? Number(u.cost_usd) : null, ms: int(u.ms), models,
    run_url: body?.run_url ? String(body.run_url).slice(0, 300) : null,
  }).catch((e) => console.error('[usage]', e.message)); // tracking never blocks the document
}

const KIND = { script: 'SWOT', deck: 'Brochure', brochure: 'Brochure', free: 'Brochure (Claude designs)', proposal: 'Proposal' };
const total = (r) => (r.input_tokens || 0) + (r.cache_write || 0) + (r.cache_read || 0) + (r.output_tokens || 0);
const fresh = (r) => (r.input_tokens || 0) + (r.cache_write || 0) + (r.output_tokens || 0);

/** Totals for today, the last 5 hours (the subscription window), each day, each tool, each lead, and the latest runs. */
export async function usageReport({ days = 14 } = {}) {
  const tz = getSettings().schedule?.timezone || 'Asia/Kolkata';
  const dayOf = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await all(`SELECT u.*, l.company FROM claude_usage u LEFT JOIN leads l ON l.id = u.lead_id WHERE u.at >= :since ORDER BY u.at DESC`, { since });
  const blank = () => ({ runs: 0, measured: 0, ok: 0, failed: 0, limit: 0, tokens: 0, fresh: 0, output: 0, cost_usd: 0, turns: 0, ms: 0 });
  const add = (a, r) => {
    a.runs++;
    if (total(r) > 0) a.measured++; // runs that reported numbers (a limit hit or a crash reports none)
    if (r.outcome === 'ok') a.ok++; else if (r.outcome === 'limit') a.limit++; else a.failed++;
    a.tokens += total(r); a.fresh += fresh(r); a.output += r.output_tokens || 0; a.cost_usd += r.cost_usd || 0; a.turns += r.turns || 0; a.ms += r.ms || 0;
    return a;
  };
  const today = dayOf(nowISO());
  const window = new Date(Date.now() - 5 * 3600000).toISOString();
  const sum = { today: blank(), window: blank(), period: blank() };
  const byDay = {}, byKind = {}, byLead = {};
  for (const r of rows) {
    add(sum.period, r);
    if (dayOf(r.at) === today) add(sum.today, r);
    if (r.at >= window) add(sum.window, r);
    add(byDay[dayOf(r.at)] ||= blank(), r);
    add(byKind[KIND[r.kind] || r.kind || 'Other'] ||= blank(), r);
    if (r.lead_id) add(byLead[r.lead_id] ||= { ...blank(), lead_id: r.lead_id, company: r.company }, r);
  }
  const perRun = (a) => ({ ...a, cost_usd: +a.cost_usd.toFixed(4), avg_tokens: a.measured ? Math.round(a.tokens / a.measured) : 0, avg_seconds: a.measured ? Math.round(a.ms / 1000 / a.measured) : 0, avg_turns: a.measured ? +(a.turns / a.measured).toFixed(1) : 0 });
  const hold = await getState('claude_hold');
  const lastLimit = rows.find((r) => r.outcome === 'limit');
  return {
    days, timezone: tz,
    today: perRun(sum.today), window: perRun(sum.window), period: perRun(sum.period),
    hold: hold?.until && new Date(hold.until) > new Date() ? { until: hold.until, why: hold.why } : null,
    last_limit: lastLimit ? { at: lastLimit.at, error: lastLimit.error } : null,
    by_day: Object.entries(byDay).sort(([a], [b]) => (a < b ? 1 : -1)).map(([day, a]) => ({ day, ...perRun(a) })),
    by_kind: Object.entries(byKind).map(([kind, a]) => ({ kind, ...perRun(a) })).sort((a, b) => b.tokens - a.tokens),
    top_leads: Object.values(byLead).map(perRun).sort((a, b) => b.tokens - a.tokens).slice(0, 10),
    recent: rows.slice(0, 30).map((r) => ({
      at: r.at, doc_id: r.doc_id, lead_id: r.lead_id, company: r.company, kind: KIND[r.kind] || r.kind, outcome: r.outcome, error: r.error,
      turns: r.turns, tokens: total(r), fresh: fresh(r), output: r.output_tokens, web_searches: r.web_searches, cost_usd: r.cost_usd,
      // Claude Code does not fill the web-search counter for its own WebSearch/WebFetch tools; pages it reads are
      // summarised by the small Haiku model, so a Haiku line in the run's model usage means it did research
      research: !!(r.web_searches || /haiku/i.test(r.models || '')),
      seconds: r.ms ? Math.round(r.ms / 1000) : null, run_url: r.run_url,
    })),
  };
}
