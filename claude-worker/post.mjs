// Sends Claude's result (or the reason there is none) back to AxiFlow: POST <callback> with x-webhook-secret.
import fs from 'node:fs';
import { validate, hardProblems } from './validate.mjs';
const dir = new URL('./work/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('meta.json', dir), 'utf8'));
let body = { doc_id: meta.doc_id, token: meta.token, run_url: process.env.RUN_URL || null };
// Usage for the Usage page (numbers only): turns, tokens, cost-equivalent, time, per model.
// A lean html job may have had a repair round (claude-repair.json): its numbers are added to the first run's.
const usageOf = (j) => {
  const u = j.usage || {};
  return {
    turns: j.num_turns, cost_usd: j.total_cost_usd, ms: j.duration_ms, input: u.input_tokens, cache_write: u.cache_creation_input_tokens,
    cache_read: u.cache_read_input_tokens, output: u.output_tokens, web_search: u.server_tool_use?.web_search_requests,
    models: Object.fromEntries(Object.entries(j.modelUsage || {}).map(([k, v]) => [k, { in: v.inputTokens, out: v.outputTokens, cache_read: v.cacheReadInputTokens, cache_write: v.cacheCreationInputTokens, usd: v.costUSD }])),
  };
};
const addUsage = (a, b) => {
  const out = { ...a };
  for (const k of ['turns', 'cost_usd', 'ms', 'input', 'cache_write', 'cache_read', 'output', 'web_search']) if (b[k] != null) out[k] = (Number(a[k]) || 0) + Number(b[k]);
  out.models = { ...a.models };
  for (const [m, v] of Object.entries(b.models || {})) {
    const w = out.models[m] || {};
    out.models[m] = Object.fromEntries(['in', 'out', 'cache_read', 'cache_write', 'usd'].map((k) => [k, (Number(w[k]) || 0) + (Number(v[k]) || 0)]));
  }
  return out;
};
try {
  const j = JSON.parse(fs.readFileSync(new URL('claude.json', dir), 'utf8'));
  body.usage = usageOf(j);
  // why Claude Code stopped (e.g. error_max_turns): shown with a missing answer file (found live 2026-11-13: doc 489
  // came back without out/result.json and nothing said why)
  body.stop = `${j.subtype || 'finished'} after ${j.num_turns ?? '?'} steps`;
  if (fs.existsSync(new URL('claude-repair.json', dir))) {
    try { body.usage = addUsage(body.usage, usageOf(JSON.parse(fs.readFileSync(new URL('claude-repair.json', dir), 'utf8')))); body.stop += ' + 1 repair round'; } catch { /* repair run did not answer */ }
  }
} catch { /* Claude Code did not answer: no usage */ }
const problems = await validate();
const hard = hardProblems(problems); // layout warnings: AxiFlow fits the text; a missing gaps slide is simply left out
const claudeErr = fs.existsSync(new URL('claude-error.txt', dir)) ? fs.readFileSync(new URL('claude-error.txt', dir), 'utf8').trim() : '';
if (claudeErr) body.error = `Claude Code: ${claudeErr}`.slice(0, 500);
else if (hard.length) body.error = `Claude's answer did not pass the checks${!fs.existsSync(new URL('out/result.json', dir)) && body.stop ? ` (Claude Code: ${body.stop})` : ''}: ${hard.slice(0, 5).join('; ')}`.slice(0, 500);
else body.output = JSON.parse(fs.readFileSync(new URL('out/result.json', dir), 'utf8'));
const r = await fetch(meta.callback, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': process.env.AXIFLOW_CALLBACK_SECRET || '' }, body: JSON.stringify(body) });
console.log(`AxiFlow answered ${r.status}${body.error ? ' (sent an error: ' + body.error.slice(0, 120) + ')' : ''}`);
if (!r.ok) process.exit(1);
