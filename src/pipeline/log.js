import { insert, get } from '../db.js';
import { nowISO } from '../util.js';

/** Append-only automation log (replaces the Google Sheets logging of the n8n flow). */
export async function logEvent(leadId, workflow, step, status, detail = '') {
  await insert('events', { lead_id: leadId, workflow, step, status, detail: String(detail).slice(0, 2000), created_at: nowISO() });
}

/** Timeline entry visible on the lead page. */
export async function addActivity(leadId, type, title, body = null) {
  await insert('activities', { lead_id: leadId, type, title, body, created_at: nowISO() });
}

/** Creates a task unless an identical open one already exists. */
export async function addTask(leadId, title, dueAt = null) {
  const exists = await get(`SELECT id FROM tasks WHERE lead_id = :leadId AND title = :title AND done = 0`, { leadId, title });
  if (exists) return exists.id;
  return await insert('tasks', { lead_id: leadId, title, due_at: dueAt, created_at: nowISO() });
}
