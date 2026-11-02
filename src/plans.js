import { db, get, all, insert, update, run } from './db.js';
import { getSettings } from './settings.js';
import { nowISO, tzParts, zonedToUtc } from './util.js';

/*
 * Revenue plans ("₹12 Lakh Revenue Achievement Plan").
 * A plan = a date range + a revenue target + funnel targets (new calls → meetings → proposals →
 * conversions), split into calendar weeks, plus a daily calling schedule. One plan is active at a
 * time; the home screen tracks it. Actual numbers come from the pipeline automatically (calls
 * logged from the CRM, meetings, proposals, accepted proposals) plus numbers the team logs by hand
 * for work done outside this app.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  revenue_target REAL NOT NULL,
  avg_value REAL NOT NULL,
  work_days_json TEXT,
  funnel_json TEXT,
  targets_json TEXT,
  weeks_json TEXT,
  daily_json TEXT,
  notes TEXT,
  activated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  calls INTEGER DEFAULT 0,
  meetings INTEGER DEFAULT 0,
  proposals INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue REAL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_entries ON plan_entries(plan_id, date);
`);

export const METRICS = ['calls', 'meetings', 'proposals', 'conversions'];
export const STATUSES = ['draft', 'active', 'paused', 'archived'];
const DEFAULT_FUNNEL = { calls_per_meeting: 10, meeting_to_proposal: 60, proposal_to_win: 16.7 };
const DEFAULT_DAILY = { new_calls: null, followups: 20, call_minutes: 3.5, break_minutes: 25, buffer_minutes: 7.5, followup_minutes: 30 };

const parse = (j, fb) => { try { return j ? JSON.parse(j) : fb; } catch { return fb; } };
const int = (v, min = 0) => Math.max(min, Math.round(Number(v) || 0));
const num = (v, min = 0) => Math.max(min, Number(v) || 0);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));
const tz = () => getSettings().schedule?.timezone || 'Asia/Kolkata';
export const today = () => tzParts(new Date(), tz()).date;

// ------------------------------------------------------------------ dates
const dayMs = 86400000;
const toMs = (d) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDate = (d, n) => fromMs(toMs(d) + n * dayMs);
const weekday = (d) => new Date(toMs(d)).getUTCDay();
const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / dayMs);

/** Calendar weeks (7-day blocks from the start date) with their working-day counts. */
export function weeksOf(start, end, workDays) {
  const out = [];
  for (let s = start; toMs(s) <= toMs(end); s = addDate(s, 7)) {
    const e = toMs(addDate(s, 6)) > toMs(end) ? end : addDate(s, 6);
    out.push({ start: s, end: e, work_days: countWorkDays(s, e, workDays) });
  }
  return out;
}
export function countWorkDays(from, to, workDays) {
  if (toMs(to) < toMs(from)) return 0;
  let n = 0;
  for (let d = from; toMs(d) <= toMs(to); d = addDate(d, 1)) if (workDays.includes(weekday(d))) n++;
  return n;
}

// ------------------------------------------------------- target builder
/** Splits `total` over `weights` in whole numbers (largest remainder), so the parts add up exactly. */
function split(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { parts[i]++; left--; } });
  return parts;
}

/**
 * Works backwards from the revenue target: wins = target ÷ average project value, then the funnel
 * ratios give proposals, meetings and new calls. Calls are spread by working days; meetings and
 * proposals ramp up week by week; wins land from week 2 on (deals take time to close).
 */
export function buildTargets(input) {
  const f = { ...DEFAULT_FUNNEL, ...(input.funnel || {}) };
  const revenue = num(input.revenue_target, 1);
  const avg = num(input.avg_value, 1);
  const conversions = Math.max(1, Math.ceil(revenue / avg - 1e-9));
  const proposals = Math.ceil(conversions / (num(f.proposal_to_win, 0.1) / 100) - 1e-9);
  const meetings = Math.ceil(proposals / (num(f.meeting_to_proposal, 0.1) / 100) - 1e-9);
  const calls = Math.ceil(meetings * num(f.calls_per_meeting, 1));
  const workDays = cleanWorkDays(input.work_days);
  const weeks = weeksOf(input.start_date, input.end_date, workDays);
  const wd = weeks.map((w) => w.work_days);
  const ramp = wd.map((d, i) => d * (1 + 0.12 * i));
  const late = wd.map((d, i) => d * i);
  const cols = { calls: split(calls, wd), meetings: split(meetings, ramp), proposals: split(proposals, ramp), conversions: split(conversions, late.some(Boolean) ? late : wd) };
  return {
    funnel: f,
    targets: { calls, meetings, proposals, conversions },
    weeks: weeks.map((w, i) => ({ calls: cols.calls[i], meetings: cols.meetings[i], proposals: cols.proposals[i], conversions: cols.conversions[i] })),
    work_days_total: wd.reduce((a, b) => a + b, 0),
  };
}

const cleanWorkDays = (v) => {
  const d = (Array.isArray(v) ? v : [1, 2, 3, 4, 5, 6]).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
  return d.length ? [...new Set(d)].sort() : [1, 2, 3, 4, 5, 6];
};

// ---------------------------------------------------------------- presets
/** The owner's "₹12 Lakh Revenue Achievement Plan" (Web Development.pdf, pages 9–11 and 13). */
function nextMonday() {
  const t = today();
  const w = weekday(t);
  return addDate(t, w === 1 ? 0 : (8 - w) % 7 || 7);
}
export function presets() {
  const start = nextMonday();
  const base = { revenue_target: 1200000, avg_value: 200000, work_days: [1, 2, 3, 4, 5, 6], funnel: DEFAULT_FUNNEL, daily: { ...DEFAULT_DAILY, followups: 20 } };
  const wk = (rows) => rows.map(([calls, meetings, proposals, conversions]) => ({ calls, meetings, proposals, conversions }));
  return [
    { key: '12l-24', label: '₹12 Lakh in 24 working days (4 weeks)', plan: { ...base, name: '₹12 Lakh Revenue Achievement Plan', start_date: start, end_date: addDate(start, 26),
      daily: { ...base.daily, new_calls: 25 },
      weeks: wk([[150, 12, 6, 0], [150, 15, 9, 1], [150, 16, 10, 2], [150, 17, 11, 3]]) } },
    { key: '12l-48', label: '₹12 Lakh in 48 working days (8 weeks)', plan: { ...base, name: '₹12 Lakh Revenue Achievement Plan (48 days)', start_date: start, end_date: addDate(start, 54),
      daily: { ...base.daily, new_calls: 13 },
      weeks: wk([[75, 5, 2, 0], [75, 7, 4, 0], [75, 7, 4, 0], [75, 8, 5, 1], [75, 8, 5, 1], [75, 8, 5, 1], [75, 8, 5, 1], [75, 9, 6, 2]]) } },
  ];
}

// ------------------------------------------------------------------- CRUD
function cleanPlan(raw, prev = {}) {
  const p = {
    name: String(raw.name ?? prev.name ?? '').trim().slice(0, 120),
    start_date: raw.start_date ?? prev.start_date,
    end_date: raw.end_date ?? prev.end_date,
    revenue_target: num(raw.revenue_target ?? prev.revenue_target),
    avg_value: num(raw.avg_value ?? prev.avg_value),
    work_days: cleanWorkDays(raw.work_days ?? prev.work_days),
    funnel: { ...DEFAULT_FUNNEL, ...(prev.funnel || {}), ...(raw.funnel || {}) },
    daily: { ...DEFAULT_DAILY, ...(prev.daily || {}), ...(raw.daily || {}) },
    notes: String(raw.notes ?? prev.notes ?? '').slice(0, 4000),
  };
  if (!p.name) throw new Error('Give the plan a name');
  if (!isDate(p.start_date) || !isDate(p.end_date)) throw new Error('Pick a start and an end date');
  if (toMs(p.end_date) < toMs(p.start_date)) throw new Error('The end date is before the start date');
  if (diffDays(p.start_date, p.end_date) > 366) throw new Error('Keep a plan to one year or less');
  if (!p.revenue_target || !p.avg_value) throw new Error('Enter the revenue target and the average project value');
  for (const k of ['followups', 'call_minutes', 'break_minutes', 'buffer_minutes', 'followup_minutes']) p.daily[k] = num(p.daily[k]);
  p.daily.new_calls = p.daily.new_calls === null || p.daily.new_calls === '' ? null : int(p.daily.new_calls);

  const weeks = weeksOf(p.start_date, p.end_date, p.work_days);
  const auto = buildTargets(p);
  let rows = Array.isArray(raw.weeks) ? raw.weeks : prev.weeks;
  if (!Array.isArray(rows) || rows.length !== weeks.length) rows = auto.weeks; // date range changed: recalculate the split
  p.weeks = rows.map((w) => Object.fromEntries(METRICS.map((m) => [m, int(w?.[m])])));
  p.targets = Object.fromEntries(METRICS.map((m) => [m, p.weeks.reduce((a, w) => a + w[m], 0)]));
  return p;
}

const toRow = (p) => ({
  name: p.name, start_date: p.start_date, end_date: p.end_date, revenue_target: p.revenue_target, avg_value: p.avg_value,
  work_days_json: p.work_days, funnel_json: p.funnel, targets_json: p.targets, weeks_json: p.weeks, daily_json: p.daily, notes: p.notes,
});

export function getPlan(id) {
  const r = get(`SELECT * FROM plans WHERE id = :id`, { id });
  if (!r) return null;
  return {
    id: r.id, name: r.name, status: r.status, start_date: r.start_date, end_date: r.end_date, revenue_target: r.revenue_target, avg_value: r.avg_value,
    work_days: parse(r.work_days_json, [1, 2, 3, 4, 5, 6]), funnel: parse(r.funnel_json, DEFAULT_FUNNEL), targets: parse(r.targets_json, {}),
    weeks: parse(r.weeks_json, []), daily: parse(r.daily_json, DEFAULT_DAILY), notes: r.notes || '', activated_at: r.activated_at, created_at: r.created_at, updated_at: r.updated_at,
  };
}

export function createPlan(raw) {
  const p = cleanPlan(raw);
  const now = nowISO();
  const id = insert('plans', { ...toRow(p), status: 'draft', created_at: now, updated_at: now });
  if (raw.activate) setStatus(id, 'active');
  return getPlan(id);
}

export function updatePlan(id, raw) {
  const prev = getPlan(id);
  if (!prev) throw new Error('Plan not found');
  const p = cleanPlan(raw, prev);
  update('plans', id, { ...toRow(p), updated_at: nowISO() });
  return getPlan(id);
}

/** Only one plan runs at a time: activating one pauses the one that was running. */
export function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error('Unknown status');
  const p = getPlan(id);
  if (!p) throw new Error('Plan not found');
  const now = nowISO();
  if (status === 'active') run(`UPDATE plans SET status = 'paused', updated_at = :now WHERE status = 'active' AND id != :id`, { id, now });
  update('plans', id, { status, updated_at: now, ...(status === 'active' ? { activated_at: now } : {}) });
  return getPlan(id);
}

export function duplicatePlan(id) {
  const p = getPlan(id);
  if (!p) throw new Error('Plan not found');
  const len = diffDays(p.start_date, p.end_date);
  const start = nextMonday();
  return createPlan({ ...p, name: `${p.name} (copy)`, start_date: start, end_date: addDate(start, len) });
}

export const deletePlan = (id) => run(`DELETE FROM plans WHERE id = :id`, { id });

export function addEntry(planId, raw) {
  if (!getPlan(planId)) throw new Error('Plan not found');
  const date = isDate(raw.date) ? raw.date : today();
  const e = { calls: int(raw.calls), meetings: int(raw.meetings), proposals: int(raw.proposals), conversions: int(raw.conversions), revenue: num(raw.revenue) };
  if (!Object.values(e).some(Boolean)) throw new Error('Enter at least one number');
  return insert('plan_entries', { plan_id: planId, date, ...e, note: String(raw.note || '').slice(0, 500), created_at: nowISO() });
}
export const deleteEntry = (planId, id) => run(`DELETE FROM plan_entries WHERE id = :id AND plan_id = :planId`, { id, planId });

// ---------------------------------------------------------------- actuals
/** UTC bounds of a range of local dates (inclusive), in the agency's timezone. */
function bounds(from, to) {
  return { a: zonedToUtc(from, '00:00', tz()), b: zonedToUtc(addDate(to, 1), '00:00', tz()) };
}

/** What actually happened between two local dates: pipeline data + numbers logged by hand. */
export function actuals(planId, from, to) {
  const { a, b } = bounds(from, to);
  const n = (sql) => get(sql, { a, b })?.n || 0;
  const auto = {
    calls: n(`SELECT COUNT(*) n FROM events WHERE workflow = 'calls' AND step = 'outcome' AND created_at >= :a AND created_at < :b`),
    meetings: n(`SELECT COUNT(*) n FROM meetings WHERE COALESCE(status,'') NOT IN ('cancelled','canceled') AND start_at >= :a AND start_at < :b`),
    proposals: n(`SELECT COUNT(*) n FROM proposals WHERE created_at >= :a AND created_at < :b`)
      + n(`SELECT COUNT(*) n FROM docs WHERE kind = 'proposal' AND status = 'ready' AND created_at >= :a AND created_at < :b
           AND (lead_id IS NULL OR lead_id NOT IN (SELECT lead_id FROM proposals))`),
    conversions: n(`SELECT COUNT(*) n FROM proposals WHERE status = 'accepted' AND responded_at >= :a AND responded_at < :b`),
    revenue: get(`SELECT COALESCE(SUM(COALESCE(subtotal, total)), 0) n FROM proposals WHERE status = 'accepted' AND responded_at >= :a AND responded_at < :b`, { a, b })?.n || 0,
  };
  const m = get(`SELECT COALESCE(SUM(calls),0) calls, COALESCE(SUM(meetings),0) meetings, COALESCE(SUM(proposals),0) proposals,
    COALESCE(SUM(conversions),0) conversions, COALESCE(SUM(revenue),0) revenue FROM plan_entries WHERE plan_id = :planId AND date >= :from AND date <= :to`, { planId, from, to });
  const out = {};
  for (const k of [...METRICS, 'revenue']) out[k] = (auto[k] || 0) + (m?.[k] || 0);
  return out;
}

// ------------------------------------------------------------------ status
/** Everything the home card and the plan page show: progress, pace, weekly review, today's job. */
export function planStatus(p) {
  const t = today();
  const weeks = weeksOf(p.start_date, p.end_date, p.work_days);
  const phase = toMs(t) < toMs(p.start_date) ? 'upcoming' : toMs(t) > toMs(p.end_date) ? 'ended' : 'running';
  const totalWork = weeks.reduce((a, w) => a + w.work_days, 0);
  const clampEnd = phase === 'ended' ? p.end_date : phase === 'upcoming' ? addDate(p.start_date, -1) : t;
  const workDone = phase === 'upcoming' ? 0 : countWorkDays(p.start_date, clampEnd, p.work_days);
  const workLeft = phase === 'ended' ? 0 : countWorkDays(phase === 'upcoming' ? p.start_date : t, p.end_date, p.work_days);

  const total = actuals(p.id, p.start_date, phase === 'upcoming' ? p.start_date : clampEnd);
  const targets = { ...p.targets, revenue: p.revenue_target };

  // Weekly review: target vs actual, met or not, and the change on the week before.
  let prev = null;
  const weekRows = weeks.map((w, i) => {
    const target = { ...(p.weeks[i] || {}), revenue: (p.weeks[i]?.conversions || 0) * p.avg_value };
    const state = toMs(t) < toMs(w.start) ? 'upcoming' : toMs(t) > toMs(w.end) ? 'done' : 'current';
    const actual = state === 'upcoming' ? null : actuals(p.id, w.start, state === 'current' ? t : w.end);
    const met = actual ? Object.fromEntries(METRICS.map((m) => [m, actual[m] >= (target[m] || 0)])) : null;
    const row = { index: i + 1, ...w, state, target, actual, met, all_met: met ? METRICS.every((m) => met[m]) : null,
      change: actual && prev && state === 'done' ? Object.fromEntries(METRICS.map((m) => [m, actual[m] - prev[m]])) : null };
    if (actual) prev = actual;
    return row;
  });

  // Pace: where we should be by today (finished weeks in full, the current week pro rata).
  const expected = Object.fromEntries([...METRICS, 'revenue'].map((m) => [m, 0]));
  for (const w of weekRows) {
    if (w.state === 'upcoming') continue;
    const share = w.state === 'done' ? 1 : w.work_days ? countWorkDays(w.start, t, p.work_days) / w.work_days : 0;
    for (const m of [...METRICS, 'revenue']) expected[m] += (w.target[m] || 0) * share;
  }
  const pace = Object.fromEntries([...METRICS, 'revenue'].map((m) => [m, {
    target: targets[m] || 0, actual: total[m] || 0, expected: Math.round(expected[m]),
    pct: targets[m] ? Math.min(100, Math.round(((total[m] || 0) / targets[m]) * 100)) : 0,
    on_track: (total[m] || 0) >= Math.floor(expected[m]),
    per_day_needed: workLeft ? Math.max(0, Math.ceil(((targets[m] || 0) - (total[m] || 0)) / workLeft)) : 0,
  }]));

  const isWorkDay = p.work_days.includes(weekday(t));
  const plannedCalls = p.daily.new_calls || (totalWork ? Math.ceil(p.targets.calls / totalWork) : 0);
  const todayActual = phase === 'running' ? actuals(p.id, t, t) : null;
  const callMin = plannedCalls * (p.daily.call_minutes || 0) + (p.daily.break_minutes || 0) + (p.daily.buffer_minutes || 0) + (p.daily.followup_minutes || 0);
  const current = weekRows.find((w) => w.state === 'current') || null;
  const lastDone = [...weekRows].reverse().find((w) => w.state === 'done') || null;

  return {
    phase, today: t, work_days_total: totalWork, work_days_done: workDone, work_days_left: workLeft,
    days_to_start: phase === 'upcoming' ? diffDays(t, p.start_date) : 0,
    total, targets, pace, weeks: weekRows, current_week: current?.index || null, last_week: lastDone?.index || null,
    on_track: phase !== 'running' || (pace.revenue.on_track && pace.calls.on_track && pace.meetings.on_track),
    behind: phase === 'running' ? [...METRICS, 'revenue'].filter((m) => !pace[m].on_track) : [],
    today_plan: phase === 'running' ? {
      work_day: isWorkDay, new_calls: plannedCalls, followups: p.daily.followups, minutes: Math.round(callMin),
      catch_up_calls: Math.max(plannedCalls, pace.calls.per_day_needed), done: todayActual,
    } : null,
  };
}

export function listPlans() {
  return all(`SELECT id FROM plans WHERE status != 'archived' ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, start_date DESC`)
    .concat(all(`SELECT id FROM plans WHERE status = 'archived' ORDER BY start_date DESC LIMIT 20`))
    .map(({ id }) => { const p = getPlan(id); const s = planStatus(p); return { ...p, phase: s.phase, pace: { revenue: s.pace.revenue, conversions: s.pace.conversions }, work_days_total: s.work_days_total }; });
}

export function activePlan() {
  const r = get(`SELECT id FROM plans WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1`);
  if (!r) return null;
  const p = getPlan(r.id);
  return { plan: p, status: planStatus(p) };
}
