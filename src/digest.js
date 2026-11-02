import { get, insert } from './db.js';
import { getSettings } from './settings.js';
import { sendEmail } from './pipeline/channels.js';
import { nowISO } from './util.js';

/** Daily summary to the agency inbox: the manager's briefing plus run stats. */
export async function sendDigest(stats, briefing) {
  const s = getSettings();
  const approvals = get(`SELECT COUNT(*) n FROM leads WHERE stage = 'brochure_ready'`).n;
  const calls = get(`SELECT COUNT(*) n FROM tasks WHERE kind = 'call' AND done = 0`).n;
  const drafts = get(`SELECT COUNT(*) n FROM tasks WHERE kind = 'reply_draft' AND done = 0`).n;
  const text = `Good morning from your AxiFlow manager.

${briefing?.content || ''}

Queue: ${approvals} pitch approval(s) · ${calls} call(s) · ${drafts} reply draft(s) to approve
Overnight run: processed ${stats.processed}, moved ${stats.moved}, messages sent ${stats.sent}, errors ${stats.errors}`;
  try {
    const r = await sendEmail({ to: s.agency.email, subject: `Today: ${approvals} approvals, ${calls} calls, ${drafts} replies`, text }, { dryRun: s.automation.dry_run });
    insert('messages', { direction: 'out', channel: 'email', template_key: 'digest', to_addr: s.agency.email, subject: 'Daily manager digest', body: text, status: r.status, created_at: nowISO() });
  } catch (e) {
    console.error('[digest]', e.message);
  }
}
