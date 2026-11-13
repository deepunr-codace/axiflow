// SWOT golden set (SWOT fix guide 2026-11-13, section 8): checks each golden lead's latest SWOT against the hand-written
// true / false statements in tests/golden/fixtures.json, and prints the guide's quality numbers.
//
//   node --env-file=.env scripts/golden-set.js               check the latest SWOTs (read-only: every database write is blocked)
//   node scripts/golden-set.js --from answers.json            check SWOT contents from a file ({ "<company>": content }), no database
//   node --env-file=.env scripts/golden-set.js --generate --yes   first write a new SWOT for every golden lead (uses the AI
//                                                             engines set on the AI page, i.e. real AI spend), then check
//
// Every run is saved in data/golden-runs/ and compared with the previous one.
// Targets (guide section 8): false absence claims 0, factual errors 0, critic-dropped share under 15 % per lead,
// 8+ evidence items for leads with a website.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const fixtures = JSON.parse(fs.readFileSync(opt('--fixtures') || 'tests/golden/fixtures.json', 'utf8'));
const generate = flag('--generate');
if (generate && !flag('--yes')) { console.log('--generate writes a new SWOT for every golden lead with the real AI engines (real spend). Add --yes to go ahead.'); process.exit(1); }

/** Every text of a SWOT that a statement can match: points, summary, pitch point, solution problems. */
export function swotTexts(c) {
  const out = [];
  if (c?.pitch_point) out.push(['pitch_point', c.pitch_point]);
  if (c?.swot?.summary) out.push(['swot.summary', c.swot.summary]);
  for (const k of ['strengths', 'weaknesses', 'opportunities', 'threats']) (c?.swot?.[k] || []).forEach((t, i) => out.push([`swot.${k}[${i}]`, t]));
  (c?.solutions || []).forEach((s, i) => out.push([`solutions[${i}].problem`, s.problem || '']));
  return out;
}
/** One lead's result against its fixture. */
export function scoreLead(fx, content, extra = {}) {
  const texts = swotTexts(content);
  const hit = (st) => texts.filter(([, t]) => st.patterns.some((p) => new RegExp(p, 'i').test(t)));
  const falseHits = fx.false.map((st) => ({ ...st, where: hit(st).map(([w, t]) => `${w}: ${t}`) })).filter((x) => x.where.length);
  const covered = fx.true.filter((st) => hit(st).length).length;
  const chk = content?.swot_check;
  const points = ['strengths', 'weaknesses', 'opportunities', 'threats'].reduce((n, k) => n + (content?.swot?.[k]?.length || 0), 0);
  const dropped = chk?.status === 'checked' ? (chk.removed || []).length : null;
  return {
    company: fx.company, doc: extra.doc || null, approved: !!extra.approved,
    false_absence: falseHits.filter((x) => x.type === 'absence').map((x) => ({ text: x.text, where: x.where })),
    factual_errors: falseHits.filter((x) => x.type !== 'absence').map((x) => ({ text: x.text, where: x.where })),
    truths_covered: `${covered}/${fx.true.length}`,
    critic: chk ? (chk.status === 'checked' ? { removed: dropped, changed: (chk.changed || []).length, dropped_share: points + dropped ? Math.round((dropped / (points + dropped)) * 100) : 0 } : { status: chk.status, reason: chk.reason }) : null,
    evidence: extra.evidence ?? null,
    to_confirm: (content?.swot?.to_confirm || []).length,
  };
}

async function fromDatabase() {
  let blocked = 0;
  if (!generate) { // read-only: every statement that is not a plain read is blocked at the driver (the start-up schema step too)
    const pg = (await import('pg')).default;
    const orig = pg.Client.prototype.query;
    const isRead = (t) => /^\s*(select|with\s[\s\S]*?\bselect\b)/i.test(t) && !/\b(insert|update|delete|alter|create|drop|truncate|grant)\b/i.test(t);
    pg.Client.prototype.query = function (q, ...rest) {
      const text = typeof q === 'string' ? q : q?.text || '';
      if (isRead(text)) return orig.call(this, q, ...rest);
      blocked++;
      const r = { rows: [], rowCount: 0, fields: [] }; const cb = rest.find((x) => typeof x === 'function');
      if (cb) { cb(null, r); return undefined; } return Promise.resolve(r);
    };
  }
  const { get } = await import('../src/db.js');
  const { loadSettings } = await import('../src/settings.js');
  await loadSettings();
  const tools = await import('../src/tools.js');
  const out = [];
  for (const fx of fixtures.leads) {
    const lead = fx.lead_id ? await get(`SELECT id, website, research_json FROM leads WHERE id = :id`, { id: fx.lead_id })
      : await get(`SELECT id, website, research_json FROM leads WHERE company ILIKE :c AND crm_removed_at IS NULL ORDER BY id DESC LIMIT 1`, { c: fx.company });
    if (!lead) { out.push({ company: fx.company, missing: 'lead not found' }); continue; }
    if (generate) {
      const id = await tools.createDoc('script', { lead_id: lead.id }, { wait: true }).catch((e) => { console.log(`  ${fx.company}: ${e.message}`); return null; });
      for (let i = 0; id && i < 240; i++) { const d = await tools.getDoc(id); if (d.status !== 'working') break; await new Promise((r) => setTimeout(r, 5000)); }
    }
    const row = await get(`SELECT id, content_json, approved_at FROM docs WHERE lead_id = :id AND kind = 'script' AND status = 'ready' ORDER BY id DESC LIMIT 1`, { id: lead.id });
    if (!row) { out.push({ company: fx.company, missing: 'no finished SWOT' }); continue; }
    let pack = lead.research_json; try { if (typeof pack === 'string') pack = JSON.parse(pack); } catch { pack = null; }
    const gated = pack ? tools.usableResearch(pack, { hasWebsite: !!lead.website }) : null;
    const content = typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json;
    out.push(scoreLead(fx, content, { doc: row.id, approved: !!row.approved_at, evidence: gated ? gated.evidence.length : 0 }));
  }
  if (blocked) console.log(`(read-only: ${blocked} write statements blocked)`);
  return out;
}

const results = opt('--from')
  ? Object.entries(JSON.parse(fs.readFileSync(opt('--from'), 'utf8'))).map(([company, content]) => {
    const fx = fixtures.leads.find((l) => l.company.toLowerCase() === company.toLowerCase());
    return fx ? scoreLead(fx, content) : { company, missing: 'not in the fixtures' };
  })
  : await fromDatabase();

const total = (k) => results.reduce((n, r) => n + (r[k]?.length || 0), 0);
const summary = { at: new Date().toISOString(), leads: results.length, false_absence: total('false_absence'), factual_errors: total('factual_errors'),
  pass: total('false_absence') === 0 && total('factual_errors') === 0 && results.every((r) => !r.missing) };
for (const r of results) {
  if (r.missing) { console.log(`- ${r.company}: ${r.missing}`); continue; }
  console.log(`- ${r.company} (SWOT #${r.doc ?? '-'}${r.approved ? ', approved' : ''}): false absence ${r.false_absence.length}, factual errors ${r.factual_errors.length}, truths covered ${r.truths_covered}`
    + `${r.critic?.dropped_share != null ? `, critic dropped ${r.critic.dropped_share} %${r.critic.dropped_share > 15 ? ' (over 15 %: look into it)' : ''}` : r.critic?.status ? `, critic: ${r.critic.status}` : ''}`
    + `${r.evidence != null ? `, evidence ${r.evidence}${r.evidence < 8 ? ' (under 8)' : ''}` : ''}`);
  for (const x of [...r.false_absence, ...r.factual_errors]) console.log(`    FALSE: "${x.text}" in ${x.where.join(' | ')}`);
}
console.log(`\n${summary.pass ? 'PASS' : 'FAIL'}: ${summary.false_absence} false absence claims, ${summary.factual_errors} factual errors over ${summary.leads} lead(s)`);

if (opt('--from')) process.exit(summary.pass ? 0 : 1); // a check of a file is not a run of the golden set: not saved
const dir = 'data/golden-runs';
fs.mkdirSync(dir, { recursive: true });
const prev = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().pop();
if (prev) {
  const p = JSON.parse(fs.readFileSync(path.join(dir, prev), 'utf8')).summary;
  console.log(`Previous run (${p.at}): ${p.false_absence} false absence, ${p.factual_errors} factual errors`);
}
fs.writeFileSync(path.join(dir, `${summary.at.replace(/[:.]/g, '-')}.json`), JSON.stringify({ summary, results }, null, 2));
process.exit(summary.pass ? 0 : 1);
