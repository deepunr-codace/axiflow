/*
 * The AI page (#/ai; owner, 2026-11-12: "make the AI integration properly… one AI integration page: enable / disable,
 * key adding options, fallback options… user friendly"). Everything about AI in one place, in plain words:
 *   1. one switch: AI writes your documents (on/off), with a sentence saying who writes what;
 *   2. who writes what: main AI + backup for SWOTs, brochures, proposals and the editor assistant;
 *   3. your AI accounts: Claude subscription (through GitHub), Anthropic API key, OpenRouter key: status, key, test,
 *      what each is used for; the subscription's setup as a 3-step checklist that folds away once it works;
 *   4. paid AI spending (today / this month / daily limit); 5. recent AI work; 6. advanced (models, retries), folded.
 * Server: src/ai-setup.js (GET/PUT /api/ai-setup, check-github, return-key); keys: the existing /api/keys routes.
 */
let H = null; // helpers from app.js: $, $$, api, esc, toast, busy, fmtDate, view, onMode
export function setupAi(helpers) { H = helpers; }

const NAME = { github: 'Claude subscription', anthropic: 'Anthropic API', openrouter: 'OpenRouter', none: 'No backup', off: 'Off' };
const ICON = { github: 'workspace_premium', anthropic: 'key', openrouter: 'alt_route' };
const JOB_ICON = { script: 'record_voice_over', brochure: 'menu_book', proposal: 'request_quote', assistant: 'chat' };
const MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 (best writing)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (cheaper)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (cheapest)']];
const usd = (n) => `$${Number(n || 0).toFixed(2)}`;
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : H.fmtDate(iso);
};
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const lc = (label) => (label === 'SWOTs' ? label : label.toLowerCase()); // "SWOTs" stays as it is in a sentence
const OWN = { github: 'your Claude subscription', anthropic: 'your Anthropic API key', openrouter: 'your OpenRouter key' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
let lastCheck = null; // the last "Check" result for the subscription, kept across redraws
const dot = (tone) => `<i class="ai-dot ${tone}"></i>`;
const chip = (tone, text, title = '') => `<span class="ai-chip ${tone}"${title ? ` title="${H.esc(title)}"` : ''}>${dot(tone)}${H.esc(text)}</span>`;

export async function renderAi() {
  draw(await H.api('/ai-setup'));
}

// ---------------------------------------------------------------- reading the state in plain words
function facts(d) {
  const A = d.accounts;
  const spentOut = d.spend.limit >= 0 && d.spend.today >= d.spend.limit;
  const usable = (e) => A[e]?.ready && !(e !== 'github' && spentOut);
  const resting = !!A.github.hold;
  return { A, spentOut, usable, resting };
}

/** One or two sentences: who writes what, and what happens when it fails. */
function summary(d) {
  const { A, resting, spentOut } = facts(d);
  if (!d.mode) return '<b>Off.</b> New documents get your standard text. Turn this on to let AI write them for each lead.';
  const by = (key) => { const m = new Map(); for (const j of d.jobs) { const k = key(j); if (k) m.set(k, [...(m.get(k) || []), j]); } return m; };
  const mains = by((j) => j.main);
  const all = (jobs) => (jobs.length === d.jobs.length ? 'SWOTs, brochures and proposals' : list(jobs.map((j) => lc(j.label))));
  const parts = [...mains].map(([e, jobs]) => `${cap(OWN[e])} writes ${all(jobs)}.`);
  // backups that can really take over (set up); the problems list names the ones that cannot
  const backups = by((j) => (j.backup !== 'none' && A[j.backup].ready ? j.backup : null));
  if (backups.size) {
    const oneMain = mains.size === 1 ? [...mains.keys()][0] : null;
    const when = oneMain === 'github' ? 'fails or reaches its limit' : 'fails';
    const b = [...backups].map(([e, jobs]) => `${OWN[e]}${backups.size === 1 && jobs.length === d.jobs.length ? '' : ` for ${list(jobs.map((j) => lc(j.label)))}`}`);
    parts.push(`If ${oneMain ? 'it' : 'one'} ${when}, ${list(b)} takes over.`);
  }
  const notes = [];
  if (resting) notes.push(`Your Claude subscription is resting until ${time(A.github.hold.until)} (its 5-hour limit). Jobs with a backup go to the backup; the others wait.`);
  if (spentOut) notes.push(`Today's spending limit of ${usd(d.spend.limit)} is reached, so paid AI pauses until midnight.`);
  return `<b>${d.on ? 'On.' : 'On, but not working:'}</b> ${parts.join(' ')}${notes.length ? `<br><span class="ai-note">${notes.join(' ')}</span>` : ''}`;
}

/** Things to fix, most important first. Each says what is wrong and what to do. */
function problems(d) {
  const { A, spentOut } = facts(d);
  const out = [];
  const group = (pick) => { const m = new Map(); for (const j of d.jobs) { const e = pick(j); if (e) m.set(e, [...(m.get(e) || []), lc(j.label)]); } return m; };
  // one line per account, not per job
  for (const [e, jobs] of group((j) => (!A[j.main].ready ? j.main : null))) {
    out.push([d.mode ? 'bad' : 'warn', d.mode ? `${cap(OWN[e]).replace(/^Your /, 'The ')} is not set up, so ${list(jobs)} cannot be written. Set it up below, or choose another AI for them.` : `Before turning this on: set up ${OWN[e].replace(/^your /, 'the ')} (chosen for ${list(jobs)}), or choose another AI.`]);
  }
  for (const [e, jobs] of group((j) => (A[j.main].ready && j.backup !== 'none' && !A[j.backup].ready ? j.backup : null))) {
    out.push(['warn', `The backup for ${list(jobs)} (${NAME[e]}) is not set up, so it cannot take over yet.`]);
  }
  if (d.assistant.main !== 'off' && !A[d.assistant.main].ready) out.push(['bad', `Editor assistant: ${NAME[d.assistant.main]} has no key.`]);
  if (spentOut) out.push(['warn', `Paid AI has used today's limit (${usd(d.spend.today)} of ${usd(d.spend.limit)}). Raise the limit below if you need more today.`]);
  if (!d.live) out.push(['info', 'This is a test server: AI jobs and the Claude subscription only run on the live site.']);
  return [...new Map(out.map((p) => [p[1], p])).values()];
}

function jobStatus(d, main, backup) {
  const { A, usable, resting } = facts(d);
  if (main === 'off') return chip('', 'Off');
  if (!A[main].ready) return chip('bad', 'Not set up');
  if (main === 'github' && resting) return backup !== 'none' && usable(backup) ? chip('warn', `Backup writing until ${time(A.github.hold.until)}`) : chip('warn', `Waits until ${time(A.github.hold.until)}`);
  if (main !== 'github' && !usable(main)) return backup !== 'none' && usable(backup) ? chip('warn', 'Backup writing (limit reached)') : chip('warn', 'Paused: limit reached');
  if (backup !== 'none' && !A[backup].ready) return chip('warn', 'Backup not set up');
  return chip('ok', 'Ready');
}

function accountStatus(d, e) {
  const a = d.accounts[e];
  if (e === 'github') {
    if (!a.ready) return a.missing?.length && a.missing.every((m) => /https/.test(m)) ? chip('', 'Set up · runs on the live site only') : chip('bad', 'Needs setup');
    if (a.hold) return chip('warn', `Resting until ${time(a.hold.until)}`, a.hold.why);
    return chip('ok', a.last_answer ? `Working · last answer ${ago(a.last_answer.at)}` : 'Set up');
  }
  if (a.key?.source === 'unreadable') return chip('bad', 'Key cannot be read: paste it again');
  if (!a.ready) return chip('', 'No key yet');
  return chip('ok', 'Key saved');
}

// ---------------------------------------------------------------- drawing
function selectFor(d, id, kind, value, main) {
  const { A } = facts(d);
  const opts = kind === 'main'
    ? (id === 'assistant' ? ['anthropic', 'openrouter', 'off'] : ['github', 'anthropic', 'openrouter'])
    : ['none', ...(id === 'assistant' ? ['anthropic', 'openrouter'] : ['github', 'anthropic', 'openrouter']).filter((e) => e !== main)];
  // the chosen value reads plainly (the "Now" column says when it is not set up); other options say why they are greyed out
  const label = (e) => (e === 'none' || e === 'off' || e === value || A[e].ready ? NAME[e] : `${NAME[e]} (not set up)`);
  return `<select data-job="${id}" data-part="${kind}" aria-label="${kind === 'main' ? 'Written by' : 'Backup'}">${opts.map((e) => `<option value="${e}" ${e === value ? 'selected' : ''} ${e !== value && e !== 'none' && e !== 'off' && !A[e].ready ? 'disabled' : ''}>${H.esc(label(e))}</option>`).join('')}</select>`;
}

function keyBlock(d, e) {
  const a = d.accounts[e];
  const name = e === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENROUTER_API_KEY';
  const where = e === 'anthropic' ? ['console.anthropic.com', 'https://console.anthropic.com/settings/keys'] : ['openrouter.ai', 'https://openrouter.ai/settings/keys'];
  const k = a.key;
  const saved = k && k.source && k.source !== 'unreadable';
  return `<div class="ai-key" data-key="${name}">
    ${saved ? `<div class="ai-key-saved"><span class="mi">vpn_key</span><span class="grow">${k.source === 'server' ? 'Key set on the server' : 'Key saved'}${k.last4 ? ` · ends in <b>${H.esc(k.last4)}</b>` : ''}</span>
      <button class="btn sm" data-test="${e}"><span class="mi">network_check</span>Test</button>
      <button class="btn sm ghost" data-replace>Replace</button>
      ${k.source === 'app' ? '<button class="btn sm ghost" data-remove>Remove</button>' : ''}</div>` : ''}
    <div class="ai-key-new" ${saved ? 'hidden' : ''}>
      <input type="password" autocomplete="off" spellcheck="false" placeholder="Paste your ${NAME[e]} key (${e === 'anthropic' ? 'sk-ant-' : 'sk-or-'}…)" aria-label="${NAME[e]} key">
      <button class="btn sm primary" data-save>Save key</button>
    </div>
    <p class="ai-help">${saved ? '' : `Get one at <a href="${where[1]}" target="_blank" rel="noopener">${where[0]}</a>. `}Stored encrypted; never shown again, only its last 4 characters.</p>
    <div class="ai-result" data-result></div>
  </div>`;
}

function subscriptionSetup(d) {
  const a = d.accounts.github;
  const tokenOk = !!(a.token?.source && a.token.source !== 'unreadable');
  const loginSeen = a.github_secrets?.CLAUDE_CODE_OAUTH_TOKEN;
  const returnOk = !!(a.return_key?.source && a.return_key.source !== 'unreadable');
  const step = (n, done, title, body) => `<li class="ai-step ${done ? 'done' : ''}"><span class="ai-step-n">${done ? '<span class="mi">check</span>' : n}</span><div class="grow"><b class="ai-step-t">${title}</b>${body}</div></li>`;
  return `<details class="ai-setup" ${a.ready ? '' : 'open'}>
    <summary>${a.ready ? 'Setup details' : 'Set it up in 3 steps'}</summary>
    <ol class="ai-steps">
      ${step(1, tokenOk, 'GitHub access key', `<p class="ai-help">Lets AxiFlow start the writing job in the repository <b>${H.esc(a.repo)}</b>. On GitHub, <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">make a fine-grained token</a> for that repository with <i>Contents: read and write</i> and <i>Secrets: read and write</i>, then paste it here.</p>
        <div class="ai-key" data-key="GITHUB_DISPATCH_TOKEN">${tokenOk ? `<div class="ai-key-saved"><span class="mi">vpn_key</span><span class="grow">Saved${a.token.last4 ? ` · ends in <b>${H.esc(a.token.last4)}</b>` : ''}</span><button class="btn sm ghost" data-replace>Replace</button></div>` : ''}
        <div class="ai-key-new" ${tokenOk ? 'hidden' : ''}><input type="password" autocomplete="off" spellcheck="false" placeholder="Paste the GitHub token (github_pat_…)" aria-label="GitHub access key"><button class="btn sm primary" data-save>Save</button></div><div class="ai-result" data-result></div></div>`)}
      ${step(2, !!loginSeen, 'Your Claude login', `<p class="ai-help">On a computer where you use Claude, run <code>claude setup-token</code> <button class="btn sm ghost icon-only" data-copy="claude setup-token" title="Copy the command" aria-label="Copy the command"><span class="mi">content_copy</span></button> and paste the token it prints. It is saved straight into GitHub, not in AxiFlow.${loginSeen ? ' <b>It is in GitHub.</b> Paste a new one only when Claude asks you to log in again.' : ''}</p>
        <div class="ai-key"><div class="ai-key-new"><input type="password" autocomplete="off" spellcheck="false" placeholder="${loginSeen ? 'Paste a new Claude login to replace it' : 'Paste the Claude login token'}" aria-label="Claude login token" data-login><button class="btn sm ${loginSeen ? '' : 'primary'}" data-login-save ${tokenOk ? '' : 'disabled title="Do step 1 first"'}>Save to GitHub</button></div><div class="ai-result" data-result></div></div>`)}
      ${step(3, returnOk && !!a.github_secrets?.AXIFLOW_CALLBACK_SECRET, 'Return key', `<p class="ai-help">A shared secret so GitHub can hand finished documents back to AxiFlow safely. AxiFlow makes it and saves it on both sides.</p>
        <div class="ai-key">${returnOk && a.github_secrets?.AXIFLOW_CALLBACK_SECRET ? '<p class="ai-help"><b>Set up on both sides.</b></p>' :`<button class="btn sm ${returnOk ? '' : 'primary'}" data-return ${tokenOk ? '' : 'disabled title="Do step 1 first"'}><span class="mi">auto_fix_high</span>${returnOk ? 'Copy it into GitHub' : 'Set up automatically'}</button>${returnOk ? '<p class="ai-help">AxiFlow already has one; this copies it into GitHub so both sides match.</p>' : ''}`}<div class="ai-result" data-result></div></div>`)}
    </ol>
    ${a.https ? '' : '<p class="ai-help ai-warnline"><span class="mi">info</span>The subscription only works on the live site (GitHub must be able to reach it).</p>'}
  </details>`;
}

function accountCard(d, e) {
  const a = d.accounts[e];
  const about = {
    github: ['Uses your Claude plan: no extra cost per document', 'Has a 5-hour usage limit; rests, then continues by itself', 'Takes about 1 to 5 minutes per document'],
    anthropic: ['Pay per document: about $0.10 for a SWOT, about $1 for a brochure', 'Fast (1 to 3 minutes) and no 5-hour limit', 'Counts towards your daily spending limit'],
    openrouter: ['Pay per use through OpenRouter, many AI models', 'Web research needs credits on your OpenRouter account', 'Counts towards your daily spending limit'],
  }[e];
  return `<article class="card ai-acct${e === 'github' ? ' wide' : ''}" id="ai-${e}">
    <header class="ai-acct-h"><span class="ai-acct-ic mi">${ICON[e]}</span><div class="grow"><h3>${NAME[e]}${e === 'github' ? ' <small>through GitHub</small>' : ''}</h3>${accountStatus(d, e)}</div>
      ${e === 'github' ? '<button class="btn sm" data-check-github><span class="mi">network_check</span>Check</button>' : ''}</header>
    <ul class="ai-facts">${about.map((t) => `<li>${H.esc(t)}</li>`).join('')}</ul>
    <p class="ai-used"><span class="muted">Used for:</span> ${a.used_for.length ? H.esc(list(a.used_for)) : '<span class="muted">nothing yet</span>'}</p>
    ${e === 'github' ? `${a.hold ? `<p class="ai-help ai-warnline"><span class="mi">bedtime</span>Resting until ${time(a.hold.until)}: the 5-hour limit was reached. It continues by itself.</p>` : ''}<div class="ai-result" data-check-result>${lastCheck ? checksHtml(lastCheck) : ''}</div>${subscriptionSetup(d)}` : keyBlock(d, e)}
  </article>`;
}

const checksHtml = (r) => `<ul class="ai-checks">${r.steps.map((s) => `<li class="${s.ok === false ? 'bad' : s.ok ? 'ok' : ''}"><span class="mi">${s.ok === false ? 'error' : s.ok ? 'check_circle' : 'help'}</span>${H.esc(s.detail)}</li>`).join('')}</ul>`;

function draw(d) {
  const { esc } = H;
  const probs = problems(d);
  const pct = d.spend.limit > 0 ? Math.min(100, (d.spend.today / d.spend.limit) * 100) : 100;
  const tone = !d.mode ? 'off' : d.on ? 'ok' : 'bad';
  const row = (id, label, detail, main, backup) => `<div class="ai-job">
      <div class="ai-job-name"><span class="mi">${JOB_ICON[id]}</span><div><b>${esc(label)}</b><small>${esc(detail)}</small></div></div>
      <label class="ai-job-cell"><span class="ai-job-l">Written by</span>${selectFor(d, id, 'main', main)}</label>
      <label class="ai-job-cell"><span class="ai-job-l">If that fails</span>${main === 'off' ? '<span class="muted small">–</span>' : selectFor(d, id, 'backup', backup, main)}</label>
      <div class="ai-job-cell ai-job-st">${jobStatus(d, main, backup)}</div>
    </div>`;
  H.view.innerHTML = `
  <div class="hello"><h2>AI</h2><p>Choose which AI writes your documents, connect its accounts, and pick a backup for when it fails.</p></div>

  <section class="card ai-master ${tone}">
    <div class="ai-master-top">
      <span class="ai-master-ic mi">auto_awesome</span>
      <div class="grow"><h2>AI writes your documents</h2><p class="muted">SWOTs, brochures and proposals for every CRM lead.</p></div>
      <input type="checkbox" class="te-sw ai-big-sw" id="aiMode" ${d.mode ? 'checked' : ''} aria-label="AI writes your documents">
    </div>
    <p class="ai-summary">${dot(tone)}<span>${summary(d)}</span></p>
    ${probs.length ? `<ul class="ai-problems">${probs.map(([t, m]) => `<li class="${t}"><span class="mi">${t === 'bad' ? 'error' : t === 'warn' ? 'warning' : 'info'}</span>${esc(m)}</li>`).join('')}</ul>` : ''}
  </section>

  <section class="card ai-who">
    <div class="sec-h"><h2>Who writes what</h2></div>
    <p class="small muted">Pick the AI for each job, and a backup that takes over at once if the first one fails or hits a limit. Changes save at once.</p>
    <div class="ai-jobs">
      <div class="ai-job ai-job-head" aria-hidden="true"><div>Job</div><div>Written by</div><div>If that fails</div><div>Now</div></div>
      ${d.jobs.map((j) => row(j.id, j.label, j.detail, j.main, j.backup)).join('')}
      ${row('assistant', 'Editor assistant', 'The chat in the document editor (needs an instant answer, so not the subscription)', d.assistant.main, d.assistant.backup)}
    </div>
    <label class="te-opt ai-research"><span class="grow"><b>Research each business on the web first</b><small>Better, more specific documents; takes a little longer.</small></span><input type="checkbox" class="te-sw" id="aiResearch" ${d.options.web_research ? 'checked' : ''} aria-label="Research each business on the web first"></label>
  </section>

  <h2 class="ai-sec-title">Your AI accounts</h2>
  <div class="ai-accts">${['github', 'anthropic', 'openrouter'].map((e) => accountCard(d, e)).join('')}</div>

  <div class="ai-two">
    <section class="card ai-spend">
      <h2>Paid AI spending</h2>
      <div class="ai-spend-row"><span class="ai-big">${usd(d.spend.today)}</span><span class="muted">of ${usd(d.spend.limit)} today</span><span class="spacer"></span><span class="muted small">This month: <b>${usd(d.spend.month)}</b></span></div>
      <div class="ai-bar ${pct >= 100 ? 'full' : pct >= 80 ? 'high' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct}%"></i></div>
      <form class="ai-limit" id="aiLimitForm"><label>Daily limit (US$)<input type="number" min="0" max="1000" step="1" id="aiLimit" value="${esc(d.spend.limit)}"></label><button class="btn sm" type="submit">Save limit</button></form>
      <p class="ai-help">Counts the Anthropic and OpenRouter keys. The Claude subscription is part of your plan, so it is not counted. When the limit is reached, paid AI stops until midnight and jobs go to their backup, or wait. $0 means never use paid AI.</p>
    </section>

    <section class="card ai-recent">
      <div class="sec-h"><h2>Recent AI work</h2><span class="spacer"></span><a class="small" href="#/usage">Full usage</a></div>
      ${d.recent.length ? `<ul class="ai-runs">${d.recent.map((r) => {
        const st = r.status === 'writing' ? (r.hold_until ? chip('warn', `Waits until ${time(r.hold_until)}`) : chip('warn', 'Writing')) : r.status === 'ready' ? chip('ok', 'Ready') : r.status === 'error' ? chip('bad', 'Failed', r.error || '') : chip('', r.status);
        const who = `${NAME[r.engine] || r.engine}${r.fell_back ? ' (backup)' : ''}`;
        return `<li><span class="mi">${JOB_ICON[r.kind] || 'description'}</span><div class="grow"><a href="#/${r.kind}/${r.id}">${esc(r.title || `#${r.id}`)}</a><small title="${esc(r.fell_back ? `Moved to the backup after: ${r.fell_back}` : '')}">${esc(who)} · ${esc(ago(r.at))}${r.attempts > 1 ? ` · try ${r.attempts}` : ''}</small></div>${st}</li>`;
      }).join('')}</ul>` : '<p class="small muted">Nothing written by AI yet.</p>'}
    </section>
  </div>

  <details class="card ai-adv">
    <summary><h2>Advanced</h2><span class="small muted">Models, waiting time, tries, repository</span></summary>
    <form id="aiAdvForm" class="form-grid">
      <label>Model for documents on the Anthropic API<select name="anthropic_docs">${modelOpts(d.options.models.anthropic_docs)}</select></label>
      <label>Model for documents on OpenRouter<input name="openrouter_docs" value="${esc(d.options.models.openrouter_docs)}" spellcheck="false"></label>
      <label>Model for the editor assistant on the Anthropic API<select name="anthropic_chat">${modelOpts(d.options.models.anthropic_chat)}</select></label>
      <label>Model for the editor assistant on OpenRouter<input name="openrouter_chat" value="${esc(d.options.models.openrouter_chat)}" placeholder="Same as the Anthropic model" spellcheck="false"></label>
      <label>Wait for an answer before trying again (minutes)<input type="number" name="timeout_minutes" min="3" max="60" value="${esc(d.options.timeout_minutes)}"></label>
      <label>Tries before a document shows an error<input type="number" name="max_attempts" min="1" max="5" value="${esc(d.options.max_attempts)}"></label>
      <label class="wide">GitHub repository that runs the Claude subscription (owner/name)<input name="github_repo" value="${esc(d.options.github_repo)}" spellcheck="false"></label>
      <div class="wide"><button class="btn sm primary" type="submit">Save advanced settings</button></div>
    </form>
  </details>`;
  wire(d);
}

function modelOpts(v) {
  const known = MODELS.some(([id]) => id === v);
  return (known ? MODELS : [[v, v], ...MODELS]).map(([id, n]) => `<option value="${H.esc(id)}" ${id === v ? 'selected' : ''}>${H.esc(n)}</option>`).join('');
}

// ---------------------------------------------------------------- actions
async function save(body, okText) {
  const d = await H.api('/ai-setup', { method: 'PUT', body });
  H.onMode?.(d.mode);
  draw(d);
  if (okText) H.toast(okText);
  return d;
}
const result = (box, ok, text) => { if (box) box.innerHTML = `<div class="ai-res ${ok === false ? 'bad' : ok ? 'ok' : ''}"><span class="mi">${ok === false ? 'error' : ok ? 'check_circle' : 'info'}</span>${H.esc(text)}</div>`; };

function wire(d) {
  const { $, $$, api, busy, toast } = H;
  const root = H.view;
  $('#aiMode', root).onchange = async (ev) => {
    const on = ev.target.checked;
    try { await save({ mode: on }, on ? 'AI writing is on' : 'AI writing is off: new documents get your standard text'); } catch (e) { ev.target.checked = !on; toast(e.message, true); }
  };
  $$('select[data-job]', root).forEach((sel) => (sel.onchange = async () => {
    const id = sel.dataset.job, part = sel.dataset.part;
    const body = id === 'assistant' ? { assistant: { [part]: sel.value } } : { jobs: { [id]: { [part]: sel.value } } };
    if (id !== 'assistant' && part === 'main') { const j = d.jobs.find((x) => x.id === id); if (j && j.backup === sel.value) body.jobs[id].backup = 'none'; }
    const label = id === 'assistant' ? 'Editor assistant' : d.jobs.find((x) => x.id === id).label;
    try { await save(body, part === 'main' ? `${label}: ${NAME[sel.value]}${sel.value === 'off' ? '' : ' writes'}` : `${label}: backup is ${NAME[sel.value]}`); } catch (e) { toast(e.message, true); draw(d); }
  }));
  $('#aiResearch', root).onchange = async (ev) => { try { await save({ web_research: ev.target.checked }, ev.target.checked ? 'AI researches each business first' : 'AI writes without web research'); } catch (e) { toast(e.message, true); } };
  $('#aiLimitForm', root).onsubmit = (ev) => { ev.preventDefault(); busy(ev.submitter, async () => save({ limit: Number($('#aiLimit', root).value) }, 'Daily limit saved')); };
  $('#aiAdvForm', root).onsubmit = (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const g = (k) => String(f.get(k) ?? '');
    busy(ev.submitter, async () => save({ options: { timeout_minutes: Number(g('timeout_minutes')), max_attempts: Number(g('max_attempts')), github_repo: g('github_repo'), models: { anthropic_docs: g('anthropic_docs'), openrouter_docs: g('openrouter_docs'), anthropic_chat: g('anthropic_chat'), openrouter_chat: g('openrouter_chat') } } }, 'Advanced settings saved'));
  };
  // keys
  $$('.ai-key[data-key]', root).forEach((box) => {
    const name = box.dataset.key;
    const res = $('[data-result]', box);
    const replace = $('[data-replace]', box);
    if (replace) replace.onclick = () => { $('.ai-key-new', box).hidden = false; $('.ai-key-new input', box).focus(); };
    const saveBtn = $('[data-save]', box);
    const inp = $('.ai-key-new input', box);
    if (saveBtn) {
      const go = () => busy(saveBtn, async () => {
        if (!inp.value.trim()) { result(res, false, 'Paste the key first'); return; }
        try {
          await api(`/keys/${name}`, { method: 'PUT', body: { value: inp.value } });
          inp.value = '';
          lastCheck = null; // an older check result no longer applies
          const fresh = await H.api('/ai-setup');
          draw(fresh);
          toast('Key saved');
          const prov = name === 'ANTHROPIC_API_KEY' ? 'anthropic' : name === 'OPENROUTER_API_KEY' ? 'openrouter' : null;
          if (prov) { const t = await api(`/keys-test/${prov}`, { body: {} }); result($(`#ai-${prov} [data-result]`, H.view), t.ok, t.ok ? `${t.detail}. Ready to use.` : `Saved, but the test failed: ${t.detail}`); }
        } catch (e) { result(res, false, e.message); }
      });
      saveBtn.onclick = go;
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } };
    }
    const rm = $('[data-remove]', box);
    if (rm) rm.onclick = () => busy(rm, async () => {
      const used = d.jobs.some((j) => (j.main === 'anthropic' && name === 'ANTHROPIC_API_KEY') || (j.main === 'openrouter' && name === 'OPENROUTER_API_KEY'));
      if (!confirm(used ? 'This key writes some of your documents. Remove it anyway? Those documents will use their backup, or wait.' : 'Remove this key from AxiFlow?')) return;
      await api(`/keys/${name}`, { method: 'DELETE' });
      draw(await H.api('/ai-setup'));
      toast('Key removed');
    });
  });
  $$('[data-test]', root).forEach((b) => (b.onclick = () => busy(b, async () => {
    const t = await api(`/keys-test/${b.dataset.test}`, { body: {} });
    result($('[data-result]', b.closest('.ai-key')), t.ok, `${t.detail} (${t.ms} ms)`);
  })));
  $$('[data-copy]', root).forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Copied'), () => toast('Select the text and copy it', true)); }));
  const login = $('[data-login-save]', root);
  if (login) login.onclick = () => busy(login, async () => {
    const box = login.closest('.ai-key');
    const v = $('[data-login]', box).value.trim();
    if (!v) { result($('[data-result]', box), false, 'Paste the token from claude setup-token first'); return; }
    try { await api('/github-secret', { body: { secret: 'CLAUDE_CODE_OAUTH_TOKEN', value: v } }); lastCheck = null; draw(await H.api('/ai-setup')); toast('Claude login saved in GitHub'); } catch (e) { result($('[data-result]', box), false, e.message); }
  });
  const ret = $('[data-return]', root);
  if (ret) ret.onclick = () => busy(ret, async () => {
    try { await api('/ai-setup/return-key', { body: {} }); lastCheck = null; draw(await H.api('/ai-setup')); toast('Return key set up on both sides'); } catch (e) { result($('[data-result]', ret.closest('.ai-key')), false, e.message); }
  });
  const chk = $('[data-check-github]', root);
  if (chk) chk.onclick = () => busy(chk, async () => {
    lastCheck = await api('/ai-setup/check-github', { body: {} });
    draw(await H.api('/ai-setup')); // the check also records what it found in GitHub, so the steps tick
  });
}
