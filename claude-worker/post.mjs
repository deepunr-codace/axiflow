// Sends Claude's result (or the reason there is none) back to AxiFlow: POST <callback> with x-webhook-secret.
import fs from 'node:fs';
import { validate } from './validate.mjs';
const dir = new URL('./work/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('meta.json', dir), 'utf8'));
let body = { doc_id: meta.doc_id, token: meta.token, run_url: process.env.RUN_URL || null };
const problems = await validate();
const hard = problems.filter((p) => !/characters; keep it to|removed by the truth checks|Give exactly|lines or fewer|^layout:|\.(fonts|font_pairing|strategy|review)(\.|:)/.test(p)); // layout warnings: AxiFlow fits the text
const claudeErr = fs.existsSync(new URL('claude-error.txt', dir)) ? fs.readFileSync(new URL('claude-error.txt', dir), 'utf8').trim() : '';
if (claudeErr) body.error = `Claude Code: ${claudeErr}`.slice(0, 500);
else if (hard.length) body.error = `Claude's answer did not pass the checks: ${hard.slice(0, 5).join('; ')}`.slice(0, 500);
else body.output = JSON.parse(fs.readFileSync(new URL('out/result.json', dir), 'utf8'));
const r = await fetch(meta.callback, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': process.env.AXIFLOW_CALLBACK_SECRET || '' }, body: JSON.stringify(body) });
console.log(`AxiFlow answered ${r.status}${body.error ? ' (sent an error: ' + body.error.slice(0, 120) + ')' : ''}`);
if (!r.ok) process.exit(1);
