// Checks claude-worker/work/out/result.json against the job's schema (and, for brochure decks, the layout limits
// and truth checks AxiFlow applies: src/ai/brochure-deck-core.js). Prints "OK" or the problems; exit 1 on problems.
import fs from 'node:fs';
const dir = new URL('./work/', import.meta.url);
const job = JSON.parse(fs.readFileSync(new URL('job.json', dir), 'utf8'));

export function checkSchema(v, s, path = '$', out = []) {
  if (!s) return out;
  if (s.anyOf) {
    const ok = s.anyOf.some((alt) => checkSchema(v, alt, path, []).length === 0);
    if (!ok) out.push(`${path}: does not match any allowed form${v === null ? ' (null not allowed here)' : ''}`);
    return out;
  }
  const t = s.type;
  if (Array.isArray(t)) { if (!t.some((x) => checkSchema(v, { ...s, type: x }, path, []).length === 0)) out.push(`${path}: should be ${t.join(' or ')}`); return out; }
  if (t === 'null') { if (v !== null) out.push(`${path}: should be null`); return out; }
  if (t === 'string') { if (typeof v !== 'string') out.push(`${path}: should be a string`); else if (s.enum && !s.enum.includes(v)) out.push(`${path}: should be one of ${s.enum.join(', ')}`); return out; }
  if (t === 'integer') { if (!Number.isInteger(v)) out.push(`${path}: should be a whole number`); else if (s.enum && !s.enum.includes(v)) out.push(`${path}: should be one of ${s.enum.join(', ')}`); return out; }
  if (t === 'number') { if (typeof v !== 'number') out.push(`${path}: should be a number`); return out; }
  if (t === 'boolean') { if (typeof v !== 'boolean') out.push(`${path}: should be true or false`); return out; }
  if (t === 'array') { if (!Array.isArray(v)) out.push(`${path}: should be a list`); else v.forEach((x, i) => checkSchema(x, s.items, `${path}[${i}]`, out)); return out; }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { out.push(`${path}: should be an object`); return out; }
    for (const k of s.required || []) if (!(k in v)) out.push(`${path}.${k}: missing`);
    if (s.additionalProperties === false) for (const k of Object.keys(v)) if (!(k in (s.properties || {}))) out.push(`${path}.${k}: not allowed`);
    for (const [k, sub] of Object.entries(s.properties || {})) if (k in v) checkSchema(v[k], sub, `${path}.${k}`, out);
  }
  return out;
}

export async function validate() {
  let result;
  try { result = JSON.parse(fs.readFileSync(new URL('out/result.json', dir), 'utf8')); } catch (e) { return [`out/result.json is missing or not valid JSON (${e.message})`]; }
  const problems = checkSchema(result, job.schema);
  if (!problems.length && job.kind === 'deck') {
    const core = await import('../src/ai/brochure-deck-core.js');
    try {
      const r = core.toBrochureData(core.parseModelOutput(result), job.brief);
      for (const i of r.issues) problems.push(`${i.path}: ${i.message}`);
      for (const x of r.removed) problems.push(`removed by the truth checks: ${x}`);
    } catch (e) { problems.push(e.message); }
  }
  return problems;
}

if (/validate\.mjs$/.test(process.argv[1] || '')) { // run as a script (post.mjs imports it)
  const problems = await validate();
  if (!problems.length) { console.log('OK'); process.exit(0); }
  console.log(`${problems.length} problem(s):\n- ${problems.slice(0, 40).join('\n- ')}`);
  process.exit(1);
}
