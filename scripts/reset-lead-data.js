// Deletes all leads and everything tied to them (messages, tasks, meetings, proposals, invoices,
// projects, logs, CRM outbox, documents made for a lead). Keeps settings, templates, plans and
// documents made in the tools without a lead. Run scripts/backup-db.js first.
// Usage: node scripts/reset-lead-data.js --yes
try { process.loadEnvFile('.env'); } catch {}
if (!process.argv.includes('--yes')) { console.log('Add --yes to delete. Back up first: node scripts/backup-db.js'); process.exit(1); }
const db = await import('../src/db.js');
await db.ready();
const steps = [
  "DELETE FROM docs WHERE lead_id IS NOT NULL",
  'DELETE FROM milestones', 'DELETE FROM projects', 'DELETE FROM invoices', 'DELETE FROM proposals',
  'DELETE FROM meetings', 'DELETE FROM messages', 'DELETE FROM tasks', 'DELETE FROM activities',
  'DELETE FROM events', 'DELETE FROM crm_outbox', 'DELETE FROM briefings', 'DELETE FROM runs',
  'DELETE FROM ai_calls', 'DELETE FROM plan_entries', 'DELETE FROM leads',
  "DELETE FROM settings WHERE key = 'state:atomic'",
];
await db.transaction(async () => {
  for (const sql of steps) { const r = await db.run(sql); console.log(sql.padEnd(45), r.changes); }
});
console.log('done', db.usingRemote ? '(Supabase)' : '(local)');
await db.close();
