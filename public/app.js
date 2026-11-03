import { openEditor, thumb, loadMeta, pdfToTemplate } from './editor.js';
import { setupPlans, homePlanCard, wirePlanButtons, renderPlans, renderPlan, renderPlanEdit } from './plans.js';
import { setupScripts, renderScripts } from './scripts.js';
import { autoEnhanceSelects } from './select.js';
// AxiFlow: single-page admin. No build step; talks to /api.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const view = $('#view');
let META = null;

// ---------------------------------------------------------------- helpers
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.raw ? { 'content-type': 'text/plain' } : { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : opts.raw ? opts.body : JSON.stringify(opts.body),
  });
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Please log in'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'toast'), 2600);
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: META?.currency || 'INR', maximumFractionDigits: 0 }).format(n || 0);
const stageOf = (id) => META.stages.find((s) => s.id === id) || { id, label: id, group: '' };
const stagePill = (id) => { const s = stageOf(id); return `<span class="pill ${esc(s.group)}">${esc(s.label)}</span>`; };
const pipePill = (p) => (p ? `<span class="small pipe-${esc(p)}"><i class="dot-i"></i>${esc(META.pipes[p] || p)}</span>` : '');
const aiBadge = (src) => (src === 'ai' ? '<span class="ai-badge"><span class="mi">auto_awesome</span>AI</span>' : src ? `<span class="ai-badge off">${esc(src)}</span>` : '');
/** Plain-language status for each stage (what a non-technical user sees). */
const SIMPLE = {
  new: ['New', 'grey'], qualified: ['Preparing pitch', 'blue'], researching: ['Preparing pitch', 'blue'],
  brochure_ready: ['Pitch ready: needs your OK', 'amber'], brochure_approved: ['Sending soon', 'blue'], needs_manual: ['Needs a call', 'amber'],
  contacted: ['Following up', 'blue'], follow_up_1: ['Following up', 'blue'], follow_up_2: ['Following up', 'blue'],
  nurture: ['Warming up', 'purple'], reengage: ['Said no: keeping in touch', 'purple'],
  replied: ['Replied', 'green'], meeting_booked: ['Meeting booked', 'green'], proposal_sent: ['Proposal sent', 'green'],
  won: ['Won: awaiting payment', 'green'], onboarding: ['Onboarding', 'green'], in_development: ['Building website', 'green'],
  delivered: ['Delivered: final payment', 'green'], completed: ['Done', 'grey'],
  closed_no_reply: ['Closed', 'grey'], not_interested: ['Not interested', 'grey'], lost: ['Lost', 'grey'], do_not_contact: ['Do not contact', 'red'],
};
const simplePill = (stage) => { const [t, c] = SIMPLE[stage] || [stage, 'grey']; return `<span class="tag ${c}">${esc(t)}</span>`; };
const nextText = (l) => {
  if (!l.next_action_at) return '';
  const what = { call: 'Call', message: 'Message', close: 'Move to warm-up' }[l.next_action_type] || 'Next step';
  return `${what} · ${fmtDate(l.next_action_at)}`;
};
const scoreCls = (n) => (n >= 60 ? 'hi' : n >= 30 ? 'mid' : 'lo');
const statusPill = (s) => `<span class="pill ${esc(s)}">${esc(s)}</span>`;

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
}

function modal(title, body, actions = '') {
  $('#modal').classList.remove('pal');
  $('#modalBody').innerHTML = `<div class="modal-h">${esc(title)}<button class="btn ghost sm icon-only" data-close aria-label="Close"><span class="mi">close</span></button></div><div class="modal-b">${body}</div>${actions ? `<div class="modal-f">${actions}</div>` : ''}`;
  const d = $('#modal');
  if (!d.open) d.showModal();
  $('[data-close]', d).onclick = () => d.close();
  return d;
}

setupPlans({ $, $$, api, esc, money, toast, busy, modal, get view() { return view; } });
setupScripts({ $, $$, api, esc, toast, busy, modal, get view() { return view; } });

function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked ? 1 : 0;
    else out[el.name] = el.value;
  }
  return out;
}

// ------------------------------------------------------------------ auth
function showLogin() {
  $('#shell').classList.add('hidden');
  $('#login').classList.remove('hidden');
}
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('/login', { body: formData(e.target) });
    $('#login').classList.add('hidden');
    boot();
  } catch (err) { $('#loginErr').textContent = err.message; }
};
$('#logoutBtn').onclick = async () => { await api('/logout', { body: {} }); showLogin(); };
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
$('#scrim').onclick = () => $('#side').classList.remove('open');

// ------------------------------------------------------------ theme and top bar
const setTheme = (mode) => {
  const light = mode === 'light';
  if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
  const next = light ? 'Dark mode' : 'Light mode';
  const icon = light ? 'dark_mode' : 'light_mode';
  $('#themeBtn .mi').textContent = icon; $('#themeBtn').dataset.tip = next; $('#themeBtn').setAttribute('aria-label', 'Switch to ' + next.toLowerCase());
  $('#avThemeIcon').textContent = icon; $('#avThemeLabel').textContent = next;
  $('meta[name=theme-color]')?.setAttribute('content', light ? '#F2F2F4' : '#0A0A0B');
  try { localStorage.setItem('axf-theme', light ? 'light' : 'dark'); } catch { /* private mode */ }
};
const toggleTheme = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
$('#themeBtn').onclick = toggleTheme;

// Pop-up menus in the top bar (bell, account, New): one open at a time; outside click or Esc closes.
const closePops = (except) => $$('.tb-pop.open').forEach((p) => p !== except && p.classList.remove('open'));
for (const [btn, wrap, onOpen] of [['#bellBtn', '#bellWrap', fillBell], ['#avBtn', '#avWrap'], ['#newBtn', '#newWrap']]) {
  $(btn).onclick = (e) => { e.stopPropagation(); const w = $(wrap); closePops(w); if (w.classList.toggle('open') && onOpen) onOpen(); };
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.pop')) return closePops();
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (e.target.closest('a')) closePops();
  if (act) { closePops(); if (act === 'theme') toggleTheme(); if (act === 'search') openPalette(); if (act === 'logout') $('#logoutBtn').click(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePops();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !$('#shell').classList.contains('hidden')) { e.preventDefault(); openPalette(); }
});
$('#searchBtn').onclick = () => openPalette();

/** Bell: what needs you right now, each line jumps to its place. */
async function fillBell() {
  const pop = $('#bellPop');
  pop.innerHTML = '<div class="empty-note">Checking…</div>';
  try {
    const m = await api('/manager');
    const rows = [['approvals', 'edit_note', 'Pitches to approve', m.approvals.length], ['drafts', 'forum', 'Replies to send', m.drafts.length],
      ['proposals', 'request_quote', 'Proposals to check', m.proposals_check?.length || 0], ['hot', 'handshake', 'Deals to close', m.hot.length], ['calls', 'call', 'Calls with the telecaller', m.calls.length]].filter((r) => r[3]);
    pop.innerHTML = '<div class="pop-h"><b>Needs you</b><small>' + (rows.length ? 'Open one to go straight there' : 'Everything is running automatically') + '</small></div>'
      + (rows.length ? rows.map(([k, ic, l, n]) => '<a href="#/today" data-scroll="' + k + '"><span class="mi">' + ic + '</span><span class="grow">' + l + '</span><span class="count">' + n + '</span></a>').join('')
        : '<div class="empty-note">Nothing needs you right now.</div>');
  } catch (err) { pop.innerHTML = '<div class="empty-note">' + esc(err.message) + '</div>'; }
}

// ---------------------------------------------------------------- search palette
const PAL_PAGES = [
  ['#/today', 'home', 'Today'], ['#/plans', 'track_changes', 'Targets'], ['#/leads', 'view_kanban', 'Pipeline'], ['#/board', 'view_week', 'Pipeline board'],
  ['#/customers', 'group', 'Customers'], ['#/inbox', 'chat', 'Messages'], ['#/brochure', 'menu_book', 'Brochures'], ['#/proposal', 'request_quote', 'Proposals'], ['#/script', 'record_voice_over', 'Pitch scripts'],
  ['#/designs', 'grid_view', 'Templates'], ['#/approvals', 'edit_note', 'Pitch approvals'], ['#/tasks', 'checklist', 'All tasks'], ['#/dashboard', 'monitoring', 'Reports'],
  ['#/automation', 'receipt_long', 'Automation log'], ['#/templates', 'mail', 'Message templates'], ['#/settings', 'settings', 'Settings'],
];
const PAL_ACTIONS = [
  ['new-brochure', 'add', 'New brochure', () => (location.hash = '#/brochure')], ['new-proposal', 'add', 'New proposal', () => (location.hash = '#/proposal')], ['new-script', 'add', 'New pitch script', () => (location.hash = '#/script')],
  ['new-plan', 'add', 'New revenue plan', () => (location.hash = '#/plan-edit/new')], ['run', 'play_arrow', 'Run automation now', () => $('#runBtnTop').click()],
  ['theme', 'contrast', 'Switch light / dark mode', toggleTheme], ['menu', 'left_panel_close', 'Hide or show the menu', () => $('#panelBtn').click()],
  ['logout', 'logout', 'Log out', () => $('#logoutBtn').click()],
];
function openPalette() {
  closePops();
  const d = $('#modal');
  $('#modalBody').innerHTML = '<div class="pal-in"><span class="mi">search</span><input id="palQ" placeholder="Search leads, pages and actions" autocomplete="off" aria-label="Search"><kbd>Esc</kbd></div><div class="pal-res" id="palRes"></div><div class="pal-foot"><span><kbd><span class="mi">arrow_upward</span></kbd><kbd><span class="mi">arrow_downward</span></kbd> to move</span><span><kbd><span class="mi">keyboard_return</span></kbd> to open</span></div>';
  d.classList.add('pal');
  d.addEventListener('close', () => d.classList.remove('pal'), { once: true });
  if (!d.open) d.showModal();
  const q = $('#palQ');
  let items = [];
  let sel = 0;
  let timer = null;
  let seq = 0;
  const draw = (leads) => {
    const t = q.value.trim().toLowerCase();
    const match = (s) => !t || s.toLowerCase().includes(t);
    const pages = PAL_PAGES.filter(([, , l]) => match(l)).map(([h, ic, l]) => ({ ic, l, sub: 'Page', go: () => (location.hash = h) }));
    const acts = PAL_ACTIONS.filter(([, , l]) => match(l)).map(([, ic, l, fn]) => ({ ic, l, sub: 'Action', go: fn }));
    const ld = (leads || []).map((x) => ({ ic: 'person', l: x.company, sub: [x.contact_name, x.city].filter(Boolean).join(' · '), go: () => (location.hash = '#/lead/' + x.id) }));
    items = [...ld, ...pages, ...acts];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    const group = (title, list, offset) => (list.length ? '<div class="pal-g">' + title + '</div>' + list.map((it, i) => '<div class="pal-i' + (i + offset === sel ? ' sel' : '') + '" data-i="' + (i + offset) + '"><span class="mi">' + it.ic + '</span><span>' + esc(it.l) + '</span><small>' + esc(it.sub) + '</small></div>').join('') : '');
    $('#palRes').innerHTML = (group('Leads', ld, 0) + group('Pages', pages, ld.length) + group('Actions', acts, ld.length + pages.length)) || '<div class="empty-note" style="padding:18px 12px;color:var(--muted)">No matches. Try a company, a town or a page name.</div>';
    $$('#palRes .pal-i').forEach((el) => (el.onclick = () => run(Number(el.dataset.i))));
  };
  const run = (i) => { const it = items[i]; if (!it) return; d.close(); it.go(); };
  const search = () => {
    clearTimeout(timer);
    const t = q.value.trim();
    draw([]);
    if (t.length < 2) return;
    const mine = ++seq;
    timer = setTimeout(async () => {
      try {
        const r = await api('/leads?q=' + encodeURIComponent(t));
        if (mine === seq) draw((Array.isArray(r) ? r : r.leads || []).slice(0, 8));
      } catch { /* keep pages and actions */ }
    }, 180);
  };
  q.oninput = () => { sel = 0; search(); };
  q.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); return run(sel); }
    else return;
    $$('#palRes .pal-i').forEach((el) => el.classList.toggle('sel', Number(el.dataset.i) === sel));
    $('#palRes .pal-i.sel')?.scrollIntoView({ block: 'nearest' });
  };
  draw([]);
  q.focus();
}
// Collapsible menu panel (the icon rail stays). Remembered per browser.
const setPanel = (off) => {
  $('#shell').classList.toggle('panel-off', off);
  $('#panelBtn').dataset.tip = off ? 'Show menu' : 'Hide menu';
  $('#panelBtn .mi').textContent = off ? 'left_panel_open' : 'left_panel_close';
  try { localStorage.setItem('axf-panel-off', off ? '1' : ''); } catch { /* private mode */ }
};
try { setPanel(localStorage.getItem('axf-panel-off') === '1'); } catch { setPanel(false); }
$('#panelBtn').onclick = () => setPanel(!$('#shell').classList.contains('panel-off'));
$('#panelClose').onclick = () => (matchMedia('(max-width: 900px)').matches ? $('#side').classList.remove('open') : setPanel(true));
// "Approve pitches / Replies to send / Close deals" jump to that part of Today.
document.addEventListener('click', (e) => {
  const sl = e.target.closest('[data-script-lead]');
  if (sl) sessionStorage.setItem('script-lead', sl.dataset.scriptLead);
  const a = e.target.closest('[data-scroll]');
  if (!a) return;
  sessionStorage.setItem('scrollTo', a.dataset.scroll);
  if (location.hash === '#/today') { e.preventDefault(); scrollToSection(); }
});
function scrollToSection() {
  const k = sessionStorage.getItem('scrollTo');
  if (!k) return;
  sessionStorage.removeItem('scrollTo');
  const el = $(`[data-sec="${k}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else toast('Nothing there right now');
  $('#side').classList.remove('open');
}
document.addEventListener('click', (e) => { const b = e.target.closest('#runBtn, #runBtnTop'); if (b) runNow(b); });
const runNow = (btn) => busy(btn, async () => {
  const r = await api('/run', { body: {} });
  toast(r.skipped ? 'Already running' : `Processed ${r.processed}, moved ${r.moved}, sent ${r.sent}${r.in_window ? '' : ' (outside send window: cold sends deferred)'}`);
  route();
});

async function boot() {
  const me = await fetch('/api/me').then((r) => r.json());
  if (!me.authed) return showLogin();
  META = await api('/meta');
  $('#shell').classList.remove('hidden');
  const who = (typeof META.agency === 'string' && META.agency) || 'Axilume';
  $('#whoName').textContent = who;
  $('#avName').textContent = who;
  $('#avBtn').textContent = who.trim().charAt(0).toUpperCase() || 'A';
  $('#whoAv').textContent = who.trim().charAt(0).toUpperCase() || 'A';
  route();
}

async function refreshBadges() {
  try {
    const [m, d] = await Promise.all([api('/manager'), api('/dashboard')]);
    const set = (id, n) => { const el = $(id); if (el) el.textContent = n || ''; };
    const todo = m.approvals.length + m.drafts.length + m.hot.length + (m.proposals_check?.length || 0);
    set('#badgeManager', todo);
    set('#bellCount', todo);
    set('#cntApprovals', m.approvals.length);
    set('#cntDrafts', m.drafts.length);
    set('#cntHot', m.hot.length);
    set('#cntLeads', d.total);
  } catch { /* ignore */ }
}

/** Wraps each run of adjacent .item rows in one raised list (the design's grouped rows). */
function groupItems(root) {
  for (const el of $$('.item', root)) {
    if (el.parentElement.classList.contains('group')) continue;
    if (el.previousElementSibling?.classList.contains('item')) continue;
    const run = [el];
    for (let n = el.nextElementSibling; n && n.classList.contains('item'); n = n.nextElementSibling) run.push(n);
    if (run.length < 2) continue;
    const g = document.createElement('div');
    g.className = 'group';
    el.before(g);
    run.forEach((x) => g.append(x));
  }
}
const initials = (s) => esc(String(s || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?');

// ---------------------------------------------------------------- router
const ROUTES = {
  brochure: ['Brochure Generator', (id) => renderTool('brochure', id)], proposal: ['Proposal Generator', (id) => renderTool('proposal', id)], designs: ['Templates', renderDesigns],
  script: ['', renderScripts],
  plans: ['', renderPlans], plan: ['Revenue plan', renderPlan], 'plan-edit': ['', renderPlanEdit],
  today: ['', renderManager], manager: ['', renderManager], customers: ['Customers', renderCustomers], dashboard: ['Reports', renderDashboard], leads: ['Pipeline', renderLeads], board: ['Pipeline board', renderBoard],
  lead: ['Lead', renderLead], approvals: ['Pitch approvals', renderApprovals], tasks: ['Tasks', renderTasks],
  inbox: ['Messages', renderInbox], projects: ['Projects', renderProjects], invoices: ['Invoices', renderInvoices],
  automation: ['Automation runs & log', renderAutomation], templates: ['Message templates', renderTemplates], settings: ['Settings', renderSettings],
};
async function route() {
  if (!META) return;
  if (activeEditor && !/^#\/(brochure|proposal)\/\d+/.test(location.hash)) { activeEditor.flush?.(); activeEditor = null; }
  const [name, arg] = (location.hash.replace(/^#\//, '') || 'today').split('/');
  const [title, fn] = ROUTES[name] || ROUTES.today;
  $('#pageTitle').textContent = title;
  $('.main').classList.toggle('notitle', !title);
  $('#shell').classList.toggle('editing', /^#\/(brochure|proposal)\/\d+/.test(location.hash)); // the editor needs the width: rail only
  $$('#side a[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === ({ lead: 'leads', manager: 'today', plan: 'plans', 'plan-edit': 'plans' }[name] || name)));
  { // top bar: where you are
    const navLabel = $('#side .p-item a.active .grow')?.textContent || '';
    const parts = [navLabel || title || 'Today'];
    if (title && navLabel && title !== navLabel && !/Generator$/.test(title)) parts.push(title);
    $('#crumbTitle').textContent = parts.join(' / ');
    closePops();
  }
  $('#side').classList.remove('open');
  try { await fn(arg); groupItems(view); } catch (e) { view.innerHTML = `<div class="card bad">${esc(e.message)}</div>`; }
  refreshBadges();
}
window.addEventListener('hashchange', route);

// --------------------------------------------------------------- manager
const OUTCOME_LABELS = { interested: 'Interested', meeting_booked: 'Meeting booked', callback: 'Call back later', no_answer: 'No answer', not_interested: 'Not interested', wrong_number: 'Wrong number' };
const OUTCOME_ICONS = { interested: 'thumb_up', meeting_booked: 'event', callback: 'phone_callback', no_answer: 'phone_missed', not_interested: 'thumb_down', wrong_number: 'block' };

/** Calls are made by the telecaller in the CRM; here we only show what was requested. */
function callCard(t) {
  return `<a class="item row link" href="#/lead/${t.lead_id}"><div class="grow"><b>${esc(t.company || '')}</b>
    <div class="small muted">${esc(t.title.replace(/^📞 Call [^:]+:\s*/, ''))}</div></div>
    <span class="tag amber">With telecaller</span><span class="small muted next">${t.due_at ? 'by ' + fmtDate(t.due_at) : ''}</span></a>`;
}

function draftCard(t) {
  return `<div class="item"><div class="row"><b><a href="#/lead/${t.lead_id}">${esc(t.company || '')}</a></b><span class="small muted">${esc(t.title.replace(/^✉️ /, ''))}</span>
    <span class="spacer"></span><span class="small muted">via ${esc(t.last_inbound_channel || 'best channel')}</span></div>
    <textarea data-draft-text="${t.id}" style="margin-top:8px">${esc(t.notes || '')}</textarea>
    <div class="outcomes"><button class="btn sm primary" data-send-draft="${t.id}" data-lead="${t.lead_id}">Send reply</button><button class="btn sm ghost" data-discard="${t.id}">Discard</button></div></div>`;
}

/** Wires call-outcome and draft buttons inside `root`; calls `done` afterwards. */
function bindWorkItems(root, done) {
  $$('[data-outcome]', root).forEach((b) => (b.onclick = async () => {
    const o = b.dataset.outcome;
    let body = { task_id: b.dataset.task, outcome: o };
    if (o === 'callback' || o === 'interested' || o === 'not_interested') {
      const d = modal(OUTCOME_LABELS[o], `${o === 'callback' ? '<label>Call back at<input id="cbAt" type="datetime-local"></label><br>' : ''}<label>Notes from the call<textarea id="cbNotes"></textarea></label>`, '<button class="btn primary" id="cbSave">Save</button>');
      $('#cbSave').onclick = (e) => busy(e.target, async () => {
        body = { ...body, notes: $('#cbNotes').value, callback_at: $('#cbAt')?.value ? new Date($('#cbAt').value).toISOString() : null };
        await api(`/leads/${b.dataset.lead}/actions/call_outcome`, { body });
        d.close(); toast('Logged; manager planned the next step'); done();
      });
      return;
    }
    busy(b, async () => { await api(`/leads/${b.dataset.lead}/actions/call_outcome`, { body }); toast('Logged; manager planned the next step'); done(); });
  }));
  $$('[data-send-draft]', root).forEach((b) => (b.onclick = () => busy(b, async () => {
    await api(`/leads/${b.dataset.lead}/actions/send_draft`, { body: { task_id: b.dataset.sendDraft, text: $(`[data-draft-text="${b.dataset.sendDraft}"]`).value } });
    toast('Reply sent'); done();
  })));
  $$('[data-discard]', root).forEach((b) => (b.onclick = () => busy(b, async () => { await api(`/tasks/${b.dataset.discard}`, { method: 'PATCH', body: { done: true } }); done(); })));
}

const HOT_HINT = {
  replied: 'Replied. Book a meeting or send the proposal',
  meeting_booked: 'Meeting booked. Proposal goes out automatically after the call',
  proposal_sent: 'Proposal PDF sent. A "yes" reply or the telecaller accepts it',
  won: 'Accepted. Waiting for the advance payment',
};

async function renderManager() {
  const [m, planCard] = await Promise.all([api('/manager'), homePlanCard()]);
  const todo = m.approvals.length + m.drafts.length + m.hot.length + (m.proposals_check?.length || 0);
  const hour = new Date().getHours();
  view.innerHTML = `
  <div class="hello"><div><div class="hello-date">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <h2>${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}</h2></div>
    <div class="hello-status"><i class="${m.ai.enabled ? '' : 'off'}"></i>${todo ? `${todo} thing${todo === 1 ? '' : 's'} need you · the rest runs automatically` : 'Nothing needs you · everything runs automatically'}</div></div>

  ${planCard}

  <div class="kpis stat-strip">${[
    ['Pitches to approve', m.approvals.length, '#/approvals', 'edit_note'],
    ['Replies to send', m.drafts.length, null, 'forum'],
    ['Deals to close', m.hot.length, null, 'handshake'],
    ['With the telecaller', m.calls.length, null, 'call'],
    ['Coming up', m.upcoming.length, null, 'schedule'],
  ].map(([l, v, h, ic]) => `<${h ? `a href="${h}"` : 'div'} class="card kpi${v ? '' : ' zero'}"><div class="v">${v}</div><div class="l"><span>${l}</span><span class="mi">${ic}</span></div></${h ? 'a' : 'div'}>`).join('')}</div>

  ${m.approvals.length ? `<section class="block" data-sec="approvals"><div class="sec-h"><h3>Approve pitches (${m.approvals.length})</h3><span class="hint">Interested leads. We researched them and made a pitch and a homepage design. Check them, then send.</span></div>
    ${m.approvals.map((l) => `<div class="item row"><span class="ini">${initials(l.company)}</span><div class="grow"><b>${esc(l.company)}</b><div class="small muted">${esc(l.contact_name || '')}${l.score ? ` · Website score ${l.score}/100` : ''}</div></div><a class="btn primary" href="#/approvals">Review</a></div>`).join('')}</section>` : ''}

  ${m.drafts.length ? `<section class="block" data-sec="drafts"><div class="sec-h"><h3>Replies to send (${m.drafts.length})</h3><span class="hint">Leads asked something. We wrote an answer; edit it if you like, then send.</span></div>${m.drafts.map(draftCard).join('')}</section>` : ''}

  ${m.proposals_check?.length ? `<section class="block" data-sec="proposals"><div class="sec-h"><h3>Proposals to check (${m.proposals_check.length})</h3><span class="hint">Made automatically after the meeting. Open to check prices and text, then send.</span></div>
    ${m.proposals_check.map((p) => `<div class="item row"><span class="ini">${initials(p.company)}</span><div class="grow"><b>${esc(p.company)}</b><div class="small muted">Designed proposal · ${money(p.total)} + tax</div></div><a class="btn" href="#/proposal/${p.id}"><span class="mi">edit</span>Open</a><button class="btn primary" data-send-proposal="${p.lead_id}" data-doc="${p.id}"><span class="mi">send</span>Send</button></div>`).join('')}</section>` : ''}

  ${m.hot.length ? `<section class="block" data-sec="hot"><div class="sec-h"><h3>Close these deals (${m.hot.length})</h3><span class="hint">They're engaged. Book the meeting, send the proposal, get the yes.</span></div>
    ${m.hot.map((l) => `<a class="item row link" href="#/lead/${l.id}"><span class="ini">${initials(l.company)}</span><div class="grow"><b>${esc(l.company)}</b><div class="small muted">${esc(HOT_HINT[l.stage] || '')}</div></div>${simplePill(l.stage)}</a>`).join('')}</section>` : ''}

  ${m.calls.length ? `<section class="block" data-sec="calls"><div class="sec-h"><h3>Calls with the telecaller (${m.calls.length})</h3><span class="hint">Sent to the CRM with a call script. The result comes back automatically and we plan the next step.</span></div>${m.calls.map(callCard).join('')}</section>` : ''}

  ${!todo ? '<div class="card all-done"><span class="mi">done_all</span><div><b>You&rsquo;re all caught up</b><div class="small muted">New pitches, replies and deals show up here as soon as they need you.</div></div></div>' : ''}

  <section class="block" data-sec="upcoming"><div class="sec-h"><h3>Coming up automatically</h3><span class="hint">Scheduled by the automation</span></div>
    ${m.upcoming.length ? m.upcoming.slice(0, 8).map((u) => `<a class="item row link" href="#/lead/${u.id}"><span class="ini">${initials(u.company)}</span><b>${esc(u.company)}</b>${simplePill(u.stage)}<span class="spacer"></span><span class="small muted">${esc(nextText(u))}</span></a>`).join('') : '<p class="muted">Nothing scheduled.</p>'}
  </section>

  <details class="block"><summary><b>Manager's notes</b> <span class="small muted">${m.briefing ? fmtDate(m.briefing.created_at) : ''}</span></summary>
    ${m.briefing ? `<pre class="briefing">${esc(m.briefing.content)}</pre>` : '<p class="muted">No notes yet.</p>'}
    <button class="btn sm" id="refreshBrief"><span class="mi">refresh</span>Write fresh notes</button>
    ${m.ai.enabled ? '' : '<p class="small muted">AI is off (no API key), so notes, pitches and designs use simple templates.</p>'}
  </details>`;
  $('#refreshBrief').onclick = (e) => busy(e.target, async () => { await api('/manager/briefing', { body: {} }); renderManager(); });
  bindWorkItems(view, () => { renderManager(); refreshBadges(); });
  wirePlanButtons(view, renderManager);
  $$('[data-send-proposal]', view).forEach((b) => (b.onclick = () => busy(b, async () => {
    if (!confirm('Send this proposal to the client now?')) return;
    await api(`/leads/${b.dataset.sendProposal}/actions/send_proposal_doc`, { body: { doc_id: b.dataset.doc } });
    toast('Proposal sent'); renderManager(); refreshBadges();
  })));
  groupItems(view);
  setTimeout(scrollToSection, 50);
}

// ---------------------------------------------------------------- customers
async function renderCustomers() {
  const [projects, invoices] = await Promise.all([api('/projects'), api('/invoices')]);
  const pending = invoices.filter((i) => i.status === 'pending');
  view.innerHTML = `
  ${pending.length ? `<section class="block"><h3>Waiting for payment (${pending.length})</h3>${pending.map((i) => `<div class="item row"><b>${esc(i.company)}</b><span class="muted small">${esc(i.number)} · ${i.kind === 'advance' ? 'advance' : 'final'}</span><span class="spacer"></span><b>${money(i.amount)}</b><button class="btn sm" data-paid="${i.id}" data-lead="${i.lead_id}">Mark paid</button></div>`).join('')}</section>` : ''}
  <section class="block"><h3>Projects</h3>${projects.length ? projects.map((p) => {
    const done = p.milestones.filter((x) => x.done).length;
    const pct = p.milestones.length ? Math.round((done / p.milestones.length) * 100) : 0;
    const next = p.milestones.find((x) => !x.done);
    return `<div class="item"><div class="row"><a href="#/lead/${p.lead_id}"><b>${esc(p.company)}</b></a>${simplePill(p.stage)}<span class="spacer"></span><span class="small muted">${pct}% done</span></div>
      <div class="bar" style="margin:8px 0"><div style="width:${pct}%;background:var(--ok)"></div></div>
      ${next ? `<label class="check"><input type="checkbox" data-ms="${next.id}"> Mark "<b>${esc(next.name)}</b>" done <span class="small muted">(client is notified)</span></label>` : '<span class="small ok">All milestones done</span>'}</div>`;
  }).join('') : '<p class="muted">No projects yet. A project starts when a client pays the advance and fills in the brief.</p>'}</section>
  <details class="block"><summary><b>All invoices</b></summary>${invoices.map((i) => `<div class="row small"><a target="_blank" href="/pay/${i.token}">${esc(i.number)}</a><span>${esc(i.company)}</span><span class="spacer"></span><span>${money(i.amount)}</span><span class="tag ${i.status === 'paid' ? 'green' : 'amber'}">${esc(i.status)}</span></div>`).join('') || '<p class="muted">None</p>'}</details>`;
  $$('[data-paid]').forEach((b) => (b.onclick = () => busy(b, async () => { await api(`/leads/${b.dataset.lead}/actions/mark_paid`, { body: { invoice_id: b.dataset.paid } }); toast('Payment recorded'); renderCustomers(); })));
  $$('[data-ms]').forEach((c) => (c.onchange = () => busy(null, async () => { await api(`/milestones/${c.dataset.ms}`, { method: 'PATCH', body: { done: true } }); toast('Done. Client notified'); renderCustomers(); })));
}

// ------------------------------------------------------------- dashboard
async function renderDashboard() {
  const d = await api('/dashboard');
  const groups = {};
  for (const s of META.stages) groups[s.group] = (groups[s.group] || 0) + (d.by_stage[s.id] || 0);
  const maxStage = Math.max(1, ...Object.values(d.by_stage));
  const maxDay = Math.max(1, ...d.days.map((x) => Math.max(x.leads, x.messages)));
  const ch = {};
  for (const r of d.channels) { ch[r.channel] ??= {}; ch[r.channel][r.status] = r.n; }
  const sch = d.scheduler;
  view.innerHTML = `
  <div class="kpis">
    ${[['Total leads', d.total], ['Contacted', d.contacted], ['Reply rate', d.reply_rate + '%'], ['Meetings', d.meetings], ['Won', d.won],
      ['Open proposals', money(d.money.open_proposals)], ['Collected', money(d.money.collected)], ['Outstanding', money(d.money.outstanding)]]
      .map(([l, v]) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}
  </div>
  <div class="kpis">
    ${[['conversion', 'Conversion pipe', 'interested leads go to the pitch maker'], ['nurture', 'Nurture pipe', 'undecided leads'], ['reengage', 'Re-engage pipe', 'said no']]
      .map(([k, l, sub]) => `<div class="card kpi"><div class="l pipe-${k}"><span><i class="dot-i"></i>${l}</span></div><div class="v">${d.pipes[k] || 0}</div><div class="small muted">${sub}</div></div>`).join('')}
    <div class="card kpi"><div class="l">Calls to make</div><div class="v">${d.calls_due}</div><div class="small muted">${d.drafts} reply draft(s)</div></div>
    <div class="card kpi"><div class="l">AI spend today</div><div class="v">$${d.ai.spent_today_usd}</div><div class="small muted">${d.ai.enabled ? 'AI on' : 'AI off'} · budget $${d.ai.daily_budget_usd}</div></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>Pipeline by stage</h2><div class="bars">
      ${META.stages.filter((s) => d.by_stage[s.id]).map((s) => `<a class="bar-row" href="#/leads?stage=${s.id}" data-stage="${s.id}"><span>${esc(s.label)}</span><div class="bar"><div style="width:${(d.by_stage[s.id] / maxStage) * 100}%"></div></div><b class="num">${d.by_stage[s.id]}</b></a>`).join('') || '<div class="empty">No leads yet</div>'}
    </div>
    <div class="row small muted" style="margin-top:12px">${Object.entries(groups).map(([g, n]) => `<span class="pill ${g}">${g}: ${n}</span>`).join(' ')}</div></div>
    <div class="card"><h2>Needs attention</h2>
      <div class="row" style="margin-bottom:10px"><a class="btn sm" href="#/approvals">${d.approvals} brochure approval(s)</a><a class="btn sm" href="#/tasks">${d.open_tasks} open task(s)</a></div>
      <h3>Upcoming meetings</h3>
      ${d.upcoming_meetings.length ? d.upcoming_meetings.map((m) => `<div class="row"><a href="#/lead/${m.lead_id}">${esc(m.company)}</a><span class="spacer"></span><span class="muted">${fmtDate(m.start_at)}</span></div>`).join('') : '<div class="muted">None scheduled</div>'}
      <h3>Scheduler</h3>
      <div class="small">${sch.enabled ? `Daily run at <b>${esc(sch.daily_time)}</b> (${esc(sch.timezone)}), sweep every ${sch.sweep_minutes} min` : '<span class="bad">Disabled</span>'}<br>
      Last daily: ${fmtDate(sch.last_daily_at)} · Last sweep: ${fmtDate(sch.last_sweep_at)}<br>
      Last run: ${d.last_run ? `${esc(d.last_run.trigger)} @ ${fmtDate(d.last_run.started_at)}: ${esc(d.last_run.stats_json || '')}` : '–'}</div>
    </div>
    <div class="card"><h2>Last 14 days</h2>
      <div class="spark">${d.days.map((x) => `<div class="sc" title="${x.d}: ${x.leads} leads, ${x.messages} messages"><span class="a" style="height:${(x.leads / maxDay) * 100}%"></span><span class="b" style="height:${(x.messages / maxDay) * 100}%"></span></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--brand)"></i>New leads</span><span><i style="background:var(--ok)"></i>Messages sent</span></div>
    </div>
    <div class="card"><h2>Channels &amp; sources</h2>
      <table><tr><th>Channel</th><th class="num">Sent</th><th class="num">Mock</th><th class="num">Failed</th></tr>
      ${['whatsapp', 'email'].map((c) => `<tr><td>${c}</td><td class="num">${ch[c]?.sent || 0}</td><td class="num">${ch[c]?.mock || 0}</td><td class="num">${ch[c]?.failed || 0}</td></tr>`).join('')}</table>
      <table style="margin-top:10px"><tr><th>Source</th><th class="num">Leads</th><th class="num">Won</th></tr>
      ${d.sources.map((s) => `<tr><td>${esc(s.source)}</td><td class="num">${s.n}</td><td class="num">${s.won}</td></tr>`).join('')}</table>
    </div>
  </div>
  <div class="card" style="margin-top:14px"><h2>Recent automation activity</h2>${eventsTable(d.recent)}</div>`;
  $$('[data-stage]', view).forEach((a) => (a.onclick = (e) => { e.preventDefault(); sessionStorage.setItem('leadStage', a.dataset.stage); location.hash = '#/leads'; }));
}

function eventsTable(rows) {
  if (!rows.length) return '<div class="empty">No events yet</div>';
  return `<div class="table-wrap"><table><tr><th>Time</th><th>Lead</th><th>Workflow</th><th>Step</th><th>Status</th><th>Detail</th></tr>
  ${rows.map((e) => `<tr><td class="small">${fmtDate(e.created_at)}</td><td>${e.lead_id ? `<a href="#/lead/${e.lead_id}">${esc(e.company || '#' + e.lead_id)}</a>` : '–'}</td><td>${esc(e.workflow)}</td><td>${esc(e.step)}</td><td>${statusPill(e.status)}</td><td class="small muted">${esc(e.detail)}</td></tr>`).join('')}
  </table></div>`;
}

// ----------------------------------------------------------------- leads
const LEAD_TABS = [
  ['active', 'Converting', (l) => !['nurture', 'reengage', 'completed', 'closed_no_reply', 'not_interested', 'lost', 'do_not_contact'].includes(l.stage) && !['won', 'onboarding', 'in_development', 'delivered'].includes(l.stage)],
  ['warm', 'Warming up', (l) => ['nurture', 'reengage'].includes(l.stage)],
  ['customers', 'Won', (l) => ['won', 'onboarding', 'in_development', 'delivered', 'completed'].includes(l.stage)],
  ['closed', 'Closed', (l) => ['closed_no_reply', 'not_interested', 'lost', 'do_not_contact'].includes(l.stage)],
  ['all', 'All', () => true],
];
async function renderLeads() {
  const tab = sessionStorage.getItem('leadTab2') || 'active';
  const rows = await api('/leads?sort=updated');
  view.innerHTML = `
  <div class="toolbar"><div class="seg">${LEAD_TABS.map(([k, label, f]) => `<button class="${k === tab ? 'on' : ''}" data-lt="${k}">${label} <span>${rows.filter(f).length}</span></button>`).join('')}</div>
    <span class="spacer"></span><input id="q" placeholder="Search" value="${esc(sessionStorage.getItem('leadQ') || '')}" style="min-width:200px">
    <a class="btn sm" href="/api/leads/export.csv" title="Download CSV" aria-label="Download CSV"><span class="mi">download</span></a></div>
  <p class="hint">Leads arrive from the CRM. The telecaller adds, edits and calls them there; this list shows how each one is converting.</p>
  <div id="leadList"></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase();
    sessionStorage.setItem('leadQ', $('#q').value);
    const f = LEAD_TABS.find(([k]) => k === tab)[2];
    const list = rows.filter(f).filter((l) => !q || [l.company, l.contact_name, l.email, l.phone, l.city].join(' ').toLowerCase().includes(q));
    $('#leadList').innerHTML = list.length ? list.map((l) => `<a class="item row link" href="#/lead/${l.id}">
      <div class="grow"><b>${esc(l.company)}</b><div class="small muted">${esc(l.contact_name || '')}${l.city ? ' · ' + esc(l.city) : ''}</div></div>
      ${simplePill(l.stage)}<span class="small muted next">${esc(nextText(l))}</span></a>`).join('')
      : '<div class="card empty">No leads here.</div>';
  };
  $$('[data-lt]').forEach((b) => (b.onclick = () => { sessionStorage.setItem('leadTab2', b.dataset.lt); renderLeads(); }));
  $('#q').oninput = draw;
  draw();
}

/** The only lead field edited here: the personal note shown in the brochure (lead data lives in the CRM). */
function pitchNoteDialog(lead, done) {
  const d = modal(`Personal note for ${lead.company}`, `<p class="small muted">Shown at the top of their brochure. Contact details are edited in the CRM.</p><textarea id="pNote" style="min-height:120px">${esc(lead.pitch || '')}</textarea>`,
    '<button class="btn primary" id="pSave">Save & rebuild brochure</button>');
  $('#pSave').onclick = (ev) => busy(ev.target, async () => { await api(`/leads/${lead.id}/actions/pitch_note`, { body: { pitch: $('#pNote').value } }); d.close(); toast('Saved'); done?.(); });
}

// ------------------------------------------------------------------ board
async function renderBoard() {
  const leads = await api('/leads?sort=score');
  const hideClosed = sessionStorage.getItem('hideClosed') !== '0';
  const stages = META.stages.filter((s) => !(hideClosed && s.group === 'Closed'));
  view.innerHTML = `<div class="toolbar"><label class="check"><input type="checkbox" id="hideClosed" ${hideClosed ? 'checked' : ''}> Hide closed stages</label><span class="small muted">Drag a card to another column to move it. The automation for that stage runs immediately.</span></div>
  <div class="board">${stages.map((s) => {
    const items = leads.filter((l) => l.stage === s.id);
    return `<div class="col" data-stage="${s.id}"><div class="col-h"><span>${esc(s.label)}</span><span class="muted">${items.length}</span></div>
      ${items.map((l) => `<div class="lead-card" draggable="true" data-id="${l.id}"><b>${esc(l.company)}</b><span class="small muted">${esc(l.contact_name || '')}</span>
      <div class="row small" style="margin-top:4px"><span class="score ${scoreCls(l.score)}">${l.score}</span><span class="muted">${esc(l.source || '')}</span><span class="spacer"></span>${l.next_action_at ? `<span class="muted" title="next action"><span class="mi in">schedule</span>${fmtDay(l.next_action_at)}</span>` : ''}</div></div>`).join('')}
    </div>`;
  }).join('')}</div>`;
  $('#hideClosed').onchange = (e) => { sessionStorage.setItem('hideClosed', e.target.checked ? '1' : '0'); renderBoard(); };
  $$('.lead-card').forEach((c) => {
    c.ondragstart = (e) => e.dataTransfer.setData('text/plain', c.dataset.id);
    c.onclick = () => (location.hash = `#/lead/${c.dataset.id}`);
  });
  $$('.col').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
    col.ondragleave = () => col.classList.remove('drop');
    col.ondrop = async (e) => {
      e.preventDefault();
      col.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      try {
        await api(`/leads/${id}/stage`, { body: { stage: col.dataset.stage } });
        toast(`Moved to ${stageOf(col.dataset.stage).label}`);
      } catch (err) { toast(err.message, true); }
      renderBoard();
    };
  });
}

// ------------------------------------------------------------ lead detail
let leadTab = 'overview';
async function renderLead(id) {
  const d = await api(`/leads/${id}`);
  const l = d.lead;
  const audit = l.audit_json ? JSON.parse(l.audit_json) : null;
  const reasons = l.score_reasons ? JSON.parse(l.score_reasons) : [];
  $('#pageTitle').textContent = '';

  const A = (action, label, cls = '') => `<button class="btn sm ${cls}" data-act="${action}">${label}</button>`;
  const M = (action, label, cls = '') => `<button class="${cls}" data-act="${action}">${label}</button>`;
  const docOf = (k) => (d.tool_docs || []).find((x) => x.kind === k && x.status === 'ready');
  const unsentProposal = (d.tool_docs || []).find((x) => x.kind === 'proposal' && x.status === 'ready' && !x.sent);
  const docLinks = [['script', 'record_voice_over', 'Call script'], ['brochure', 'menu_book', 'Brochure'], ['proposal', 'request_quote', 'Proposal']]
    .map(([k, ic, label]) => { const x = docOf(k); return x ? `<a class="btn sm" href="#/${k}/${x.id}"><span class="mi">${ic}</span>${label}</a>` : ''; }).join('');
  // One clear main action for where the lead is now.
  const main = l.stage === 'brochure_ready' ? A('approve', '<span class="mi">check</span>Approve & send pitch', 'primary')
    : unsentProposal && ['replied', 'meeting_booked', 'needs_manual', 'contacted', 'follow_up_1', 'follow_up_2'].includes(l.stage) ? A('send_proposal_doc', '<span class="mi">send</span>Send the proposal', 'primary')
    : ['replied', 'meeting_booked'].includes(l.stage) ? A('proposal', '<span class="mi">request_quote</span>Make the proposal', 'primary')
    : l.stage === 'proposal_sent' ? A('accept_proposal', '<span class="mi">check</span>Client said yes', 'primary')
    : ['brochure_approved', 'contacted', 'follow_up_1', 'follow_up_2', 'nurture', 'reengage'].includes(l.stage) ? A('send_now', 'Do next step now', 'primary')
    : ['qualified', 'new', 'researching'].includes(l.stage) ? A('run', 'Run now', 'primary') : '';
  const quick = l.stage === 'do_not_contact' ? '' : A('message', 'Message') + A('book', 'Book meeting');
  const more = [
    `<a href="#/script" data-script-lead="${l.id}"><span class="mi">record_voice_over</span>Write a call script</a>`,
    M('pitch_note', 'Edit personal note in brochure'), M('note', 'Add note'), M('plan_next', '<span class="mi">auto_awesome</span>Ask manager for next step'),
    l.stage !== 'do_not_contact' ? M('repitch', l.pitch_json ? '<span class="mi">auto_awesome</span>Redo research & pitch' : '<span class="mi">auto_awesome</span>Make pitch now') : '',
    l.brochure_version ? `<a target="_blank" href="/pdf/brochure/${l.token}.pdf">Open brochure PDF<span class="mi">open_in_new</span></a>` : '',
    l.stage === 'proposal_sent' ? M('decline_proposal', 'Client declined the proposal', 'danger') : '',
    ['closed_no_reply', 'not_interested', 'lost', 'do_not_contact', 'nurture', 'reengage'].includes(l.stage) ? M('reopen', 'Re-open as new') : '',
    M('reply', 'Test: simulate a client reply'), M('test_crm_call', 'Test: simulate telecaller call result'),
    !['lost', 'completed'].includes(l.stage) ? M('disqualify', 'Mark as lost', 'danger') : '',
  ].join('');
  const acts = [main, quick, `<details class="dd"><summary class="btn sm">More<span class="mi">expand_more</span></summary><div>${more}</div></details>`];

  view.innerHTML = `
  <div class="detail-head">
    <div><h2>${esc(l.company)}</h2><div class="muted">${esc(l.contact_name || '')}${l.city ? ' · ' + esc(l.city) : ''}${l.industry ? ' · ' + esc(l.industry) : ''}</div>
    <div class="row" style="margin-top:8px">${simplePill(l.stage)}</div>${docLinks ? `<div class="row lead-docs" style="margin-top:10px;gap:6px"><span class="small muted">Made for this lead:</span>${docLinks}</div>` : ''}</div>
    <span class="spacer"></span>
    <div class="row">${acts.join('')}</div>
  </div>
  ${l.next_action_at ? `<div class="next-action" style="margin-bottom:14px"><b>Next: ${esc(nextText(l))}</b>${l.next_action_note ? `<pre>${esc(l.next_action_note)}</pre>` : ''}</div>` : ''}
  <div class="tabs">${[['overview', 'Overview'], ['messages', `Messages (${d.messages.length})`], ['pitch', 'Pitch'], ['design', 'Design'], ['deal', 'Deal'], ['timeline', 'History']]
    .map(([k, label]) => `<button data-tab="${k}" class="${leadTab === k ? 'active' : ''}">${label}</button>`).join('')}</div>
  <div id="tabBody"></div>`;

  const tabs = {
    tasks: () => `${d.tasks.filter((t) => !t.done && t.kind === 'call').map((t) => callCard({ ...t, company: l.company, phone: l.phone })).join('')}${d.tasks.filter((t) => !t.done && t.kind === 'reply_draft').map((t) => draftCard({ ...t, company: l.company, last_inbound_channel: l.last_inbound_channel })).join('')}`,
    overview: () => `${tabs.tasks()}<div class="grid">
      <div class="card"><h2>Contact</h2><table>
        ${[['Email', l.email ? `${esc(l.email)} ${l.email_valid ? '<span class="ok mi in" title="Valid">check</span>' : '<span class="bad">invalid</span>'}` : '–'],
          ['Phone', l.phone ? `${esc(l.phone)} ${l.phone_valid ? '<span class="ok mi in" title="Valid">check</span>' : '<span class="bad">invalid</span>'}` : '–'],
          ['Website', l.website ? `<a href="${esc(l.website)}" target="_blank" rel="noopener">${esc(l.website)}</a>` : '–'],
          ['Wants', esc(META.packages.find((p) => p.id === l.recommended_package)?.name || l.service || '–')], ['Budget', l.budget ? money(l.budget) : '–'],
          ['Permissions', `${l.wa_opt_in ? 'WhatsApp <span class="mi in">check</span> ' : ''}${l.email_opt_in ? 'Email <span class="mi in">check</span>' : ''}${!l.wa_opt_in && !l.email_opt_in ? '<span class="muted">none</span>' : ''}${l.consent_at ? ` <span class="small muted">(${fmtDay(l.consent_at)})</span>` : ''}`],
          ['Last contact', `${fmtDate(l.last_contacted_at)} ${esc(l.last_channel || '')}`], ['Last reply', fmtDate(l.last_inbound_at)]].map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('')}
      </table>${l.notes ? `<h3>Notes</h3><p>${esc(l.notes)}</p>` : ''}</div>
      <details class="card"><summary><b>Website check & score</b> <span class="small muted">score ${l.score}</span></summary><div class="grid">
        <div><h3>Website check <button class="btn sm ghost" data-act="reaudit">Re-run</button></h3>
          ${audit ? `${audit.load_ms ? `<p class="small muted">Load ${(audit.load_ms / 1000).toFixed(1)}s · HTTPS ${audit.https ? '<span class="mi in">check</span>' : '<span class="mi in">close</span>'} · ${esc(audit.title || '')}</p>` : ''}
          <ul class="findings">${audit.findings.map((f) => `<li><span class="sev ${f.severity}">${f.severity}</span>${esc(f.text)}</li>`).join('') || '<li class="muted">No issues found</li>'}</ul>` : '<p class="muted">Not audited yet</p>'}
        </div>
        <div><h3>Score <button class="btn sm ghost" data-act="rescore">Re-score</button></h3>
          ${reasons.length ? `<ul class="small">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="muted">Not scored yet</p>'}
          <p class="small muted">Source: ${esc(l.source || '–')}${l.external_id ? ` · CRM id ${esc(l.external_id)}` : ''}</p></div>
      </div></details></div>`,
    timeline: () => `<details class="block"><summary class="small muted">Technical log</summary>${eventsTable(d.events.map((e) => ({ ...e, company: l.company })))}</details><div class="card timeline">${d.activities.map((a) => `<div class="tl"><span class="dot ${esc(a.type)}"></span><div><b>${esc(a.title)}</b> <span class="small muted">${fmtDate(a.created_at)}</span>${a.body ? `<pre>${esc(a.body)}</pre>` : ''}</div></div>`).join('') || '<div class="empty">Nothing yet</div>'}</div>`,
    messages: () => d.messages.map((m) => `<div class="msg ${m.direction}"><div class="row small"><b>${m.direction === 'in' ? '<span class="mi in">south_west</span>From client' : '<span class="mi in">north_east</span>To client'}</b><span class="pill">${esc(m.channel)}</span>${m.template_key ? `<span class="muted">${esc(m.template_key)}</span>` : ''}${statusPill(m.status)}<span class="spacer"></span><span class="muted">${fmtDate(m.created_at)}</span></div>
      ${m.subject ? `<div><b>${esc(m.subject)}</b></div>` : ''}<pre>${esc(m.body)}</pre>${m.error ? `<div class="bad small">${esc(m.error)}</div>` : ''}</div>`).join('') || '<div class="card empty">No messages yet</div>',
    pitch: () => `${l.brochure_version ? `<p class="small"><a target="_blank" href="/pdf/brochure/${l.token}.pdf"><span class="mi">description</span>Open the brochure PDF the client gets<span class="mi">open_in_new</span></a></p>` : ''}${pitchView(l)}`,
    design: () => l.design_version ? `<div class="row small muted" style="margin-bottom:8px">Version ${l.design_version}<span class="spacer"></span><button class="btn sm" data-act="redesign"><span class="mi">auto_awesome</span>Regenerate design</button><a class="btn sm" target="_blank" href="/d/${l.token}">Open<span class="mi">open_in_new</span></a></div><iframe class="preview" sandbox src="/d/${l.token}"></iframe>`
      : `<div class="card empty">No design yet. The pitch maker creates a homepage concept for interested leads.<br><br><button class="btn sm" data-act="redesign"><span class="mi">auto_awesome</span>Create design now</button></div>`,
    brochure: () => l.brochure_version ? `<p class="small muted">Version ${l.brochure_version} · status <b>${esc(l.brochure_status)}</b>${l.approved_at ? ` · approved by ${esc(l.approved_by)} ${fmtDate(l.approved_at)}` : ''}</p><iframe class="preview" src="/pdf/brochure/${l.token}.pdf"></iframe>` : '<div class="card empty">No brochure yet. It is generated when the lead is qualified.</div>',
    deal: () => `<div class="grid g2">
      <div class="card"><h2>Meetings</h2>${d.meetings.map((m) => `<div class="row"><span>${fmtDate(m.start_at)}</span>${statusPill(m.status)}</div>`).join('') || '<p class="muted">None</p>'}
        <p class="small"><a href="/book/${l.token}" target="_blank">Client booking page<span class="mi">open_in_new</span></a></p></div>
      <div class="card"><h2>Proposals</h2>${d.proposals.map((p) => `<div class="row"><a href="/pdf/proposal/${p.token}.pdf" target="_blank"><span class="mi">description</span>#${p.id} ${money(p.total)}</a>${statusPill(p.status)}<span class="spacer"></span><span class="small muted">${fmtDay(p.created_at)}</span></div>${p.decline_reason ? `<div class="small bad">${esc(p.decline_reason)}</div>` : ''}`).join('') || '<p class="muted">None</p>'}</div>
      <div class="card"><h2>Invoices</h2>${d.invoices.map((i) => `<div class="row"><a href="/pay/${i.token}" target="_blank">${esc(i.number)}</a><span>${esc(i.kind)} ${money(i.amount)}</span>${statusPill(i.status === 'paid' ? 'ok' : 'skipped').replace(/>(ok|skipped)</, `>${i.status}<`)}<span class="spacer"></span>${i.status === 'pending' ? `<button class="btn sm" data-paid="${i.id}">Mark paid</button>` : `<span class="small muted">${fmtDay(i.paid_at)}</span>`}</div>`).join('') || '<p class="muted">None</p>'}</div>
      <div class="card"><h2>Project</h2>${d.project ? `<p class="small"><a href="/status/${l.token}" target="_blank">Client status portal<span class="mi">open_in_new</span></a></p>
        ${d.milestones.map((m) => `<label class="ms check"><input type="checkbox" data-ms="${m.id}" ${m.done ? 'checked' : ''}> ${esc(m.name)} ${m.done_at ? `<span class="small muted">${fmtDay(m.done_at)}</span>` : ''}</label>`).join('')}
        <details><summary class="small muted">Client brief</summary><pre class="mono">${esc(JSON.stringify(JSON.parse(d.project.brief_json || '{}'), null, 2))}</pre></details>` : '<p class="muted">Created when the client submits the onboarding brief.</p>'}</div>
    </div>`,
    log: () => eventsTable(d.events.map((e) => ({ ...e, company: l.company }))),
  };
  const showTab = (k) => {
    leadTab = k;
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === k));
    $('#tabBody').innerHTML = tabs[k]();
    bindLeadInner(l);
  };
  $$('.tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  showTab(tabs[leadTab] ? leadTab : 'overview');

  $$('.detail-head [data-act]').forEach((b) => (b.onclick = () => { b.closest('details')?.removeAttribute('open'); leadAction(l, b.dataset.act, b); }));
}

function pitchView(l) {
  const r = l.research_json ? JSON.parse(l.research_json) : null;
  const p = l.pitch_json ? JSON.parse(l.pitch_json) : null;
  if (!p) return `<div class="card empty">No pitch yet. The pitch maker runs automatically for <b>interested</b> leads (web research, then pitch, then design).<br><br><button class="btn sm primary" data-act="repitch"><span class="mi">auto_awesome</span>Run pitch maker now</button></div>`;
  const ul = (xs) => (xs?.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted small">–</p>');
  return `<div class="grid g2">
    <div class="card"><div class="row"><h2 style="margin:0">The pitch</h2>${aiBadge(p.source)}</div>
      <h3>Headline</h3><p><b>${esc(p.headline)}</b></p><h3>Hook</h3><p>${esc(p.hook)}</p>
      <h3>Pain points</h3>${ul(p.pain_points)}<h3>Value we bring</h3>${ul(p.value_props)}
      <h3>Package</h3><p><b>${esc(META.packages.find((x) => x.id === p.recommended_package)?.name || p.recommended_package)}</b>: ${esc(p.package_reason)}</p></div>
    <div class="card"><h2>Sales call kit</h2>${p.telecaller_script ? `<h3><span class="mi">call</span>Telecaller script (sent to the CRM)</h3><pre class="briefing small">${esc(p.telecaller_script)}</pre>` : ''}<h3>Talking points</h3><ol>${(p.call_script || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <h3>Objection handling</h3>${(p.objections || []).map((o) => `<div class="item"><b>"${esc(o.objection)}"</b><pre>${esc(o.response)}</pre></div>`).join('')}</div>
    <div class="card"><h2>Intro messages</h2><h3>Email: ${esc(p.email?.subject)}</h3><pre class="briefing small">${esc(p.email?.body)}</pre><h3>WhatsApp</h3><pre class="briefing small">${esc(p.whatsapp_intro)}</pre></div>
    <div class="card"><div class="row"><h2 style="margin:0">Web research</h2>${aiBadge(r?.source)}${r?.confidence ? `<span class="small muted">confidence: ${esc(r.confidence)}</span>` : ''}</div>
      ${r ? `<p>${esc(r.business_summary)}</p><dl class="kv"><dt>Sells</dt><dd>${esc((r.what_they_sell || []).join(', ') || '–')}</dd><dt>Customers</dt><dd>${esc(r.target_customers)}</dd>
      <dt>Website</dt><dd>${esc(r.online_presence?.website)}</dd><dt>Google</dt><dd>${esc(r.online_presence?.google_business)}</dd><dt>Social</dt><dd>${esc(r.online_presence?.social_media)}</dd><dt>Reviews</dt><dd>${esc(r.online_presence?.reviews)}</dd>
      <dt>Fit</dt><dd>${esc(r.fit_score)}/100: ${esc(r.fit_reason)}</dd></dl>
      <h3>Competitors</h3>${ul((r.competitors || []).map((c) => `${c.name}: ${c.what_they_do_better_online}`))}<h3>Growth signals</h3>${ul(r.growth_signals)}
      ${r.sources?.length ? `<h3>Sources</h3><ul class="small">${r.sources.filter((s) => /^https?:/i.test(s.url)).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ul>` : ''}
      <details><summary class="small muted">Full research notes</summary><pre class="briefing small">${esc(r.notes)}</pre></details>` : ''}</div>
  </div>`;
}

function bindLeadInner(l) {
  const reload = () => renderLead(l.id);
  bindWorkItems($('#tabBody'), () => { reload(); refreshBadges(); });
  $$('#tabBody [data-act]').forEach((b) => (b.onclick = () => leadAction(l, b.dataset.act, b)));
  $$('[data-paid]').forEach((b) => (b.onclick = () => busy(b, async () => { await api(`/leads/${l.id}/actions/mark_paid`, { body: { invoice_id: b.dataset.paid } }); toast('Marked paid'); reload(); })));
  $$('[data-ms]').forEach((c) => (c.onchange = () => busy(null, async () => { await api(`/milestones/${c.dataset.ms}`, { method: 'PATCH', body: { done: c.checked } }); toast(c.checked ? 'Milestone done; client notified' : 'Milestone reopened'); reload(); })));
  $$('[data-task]').forEach((c) => (c.onchange = () => busy(null, async () => { await api(`/tasks/${c.dataset.task}`, { method: 'PATCH', body: { done: c.checked } }); reload(); })));
}

async function leadAction(l, act, btn) {
  const go = async (body = {}) => {
    const r = await api(`/leads/${l.id}/actions/${act}`, { body });
    toast(`Done${r.lead?.stage ? `. Now: ${stageOf(r.lead.stage).label}` : ''}`);
    renderLead(l.id);
    refreshBadges();
  };
  if (act === 'message') {
    const d = modal(`Message ${l.company}`, `<p class="small muted">Sent as a personal message (transactional). Goes on the channel they last replied on, else the best valid one.</p>
      <label>Channel<select id="mCh"><option value="">Automatic</option><option>whatsapp</option><option>email</option></select></label><br><label>Message<textarea id="mText" style="min-height:140px"></textarea></label>`,
    '<button class="btn primary" id="mSend">Send</button>');
    $('#mSend').onclick = (e) => busy(e.target, async () => { await go({ text: $('#mText').value, channel: $('#mCh').value || null }); d.close(); });
    return;
  }
  if (act === 'accept_proposal') {
    if (!confirm(`Mark ${l.company}'s proposal as accepted? This sends the advance invoice.`)) return;
    return busy(btn, () => api(`/leads/${l.id}/actions/proposal_decision`, { body: { decision: 'accepted' } }).then(() => { toast('Accepted. Advance invoice sent'); renderLead(l.id); }));
  }
  if (act === 'decline_proposal') {
    const reason = prompt('Why did they decline?', 'Budget');
    if (reason === null) return;
    return busy(btn, () => api(`/leads/${l.id}/actions/proposal_decision`, { body: { decision: 'declined', reason } }).then(() => { toast('Marked as declined'); renderLead(l.id); }));
  }
  if (act === 'test_crm_call') {
    const d = modal('Test: telecaller call result', `<p class="small muted">In real use the CRM sends this automatically after the telecaller's call (POST /api/crm/leads/:external_id/call).</p>
      <div class="outcomes">${META.call_outcomes.map((o) => `<button class="btn sm" data-o="${o}"><span class="mi">${OUTCOME_ICONS[o] || 'call'}</span>${OUTCOME_LABELS[o]}</button>`).join('')}</div>`);
    $$('[data-o]', d).forEach((b) => (b.onclick = () => busy(b, async () => { await go({ outcome: b.dataset.o }); d.close(); })));
    return;
  }
  if (act === 'pitch_note') {
    const d = await api(`/leads/${l.id}`);
    return pitchNoteDialog(d.lead, () => renderLead(l.id));
  }
  if (act === 'repitch' && l.pitch_json && !confirm('Re-run web research, pitch and design? With AI on this costs a few cents and takes 1-3 minutes.')) return;
  if (act === 'reply') {
    const d = modal('Simulate a client reply', `<p class="small muted">Works exactly like a real inbound WhatsApp/email webhook. Replies are classified: STOP: do-not-contact, "not interested": closed, positive: booking link sent.</p>
      <label>Channel<select id="rCh"><option>whatsapp</option><option>email</option></select></label><br>
      <label>Message<textarea id="rText">Yes, interested. What would it cost?</textarea></label>
      <div class="row small" style="margin-top:8px">${['Yes, interested. What would it cost?', 'Can we do a call tomorrow?', 'Not interested, thanks', 'STOP'].map((t) => `<button class="btn sm ghost" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>`,
    '<button class="btn primary" id="rSend">Receive reply</button>');
    $$('[data-t]', d).forEach((b) => (b.onclick = () => ($('#rText').value = b.dataset.t)));
    $('#rSend').onclick = (e) => busy(e.target, async () => { await go({ channel: $('#rCh').value, text: $('#rText').value }); d.close(); });
    return;
  }
  if (act === 'book') {
    const days = await api('/slots');
    const d = modal('Book a meeting', days.map((day) => `<h3>${esc(day.label)}</h3><div class="row">${day.slots.map((s) => `<button class="btn sm" data-slot="${s.iso}">${esc(s.label.split(', ').pop())}</button>`).join('')}</div>`).join(''));
    $$('[data-slot]', d).forEach((b) => (b.onclick = () => busy(b, async () => { await go({ start_at: b.dataset.slot }); d.close(); })));
    return;
  }
  if (act === 'note' || act === 'task') {
    const d = modal(act === 'note' ? 'Add note' : 'Add task', act === 'note' ? '<textarea id="nBody"></textarea>' : '<label>Task<input id="tTitle"></label><br><label>Due<input id="tDue" type="datetime-local"></label>',
      '<button class="btn primary" id="nSave">Save</button>');
    $('#nSave').onclick = (e) => busy(e.target, async () => {
      await go(act === 'note' ? { body: $('#nBody').value } : { title: $('#tTitle').value, due_at: $('#tDue').value ? new Date($('#tDue').value).toISOString() : null });
      d.close();
    });
    return;
  }
  if (act === 'disqualify') {
    const reason = prompt('Reason for marking as lost?', 'Budget mismatch');
    if (reason === null) return;
    return busy(btn, () => go({ reason }));
  }
  return busy(btn, () => go());
}

// ------------------------------------------------------------- approvals
async function renderApprovals() {
  const rows = await api('/leads?stage=brochure_ready&sort=score');
  if (!rows.length) { view.innerHTML = '<div class="card empty">Nothing to approve. Interested leads appear here once the pitch maker has researched them and built their pitch, homepage design and brochure.</div>'; return; }
  let idx = Math.min(Number(sessionStorage.getItem('apprIdx') || 0), rows.length - 1);
  let apprTab = 'pitch';
  const show = () => {
    const l = rows[idx];
    sessionStorage.setItem('apprIdx', idx);
    view.innerHTML = `<div class="toolbar"><b>${idx + 1} / ${rows.length}</b><button class="btn sm" id="prev" aria-label="Previous" ${idx === 0 ? 'disabled' : ''}><span class="mi">chevron_left</span></button><button class="btn sm" id="next" aria-label="Next" ${idx === rows.length - 1 ? 'disabled' : ''}><span class="mi">chevron_right</span></button>
      <span><a href="#/lead/${l.id}"><b>${esc(l.company)}</b></a> · ${esc(l.contact_name || '')} · score <span class="score ${scoreCls(l.score)}">${l.score}</span> · will go via ${l.wa_opt_in && l.phone ? 'WhatsApp' : l.email_opt_in && l.email ? 'email' : '<span class="bad">no permitted channel</span>'}</span>
      <span class="spacer"></span><button class="btn sm danger" data-a="disqualify">Disqualify</button><button class="btn sm" data-a="edit">Edit personal note</button><button class="btn sm" data-a="regenerate">Rebuild brochure</button><button class="btn sm" data-a="redesign"><span class="mi">auto_awesome</span>New design</button><button class="btn primary sm" data-a="approve"><span class="mi">check</span>Approve &amp; send</button></div>
      <div class="subtabs">${[['pitch', 'Pitch & research'], ['design', 'Homepage design'], ['brochure', 'Brochure PDF (what the client gets)']].map(([k, t]) => `<button class="btn sm ${apprTab === k ? 'primary' : ''}" data-sub="${k}">${t}</button>`).join('')}</div>
      <div id="apprBody"></div>`;
    api(`/leads/${l.id}`).then((d) => {
      const full = d.lead;
      $('#apprBody').innerHTML = apprTab === 'pitch' ? pitchView(full)
        : apprTab === 'design' ? (full.design_version ? `<iframe class="preview" sandbox src="/d/${l.token}"></iframe>` : '<div class="card empty">No design</div>')
        : `${(d.tool_docs || []).some((x) => x.kind === 'brochure' && x.status === 'ready') ? `<div class="row" style="margin-bottom:10px"><span class="small muted grow">This is the designed brochure from your default template. Change anything in the editor; the intro sends the latest version.</span><a class="btn sm" href="#/brochure/${d.tool_docs.find((x) => x.kind === 'brochure' && x.status === 'ready').id}"><span class="mi">edit</span>Edit brochure</a></div>` : ''}<iframe class="preview" src="/pdf/brochure/${l.token}.pdf?v=${Date.now()}"></iframe>`;
    });
    $$('[data-sub]').forEach((b) => (b.onclick = () => { apprTab = b.dataset.sub; show(); }));
    $('#prev').onclick = () => { idx--; show(); };
    $('#next').onclick = () => { idx++; show(); };
    $$('[data-a]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.a === 'edit') { const d = await api(`/leads/${l.id}`); return pitchNoteDialog(d.lead, show); }
      if (b.dataset.a === 'disqualify' && !confirm(`Disqualify ${l.company}?`)) return;
      busy(b, async () => {
        await api(`/leads/${l.id}/actions/${b.dataset.a}`, { body: {} });
        toast(['regenerate', 'redesign'].includes(b.dataset.a) ? 'Regenerated' : 'Done');
        if (['regenerate', 'redesign'].includes(b.dataset.a)) return show();
        route();
      });
    }));
  };
  show();
}

// ----------------------------------------------------------------- tasks
async function renderTasks() {
  const all = sessionStorage.getItem('tasksAll') === '1';
  const rows = await api('/tasks' + (all ? '?all=1' : ''));
  view.innerHTML = `<div class="toolbar"><label class="check"><input type="checkbox" id="tAll" ${all ? 'checked' : ''}> Show completed</label><span class="spacer"></span><input id="newTask" placeholder="New task…" style="min-width:260px"><button class="btn sm" id="addTask">Add</button></div>
  ${rows.filter((t) => !t.done && t.kind === 'call').map(callCard).join('')}${rows.filter((t) => !t.done && t.kind === 'reply_draft').map(draftCard).join('')}
  <div class="card">${rows.filter((t) => t.done || !['call', 'reply_draft'].includes(t.kind)).map((t) => `<label class="ms check"><input type="checkbox" data-task="${t.id}" ${t.done ? 'checked' : ''}><span class="${t.done ? 'muted' : ''}">${esc(t.title)}</span>${t.outcome ? ` <span class="pill">${esc(t.outcome)}</span>` : ''}
    ${t.lead_id ? `<a class="small" href="#/lead/${t.lead_id}">${esc(t.company)}</a>` : ''}<span class="spacer"></span><span class="small ${t.due_at && new Date(t.due_at) < new Date() && !t.done ? 'bad' : 'muted'}">${t.due_at ? 'due ' + fmtDate(t.due_at) : fmtDay(t.created_at)}</span></label>`).join('') || '<div class="empty">All clear</div>'}</div>`;
  $('#tAll').onchange = (e) => { sessionStorage.setItem('tasksAll', e.target.checked ? '1' : '0'); renderTasks(); };
  $('#addTask').onclick = async () => { if (!$('#newTask').value.trim()) return; await api('/tasks', { body: { title: $('#newTask').value } }); renderTasks(); };
  $$('[data-task]').forEach((c) => (c.onchange = async () => { await api(`/tasks/${c.dataset.task}`, { method: 'PATCH', body: { done: c.checked } }); renderTasks(); refreshBadges(); }));
  bindWorkItems(view, () => { renderTasks(); refreshBadges(); });
}

// ----------------------------------------------------------------- inbox
async function renderInbox() {
  const dir = sessionStorage.getItem('mDir') || '';
  const ch = sessionStorage.getItem('mCh') || '';
  const rows = await api(`/messages?direction=${dir}&channel=${ch}`);
  view.innerHTML = `<div class="toolbar"><select id="mDir"><option value="">All directions</option><option value="in" ${dir === 'in' ? 'selected' : ''}>Inbound (replies)</option><option value="out" ${dir === 'out' ? 'selected' : ''}>Outbound</option></select>
    <select id="mCh"><option value="">All channels</option><option ${ch === 'whatsapp' ? 'selected' : ''}>whatsapp</option><option ${ch === 'email' ? 'selected' : ''}>email</option></select>
    <span class="small muted">Status "mock" = channel not configured (or dry-run on); the message was rendered and logged but not delivered.</span></div>
  ${rows.map((m) => `<div class="msg ${m.direction}"><div class="row small"><b>${m.lead_id ? `<a href="#/lead/${m.lead_id}">${esc(m.company)}</a>` : 'Agency'}</b><span>${m.direction === 'in' ? '<span class="mi in" title="From client">south_west</span>' : '<span class="mi in" title="To client">north_east</span>'} ${esc(m.to_addr || '')}</span><span class="pill">${esc(m.channel)}</span><span class="muted">${esc(m.template_key || '')}</span>${statusPill(m.status)}<span class="spacer"></span><span class="muted">${fmtDate(m.created_at)}</span></div>
    ${m.subject ? `<b>${esc(m.subject)}</b>` : ''}<details><summary class="small muted">${esc((m.body || '').slice(0, 120))}…</summary><pre>${esc(m.body)}</pre></details>${m.error ? `<div class="bad small">${esc(m.error)}</div>` : ''}</div>`).join('') || '<div class="card empty">No messages</div>'}`;
  $('#mDir').onchange = (e) => { sessionStorage.setItem('mDir', e.target.value); renderInbox(); };
  $('#mCh').onchange = (e) => { sessionStorage.setItem('mCh', e.target.value); renderInbox(); };
}

// ------------------------------------------------------- projects/invoices
async function renderProjects() {
  const rows = await api('/projects');
  view.innerHTML = rows.length ? `<div class="grid g2">${rows.map((p) => {
    const done = p.milestones.filter((m) => m.done).length;
    const pct = p.milestones.length ? Math.round((done / p.milestones.length) * 100) : 0;
    return `<div class="card"><div class="row"><h2 style="margin:0"><a href="#/lead/${p.lead_id}">${esc(p.company)}</a></h2>${statusPill(p.status === 'active' ? 'mock' : 'ok').replace(/>(mock|ok)</, `>${esc(p.status)}<`)}<span class="spacer"></span><a class="small" target="_blank" href="/status/${p.token}">Client portal<span class="mi">open_in_new</span></a></div>
      <div class="bar" style="margin:12px 0"><div style="width:${pct}%;background:var(--ok)"></div></div><div class="small muted">${pct}% · started ${fmtDay(p.created_at)}</div>
      ${p.milestones.map((m) => `<label class="ms check"><input type="checkbox" data-ms="${m.id}" ${m.done ? 'checked' : ''}> ${esc(m.name)}</label>`).join('')}</div>`;
  }).join('')}</div>` : '<div class="card empty">No projects yet. A project is created automatically when a client pays the advance and submits the onboarding brief.</div>';
  $$('[data-ms]').forEach((c) => (c.onchange = () => busy(null, async () => { await api(`/milestones/${c.dataset.ms}`, { method: 'PATCH', body: { done: c.checked } }); toast(c.checked ? 'Client notified' : 'Reopened'); renderProjects(); })));
}

async function renderInvoices() {
  const rows = await api('/invoices');
  view.innerHTML = rows.length ? `<div class="table-wrap"><table><tr><th>Number</th><th>Client</th><th>Type</th><th class="num">Amount</th><th>Status</th><th>Created</th><th>Paid</th><th></th></tr>
  ${rows.map((i) => `<tr><td><a target="_blank" href="/pay/${i.token}">${esc(i.number)}</a></td><td><a href="#/lead/${i.lead_id}">${esc(i.company)}</a></td><td>${esc(i.kind)}</td><td class="num">${money(i.amount)}</td>
    <td>${i.status === 'paid' ? '<span class="pill ok">paid</span>' : '<span class="pill skipped">pending</span>'}</td><td class="small">${fmtDay(i.created_at)}</td><td class="small">${fmtDay(i.paid_at)} ${esc(i.payment_ref || '')}</td>
    <td>${i.status === 'pending' ? `<button class="btn sm" data-paid="${i.id}" data-lead="${i.lead_id}">Mark paid</button>` : ''}</td></tr>`).join('')}</table></div>`
    : '<div class="card empty">No invoices yet. They are created automatically when a proposal is accepted (advance) and when a project is delivered (balance).</div>';
  $$('[data-paid]').forEach((b) => (b.onclick = () => busy(b, async () => { await api(`/leads/${b.dataset.lead}/actions/mark_paid`, { body: { invoice_id: b.dataset.paid } }); toast('Paid; next step triggered'); renderInvoices(); })));
}

// ------------------------------------------------------------ automation
async function renderAutomation() {
  const status = sessionStorage.getItem('evStatus') || '';
  const [runs, events, aiCalls, outbox] = await Promise.all([api('/runs'), api('/events?status=' + status), api('/ai/calls'), api('/crm/outbox')]);
  const flow = ['Lead from CRM / form / API', 'Normalise + dedupe', 'Website audit + score', 'Route by interest', 'Interested: web research', 'Pitch', 'Homepage design', 'Brochure', 'Human approval', 'Intro (WhatsApp, else email)', 'Manager plans call / message', 'Follow-ups', 'Silent, then Nurture pipe', 'Reply, then understood & drafted', 'Booking, then meeting', 'Proposal', 'Advance, then onboarding', 'Milestones', 'Final invoice, then review'];
  const flow2 = ['Undecided: Nurture pipe (5 touches over 5 weeks)', 'Said no, then Re-engage pipe (30 / 90 / 180 days)', 'Positive reply or CRM says interested, then back to Conversion'];
  view.innerHTML = `<div class="card" style="margin-bottom:14px"><h2>Pipeline flow</h2><div class="flow">${flow.map((f) => `<span>${esc(f)}</span>`).join('<span class="mi">arrow_forward</span>')}</div><h3>Marketing pipes</h3><div class="flow">${flow2.map((f) => `<span>${esc(f)}</span>`).join('<i>·</i>')}</div></div>
  <div class="grid g2" style="margin-bottom:14px"><div class="card"><h2>Recent runs</h2>${runs.length ? `<table><tr><th>Trigger</th><th>Started</th><th>Stats</th></tr>${runs.slice(0, 12).map((r) => `<tr><td>${esc(r.trigger)}</td><td class="small">${fmtDate(r.started_at)}</td><td class="small mono">${esc(r.stats_json || 'running…')}</td></tr>`).join('')}</table>` : '<p class="muted">No runs yet</p>'}</div>
  <div class="card"><h2>How runs work</h2><ul class="small">
    <li><b>Event-driven:</b> new leads, approvals, replies, bookings, payments and briefs trigger their next step instantly.</li>
    <li><b>Daily run</b> at ${esc(META.scheduler.daily_time)} ${esc(META.scheduler.timezone)} processes everything that is due.</li>
    <li><b>Sweep</b> every ${META.scheduler.sweep_minutes} min picks up due follow-ups, reminders and post-meeting proposals.</li>
    <li>Cold outreach only goes out inside the send window, within daily caps, and only to leads who gave permission.</li></ul></div></div>
  <div class="toolbar"><select id="evStatus"><option value="">All statuses</option>${['ok', 'skipped', 'error'].map((s) => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select><span class="spacer"></span><a class="btn sm" href="/api/events.csv">Export log CSV</a></div>
  ${eventsTable(events)}
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2><span class="mi">auto_awesome</span>AI calls</h2>${aiCalls.length ? `<div class="table-wrap"><table><tr><th>Time</th><th>Lead</th><th>Purpose</th><th>Status</th><th class="num">Cost</th></tr>${aiCalls.slice(0, 60).map((c) => `<tr><td class="small">${fmtDate(c.created_at)}</td><td>${c.lead_id ? `<a href="#/lead/${c.lead_id}">${esc(c.company || '#' + c.lead_id)}</a>` : '–'}</td><td>${esc(c.purpose)}${c.web_searches ? ` <span class="small muted">${c.web_searches} searches</span>` : ''}</td><td>${statusPill(c.status)}${c.error ? `<div class="small bad">${esc(c.error)}</div>` : ''}</td><td class="num small">$${(c.cost_usd || 0).toFixed(3)}</td></tr>`).join('')}</table></div>` : '<p class="muted">No AI calls yet</p>'}</div>
    <div class="card"><div class="row"><h2 style="margin:0"><span class="mi">sync</span>CRM sync outbox</h2><span class="spacer"></span><button class="btn sm" id="flushCrm">Retry now</button></div>
      <p class="small muted">${META.crm_sync ? 'Pushing every change to CRM_WEBHOOK_URL (signed, retried).' : 'CRM_WEBHOOK_URL not set: events are recorded as "skipped".'}</p>
      ${outbox.length ? `<div class="table-wrap"><table><tr><th>Time</th><th>Lead</th><th>Event</th><th>Status</th></tr>${outbox.slice(0, 60).map((o) => `<tr><td class="small">${fmtDate(o.created_at)}</td><td>${o.lead_id ? `<a href="#/lead/${o.lead_id}">#${o.lead_id}</a>` : ''}</td><td class="mono">${esc(o.event)}</td><td><span class="pill ${o.status === 'sent' ? 'ok' : o.status === 'failed' ? 'error' : 'skipped'}">${esc(o.status)}</span>${o.last_error ? `<div class="small bad">${esc(o.last_error)} (${o.attempts}×)</div>` : ''}</td></tr>`).join('')}</table></div>` : '<p class="muted">No events yet</p>'}</div>
  </div>`;
  $('#flushCrm').onclick = (e) => busy(e.target, async () => { await api('/crm/flush', { body: {} }); renderAutomation(); });
  $('#evStatus').onchange = (e) => { sessionStorage.setItem('evStatus', e.target.value); renderAutomation(); };
}

// ------------------------------------------------------------- templates
async function renderTemplates() {
  const rows = await api('/templates');
  const vars = ['first_name', 'contact_name', 'company', 'agency_name', 'sender_name', 'agency_phone', 'brochure_link', 'booking_link', 'proposal_link', 'payment_link', 'onboarding_link', 'status_link', 'review_link', 'meeting_time', 'meeting_link', 'top_issue', 'package_name', 'package_price', 'amount', 'invoice_number', 'milestone', 'progress'];
  view.innerHTML = `<p class="small muted">Variables: ${vars.map((v) => `<code>{{${v}}}</code>`).join(' ')}. WhatsApp outside the 24h window uses the Meta-approved template name with body params {{1}} first name, {{2}} company, {{3}} link.</p>
  <div class="grid">${rows.map((t) => `<form class="card" data-key="${esc(t.key)}"><div class="row"><h2 style="margin:0">${esc(t.label)}</h2><span class="muted mono">${esc(t.key)}</span><span class="spacer"></span><button class="btn sm primary">Save</button></div>
    <div class="form-grid" style="margin-top:10px"><label class="full">Email subject<input name="subject" value="${esc(t.subject)}"></label>
    <label>Email body<textarea name="email_body" class="code">${esc(t.email_body)}</textarea></label>
    <div><label>WhatsApp text (inside 24h window / mock)<textarea name="wa_body" class="code" style="min-height:140px">${esc(t.wa_body)}</textarea></label><br>
    <label>Meta template name<input name="wa_template_name" value="${esc(t.wa_template_name)}"></label></div></div></form>`).join('')}</div>`;
  $$('form[data-key]').forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); busy(null, async () => { await api(`/templates/${f.dataset.key}`, { method: 'PUT', body: formData(f) }); toast('Template saved'); }); }));
}

// -------------------------------------------------------------- settings
async function renderSettings() {
  const { settings: s, env } = await api('/settings');
  const inp = (path, label, type = 'text') => {
    const v = path.split('.').reduce((o, k) => o?.[k], s);
    if (type === 'bool') return `<label class="check"><input type="checkbox" data-path="${path}" data-type="bool" ${v ? 'checked' : ''}> ${label}</label>`;
    return `<label>${label}<input data-path="${path}" data-type="${type}" type="${type === 'number' ? 'number' : 'text'}" value="${esc(Array.isArray(v) ? v.join(',') : v)}"></label>`;
  };
  view.innerHTML = `<div class="card more-tools"><h2>More tools</h2><div class="row wrap">
    ${[['#/approvals', 'Pitch approvals'], ['#/tasks', 'All tasks'], ['#/board', 'Pipeline board'], ['#/dashboard', 'Reports'], ['#/automation', 'Automation log'], ['#/templates', 'Message templates']].map(([h, n]) => `<a class="btn sm" href="${h}">${n}</a>`).join('')}
    <span class="spacer"></span><button class="btn sm primary" id="runBtn" title="Run every automatic step now">Run automation now</button></div></div>
  <div class="grid g2">
  <div class="card"><h2>Your business</h2><div class="form-grid">${inp('agency.name', 'Agency name')}${inp('agency.sender_name', 'Sender name')}${inp('agency.email', 'Email (digest goes here)')}${inp('agency.phone', 'Phone')}${inp('agency.website', 'Website')}${inp('agency.address', 'Address')}${inp('agency.review_link', 'Google review link')}</div></div>
  <div class="card"><h2>Connections</h2><div class="conn">
    ${[['Email', env.channels.email === 'live', 'Add SMTP details in .env'], ['WhatsApp', env.channels.whatsapp === 'live', 'Add WA_TOKEN + WA_PHONE_NUMBER_ID in .env'],
      ['AI (' + (env.ai.provider === 'openrouter' ? 'OpenRouter' : 'Claude API') + ')', env.ai.enabled, env.ai.key_set ? 'Turn on below' : 'Add OPENROUTER_API_KEY or ANTHROPIC_API_KEY'], ['Team CRM', env.crm_webhook, 'Add CRM_WEBHOOK_URL in .env']]
      .map(([n, on, how]) => `<div class="row"><i class="dot-s ${on ? 'on' : ''}"></i><b>${n}</b><span class="spacer"></span><span class="small ${on ? 'ok' : 'muted'}">${on ? 'Connected' : how}</span></div>`).join('')}
    <p class="small muted">Not connected = messages are only saved here (safe test mode), not delivered.</p>
    <div class="form-grid">${inp('ai.enabled', 'Use AI', 'bool')}${inp('ai.daily_budget_usd', 'AI daily budget (USD)', 'number')}${inp('automation.auto_approve_brochure', 'Send pitches without my approval', 'bool')}</div></div></div>
  </div>
  <details class="block advanced"><summary><b>Advanced settings</b> <span class="small muted">schedule, limits, prices, AI tuning, marketing, integrations</span></summary>
  <div class="grid g2">
  <div class="card"><h2>Schedule &amp; sending</h2><div class="form-grid">${inp('schedule.enabled', 'Scheduler enabled', 'bool')}${inp('schedule.daily_time', 'Daily run time (HH:MM)')}${inp('schedule.timezone', 'Timezone')}${inp('schedule.sweep_minutes', 'Sweep every N minutes (0 = off)', 'number')}
    ${inp('sending.window_start', 'Send window start')}${inp('sending.window_end', 'Send window end')}${inp('sending.send_days', 'Send days (0=Sun … 6=Sat)', 'numlist')}${inp('sending.channel_priority', 'Channel priority', 'list')}
    ${inp('sending.daily_cap_whatsapp', 'Daily cap: WhatsApp', 'number')}${inp('sending.daily_cap_email', 'Daily cap: email', 'number')}${inp('sending.throttle_ms', 'Delay between live sends (ms)', 'number')}${inp('sending.default_country_code', 'Default country code')}</div></div>
  <div class="card"><h2>Automation</h2><div class="form-grid">${inp('automation.dry_run', 'Dry run (never send for real)', 'bool')}
    ${inp('automation.auto_send_booking_link', 'Auto-send booking link on positive reply', 'bool')}${inp('automation.auto_proposal_after_meeting', 'Make the proposal after the meeting', 'bool')}
    ${inp('automation.auto_tools.script', 'Pitch script for every interested lead (sent to the CRM)', 'bool')}${inp('automation.auto_tools.brochure', 'Designed brochure for every interested lead', 'bool')}${inp('automation.auto_tools.proposal', 'Designed proposal (Proposal tool)', 'bool')}${inp('automation.proposal_needs_ok', 'Proposals wait for my OK before sending', 'bool')}${inp('automation.daily_digest', 'Daily digest email', 'bool')}
    ${inp('sequence.follow_up_1_days', 'Days until follow-up 1', 'number')}${inp('sequence.follow_up_2_days', 'Days until follow-up 2', 'number')}${inp('sequence.close_after_days', 'Days until closing (no reply)', 'number')}${inp('sequence.proposal_reminder_days', 'Days until proposal reminder', 'number')}${inp('sequence.invoice_reminder_days', 'Days between invoice reminders', 'number')}</div></div>
  <div class="card"><h2>Billing &amp; meetings</h2><div class="form-grid">${inp('billing.currency', 'Currency')}${inp('billing.tax_label', 'Tax label')}${inp('billing.tax_pct', 'Tax %', 'number')}${inp('billing.advance_pct', 'Advance %', 'number')}${inp('billing.invoice_prefix', 'Invoice prefix')}
    ${inp('meeting.slots', 'Meeting slots (HH:MM list)', 'list')}${inp('meeting.days_ahead', 'Days bookable ahead', 'number')}${inp('meeting.duration_min', 'Meeting minutes', 'number')}${inp('meeting.meet_link', 'Meeting link')}${inp('milestones', 'Project milestones', 'list')}</div></div>
  <div class="card"><h2><span class="mi">auto_awesome</span>AI manager</h2>
    <p class="small muted">Status: ${env.ai.enabled ? '<b class="ok">on</b>' : env.ai.key_set ? '<b>disabled</b>' : '<b class="bad">no API key</b>: add OPENROUTER_API_KEY or ANTHROPIC_API_KEY (.env locally, Vercel environment variables live), then restart / redeploy'} · provider <b>${env.ai.provider === 'openrouter' ? 'OpenRouter' : 'Claude API'}</b>, model ${esc(env.ai.model)} · spent today $${env.ai.spent_today_usd}<br>Keys found: OpenRouter ${env.ai.keys?.openrouter ? 'yes' : 'no'}, Anthropic ${env.ai.keys?.anthropic ? 'yes' : 'no'}</p>
    <div class="form-grid">${inp('ai.design_enabled', 'AI homepage designs', 'bool')}${inp('ai.auto_send_ai_replies', 'Auto-send AI replies (skip approval)', 'bool')}
    <label>AI provider<select data-path="ai.provider">${[['auto', 'Automatic (whichever key is set)'], ['openrouter', 'OpenRouter'], ['anthropic', 'Claude API (Anthropic)']].map(([v, l]) => `<option value="${v}" ${(s.ai.provider || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${inp('ai.openrouter_model', 'OpenRouter model (empty = Claude model on OpenRouter)')}
    ${inp('ai.model', 'Claude model')}${inp('ai.effort_research', 'Effort: research (low…max)')}${inp('ai.effort_writing', 'Effort: pitch, design, messages')}${inp('ai.effort_light', 'Effort: replies, planning')}
    ${inp('ai.web_search_max_uses', 'Max web searches per lead', 'number')}${inp('ai.max_concurrent', 'Parallel AI jobs', 'number')}</div>
    <p class="small muted">Without a key (or when the budget is reached) every AI step falls back to rules and templates, so the pipeline never stops.</p></div>
  <div class="card"><h2>Marketing pipes (JSON)</h2>
    <p class="small muted">Each touch: <code>after_days</code> since entering the pipe, <code>theme</code> (the AI writes the message from it), <code>fallback</code> (text used without AI).</p>
    <label>Nurture: undecided leads<textarea id="nurtureJson" class="code">${esc(JSON.stringify(s.marketing.nurture, null, 2))}</textarea></label><br>
    <label>Re-engage: leads who said no<textarea id="reengageJson" class="code">${esc(JSON.stringify(s.marketing.reengage, null, 2))}</textarea></label></div>
  <div class="card"><h2>Packages &amp; portfolio (JSON)</h2><label>Packages<textarea id="pkgJson" class="code">${esc(JSON.stringify(s.packages, null, 2))}</textarea></label><br>
    <label>Care plan<textarea id="careJson" class="code" style="min-height:80px">${esc(JSON.stringify(s.care_plan, null, 2))}</textarea></label><br>
    <label>Portfolio (shown in brochures)<textarea id="portJson" class="code" style="min-height:120px">${esc(JSON.stringify(s.agency.portfolio, null, 2))}</textarea></label></div>
  <div class="card"><h2>Integrations</h2><table class="small">
    <tr><td>Email</td><td><b>${env.channels.email}</b> <span class="muted">(set SMTP_* in .env)</span></td></tr>
    <tr><td>WhatsApp</td><td><b>${env.channels.whatsapp}</b> <span class="muted">(set WA_TOKEN, WA_PHONE_NUMBER_ID)</span></td></tr>
    <tr><td>Public lead form</td><td><a href="${esc(env.webhooks.public_form)}" target="_blank">${esc(env.webhooks.public_form)}</a></td></tr>
    <tr><td>Intake API</td><td class="mono">POST ${esc(env.webhooks.intake)}<br>header X-API-Key ${env.intake_key_set ? '<span class="ok">set</span>' : '<span class="bad">INTAKE_API_KEY not set: intake API disabled</span>'}</td></tr>
    <tr><td>WhatsApp webhook</td><td class="mono">${esc(env.webhooks.whatsapp)}</td></tr>
    <tr><td>Inbound email webhook</td><td class="mono">POST ${esc(env.webhooks.email)}<br>header X-Webhook-Secret ${env.webhook_secret_set ? '<span class="ok">set</span>' : '<span class="bad">not set</span>'}</td></tr>
    <tr><td>Payment webhook</td><td class="mono">POST ${esc(env.webhooks.payment)}</td></tr>
    <tr><td>From the CRM to us (update)</td><td class="mono">PATCH ${esc(env.webhooks.crm_update)}<br>header X-API-Key</td></tr>
    <tr><td>From us to the CRM (sync)</td><td>${env.crm_webhook ? '<span class="ok">CRM_WEBHOOK_URL set</span>' : '<span class="bad">CRM_WEBHOOK_URL not set</span>'}</td></tr>
    <tr><td>AI</td><td>OpenRouter: ${env.ai.keys?.openrouter ? '<span class="ok">OPENROUTER_API_KEY set</span>' : '<span class="muted">not set</span>'} · Claude API: ${env.ai.keys?.anthropic ? '<span class="ok">ANTHROPIC_API_KEY set</span>' : '<span class="muted">not set</span>'}</td></tr></table>
    <h3>Demo</h3><button class="btn sm" id="seedBtn">Load 8 demo leads</button></div>
  </div>
  </details>
  <div class="row save-bar"><span class="spacer"></span><button class="btn primary" id="saveSettings">Save settings</button></div>`;

  $('#seedBtn').onclick = (e) => busy(e.target, async () => { const r = await api('/demo/seed', { body: {} }); toast(`Created ${r.created} demo leads`); });
  $('#saveSettings').onclick = (e) => busy(e.target, async () => {
    const patch = {};
    for (const el of $$('[data-path]')) {
      const keys = el.dataset.path.split('.');
      let v;
      switch (el.dataset.type) {
        case 'bool': v = el.checked; break;
        case 'number': v = Number(el.value); break;
        case 'list': v = el.value.split(',').map((x) => x.trim()).filter(Boolean); break;
        case 'numlist': v = el.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)); break;
        default: v = el.value;
      }
      let o = patch;
      keys.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
      o[keys.at(-1)] = v;
    }
    try {
      patch.packages = JSON.parse($('#pkgJson').value);
      patch.care_plan = JSON.parse($('#careJson').value);
      patch.agency.portfolio = JSON.parse($('#portJson').value);
      patch.marketing = { nurture: JSON.parse($('#nurtureJson').value), reengage: JSON.parse($('#reengageJson').value) };
    } catch (err) { throw new Error('Invalid JSON: ' + err.message); }
    await api('/settings', { method: 'PUT', body: patch });
    META = await api('/meta');
    toast('Settings saved');
  });
}



// ------------------------------------------- AI Brochure / Proposal tools
const TOOL = {
  brochure: { title: 'Brochure Generator', noun: 'brochure', hint: 'A brochure written for one client, in your template’s design.' },
  proposal: { title: 'Proposal Generator', noun: 'proposal', hint: 'A proposal with scope, features, pricing and terms, in your template’s design.' },
};
let toolTimer = null;
let activeEditor = null;

async function renderTool(kind, id) {
  clearTimeout(toolTimer);
  if (activeEditor) { await activeEditor.flush?.(); activeEditor = null; }
  $('#pageTitle').textContent = id ? TOOL[kind].title : '';
  $('.main').classList.add('notitle'); // the form has its own heading; the editor has its own header bar
  if (id) return renderToolDoc(kind, Number(id));
  const [opts, docs] = await Promise.all([api(`/tools/options?kind=${kind}`), api(`/tools/docs?kind=${kind}`)]);
  const pre = sessionStorage.getItem(`tpl-${kind}`);
  sessionStorage.removeItem(`tpl-${kind}`);
  const chosen = opts.templates.find((t) => String(t.id) === pre) || opts.templates.find((t) => t.is_default) || opts.templates[0];
  view.innerHTML = `
  <div class="hello" style="padding-top:4px"><h2>${TOOL[kind].title}</h2><p>${TOOL[kind].hint} ${opts.ai.enabled ? 'AI writes it in about a minute; then edit anything on the page, like in Canva, or ask the AI assistant.' : 'AI is off (no API key), so it is filled from your standard copy. You can edit everything on the page.'}</p></div>
  <div class="grid g2">
    <form class="card" id="toolForm">
      <h2>New ${TOOL[kind].noun}</h2>
      <label>Template<div class="row" style="margin-top:5px"><select name="template_id" class="grow">${opts.templates.map((t) => `<option value="${t.id}" data-mode="${t.mode}" ${t.id === chosen?.id ? 'selected' : ''}>${esc(t.name)}${t.is_default ? ' (default)' : ''}</option>`).join('')}</select><a class="btn sm" href="#/designs/${kind}">Templates</a></div></label>
      <label style="margin-top:14px">Start from a lead (optional)<select id="fromLead"><option value="">Type the details below</option>${opts.leads.map((l) => `<option value="${l.id}">${esc(l.company)}${l.city ? ` · ${esc(l.city)}` : ''}</option>`).join('')}</select></label>
      <div class="form-grid" style="margin-top:14px">
        <label class="full">Business name *<input name="company" required maxlength="120"></label>
        <label>Contact person<input name="contact_name" maxlength="120"></label>
        <label>Industry<input name="industry" maxlength="80" placeholder="Salon, clinic, retail…"></label>
        <label>City<input name="city" maxlength="80"></label>
        <label>Current website<input name="website" maxlength="200"></label>
        ${kind === 'proposal'
          ? `<label class="full">Package<select name="package">${opts.packages.map((p) => `<option value="${p.id}">${esc(p.name)} · ${money(p.price)}</option>`).join('')}</select></label>`
          : `<div class="full" id="svcBox"><label>Services to include</label><div class="row" style="margin-top:6px">${opts.services.map((sv) => `<label class="check"><input type="checkbox" name="svc" value="${sv.id}" checked> ${esc(sv.name)}</label>`).join('')}</div></div>`}
        <label class="full">${kind === 'proposal' ? 'Requirements and meeting notes' : 'What they need / anything to mention'}<textarea name="notes" maxlength="6000" placeholder="${kind === 'proposal' ? 'e.g. Shopify store, 40 products, COD + UPI, bundles, WhatsApp orders…' : 'e.g. wants online bookings, active on Instagram, competitor has a better site…'}"></textarea></label>
        ${opts.ai.enabled ? '<label class="check full"><input type="checkbox" name="research" checked> Research the business on the web first (better copy, ~1 minute more)</label>' : ''}
      </div>
      <input type="hidden" name="lead_id">
      <div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn primary" id="genBtn">Generate ${TOOL[kind].noun}</button></div>
    </form>
    <div class="card"><h2>Recent ${TOOL[kind].noun}s</h2>
      ${docs.length ? docs.map((d) => `<a class="item row link" href="#/${kind}/${d.id}"><div class="grow"><b>${esc(d.title)}</b><div class="small muted">${fmtDate(d.updated_at)}</div></div>${docTag(d)}</a>`).join('') : '<p class="muted">Nothing yet.</p>'}
    </div>
  </div>`;
  const f = $('#toolForm');
  const syncSvc = () => { const box = $('#svcBox'); if (box) box.classList.toggle('hidden', f.elements.template_id.selectedOptions[0]?.dataset.mode !== 'smart'); };
  f.elements.template_id.onchange = syncSvc;
  syncSvc();
  $('#fromLead').onchange = async (e) => {
    if (!e.target.value) return;
    const p = await api(`/tools/prefill/${e.target.value}`);
    for (const [k, v] of Object.entries(p)) if (f.elements[k] && f.elements[k].type !== 'checkbox' && k !== 'template_id') f.elements[k].value = v ?? '';
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    busy($('#genBtn'), async () => {
      const body = formData(f);
      if (kind === 'brochure') body.services = $$('input[name=svc]:checked', f).map((x) => x.value);
      const r = await api(`/tools/${kind}`, { body });
      location.hash = `#/${kind}/${r.id}`;
    });
  };
}

const docTag = (d) => (d.status === 'ready' ? '<span class="tag green">Ready</span>' : d.status === 'error' ? '<span class="tag red">Failed</span>' : '<span class="tag blue">Writing…</span>');

async function renderToolDoc(kind, id) {
  const d = await api(`/tools/docs/${id}`);
  if (d.status === 'working') {
    view.innerHTML = `<p><a class="back-link" href="#/${kind}"><span class="mi">arrow_back</span>All ${TOOL[kind].noun}s</a></p><div class="card empty"><h2>Writing the ${TOOL[kind].noun} for ${esc(d.title)}…</h2>
      <p class="muted">${d.input.research ? 'Researching the business on the web, then writing every page.' : 'Writing every page.'} This page updates by itself.</p><div class="bar" style="max-width:320px;margin:16px auto 0"><div class="indet"></div></div></div>`;
    toolTimer = setTimeout(() => { if (location.hash === `#/${kind}/${id}`) renderToolDoc(kind, id); }, 2500);
    return;
  }
  if (d.status === 'error' || !d.design) {
    view.innerHTML = `<p><a class="back-link" href="#/${kind}"><span class="mi">arrow_back</span>All ${TOOL[kind].noun}s</a></p><div class="card"><h2 class="bad">Could not create it</h2><p class="muted">${esc(d.error || 'No design')}</p><button class="btn primary" id="retry">Try again</button></div>`;
    $('#retry').onclick = (e) => busy(e.target, async () => { await api(`/tools/docs/${id}/regenerate`, { body: {} }); renderToolDoc(kind, id); });
    return;
  }
  $('#pageTitle').textContent = '';
  view.innerHTML = `
  <div class="ed-head">
    <a class="btn ghost sm icon-only" href="#/${kind}" aria-label="Back to all ${TOOL[kind].noun}s" title="Back"><span class="mi">arrow_back</span></a>
    <input class="ed-title" value="${esc(d.title)}" maxlength="120" title="Document name">
    ${d.source === 'ai' ? '<span class="ai-badge">Written by AI</span>' : `<span class="small muted">${esc(d.source || '')}</span>`}
    <span class="small muted">${esc(d.template?.name || '')}</span>
    <span class="spacer"></span>
    <a class="btn primary sm" id="dlBtn" href="/api/tools/docs/${id}/pdf?download=1">Download PDF</a>
    <button class="btn sm" id="copyLink">Copy share link</button>
    <details class="dd"><summary class="btn sm">More<span class="mi">expand_more</span></summary><div>
      <a href="/api/tools/docs/${id}/pdf" target="_blank">Open PDF preview<span class="mi">open_in_new</span></a>
      <button id="saveTpl">Save as template</button>
      <button id="regenBtn">Write it again from the template</button>
      <button class="danger" id="delBtn">Delete</button></div></details>
  </div>
  <div id="edRoot"></div>`;
  activeEditor = await openEditor($('#edRoot'), { doc: d, api, toast, busy, modal });
  $('#dlBtn').onclick = async (e) => { e.preventDefault(); await activeEditor.flush?.(); location.href = e.currentTarget.href; };
  $('.ed-title').onchange = (e) => api(`/tools/docs/${id}`, { method: 'PUT', body: { title: e.target.value } }).then(() => toast('Renamed')).catch((err) => toast(err.message, true));
  $('#copyLink').onclick = async () => { await activeEditor.flush?.(); try { await navigator.clipboard.writeText(d.share_url); toast('Share link copied'); } catch { prompt('Copy this link:', d.share_url); } };
  $('#saveTpl').onclick = async () => {
    const name = prompt('Template name', `${d.title} style`);
    if (!name) return;
    await activeEditor.flush?.();
    await api(`/tools/docs/${id}/save-template`, { body: { name } });
    toast('Saved as a template. The client name is replaced with {{company}}');
  };
  $('#regenBtn').onclick = (e) => { if (!confirm('Write it again from the template? All your edits on the pages will be replaced.')) return; busy(e.target, async () => { await api(`/tools/docs/${id}/regenerate`, { body: {} }); activeEditor = null; renderToolDoc(kind, id); }); };
  $('#delBtn').onclick = async () => { if (!confirm(`Delete this ${TOOL[kind].noun}?`)) return; activeEditor = null; await api(`/tools/docs/${id}`, { method: 'DELETE' }); location.hash = `#/${kind}`; };
}

// ---------------------------------------------------------------- templates
async function renderDesigns(arg) {
  if (activeEditor) { await activeEditor.flush?.(); activeEditor = null; }
  const kind = arg === 'proposal' ? 'proposal' : 'brochure';
  $('#pageTitle').textContent = 'Templates';
  const list = await api(`/design/templates?kind=${kind}`);
  await loadMeta(api);
  view.innerHTML = `
  <div class="toolbar"><div class="seg">${['brochure', 'proposal'].map((k) => `<button class="${k === kind ? 'on' : ''}" data-k="${k}">${k === 'brochure' ? 'Brochures' : 'Proposals'}</button>`).join('')}</div>
    <span class="spacer"></span><button class="btn primary sm" id="importBtn">Import from PDF</button></div>
  <p class="hint">The <b>default</b> template is used for new ${kind}s. Import a PDF made in Canva (or anywhere) and it becomes an editable template; the AI rewrites its text for each client. You can also save any finished ${kind} as a template.</p>
  <div class="tpl-grid">${list.map((t) => `<div class="card tpl-card" data-id="${t.id}">
    <div class="tpl-thumb"><div class="muted small">Loading preview…</div></div>
    <div class="tpl-body"><div class="row"><b class="grow">${esc(t.name)}</b>${t.is_default ? '<span class="tag green">Default</span>' : ''}</div>
    <div class="small muted">${t.mode === 'smart' ? 'Built-in · layout adapts to the content' : t.source === 'pdf' ? 'Imported from PDF' : 'Saved from a document'}</div>
    <div class="row" style="margin-top:10px;gap:6px">
      <button class="btn sm primary" data-a="use">Use</button>
      ${t.is_default ? '' : '<button class="btn sm" data-a="default">Make default</button>'}
      <button class="btn sm ghost" data-a="rename">Rename</button>
      ${t.mode === 'smart' ? '' : '<button class="btn sm ghost danger" data-a="delete">Delete</button>'}
    </div></div></div>`).join('')}</div>`;
  $$('[data-k]', view).forEach((b) => (b.onclick = () => (location.hash = `#/designs/${b.dataset.k}`)));
  $('#importBtn').onclick = () => importDialog(kind);
  for (const card of $$('.tpl-card', view)) {
    api(`/design/templates/${card.dataset.id}/preview`).then((d) => {
      const box = $('.tpl-thumb', card);
      box.innerHTML = '';
      const pg = d.pages?.[0];
      // full card width, but never taller than 360px (portrait A4 proposals are shown centred)
      if (pg) box.append(thumb(pg, Math.min(box.clientWidth || 300, 360 * pg.w / pg.h), [{ name: 'Design', price: 30000 }, { name: 'Development', price: 60000 }]));
    }).catch(() => { $('.tpl-thumb', card).innerHTML = '<div class="muted small">No preview</div>'; });
    card.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      const id = card.dataset.id;
      if (a === 'use') { sessionStorage.setItem(`tpl-${kind}`, id); location.hash = `#/${kind}`; }
      if (a === 'default') { await api(`/design/templates/${id}/default`, { body: {} }); toast('Default template changed'); renderDesigns(kind); }
      if (a === 'rename') { const n = prompt('Template name', $('b', card).textContent); if (n) { await api(`/design/templates/${id}`, { method: 'PUT', body: { name: n } }); renderDesigns(kind); } }
      if (a === 'delete') { if (!confirm('Delete this template? Documents already made with it are kept.')) return; await api(`/design/templates/${id}`, { method: 'DELETE' }); renderDesigns(kind); }
    };
  }
}

function importDialog(kind) {
  const d = modal('Import a template from PDF', `
    <p class="small muted">Works best with PDFs exported from Canva, Figma, PowerPoint or Word. Each page's artwork becomes the background and every piece of text becomes an editable text box. Fonts are swapped for Poppins, so check the spacing after importing.</p>
    <div class="form-grid">
      <label>Type<select id="impKind"><option value="brochure" ${kind === 'brochure' ? 'selected' : ''}>Brochure</option><option value="proposal" ${kind === 'proposal' ? 'selected' : ''}>Proposal</option></select></label>
      <label>Template name<input id="impName" placeholder="e.g. Blue salon brochure"></label>
      <label class="full">Client name used in this PDF (optional)<input id="impClient" placeholder="e.g. Bodhis LUXE: replaced with each new client's name"></label>
      <label class="full">PDF file<input type="file" id="impFile" accept="application/pdf"></label>
    </div><p class="small muted" id="impStatus"></p>`, '<button class="btn primary" id="impGo">Import</button>');
  $('#impFile').onchange = () => { const f = $('#impFile').files[0]; if (f && !$('#impName').value) $('#impName').value = f.name.replace(/\.pdf$/i, ''); };
  $('#impGo').onclick = (e) => busy(e.target, async () => {
    const f = $('#impFile').files[0];
    if (!f) throw new Error('Choose a PDF file');
    if (f.size > 60e6) throw new Error('PDF is too large (max 60 MB)');
    const pages = await pdfToTemplate(f, (n, total) => { $('#impStatus').textContent = `Reading page ${n} of ${total}…`; });
    for (const [i, p] of pages.entries()) { // one request per page image (hosting caps request size)
      $('#impStatus').textContent = `Uploading page ${i + 1} of ${pages.length}…`;
      if (p.bg) p.bg = (await api('/design/images', { body: { image: p.bg } })).src;
    }
    $('#impStatus').textContent = 'Saving template…';
    const k = $('#impKind').value;
    await api('/design/templates/import', { body: { kind: k, name: $('#impName').value || f.name, sample_company: $('#impClient').value, pages } });
    d.close();
    toast(`Imported ${pages.length} page${pages.length === 1 ? '' : 's'}`);
    renderDesigns(k);
  });
}

boot();

// Our own dropdowns everywhere (public/select.js).
autoEnhanceSelects();
