// One repair round for lean jobs without --json-schema (kind html; brochure fix guide 2026-11-13): when the answer in
// work/out/result.json is missing or fails validate.mjs (hard problems only), write work/PROMPT-repair.txt with the
// task, the previous answer and the problems, and exit 0; the workflow then runs Claude once more without tools.
// Exit 3 = nothing to repair (answer fine, or not a lean html job).
import fs from 'node:fs';
import { validate, hardProblems } from './validate.mjs';
const dir = new URL('./work/', import.meta.url);
const job = JSON.parse(fs.readFileSync(new URL('job.json', dir), 'utf8'));
if (job.kind !== 'html' || !fs.existsSync(new URL('PROMPT-inline.txt', dir))) process.exit(3);
const problems = hardProblems(await validate());
if (!problems.length) process.exit(3);
const prev = fs.existsSync(new URL('out/result.json', dir)) ? fs.readFileSync(new URL('out/result.json', dir), 'utf8') : '';
fs.writeFileSync(new URL('PROMPT-repair.txt', dir), `${fs.readFileSync(new URL('PROMPT-inline.txt', dir), 'utf8')}

Your previous answer did not match the schema:
${problems.slice(0, 25).map((p) => `- ${p}`).join('\n')}
${prev ? `\nYour previous answer:\n${prev.slice(0, 60000)}\n` : '\nYour previous answer was not a JSON object.\n'}
Return the complete corrected JSON only. Do not research again.`);
console.log(`repair round: ${problems.length} problem(s)`);
