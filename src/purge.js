import { all, run, transaction } from './db.js';

/**
 * Deletes leads and everything tied to them (docs, projects + milestones, invoices, proposals, meetings,
 * messages, tasks, activities, events, CRM outbox, AI call log). Used for data that is not (or no longer) in the CRM.
 * Returns { table: rows deleted }.
 */
export async function purgeLeads(ids) {
  const list = [...new Set(ids.map(Number).filter(Boolean))];
  const out = {};
  if (!list.length) return out;
  const inList = list.join(',');
  await transaction(async () => {
    out.milestones = (await run(`DELETE FROM milestones WHERE project_id IN (SELECT id FROM projects WHERE lead_id IN (${inList}))`)).changes;
    for (const t of ['docs', 'projects', 'invoices', 'proposals', 'meetings', 'messages', 'tasks', 'activities', 'events', 'crm_outbox', 'ai_calls']) {
      out[t] = (await run(`DELETE FROM ${t} WHERE lead_id IN (${inList})`)).changes;
    }
    out.leads = (await run(`DELETE FROM leads WHERE id IN (${inList})`)).changes;
  });
  return out;
}

/** Leads deleted in the CRM more than `days` days ago (the wait guards against a mistaken CRM read). */
export async function removedLeadIds(days) {
  const before = new Date(Date.now() - days * 86400000).toISOString();
  return (await all(`SELECT id FROM leads WHERE crm_removed_at IS NOT NULL AND crm_removed_at < :before`, { before })).map((r) => r.id);
}
