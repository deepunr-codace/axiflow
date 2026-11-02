/*
 * Revenue plans UI: home card, plan list, plan page (weekly review), plan editor, "log numbers".
 * Helpers come from app.js via setupPlans() so this file stays a plain module.
 */
let H; // { $, $$, api, esc, money, toast, busy, modal, view }
export function setupPlans(helpers) { H = helpers; }

const METRICS = [['calls', 'New calls'], ['meetings', 'Meetings'], ['proposals', 'Proposals'], ['conversions', 'Wins']];
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const n0 = (v) => new Intl.NumberFormat('en-IN').format(Math.round(v || 0));
const lakh = (v) => (v >= 100000 ? `₹${+(v / 100000).toFixed(v % 100000 ? 1 : 0)}L` : H.money(v));
const dShort = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const range = (a, b) => `${dShort(a)} – ${dShort(b)}`;
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${Math.round(min % 60) ? `${Math.round(min % 60)}m` : ''}`.trim() : `${Math.round(min)}m`);
const bar = (pct, mark) => `<div class="pbar"><div style="width:${Math.min(100, Math.max(0, pct))}%"></div>${mark != null ? `<i style="left:${Math.min(100, Math.max(0, mark))}%" title="Where you should be today"></i>` : ''}</div>`;

const PHASE = { upcoming: 'Starts soon', running: 'Running', ended: 'Ended' };
function statusTag(plan, s) {
  if (plan.status === 'active') {
    if (s.phase === 'running') return `<span class="tag ${s.on_track ? 'green' : 'red'}" ${s.on_track ? '' : `title="Below where the plan should be by today"`}>${s.on_track ? 'On track' : `Behind on ${(s.behind || []).map((m) => ({ calls: 'calls', meetings: 'meetings', proposals: 'proposals', conversions: 'wins', revenue: 'revenue' })[m]).slice(0, 2).join(' and ') || 'pace'}`}</span>`;
    return `<span class="tag">${s.phase === 'upcoming' ? `Starts in ${s.days_to_start} day${s.days_to_start === 1 ? '' : 's'}` : 'Ended'}</span>`;
  }
  return `<span class="tag">${{ draft: 'Draft', paused: 'Paused', archived: 'Archived' }[plan.status] || plan.status}</span>`;
}

function dayLine(s) {
  if (s.phase === 'upcoming') return `Starts ${s.days_to_start === 1 ? 'tomorrow' : `in ${s.days_to_start} days`} · ${s.work_days_total} working days`;
  if (s.phase === 'ended') return `Ended · ${s.work_days_total} working days`;
  return `Day ${s.work_days_done} of ${s.work_days_total} · ${s.work_days_left} working day${s.work_days_left === 1 ? '' : 's'} left`;
}

/** The big summary block: revenue progress, the four funnel numbers, today's calling job. */
function hero(plan, s, { home = false } = {}) {
  const r = s.pace.revenue;
  const expPct = r.target ? (r.expected / r.target) * 100 : 0;
  const left = Math.max(0, r.target - r.actual);
  const tiles = METRICS.map(([k, label]) => {
    const p = s.pace[k];
    const wk = s.current_week ? s.weeks[s.current_week - 1] : null;
    return `<div class="pm">
      <div class="pm-v">${n0(p.actual)}<span>/ ${n0(p.target)}</span></div>
      <div class="pm-l">${label}</div>
      ${bar(p.pct, p.target ? (p.expected / p.target) * 100 : null)}
      <div class="pm-s">${wk ? `This week ${n0(wk.actual?.[k])} of ${n0(wk.target[k])}` : s.phase === 'upcoming' ? `Week 1 target ${n0(s.weeks[0]?.target[k])}` : `${p.pct}% of target`}</div>
    </div>`;
  }).join('');
  const t = s.today_plan;
  const todayRow = t ? `<div class="pt">
      <div class="grow"><b>${t.work_day ? 'Today' : 'Today is a day off'}</b>
        <span class="muted">${t.work_day ? `${t.new_calls} new calls + ${t.followups} follow-ups · about ${hm(t.minutes)} on the phone` : 'Next working day continues the plan'}</span>
        ${t.work_day && t.catch_up_calls > t.new_calls ? `<div class="small warnt">To catch up: ${t.catch_up_calls} new calls a day for the rest of the plan</div>` : ''}</div>
      <div class="pt-done"><b>${n0(t.done?.calls)}</b><span>calls today</span></div>
      <button class="btn sm" data-log-plan="${plan.id}">Log numbers</button>
    </div>` : '';
  return `<div class="ph-top">
      <div class="grow"><h2>${H.esc(plan.name)}</h2><div class="small muted">${range(plan.start_date, plan.end_date)} · ${dayLine(s)}</div></div>
      ${statusTag(plan, s)}
      ${home ? `<a class="btn sm" href="#/plan/${plan.id}">Open plan</a>` : ''}
    </div>
    <div class="ph-rev">
      <div class="ph-big">${H.money(r.actual)}<span>of ${H.money(r.target)}</span></div>
      <div class="small muted">${left ? `${H.money(left)} to go · ${s.pace.conversions.target - s.pace.conversions.actual > 0 ? `${s.pace.conversions.target - s.pace.conversions.actual} more project${s.pace.conversions.target - s.pace.conversions.actual === 1 ? '' : 's'} at about ${lakh(plan.avg_value)}` : 'wins on target'}` : 'Revenue target reached'}${s.phase === 'running' ? ` · should be at ${H.money(r.expected)} by today` : ''}</div>
      ${bar(r.pct, s.phase === 'running' ? expPct : null)}
    </div>
    <div class="pm-grid">${tiles}</div>
    ${todayRow}`;
}

// ------------------------------------------------------------- home card
export async function homePlanCard() {
  let d = null;
  try { d = await H.api('/plans/active'); } catch { return ''; }
  if (!d) {
    return `<div class="card plan-empty"><div class="grow"><h2>Set a revenue target</h2>
      <p class="muted small">Create a plan with a date range and AxiFlow tracks new calls, meetings, proposals and wins against it every day, week by week.</p></div>
      <a class="btn primary" href="#/plan-edit/new">Create a plan</a></div>`;
  }
  return `<div class="card plan-hero">${hero(d.plan, d.status, { home: true })}</div>`;
}

/** Wires "Log numbers" buttons inside `root`. */
export function wirePlanButtons(root, done) {
  H.$$('[data-log-plan]', root).forEach((b) => (b.onclick = () => logDialog(Number(b.dataset.logPlan), done)));
}

function logDialog(planId, done) {
  const today = new Date().toLocaleDateString('en-CA');
  const d = H.modal('Log numbers', `<p class="small muted">Calls logged from the CRM, booked meetings, proposals and accepted proposals count automatically. Log only work done outside AxiFlow.</p>
    <div class="form-grid">
      <label>Date<input type="date" id="leDate" value="${today}" max="${today}"></label>
      <label>New calls<input type="number" min="0" id="le_calls" placeholder="0"></label>
      <label>Meetings<input type="number" min="0" id="le_meetings" placeholder="0"></label>
      <label>Proposals<input type="number" min="0" id="le_proposals" placeholder="0"></label>
      <label>Wins<input type="number" min="0" id="le_conversions" placeholder="0"></label>
      <label>Revenue won (₹)<input type="number" min="0" id="le_revenue" placeholder="0"></label>
      <label class="full">Note<input id="leNote" maxlength="500" placeholder="Optional"></label>
    </div>`, '<button class="btn primary" id="leSave">Save numbers</button>');
  H.$('#le_calls', d).focus();
  H.$('#leSave', d).onclick = (e) => H.busy(e.target, async () => {
    const body = { date: H.$('#leDate', d).value, note: H.$('#leNote', d).value };
    for (const k of ['calls', 'meetings', 'proposals', 'conversions', 'revenue']) body[k] = H.$(`#le_${k}`, d).value;
    await H.api(`/plans/${planId}/entries`, { body });
    d.close(); H.toast('Numbers saved'); done?.();
  });
}

// ------------------------------------------------------------- plan list
export async function renderPlans() {
  const { plans } = await H.api('/plans');
  H.view.innerHTML = `
  <div class="hello"><h2>Revenue plans</h2><p>Set a revenue target for a date range. AxiFlow works out the calls, meetings, proposals and wins you need, week by week, and tracks them.</p></div>
  <div class="row" style="margin-bottom:14px"><span class="spacer"></span><a class="btn primary" href="#/plan-edit/new">New plan</a></div>
  ${plans.length ? plans.map((p) => `<a class="item plan-row link" href="#/plan/${p.id}">
      <div class="grow"><b>${H.esc(p.name)}</b><div class="small muted">${range(p.start_date, p.end_date)} · ${p.work_days_total} working days · ${lakh(p.revenue_target)} target</div></div>
      <div class="plan-row-p"><div class="small"><b>${H.money(p.pace.revenue.actual)}</b> <span class="muted">· ${p.pace.conversions.actual} of ${p.pace.conversions.target} wins</span></div>${bar(p.pace.revenue.pct)}</div>
      ${statusTag(p, { phase: p.phase, on_track: true, days_to_start: 0 }).replace('On track', PHASE[p.phase])}
    </a>`).join('') : `<div class="card empty">No plans yet. Start from the ₹12 Lakh plan or your own numbers.<div style="margin-top:12px"><a class="btn primary" href="#/plan-edit/new">Create a plan</a></div></div>`}`;
}

// ------------------------------------------------------------- plan page
export async function renderPlan(id) {
  const d = await H.api(`/plans/${Number(id)}`);
  const { plan: p, status: s, entries } = d;
  const reload = () => renderPlan(id);
  const cell = (w, k) => {
    if (!w.actual) return `<td class="num muted">${n0(w.target[k])}</td>`;
    const ok = w.met[k];
    const ch = w.change ? w.change[k] : null;
    return `<td class="num"><b class="${ok ? '' : 'missed'}">${n0(w.actual[k])}</b><span class="muted"> / ${n0(w.target[k])}</span>${ok ? ' <span class="okm mi in" title="Target met">check_circle</span>' : ''}
      ${ch != null ? `<div class="chg">${ch > 0 ? '+' : ''}${ch} vs last week</div>` : ''}</td>`;
  };
  const result = (w) => (w.state === 'upcoming' ? '<span class="tag">Upcoming</span>' : w.state === 'current' ? '<span class="tag">In progress</span>' : w.all_met ? '<span class="tag green">Achieved</span>' : '<span class="tag red">Missed</span>');
  const last = s.last_week ? s.weeks[s.last_week - 1] : null;
  const review = last ? `<div class="card"><h2>Week ${last.index} review</h2><p class="small muted">${range(last.start, last.end)}${last.index > 1 ? ` · compared with week ${last.index - 1}` : ''}</p>
      ${METRICS.map(([k, label]) => { const a = last.actual[k], t = last.target[k], ch = last.change?.[k]; return `<div class="row rv"><span class="grow">${label}</span><b>${n0(a)}</b><span class="muted">of ${n0(t)}</span>
        <span class="tag ${a >= t ? 'green' : 'red'}">${a >= t ? 'Met' : `Short by ${n0(t - a)}`}</span>${ch != null ? `<span class="small muted rv-ch">${ch > 0 ? '+' : ''}${ch}</span>` : ''}</div>`; }).join('')}
    </div>` : '';
  const dl = p.daily;
  const plannedCalls = dl.new_calls || (s.work_days_total ? Math.ceil(p.targets.calls / s.work_days_total) : 0);
  const callMin = plannedCalls * dl.call_minutes;
  const sched = [['New calls', `${plannedCalls} calls`], ['Average new call', `${dl.call_minutes} minutes`], ['New calling time', `${+callMin.toFixed(1)} minutes`],
    ['Breaks and transitions', `${dl.break_minutes} minutes`], ['Buffer', `${dl.buffer_minutes || 0} minutes`], ['Follow-ups and callbacks', `${dl.followups} attempts`], ['Follow-up session', `${dl.followup_minutes} minutes`],
    ['Total phone time', hm(callMin + dl.break_minutes + (dl.buffer_minutes || 0) + dl.followup_minutes)]];

  H.view.innerHTML = `
  <div class="row plan-actions">
    <a class="btn sm ghost" href="#/plans">All plans</a><span class="spacer"></span>
    ${p.status === 'active' ? `<button class="btn sm" data-st="paused">Pause</button>` : `<button class="btn sm primary" data-st="active">Activate</button>`}
    <a class="btn sm" href="#/plan-edit/${p.id}">Edit</a>
    <details class="dd"><summary class="btn sm">More</summary><div>
      <button data-dup>Duplicate</button>
      ${p.status !== 'archived' ? '<button data-st="archived">Archive</button>' : '<button data-st="draft">Restore</button>'}
      <button data-del class="bad">Delete</button></div></details>
  </div>
  <div class="card plan-hero">${hero(p, s)}</div>
  ${p.status !== 'active' ? `<div class="card next-action small">This plan is ${p.status}. ${p.status === 'draft' || p.status === 'paused' ? 'Activate it to show it on Today and track it every day.' : ''}</div>` : ''}

  <section class="block"><h3>Weekly targets</h3><p class="hint">Each week: actual / target. A week is achieved when all four targets are met.</p>
  <div class="table-wrap"><table class="wk"><tr><th>Week</th>${METRICS.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th class="num">Revenue</th><th>Result</th></tr>
    ${s.weeks.map((w) => `<tr class="${w.state === 'current' ? 'cur' : ''}"><td><b>Week ${w.index}</b><div class="small muted">${range(w.start, w.end)} · ${w.work_days} days</div></td>
      ${METRICS.map(([k]) => cell(w, k)).join('')}<td class="num">${w.actual ? `<b>${lakh(w.actual.revenue)}</b>` : ''}<span class="muted">${w.actual ? ' / ' : ''}${lakh(w.target.revenue)}</span></td><td>${result(w)}</td></tr>`).join('')}
    <tr class="tot"><td><b>Total</b></td>${METRICS.map(([k]) => `<td class="num"><b>${n0(s.total[k])}</b><span class="muted"> / ${n0(p.targets[k])}</span></td>`).join('')}<td class="num"><b>${lakh(s.total.revenue)}</b><span class="muted"> / ${lakh(p.revenue_target)}</span></td><td></td></tr>
  </table></div></section>

  <div class="grid g2">
    ${review || `<div class="card"><h2>Weekly review</h2><p class="muted small">After the first week ends, this compares it with its targets, and each later week with the week before.</p></div>`}
    <div class="card"><h2>Daily calling schedule</h2>${sched.map(([a, b], i) => `<div class="row rv${i === sched.length - 1 ? ' strong' : ''}"><span class="grow">${a}</span><span>${b}</span></div>`).join('')}</div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>How the targets were set</h2>
      <div class="row rv"><span class="grow">Average project value</span><span>${H.money(p.avg_value)}</span></div>
      <div class="row rv"><span class="grow">New calls per meeting</span><span>${p.funnel.calls_per_meeting}</span></div>
      <div class="row rv"><span class="grow">Meetings that get a proposal</span><span>${p.funnel.meeting_to_proposal}%</span></div>
      <div class="row rv"><span class="grow">Proposals that are won</span><span>${p.funnel.proposal_to_win}%</span></div>
      <div class="row rv"><span class="grow">Working days</span><span>${DAYS.filter(([d]) => p.work_days.includes(d)).map(([, l]) => l).join(', ')}</span></div>
      ${p.notes ? `<p class="small" style="margin-top:10px;white-space:pre-wrap">${H.esc(p.notes)}</p>` : ''}</div>
    <div class="card"><div class="row"><h2 class="grow" style="margin:0">Numbers logged by hand</h2><button class="btn sm" data-log-plan="${p.id}">Log numbers</button></div>
      ${entries.length ? entries.map((e) => `<div class="row rv"><span class="small muted" style="width:62px">${dShort(e.date)}</span><span class="grow small">${[['calls', 'call'], ['meetings', 'meeting'], ['proposals', 'proposal'], ['conversions', 'win']].filter(([k]) => e[k]).map(([k, l]) => `${e[k]} ${l}${e[k] === 1 ? '' : 's'}`).concat(e.revenue ? [H.money(e.revenue)] : []).join(', ')}${e.note ? ` <span class="muted">· ${H.esc(e.note)}</span>` : ''}</span><button class="btn ghost sm" data-del-entry="${e.id}" title="Delete" aria-label="Delete"><span class="mi">close</span></button></div>`).join('')
        : '<p class="muted small" style="margin-top:8px">Nothing logged. Work tracked in AxiFlow is counted automatically.</p>'}</div>
  </div>`;

  wirePlanButtons(H.view, reload);
  H.$$('[data-st]').forEach((b) => (b.onclick = () => H.busy(b, async () => {
    await H.api(`/plans/${p.id}/status`, { body: { status: b.dataset.st } });
    H.toast({ active: 'Plan activated. It now shows on Today', paused: 'Plan paused', archived: 'Plan archived', draft: 'Plan restored' }[b.dataset.st]); reload();
  })));
  const dup = H.$('[data-dup]');
  dup.onclick = () => H.busy(dup, async () => { const r = await H.api(`/plans/${p.id}/duplicate`, { method: 'POST', body: {} }); location.hash = `#/plan-edit/${r.plan.id}`; });
  const del = H.$('[data-del]');
  del.onclick = () => { if (confirm(`Delete "${p.name}" and its logged numbers?`)) H.busy(del, async () => { await H.api(`/plans/${p.id}`, { method: 'DELETE' }); H.toast('Plan deleted'); location.hash = '#/plans'; }); };
  H.$$('[data-del-entry]').forEach((b) => (b.onclick = () => H.busy(b, async () => { await H.api(`/plans/${p.id}/entries/${b.dataset.delEntry}`, { method: 'DELETE' }); reload(); })));
}

// ----------------------------------------------------------- plan editor
export async function renderPlanEdit(id) {
  const isNew = !id || id === 'new';
  const [{ presets }, existing] = await Promise.all([H.api('/plans/presets'), isNew ? null : H.api(`/plans/${Number(id)}`)]);
  let p = existing ? existing.plan : JSON.parse(JSON.stringify(presets[0].plan));
  let weeksRange = [];

  H.view.innerHTML = `
  <div class="hello" style="padding-top:4px"><h2>${isNew ? 'New revenue plan' : 'Edit plan'}</h2><p>Set the target and the dates. The weekly targets are worked out from your funnel; you can change any number.</p></div>
  <form id="planForm" class="plan-form">
    ${isNew ? `<div class="card"><h2>Start from</h2><div class="seg" id="presetSeg">${presets.map((x, i) => `<button type="button" data-preset="${i}" class="${i === 0 ? 'on' : ''}">${H.esc(x.label)}</button>`).join('')}<button type="button" data-preset="blank">My own numbers</button></div></div>` : ''}
    <div class="grid g2">
      <div class="card"><h2>Target and dates</h2><div class="form-grid">
        <label class="full">Plan name<input name="name" required maxlength="120"></label>
        <label>Start date<input type="date" name="start_date" required></label>
        <label>End date<input type="date" name="end_date" required></label>
        <label>Revenue target (₹)<input type="number" name="revenue_target" min="1" step="any" required></label>
        <label>Average project value (₹)<input type="number" name="avg_value" min="1" step="any" required></label>
        <div class="full"><label>Working days</label><div class="row wd" style="margin-top:6px">${DAYS.map(([d, l]) => `<label class="check"><input type="checkbox" name="wd" value="${d}"> ${l}</label>`).join('')}</div></div>
        <p class="small muted full" id="rangeInfo"></p>
      </div></div>
      <div class="card"><h2>Funnel</h2><p class="small muted">How many of each step turn into the next. From your past numbers.</p><div class="form-grid">
        <label>New calls per meeting<input type="number" name="calls_per_meeting" min="1" step="0.5"></label>
        <label>Meetings that get a proposal (%)<input type="number" name="meeting_to_proposal" min="1" max="100" step="1"></label>
        <label>Proposals that are won (%)<input type="number" name="proposal_to_win" min="1" max="100" step="0.1"></label>
        <div class="full"><button type="button" class="btn sm" id="recalc">Recalculate weekly targets</button></div>
        <p class="small muted full" id="funnelInfo"></p>
      </div></div>
    </div>

    <section class="block"><h3>Weekly targets</h3><p class="hint">Edit any cell. If a new date range changes the number of weeks, the totals are split again.</p>
      <div class="table-wrap"><table class="wk" id="wkTable"></table></div></section>

    <div class="grid g2">
      <div class="card"><h2>Daily calling schedule</h2><div class="form-grid">
        <label>New calls per day<input type="number" name="new_calls" min="0" placeholder="Auto"></label>
        <label>Follow-ups per day<input type="number" name="followups" min="0"></label>
        <label>Average new call (minutes)<input type="number" name="call_minutes" min="0" step="0.5"></label>
        <label>Breaks and transitions (minutes)<input type="number" name="break_minutes" min="0"></label>
        <label>Buffer (minutes)<input type="number" name="buffer_minutes" min="0" step="0.5"></label>
        <label>Follow-up session (minutes)<input type="number" name="followup_minutes" min="0"></label>
        <p class="small muted full" id="dayInfo"></p>
      </div></div>
      <div class="card"><h2>Notes</h2><textarea name="notes" maxlength="4000" placeholder="Verticals to focus on, offers, who is responsible…" style="min-height:150px"></textarea></div>
    </div>

    <div class="row" style="margin-top:16px"><a class="btn ghost" href="${isNew ? '#/plans' : `#/plan/${id}`}">Cancel</a><span class="spacer"></span>
      ${isNew ? '<button type="button" class="btn" id="saveDraft">Save as draft</button><button type="submit" class="btn primary">Save and activate</button>' : '<button type="submit" class="btn primary">Save changes</button>'}</div>
  </form>`;

  const f = H.$('#planForm');
  const el = (n) => f.elements[n];
  const fill = (plan) => {
    for (const k of ['name', 'start_date', 'end_date', 'revenue_target', 'avg_value', 'notes']) el(k).value = plan[k] ?? '';
    for (const k of ['calls_per_meeting', 'meeting_to_proposal', 'proposal_to_win']) el(k).value = plan.funnel?.[k] ?? '';
    for (const k of ['new_calls', 'followups', 'call_minutes', 'break_minutes', 'buffer_minutes', 'followup_minutes']) el(k).value = plan.daily?.[k] ?? '';
    H.$$('input[name=wd]', f).forEach((c) => (c.checked = (plan.work_days || [1, 2, 3, 4, 5, 6]).includes(Number(c.value))));
  };
  const read = () => ({
    name: el('name').value, start_date: el('start_date').value, end_date: el('end_date').value,
    revenue_target: Number(el('revenue_target').value), avg_value: Number(el('avg_value').value), notes: el('notes').value,
    work_days: H.$$('input[name=wd]:checked', f).map((c) => Number(c.value)),
    funnel: { calls_per_meeting: Number(el('calls_per_meeting').value), meeting_to_proposal: Number(el('meeting_to_proposal').value), proposal_to_win: Number(el('proposal_to_win').value) },
    daily: { new_calls: el('new_calls').value === '' ? null : Number(el('new_calls').value), followups: Number(el('followups').value), call_minutes: Number(el('call_minutes').value), break_minutes: Number(el('break_minutes').value), buffer_minutes: Number(el('buffer_minutes').value), followup_minutes: Number(el('followup_minutes').value) },
    weeks: H.$$('#wkTable tr[data-w]').map((tr) => Object.fromEntries(METRICS.map(([k]) => [k, Number(H.$(`input[data-k=${k}]`, tr).value) || 0]))),
  });

  const drawWeeks = (weeks) => {
    const avg = Number(el('avg_value').value) || 0;
    H.$('#wkTable').innerHTML = `<tr><th>Week</th>${METRICS.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th class="num">Revenue</th></tr>
      ${weeks.map((w, i) => `<tr data-w="${i}"><td><b>Week ${i + 1}</b><div class="small muted">${weeksRange[i] ? `${range(weeksRange[i].start, weeksRange[i].end)} · ${weeksRange[i].work_days} days` : ''}</div></td>
        ${METRICS.map(([k]) => `<td class="num"><input type="number" min="0" data-k="${k}" value="${w[k] ?? 0}"></td>`).join('')}<td class="num muted" data-rev>${lakh((w.conversions || 0) * avg)}</td></tr>`).join('')}
      <tr class="tot" id="wkTot"></tr>`;
    H.$$('#wkTable input').forEach((i) => (i.oninput = totals));
    totals();
  };
  const totals = () => {
    const w = read().weeks;
    const avg = Number(el('avg_value').value) || 0;
    H.$$('#wkTable tr[data-w]').forEach((tr, i) => (H.$('[data-rev]', tr).textContent = lakh((w[i]?.conversions || 0) * avg)));
    const sum = Object.fromEntries(METRICS.map(([k]) => [k, w.reduce((a, x) => a + x[k], 0)]));
    H.$('#wkTot').innerHTML = `<td><b>Total</b></td>${METRICS.map(([k]) => `<td class="num"><b>${n0(sum[k])}</b></td>`).join('')}<td class="num"><b>${lakh(sum.conversions * avg)}</b></td>`;
    const target = Number(el('revenue_target').value) || 0;
    const wd = weeksRange.reduce((a, x) => a + x.work_days, 0);
    H.$('#funnelInfo').innerHTML = sum.conversions * avg < target ? `<span class="warnt">${sum.conversions} wins × ${H.money(avg)} = ${H.money(sum.conversions * avg)}, below the ${H.money(target)} target.</span>` : `${sum.conversions} wins × ${H.money(avg)} = ${H.money(sum.conversions * avg)}`;
    const perDay = el('new_calls').value || (wd ? Math.ceil(sum.calls / wd) : 0);
    H.$('#dayInfo').textContent = wd ? `${sum.calls} new calls over ${wd} working days = about ${Math.ceil(sum.calls / wd)} a day. Phone time a day: about ${hm(perDay * (Number(el('call_minutes').value) || 0) + (Number(el('break_minutes').value) || 0) + (Number(el('buffer_minutes').value) || 0) + (Number(el('followup_minutes').value) || 0))}.` : '';
  };
  const calc = async (keepWeeks) => {
    const b = read();
    if (!b.start_date || !b.end_date || b.end_date < b.start_date) { H.$('#rangeInfo').textContent = 'Pick a start and an end date (end after start).'; return; }
    try {
      const r = await H.api('/plans/calc', { body: b });
      weeksRange = r.weeks_range;
      const wd = weeksRange.reduce((a, x) => a + x.work_days, 0);
      H.$('#rangeInfo').textContent = `${weeksRange.length} week${weeksRange.length === 1 ? '' : 's'}, ${wd} working days.`;
      drawWeeks(keepWeeks && keepWeeks.length === weeksRange.length ? keepWeeks : r.weeks);
    } catch (e) { H.toast(e.message, true); }
  };

  fill(p);
  await calc(p.weeks);
  // Same number of weeks: keep the weekly numbers; a different number: split the totals again.
  for (const n of ['start_date', 'end_date']) el(n).onchange = () => calc(read().weeks);
  H.$$('input[name=wd]', f).forEach((c) => (c.onchange = () => calc(read().weeks)));
  for (const n of ['avg_value', 'revenue_target', 'new_calls', 'call_minutes', 'break_minutes', 'buffer_minutes', 'followup_minutes']) el(n).addEventListener('input', totals);
  H.$('#recalc').onclick = () => calc();
  H.$$('[data-preset]').forEach((b) => (b.onclick = async () => {
    H.$$('[data-preset]').forEach((x) => x.classList.toggle('on', x === b));
    if (b.dataset.preset === 'blank') {
      p = { ...presets[0].plan, name: '', revenue_target: '', avg_value: '', notes: '', weeks: null };
      fill(p); el('name').focus(); H.$('#wkTable').innerHTML = ''; H.$('#rangeInfo').textContent = 'Enter the target and average value, then press Recalculate.';
      return;
    }
    p = JSON.parse(JSON.stringify(presets[Number(b.dataset.preset)].plan));
    fill(p); await calc(p.weeks);
  }));

  const save = async (activate, btn) => H.busy(btn, async () => {
    if (!f.reportValidity()) return;
    const body = read();
    if (!body.weeks.length) { await calc(); body.weeks = read().weeks; }
    const r = isNew ? await H.api('/plans', { body: { ...body, activate } }) : await H.api(`/plans/${Number(id)}`, { method: 'PUT', body });
    H.toast(isNew ? (activate ? 'Plan created and activated' : 'Plan saved as a draft') : 'Plan saved');
    location.hash = `#/plan/${r.plan.id}`;
  });
  f.onsubmit = (e) => { e.preventDefault(); save(true, e.submitter); };
  if (isNew) H.$('#saveDraft').onclick = (e) => save(false, e.target);
}
