// Lean jobs (SWOT): save Claude's answer as work/out/result.json for validate/post. With --json-schema the answer is
// the structured output; otherwise (older CLI) the JSON is taken from the final message. A message without parseable
// JSON leaves no result file, so post.mjs reports it and AxiFlow retries.
// Argument: the Claude Code output file in work/ (default claude.json; the repair round passes claude-repair.json).
import fs from 'node:fs';
const dir = new URL('./work/', import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL(process.argv[2] || 'claude.json', dir), 'utf8'));
const save = (out, how) => {
  fs.mkdirSync(new URL('out/', dir), { recursive: true });
  fs.writeFileSync(new URL('out/result.json', dir), JSON.stringify(out, null, 2));
  console.log(`answer saved (${how})`);
};
const structured = j.structured_output ?? j.structuredOutput;
if (structured && typeof structured === 'object') save(structured, 'structured output');
else {
  const text = String(j.result || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  try { save(JSON.parse(text.slice(a, b + 1)), 'final message'); } catch (e) {
    console.log(`answer is not JSON (${e.message.slice(0, 80)}); result keys: ${Object.keys(j).join(',')}`);
  }
}
