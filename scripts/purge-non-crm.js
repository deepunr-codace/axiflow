// Deletes everything that is not CRM data (owner, 2026-11-05: "only store/show data from crm"):
//   - documents made in the tools without a CRM lead,
//   - leads that did not come from the CRM, and leads deleted in the CRM (crm_removed_at set),
//     with everything tied to them (docs, messages, tasks, meetings, proposals, invoices, projects, logs, outbox).
// Run scripts/backup-db.js first. Usage: node scripts/purge-non-crm.js --yes
try { process.loadEnvFile('.env'); } catch {}
const yes = process.argv.includes('--yes');
const db = await import('../src/db.js');
await db.ready();
const leads = await db.all(`SELECT id, company, external_id FROM leads WHERE external_id IS NULL OR external_id NOT LIKE 'atomic:%' OR crm_removed_at IS NOT NULL ORDER BY id`);
const loose = await db.all(`SELECT id, kind, title FROM docs WHERE lead_id IS NULL ORDER BY id`);
console.log('leads to delete:', leads.map((l) => `#${l.id} ${l.company} (${l.external_id || 'not from the CRM'})`).join(', ') || 'none');
console.log('documents without a CRM lead:', loose.map((d) => `#${d.id} ${d.kind} ${d.title}`).join(', ') || 'none');
if (!yes) { console.log('Nothing deleted. Back up first (node scripts/backup-db.js), then add --yes.'); await db.close(); process.exit(0); }
const { purgeLeads } = await import('../src/purge.js');
const out = await purgeLeads(leads.map((l) => l.id));
for (const [t, n] of Object.entries(out)) if (n) console.log(`  ${t}: ${n}`);
console.log('  documents without a lead:', (await db.run(`DELETE FROM docs WHERE lead_id IS NULL`)).changes);
console.log('done', db.usingRemote ? '(Supabase)' : '(local)');
await db.close();
