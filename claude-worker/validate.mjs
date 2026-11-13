// Checks claude-worker/work/out/result.json against the job's schema (and, for brochure decks, the layout limits
// and truth checks AxiFlow applies: src/ai/brochure-deck-core.js). Prints "OK" or the problems; exit 1 on problems.
import fs from 'node:fs';
const dir = new URL('./work/', import.meta.url);
const job = JSON.parse(fs.readFileSync(new URL('job.json', dir), 'utf8'));

// the schema check is shared with the API engines (src/ai/schema-check.js)
import { checkSchema } from '../src/ai/schema-check.js';
export { checkSchema };

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
  if (!problems.length && job.kind === 'free') problems.push(...checkSlides(result));
  // HTML brochures: words particular to the reference example must not appear unless they are true for this business
  // (in the lead data, or confirmed with a URL in verification.facts); same rule as AxiFlow's exampleLeaks()
  if (job.kind === 'html' && Array.isArray(job.example_terms)) {
    const lead = [...String(job.prompt || '').matchAll(/<(lead|crm_and_notes|research|website_check|swot)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]).join('\n').toLowerCase(); // the lead's own sections
    const text = JSON.stringify({ ...result, verification: undefined, strategy: undefined, review: undefined }).toLowerCase();
    const confirmed = JSON.stringify((result?.verification?.facts || []).filter((f) => f.status === 'confirmed' && /^https?:\/\//.test(f.source || ''))).toLowerCase();
    const leaks = job.example_terms.filter((t) => { const w = t.toLowerCase(); return new RegExp(`\\b${w}\\b`).test(text) && !lead.includes(w) && !confirmed.includes(w); });
    if (leaks.length) problems.push(`copied from the reference example: ${leaks.join(', ')}. Write about this business only, or confirm the fact with a URL in verification.facts`);
  }
  return problems;
}

// "Claude designs" brochures: a rough, dependency-free layout check (AxiFlow measures exactly and shrinks text that
// still runs off). Width per character ≈ 0.55 em; these problems are warnings ("layout:"), post.mjs still sends them.
function checkSlides(r) {
  const W = 1920, H = 1080, out = [];
  const known = new Set(job.images || []);
  (r.pages || []).forEach((p, pi) => {
    const where = `slide ${pi + 1}${p.name ? ` (${p.name})` : ''}`;
    if (!/^#[0-9a-f]{6}$/i.test(p.bg || '')) out.push(`layout: ${where}: bg should be a #rrggbb colour`);
    const boxes = [];
    (p.elements || []).forEach((e, i) => {
      if (e.type === 'image' && !known.has(e.image)) out.push(`layout: ${where}, element ${i}: unknown image "${e.image}" (use an id from the catalogue)`);
      if (e.type !== 'text' || e.arc) return;
      const size = e.size || 16, lh = e.lh || 1.3, perLine = Math.max(1, Math.floor(e.w / (size * 0.55 + (e.ls || 0))));
      const lines = String(e.text || '').replace(/\*\*/g, '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
      const h = lines * size * lh;
      const label = `"${String(e.text || '').slice(0, 30)}"`;
      if (e.x < 0 || e.y < 0 || e.x + e.w > W) out.push(`layout: ${where}: text ${label} is outside the slide`);
      if (e.y + h > H) out.push(`layout: ${where}: text ${label} probably runs off the bottom (about ${Math.round(e.y + h - H)} pt)`);
      boxes.push({ x: e.x, y: e.y, w: e.w, h, label });
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 20 && oy > 8) out.push(`layout: ${where}: text ${a.label} and ${b.label} probably overlap`);
    }
  });
  if ((r.pages || []).length < 8) out.push(`layout: give 10–12 slides (got ${(r.pages || []).length})`);
  return out;
}

if (/validate\.mjs$/.test(process.argv[1] || '')) { // run as a script (post.mjs imports it)
  const problems = await validate();
  if (!problems.length) { console.log('OK'); process.exit(0); }
  console.log(`${problems.length} problem(s):\n- ${problems.slice(0, 40).join('\n- ')}`);
  process.exit(1);
}
