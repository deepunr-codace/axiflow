// Inline jobs (SWOT): Claude's final message is the JSON answer. Save it as work/out/result.json for validate/post.
// A message without parseable JSON leaves no result file, so post.mjs reports it and AxiFlow retries.
import fs from 'node:fs';
const dir = new URL('./work/', import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL('claude.json', dir), 'utf8'));
const text = String(j.result || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '');
const a = text.indexOf('{'), b = text.lastIndexOf('}');
try {
  const out = JSON.parse(text.slice(a, b + 1));
  fs.mkdirSync(new URL('out/', dir), { recursive: true });
  fs.writeFileSync(new URL('out/result.json', dir), JSON.stringify(out, null, 2));
  console.log('inline answer saved');
} catch (e) {
  console.log(`inline answer is not JSON (${e.message.slice(0, 80)})`);
}
