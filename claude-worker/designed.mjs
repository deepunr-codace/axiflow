// The designed brochure on the GitHub runner (brochure fix guide 2026-11-13, stages 2-4; AxiFlow sends it as a job with
// purpose "brochure_designed"). Everything runs on the Claude subscription, in this order:
//   1. Write: one call (job.model, no tools) → story, theme, fonts, pages as HTML, claims; the output check in code
//      (8-14 pages, known theme and fonts, claims cite ids of the brief) with one repair round.
//   2. Claims check: one call (job.review_model) gives a verdict per claim; unsupported or overstated text is replaced
//      or removed in the page HTML.
//   3. Render: the pages printed in Chromium (src/brochure/render.js) with the layout check; one JPEG per page.
//   4. Visual review: one call that opens the page images (Read tool) and returns full replacements for pages that need
//      them; applied, rendered and checked once more. What is still wrong marks the brochure "needs a look".
// Writes work/out/result.json (the answer AxiFlow takes) and work/claude.json (the usage of all calls, for post.mjs).
// Prompts go in on stdin (the review message holds every page's HTML). CLAUDE_BIN = the Claude Code executable
// (default "claude"); locally on Windows point it at claude.exe.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const W = path.join(here, 'work');
const job = JSON.parse(fs.readFileSync(path.join(W, 'job.json'), 'utf8'));
const { checkOutput, CLAIMS_SYSTEM, CLAIMS_SCHEMA, claimsMessage, applyClaims, REVIEW_SYSTEM, REVIEW_SCHEMA, reviewMessage, applyReview } = await import('../src/brochure/writer.js');
const { designedHtml, checkInPage } = await import('../src/brochure/render.js');
const { withPage } = await import('../src/html-docs/chrome.js');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// --- Claude Code calls, with their usage added up
const usage = { num_turns: 0, total_cost_usd: 0, duration_ms: 0, usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 0 } }, modelUsage: {}, steps: [] };
function addUsage(step, j) {
  usage.num_turns += j.num_turns || 0; usage.total_cost_usd += j.total_cost_usd || 0; usage.duration_ms += j.duration_ms || 0;
  for (const k of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']) usage.usage[k] += j.usage?.[k] || 0;
  for (const [m, v] of Object.entries(j.modelUsage || {})) {
    const u = usage.modelUsage[m] ||= { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 };
    for (const k of Object.keys(u)) u[k] += v[k] || 0;
  }
  usage.steps.push({ step, turns: j.num_turns, ms: j.duration_ms, usd: j.total_cost_usd, subtype: j.subtype });
}
const saveUsage = (subtype = 'success') => fs.writeFileSync(path.join(W, 'claude.json'), JSON.stringify({ ...usage, subtype }, null, 2));
function claude(step, { system, prompt, model, schema, tools = '', maxTurns = 3, allowed = '' }) {
  const args = ['-p', '--system-prompt', system, '--tools', tools, '--strict-mcp-config', '--max-turns', String(maxTurns), '--output-format', 'json'];
  if (allowed) args.push('--allowedTools', allowed);
  if (model) args.push('--model', model);
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  const t0 = Date.now();
  const r = spawnSync(process.env.CLAUDE_BIN || 'claude', args, { input: prompt, encoding: 'utf8', cwd: W, maxBuffer: 64 * 1024 * 1024, timeout: 40 * 60000 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* no JSON: failed before answering */ }
  if (j) addUsage(step, j);
  log(`${step}: ${j ? `${j.subtype}, ${j.num_turns} turns` : `no answer (exit ${r.status}${r.error ? `, ${r.error.message}` : ''})`}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!j || j.is_error) throw new Error(`${step}: ${String(j?.result || r.stderr || r.error?.message || 'Claude Code did not answer').slice(0, 300)}`);
  const out = j.structured_output ?? j.structuredOutput ?? (() => { const t = String(j.result || ''); const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); })();
  return out;
}

// --- rendering with the client's own images (their URLs; AxiFlow prints the stored copies)
const imgUrl = Object.fromEntries((job.images || []).map((i) => [i.id, i.url]).filter(([, u]) => u));
const SIZE = { width: 1123, height: 794 };
async function renderCheck(out, tag) {
  const html = designedHtml(out, { client: job.client || '', date: job.date || '', docName: 'Growth Brochure', contact: job.contact || {}, imageSrc: (id) => imgUrl[id] || null });
  const dir = path.join(W, 'pages');
  fs.mkdirSync(dir, { recursive: true });
  const r = await withPage(html, { ...SIZE, scaleFactor: 1 }, async (page) => {
    await page.evaluate(async () => { await Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((ok) => { im.onload = im.onerror = ok; })))); });
    const issues = await page.evaluate(checkInPage);
    const files = [];
    const els = await page.$$('.page');
    for (let i = 0; i < els.length; i++) { const f = path.join(dir, `${tag}-p${String(i + 1).padStart(2, '0')}.jpg`); await els[i].screenshot({ path: f, type: 'jpeg', quality: 80 }); files.push(f); }
    return { issues, files };
  });
  log(`render ${tag}: ${r.files.length} pages, ${r.issues.length} layout issue(s)`);
  return r;
}

let result = null;
try {
  // 1. Write (+ one repair round)
  let out = claude('write', { system: job.system, prompt: job.prompt, model: job.model, schema: job.schema, maxTurns: job.max_turns || 3 });
  let problems = checkOutput(out, { ids: job.brief_ids, images: job.images });
  if (problems.length) {
    log(`output check: ${problems.length} problem(s), repair round`);
    out = claude('repair', { system: job.system, model: job.model, schema: job.schema, maxTurns: 3,
      prompt: `${job.prompt}\n\nYour previous answer did not pass the checks:\n${problems.slice(0, 25).map((p) => `- ${p}`).join('\n')}\n\nYour previous answer:\n${JSON.stringify(out).slice(0, 80000)}\n\nReturn the complete corrected JSON.` });
    problems = checkOutput(out, { ids: job.brief_ids, images: job.images });
  }
  const check = { output_problems: problems };

  // 2. Claims check
  try {
    const c = claude('claims', { system: CLAIMS_SYSTEM, prompt: claimsMessage({ brief: job.brief, out }), model: job.review_model, schema: CLAIMS_SCHEMA, maxTurns: 3 });
    const a = applyClaims(out.pages, c.checks);
    out = { ...out, pages: a.pages };
    check.claims = { status: 'checked', checks: c.checks || [], applied: a.applied.length, unresolved: a.unresolved };
  } catch (e) { check.claims = { status: 'not_checked', reason: e.message.slice(0, 300) }; }

  // 3. Render + layout check, 4. visual review (one round), then render + check again
  const first = await renderCheck(out, 'before');
  check.layout_before = first.issues;
  try {
    const rel = first.files.map((f) => path.relative(W, f).replace(/\\/g, '/'));
    const rv = claude('review', { system: REVIEW_SYSTEM, prompt: reviewMessage({ out, issues: first.issues, imageFiles: rel }), model: job.review_model, schema: REVIEW_SCHEMA,
      tools: 'Read', allowed: 'Read', maxTurns: rel.length + 4 });
    const a = applyReview(out.pages, rv.changes);
    out = { ...out, pages: a.pages };
    check.review = { status: 'reviewed', changes: a.applied, ok_pages: rv.ok_pages || [] };
  } catch (e) { check.review = { status: 'not_reviewed', reason: e.message.slice(0, 300) }; }
  const last = check.review.changes?.length ? await renderCheck(out, 'after') : first;
  check.layout_after = last.issues;
  const after = checkOutput(out, { ids: job.brief_ids, images: job.images });
  const reasons = [
    ...last.issues.map((x) => `page ${x.page}: ${x.what}${x.text ? ` ("${x.text}")` : ''}`),
    ...after.map((p) => `output: ${p}`),
    ...(check.claims.status !== 'checked' ? ['the claims were not checked'] : (check.claims.unresolved || []).filter((u) => u.verdict === 'unsupported').map((u) => `an unsupported claim could not be removed (claim ${u.claim})`)),
    ...(check.review.status !== 'reviewed' ? ['the pages were not reviewed'] : []),
  ];
  check.needs_look = reasons.length > 0;
  check.reasons = reasons.slice(0, 20);
  check.at = new Date().toISOString();
  result = { ...out, check };
  fs.mkdirSync(path.join(W, 'out'), { recursive: true });
  fs.writeFileSync(path.join(W, 'out', 'result.json'), JSON.stringify(result, null, 2));
  saveUsage();
  log(`done: ${out.pages.length} pages, needs a look: ${check.needs_look}${reasons.length ? ` (${reasons.slice(0, 3).join('; ')})` : ''}`);
} catch (e) {
  saveUsage('error');
  fs.writeFileSync(path.join(W, 'claude-error.txt'), String(e.message).slice(0, 300));
  log(`failed: ${e.message}`);
  process.exitCode = 1;
}
const { browser } = await import('../src/html-docs/chrome.js');
await (await browser().catch(() => null))?.close().catch(() => {});
process.exit(process.exitCode || 0);
