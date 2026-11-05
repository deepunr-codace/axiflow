import { getSettings, loadSettings, getState, setState } from './settings.js';
import { pollCrm } from './atomic.js';
import { resumeDocs } from './tools.js';
import { tzParts, nowISO, addMinutes } from './util.js';
import { insert } from './db.js';
import { runPipeline } from './pipeline/engine.js';
import { flushOutbox } from './crm-sync.js';
import { dailyBriefing } from './ai/manager.js';
import { sendDigest } from './digest.js';

/** Generates and stores the manager's briefing. */
export async function refreshBriefing() {
  const b = await dailyBriefing();
  await insert('briefings', { source: b.source, content: b.content, created_at: nowISO() });
  return b;
}

/**
 * One scheduler step (idempotent, safe to call often):
 *  - daily run at settings.schedule.daily_time, then the manager's briefing + digest email
 *  - otherwise a light sweep every `sweep_minutes` (follow-ups, marketing touches, reminders, overdue calls)
 *  - CRM outbox retries, and brochure/proposal jobs that stalled (serverless instance stopped)
 * Locally it runs every 30 s (startScheduler); on Vercel, /api/cron/tick calls it.
 */
export async function cronTick() {
  const out = { at: nowISO(), ran: 'nothing' };
  await loadSettings();
  await flushOutbox().catch((e) => { out.crm_error = e.message; });
  await resumeDocs({ staleMinutes: 6 }).catch((e) => { out.docs_error = e.message; });
  out.claude_retried = await (await import('./claude-worker.js')).retryStale({ force: true }).catch((e) => { out.claude_error = e.message; return 0; });
  const crm = await pollCrm().catch((e) => ({ errors: [e.message] }));
  if (!crm.skipped) out.crm = { deals: crm.deals, created: crm.created, updated: crm.updated, errors: crm.errors?.length || 0 };
  const s = getSettings();
  if (!s.schedule.enabled) return { ...out, ran: 'scheduler disabled' };
  const { date, hhmm } = tzParts(new Date(), s.schedule.timezone);
  const st = await getState('scheduler', {});
  try {
    if (hhmm >= s.schedule.daily_time && st.last_daily_date !== date) {
      await setState('scheduler', { ...st, last_daily_date: date, last_daily_at: nowISO() });
      out.stats = await runPipeline('daily');
      const briefing = await refreshBriefing();
      if (s.automation.daily_digest) await sendDigest(out.stats, briefing);
      out.ran = 'daily';
    } else if (s.schedule.sweep_minutes > 0 && (!st.last_sweep_at || addMinutes(st.last_sweep_at, s.schedule.sweep_minutes) <= nowISO())) {
      await setState('scheduler', { ...st, last_sweep_at: nowISO() });
      out.stats = await runPipeline('sweep');
      out.ran = 'sweep';
    }
  } catch (e) {
    console.error('[scheduler]', e);
    out.error = e.message;
  }
  return out;
}

/** Local server: tick every 30 s. */
export function startScheduler() {
  const tick = () => cronTick().catch((e) => console.error('[scheduler]', e));
  setTimeout(tick, 3000);
  return setInterval(tick, 30000);
}

export async function schedulerInfo() {
  const s = getSettings();
  const st = await getState('scheduler', {});
  return { ...st, enabled: s.schedule.enabled, daily_time: s.schedule.daily_time, timezone: s.schedule.timezone, sweep_minutes: s.schedule.sweep_minutes };
}
