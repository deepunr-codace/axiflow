// Brochure comparison (brochure fix guide 2026-11-13, section 10 and phase 5): for each lead, build the brief, make the
// brochure with both templates (the CodeAce Growth Brochure = template 25, and the Designed brochure), and write the
// PDFs side by side as A and B (shuffled) for blind review, with the brief to paste into Claude web as the baseline.
//
//   node --env-file=.env scripts/compare-brochures.js 276 [more lead ids] [--only ps|designed] [--out data/brochure-compare]
//
// Safe to run against the live data:
//  - read-only: DB_READ_ONLY=1 (every database write is refused; no schema changes), the CRM is only read;
//  - no API key: the AI runs only on this computer's Claude Code CLI (CLAUDE_BIN, the Claude subscription); the
//    Anthropic and other keys are removed from this process, so nothing here can bill the API;
//  - pictures go to local storage (data/uploads), never the live bucket; nothing is sent to the CRM.
// Each brochure takes several minutes (the designed one makes 3-4 calls). Runs one at a time (claude-worker/work).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

process.env.DB_READ_ONLY = '1';
for (const k of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'BLOB_READ_WRITE_TOKEN', 'GITHUB_DISPATCH_TOKEN']) delete process.env[k];

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ids = args.filter((a, i) => /^\d+$/.test(a) && !['--only', '--out'].includes(args[i - 1])).map(Number);
if (!ids.length) { console.log('Give one or more lead ids, e.g. node --env-file=.env scripts/compare-brochures.js 276'); process.exit(1); }
const only = opt('--only');
const OUT = path.resolve(opt('--out') || 'data/brochure-compare');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const WORK = path.join(ROOT, 'claude-worker', 'work');
const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const { loadSettings, getSettings } = await import('../src/settings.js');
const { get } = await import('../src/db.js');
const tools = await import('../src/tools.js');
const h = await import('../src/html-docs/index.js');
await loadSettings();
const TEMPLATES = { ps: 'builtin-html-brochure-ps', designed: h.DESIGNED };

/** The template-25 job the way the runner does it (lean: prepare.mjs, one Claude call, one repair round). */
function runLean() {
  const job = JSON.parse(fs.readFileSync(path.join(WORK, 'job.json'), 'utf8'));
  const call = (prompt, extra, file) => {
    const a = ['-p', '--system-prompt', fs.readFileSync(path.join(WORK, 'SYSTEM-inline.txt'), 'utf8'), ...extra, '--strict-mcp-config', '--output-format', 'json'];
    if (job.model) a.push('--model', job.model);
    const r = spawnSync(CLAUDE, a, { input: prompt, encoding: 'utf8', cwd: WORK, maxBuffer: 64e6, timeout: 60 * 60000 });
    fs.writeFileSync(path.join(WORK, file), r.stdout || '');
    return r.status === 0;
  };
  const web = job.web ? ['--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch'] : ['--tools', ''];
  if (!call(fs.readFileSync(path.join(WORK, 'PROMPT-inline.txt'), 'utf8'), [...web, '--max-turns', String(job.max_turns || 10)], 'claude.json')) throw new Error('Claude Code did not answer');
  spawnSync(process.execPath, ['claude-worker/inline-result.mjs'], { cwd: ROOT, stdio: 'inherit' });
  if (spawnSync(process.execPath, ['claude-worker/repair-prompt.mjs'], { cwd: ROOT, stdio: 'inherit' }).status === 0) {
    if (call(fs.readFileSync(path.join(WORK, 'PROMPT-repair.txt'), 'utf8'), ['--tools', '', '--max-turns', '2'], 'claude-repair.json')) spawnSync(process.execPath, ['claude-worker/inline-result.mjs', 'claude-repair.json'], { cwd: ROOT, stdio: 'inherit' });
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const leadId of ids) {
  const lead = await get(`SELECT * FROM leads WHERE id = :id`, { id: leadId });
  if (!lead) { log(`lead ${leadId}: not found`); continue; }
  const dir = path.join(OUT, `${leadId}-${String(lead.company).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`);
  fs.mkdirSync(dir, { recursive: true });
  const pre = await tools.leadPrefill(leadId);
  const made = {};
  for (const [key, source] of Object.entries(TEMPLATES)) {
    if (only && only !== key) continue;
    const t0 = Date.now();
    try {
      const tpl = await get(`SELECT id FROM design_templates WHERE source = :source ORDER BY id LIMIT 1`, { source });
      const s = getSettings();
      const doc = { id: 0, kind: 'brochure', token: 'compare', title: lead.company, lead_id: leadId, template_id: tpl?.id ?? null, status: 'working', created_at: new Date().toISOString(),
        input: { ...pre, website_type: lead.website_type || '', services: s.brochure.services.map((x) => x.id), auto: true } };
      // the template itself (a new template has no row in the database until the new code starts there once)
      const template = { id: tpl?.id ?? null, kind: 'brochure', mode: 'html', source, name: h.HTML_TEMPLATES[source].name };
      const { job } = await tools.buildClaudeJob(doc, s, { preview: true, template });
      if (job.template !== source) throw new Error(`the job was built for ${job.template}, not ${source}`);
      if (job.brief) { // the baseline's input: the same brief and style note, to paste into Claude web
        const { STYLE_NOTE } = await import('../src/brochure/writer.js');
        fs.writeFileSync(path.join(dir, 'brief.txt'), `Design and write a landscape sales brochure (8-12 pages) for this business, from this brief only. Sell exactly the offer.\n\n<brief>\n${job.brief}\n</brief>\n\n<style_note>\n${STYLE_NOTE}\n</style_note>\n`);
      }
      fs.writeFileSync(path.join(dir, `${key}-prompt.txt`), `${job.system}\n\n=====\n\n${job.prompt}\n`);
      fs.rmSync(WORK, { recursive: true, force: true });
      fs.mkdirSync(path.join(WORK, 'out'), { recursive: true });
      fs.writeFileSync(path.join(WORK, 'payload.json'), JSON.stringify({ doc_id: -1, token: 'compare', callback: 'http://localhost/none', kind: job.kind, job }));
      spawnSync(process.execPath, ['claude-worker/prepare.mjs'], { cwd: ROOT, stdio: 'inherit' });
      if (job.purpose === 'brochure_designed') {
        const r = spawnSync(process.execPath, ['claude-worker/designed.mjs'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CLAUDE_BIN: CLAUDE } });
        if (r.status !== 0) throw new Error(fs.existsSync(path.join(WORK, 'claude-error.txt')) ? fs.readFileSync(path.join(WORK, 'claude-error.txt'), 'utf8') : 'designed.mjs failed');
      } else runLean();
      const output = JSON.parse(fs.readFileSync(path.join(WORK, 'out', 'result.json'), 'utf8'));
      fs.writeFileSync(path.join(dir, `${key}-answer.json`), JSON.stringify(output, null, 2));
      const content = h.acceptHtml(source, output, job);
      const d = { ...doc, status: 'ready', content };
      if (source === TEMPLATES.ps) await tools.addClientPhotos(d, content);
      const issues = source === h.DESIGNED ? await h.designedIssues(d) : null;
      const pdf = await h.htmlDocPdf(d);
      const usage = JSON.parse(fs.readFileSync(path.join(WORK, 'claude.json'), 'utf8'));
      made[key] = { pdf, issues, check: content.html.check || null, minutes: +((Date.now() - t0) / 60000).toFixed(1), cost_equivalent_usd: +(usage.total_cost_usd || 0).toFixed(2), turns: usage.num_turns };
      log(`lead ${leadId} ${key}: ${(pdf.length / 1024).toFixed(0)} KB, ${made[key].minutes} min${issues ? `, ${issues.length} layout issue(s)` : ''}`);
    } catch (e) { log(`lead ${leadId} ${key}: failed: ${e.message}`); made[key] = { error: e.message }; }
  }
  // blind: A and B in a random order; the key says which is which
  const keys = Object.keys(made).filter((k) => made[k].pdf);
  if (keys.length === 2 && crypto.randomInt(2)) keys.reverse();
  const key = {};
  keys.forEach((k, i) => { const label = 'AB'[i] || `X${i}`; fs.writeFileSync(path.join(dir, `${label}.pdf`), made[k].pdf); key[label] = k; });
  fs.writeFileSync(path.join(dir, 'key.json'), JSON.stringify({ lead: leadId, company: lead.company, key, runs: Object.fromEntries(Object.entries(made).map(([k, v]) => [k, { ...v, pdf: undefined }])) }, null, 2));
  fs.writeFileSync(path.join(dir, 'README.txt'), `Blind comparison for ${lead.company} (lead ${leadId}).
1. Paste brief.txt into Claude web (with the style note at its end) and save that brochure here as C.pdf: the baseline.
2. Two reviewers score A, B and C without opening key.json (guide section 10): specific to the business, clear single
   offer, looks professional (1-5 each), facts correct (any false claim?), send as is (yes / no).
3. key.json says which template made A and B.
`);
  log(`lead ${leadId}: ${dir}`);
}
const { browser } = await import('../src/html-docs/chrome.js');
await (await browser().catch(() => null))?.close().catch(() => {});
process.exit(0);
