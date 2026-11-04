// Copies every AxiFlow table to data/backup-<time>.json (git-ignored). Read-only.
import fs from 'node:fs';
import path from 'node:path';
try { process.loadEnvFile('.env'); } catch {}
const db = await import('../src/db.js');
await db.ready();
const tables = (await db.all(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`)).map((r) => r.table_name);
const out = {};
for (const t of tables) { out[t] = await db.all(`SELECT * FROM "${t}"`); console.log(t.padEnd(18), out[t].length); }
const file = path.join(db.DATA_DIR, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.mkdirSync(db.DATA_DIR, { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));
console.log('saved', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB', db.usingRemote ? '(Supabase)' : '(local)');
await db.close();
