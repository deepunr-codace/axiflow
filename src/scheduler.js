import { getSettings, getState, setState } from './settings.js';
import { tzParts, nowISO, addMinutes } from './util.js';
import { insert } from './db.js';
import { runPipeline } from './pipeline/engine.js';
import { flushOutbox } from './crm-sync.js';
import { dailyBriefing } from './ai/manager.js';
import { sendDigest } from './digest.js';

/** Generates and stores the manager's briefing. */
export async function refreshBriefing() {
  const b = await dailyBriefing();
  insert('briefings', { source: b.source, content: b.content, created_at: nowISO() });
  return b;
}

/**
 * Driven by a 30s tick:
 *  - daily run at settings.schedule.daily_time, then the manager's briefing + digest email
 *  - a light sweep every `sweep_minutes` (follow-ups, marketing touches, reminders, overdue calls)
 *  - CRM outbox retries on every tick
 */
export function startScheduler() {
  const tick = async () => {
    flushOutbox().catch((e) => console.error('[crm-sync]', e.message));
    const s = getSettings();
    if (!s.schedule.enabled) return;
    const { date, hhmm } = tzParts(new Date(), s.schedule.timezone);
    const st = getState('scheduler', {});
    try {
      if (hhmm >= s.schedule.daily_time && st.last_daily_date !== date) {
        setState('scheduler', { ...st, last_daily_date: date, last_daily_at: nowISO() });
        const stats = await runPipeline('daily');
        const briefing = await refreshBriefing();
        if (s.automation.daily_digest) await sendDigest(stats, briefing);
      } else if (s.schedule.sweep_minutes > 0 && (!st.last_sweep_at || addMinutes(st.last_sweep_at, s.schedule.sweep_minutes) <= nowISO())) {
        setState('scheduler', { ...st, last_sweep_at: nowISO() });
        await runPipeline('sweep');
      }
    } catch (e) {
      console.error('[scheduler]', e);
    }
  };
  setTimeout(tick, 3000);
  return setInterval(tick, 30000);
}

export function schedulerInfo() {
  const s = getSettings();
  const st = getState('scheduler', {});
  return { ...st, enabled: s.schedule.enabled, daily_time: s.schedule.daily_time, timezone: s.schedule.timezone, sweep_minutes: s.schedule.sweep_minutes };
}
