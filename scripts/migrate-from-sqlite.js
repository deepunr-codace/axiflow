// One-time copy of the old SQLite database (data/crm.db) into Postgres: Supabase when DATABASE_URL is
// set, otherwise the local embedded Postgres (data/pg). Keeps ids, then moves the id counters past them.
// Also copies data/uploads/* into the upload store (Vercel Blob when BLOB_READ_WRITE_TOKEN is set).
//   node --env-file-if-exists=.env scripts/migrate-from-sqlite.js [path/to/crm.db] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ready, all, run, close, usingRemote } from '../src/db.js';
// importing these registers their tables
import '../src/tools.js';
import '../src/plans.js';
import '../src/design/templates.js';
import { saveUpload, usingBlob } from '../src/storage.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const file = args.find((a) => !a.startsWith('--')) || path.resolve('data', 'crm.db');
if (!fs.existsSync(file)) { console.error('No SQLite database at', file); process.exit(1); }

const TABLES = ['leads', 'activities', 'messages', 'tasks', 'templates', 'settings', 'meetings', 'proposals', 'invoices', 'projects',
  'milestones', 'events', 'runs', 'ai_calls', 'crm_outbox', 'briefings', 'docs', 'design_templates', 'plans', 'plan_entries'];
const KEYED = { templates: 'key', settings: 'key' }; // no id column: upsert by key

const src = new DatabaseSync(file, { readOnly: true });
await ready();
console.log(`Copying ${file} → ${usingRemote ? 'Postgres (DATABASE_URL)' : 'embedded Postgres (data/pg)'}`);

const existing = (await all(`SELECT COUNT(*) n FROM leads`))[0].n;
if (existing && !force) { console.error(`Target already has ${existing} leads. Re-run with --force to replace all data.`); process.exit(1); }

const srcTables = new Set(src.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name));
if (force) for (const t of [...TABLES].reverse()) if (!KEYED[t]) await run(`DELETE FROM ${t}`);

for (const t of TABLES) {
  if (!srcTables.has(t)) { console.log(`  ${t}: not in source, skipped`); continue; }
  const targetCols = new Set((await all(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = :t`, { t })).map((r) => r.column_name));
  const rows = src.prepare(`SELECT * FROM ${t}`).all();
  let n = 0;
  for (const row of rows) {
    if (t === 'settings' && row.key === 'schema_hash') continue;
    const cols = Object.keys(row).filter((c) => targetCols.has(c));
    const params = Object.fromEntries(cols.map((c) => [c, row[c] === undefined ? null : row[c]]));
    const conflict = KEYED[t] ? ` ON CONFLICT (${KEYED[t]}) DO UPDATE SET ${cols.filter((c) => c !== KEYED[t]).map((c) => `${c} = EXCLUDED.${c}`).join(', ')}` : '';
    await run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((c) => ':' + c).join(',')})${conflict}`, params);
    n++;
  }
  if (targetCols.has('id')) await run(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1), (SELECT COUNT(*) FROM ${t}) > 0)`);
  console.log(`  ${t}: ${n} rows`);
}

const uploads = path.resolve(path.dirname(file), 'uploads');
if (fs.existsSync(uploads)) {
  let n = 0;
  const walk = async (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        const key = path.relative(uploads, p).replace(/\\/g, '/');
        await saveUpload(key, fs.readFileSync(p), /\.png$/i.test(p) ? 'image/png' : 'image/jpeg');
        n++;
      }
    }
  };
  if (usingBlob() || path.resolve(process.env.DATA_DIR || 'data', 'uploads') !== uploads) await walk(uploads);
  console.log(`  uploads: ${n} files ${usingBlob() ? '→ Vercel Blob' : '(local)'}`);
}
src.close();
await close();
console.log('Done.');
