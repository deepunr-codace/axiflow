import { get, all } from './db.js';
import { getSettings, saveSettings, getState } from './settings.js';
import { BASE_URL } from './util.js';
import * as cw from './claude-worker.js';

/*
 * The AI page (owner, 2026-11-12: "make the AI integration properly… one AI integration page: enable / disable, key
 * adding, fallback options… user friendly"). One read of everything the page shows, in plain terms, and one save
 * that maps the page's choices onto the existing settings:
 *   - AI writing on/off            → claude.mode
 *   - main AI per document job     → claude.engines[tool]   (github | anthropic | openrouter)
 *   - backup per document job      → claude.fallbacks[tool] (an engine or 'none'; see backupSetting in claude-worker)
 *   - editor assistant main/backup → ai.enabled + ai.provider, ai.backup_provider
 *   - web research, spend limit, models, retries → claude.* / ai.*
 * Keys are saved with the existing /api/keys routes; nothing here ever returns a key.
 */
export const JOBS = [
  { id: 'script', label: 'SWOTs', detail: 'Pitch scripts: one for every new CRM lead' },
  { id: 'brochure', label: 'Brochures', detail: 'When a lead is marked Interested' },
  { id: 'proposal', label: 'Proposals', detail: 'When a deal reaches the proposal stage' },
];
const ACCOUNTS = ['github', 'anthropic', 'openrouter'];
const KEY_OF = { anthropic: 'ANTHROPIC_API_KEY', openrouter: 'OPENROUTER_API_KEY' };

const firstOfMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };

export async function aiSetupStatus() {
  const s = getSettings();
  const { keysStatus, githubSecretsSeen } = await import('./keys.js');
  const { aiStatus, aiProvider } = await import('./ai/claude.js');
  const keys = Object.fromEntries((await keysStatus()).map((k) => [k.name, { source: k.source, last4: k.last4, updated_at: k.updated_at }]));
  const ai = await aiStatus();
  let hold = await getState('claude_hold');
  if (hold && !(new Date(hold.until) > new Date())) hold = null;
  const seen = await getState('integrations', {});
  const month = Number((await get(`SELECT COALESCE(SUM(cost_usd),0) v FROM ai_calls WHERE created_at >= :since`, { since: firstOfMonth() }).catch(() => ({ v: 0 }))).v || 0);
  const ready = Object.fromEntries(ACCOUNTS.map((a) => [a, !cw.missingFor(a, s).length]));
  const usedFor = Object.fromEntries(ACCOUNTS.map((a) => [a, []]));
  const jobs = JOBS.map((j) => {
    const main = cw.engineFor(j.id, s);
    const backup = cw.backupSetting(j.id, s);
    usedFor[main].push(`${j.label} (main)`);
    if (backup !== 'none' && backup !== main) usedFor[backup].push(`${j.label} (backup)`);
    return { ...j, main, backup: backup === main ? 'none' : backup };
  });
  const assistant = { main: s.ai.enabled ? aiProvider(s) : 'off', backup: ['anthropic', 'openrouter'].includes(s.ai.backup_provider) ? s.ai.backup_provider : 'none' };
  if (assistant.main !== 'off') usedFor[assistant.main].push('Editor assistant (main)');
  if (assistant.backup !== 'none' && assistant.backup !== assistant.main && assistant.main !== 'off') usedFor[assistant.backup].push('Editor assistant (backup)');
  const docs = await all(`SELECT id, kind, title, status, error, input_json, updated_at FROM docs WHERE input_json LIKE '%"claude":%' ORDER BY id DESC LIMIT 8`).catch(() => []);
  const recent = docs.map((d) => {
    let c = {};
    try { c = JSON.parse(d.input_json).claude || {}; } catch { /* old row */ }
    return { id: d.id, kind: d.kind, title: d.title, status: c.waiting ? 'writing' : d.status, error: d.error || c.last_error || null, engine: c.engine || 'github', fell_back: c.fell_back || null, hold_until: c.hold_until || null, attempts: c.attempts || 1, run_url: c.run_url || null, at: c.dispatched_at || d.updated_at };
  });
  return {
    live: /^https:/.test(BASE_URL),
    mode: !!s.claude?.mode,
    on: cw.claudeOn(s),
    jobs,
    assistant,
    accounts: {
      github: {
        ready: ready.github, used_for: usedFor.github, hold, missing: cw.missingFor('github', s),
        last_answer: seen.claude_result || null,
        repo: s.claude?.github_repo || '',
        token: keys.GITHUB_DISPATCH_TOKEN || null,
        return_key: keys.CLAUDE_WORKER_SECRET || null,
        github_secrets: await githubSecretsSeen().catch(() => ({})),
        https: /^https:/.test(BASE_URL),
      },
      anthropic: { ready: ready.anthropic, used_for: usedFor.anthropic, key: keys.ANTHROPIC_API_KEY || null, model: s.claude?.api_model?.anthropic || 'claude-opus-5-5' },
      openrouter: { ready: ready.openrouter, used_for: usedFor.openrouter, key: keys.OPENROUTER_API_KEY || null, model: s.claude?.api_model?.openrouter || 'anthropic/claude-opus-5.5' },
    },
    spend: { today: ai.spent_today_usd, limit: s.ai.daily_budget_usd, month: Number(month.toFixed(2)) },
    recent,
    options: {
      web_research: s.claude?.web_research !== false,
      timeout_minutes: s.claude?.timeout_minutes || 12,
      max_attempts: s.claude?.max_attempts || 3,
      github_repo: s.claude?.github_repo || '',
      models: {
        anthropic_docs: s.claude?.api_model?.anthropic || 'claude-opus-5-5',
        openrouter_docs: s.claude?.api_model?.openrouter || 'anthropic/claude-opus-5.5',
        anthropic_chat: s.ai.model || 'claude-opus-5-5',
        openrouter_chat: s.ai.openrouter_model || '',
      },
    },
  };
}

const ENGINE_NAME = { github: 'the Claude subscription', anthropic: 'the Anthropic API key', openrouter: 'the OpenRouter key' };
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

/** Saves the page's choices. Refuses a state that would stop documents being written. */
export async function saveAiSetup(body = {}) {
  const s = getSettings();
  const patch = { claude: {}, ai: {} };
  if (body.jobs && typeof body.jobs === 'object') {
    for (const j of JOBS) {
      const c = body.jobs[j.id];
      if (!c) continue;
      if (c.main !== undefined) {
        if (!cw.ENGINES[c.main]) throw bad(`Unknown AI for ${j.label}`);
        (patch.claude.engines ??= {})[j.id] = c.main;
      }
      if (c.backup !== undefined) {
        if (c.backup !== 'none' && !cw.ENGINES[c.backup]) throw bad(`Unknown backup for ${j.label}`);
        (patch.claude.fallbacks ??= {})[j.id] = c.backup;
      }
    }
  }
  if (body.assistant) {
    const { main, backup } = body.assistant;
    if (main !== undefined) {
      if (!['off', 'anthropic', 'openrouter'].includes(main)) throw bad('Unknown AI for the editor assistant');
      if (main !== 'off' && !process.env[KEY_OF[main]]) throw bad(`Add ${ENGINE_NAME[main]} first (Your AI accounts, below)`);
      patch.ai.enabled = main !== 'off';
      if (main !== 'off') patch.ai.provider = main;
    }
    if (backup !== undefined) {
      if (!['none', 'anthropic', 'openrouter'].includes(backup)) throw bad('Unknown backup for the editor assistant');
      patch.ai.backup_provider = backup === 'none' ? '' : backup;
    }
  }
  if (body.web_research !== undefined) patch.claude.web_research = !!body.web_research;
  if (body.limit !== undefined) {
    const n = Number(body.limit);
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw bad('The daily limit must be between $0 and $1000');
    patch.ai.daily_budget_usd = Math.round(n * 100) / 100;
  }
  const o = body.options || {};
  if (o.timeout_minutes !== undefined) { const n = Number(o.timeout_minutes); if (!(n >= 3 && n <= 60)) throw bad('Wait between 3 and 60 minutes'); patch.claude.timeout_minutes = n; }
  if (o.max_attempts !== undefined) { const n = Number(o.max_attempts); if (!(n >= 1 && n <= 5)) throw bad('Tries must be 1 to 5'); patch.claude.max_attempts = n; }
  if (o.github_repo !== undefined) { const r = String(o.github_repo).trim(); if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw bad('The repository looks like owner/name'); patch.claude.github_repo = r; }
  if (o.models) {
    const m = o.models, clean = (v) => String(v || '').trim().slice(0, 120);
    if (m.anthropic_docs !== undefined && clean(m.anthropic_docs)) (patch.claude.api_model ??= {}).anthropic = clean(m.anthropic_docs);
    if (m.openrouter_docs !== undefined && clean(m.openrouter_docs)) (patch.claude.api_model ??= {}).openrouter = clean(m.openrouter_docs);
    if (m.anthropic_chat !== undefined && clean(m.anthropic_chat)) patch.ai.model = clean(m.anthropic_chat);
    if (m.openrouter_chat !== undefined) patch.ai.openrouter_model = clean(m.openrouter_chat);
  }
  if (body.mode !== undefined) patch.claude.mode = !!body.mode;

  // what the settings would be after this save: AI writing on needs every main AI set up
  const next = structuredClone(s);
  next.claude = { ...next.claude, ...patch.claude, engines: { ...next.claude?.engines, ...patch.claude.engines }, fallbacks: { ...next.claude?.fallbacks, ...patch.claude.fallbacks } };
  if (next.claude.mode) {
    const notReady = [...new Set(JOBS.map((j) => cw.engineFor(j.id, next)).filter((e) => cw.missingFor(e, next).length))];
    if (notReady.length) throw bad(`Set up ${notReady.map((e) => ENGINE_NAME[e]).join(' and ')} first, or choose another AI for ${JOBS.filter((j) => notReady.includes(cw.engineFor(j.id, next))).map((j) => j.label).join(', ')}.`);
  }
  if (!Object.keys(patch.claude).length) delete patch.claude;
  if (!Object.keys(patch.ai).length) delete patch.ai;
  await saveSettings(patch);
  return aiSetupStatus();
}

/**
 * The subscription's setup, checked live on GitHub: the token can see the repo and start its workflow, and the two
 * repo secrets the job needs exist (listing secret names needs "Secrets: read" on the token; values are never readable).
 */
export async function checkGithub() {
  const s = getSettings();
  const repo = s.claude?.github_repo || '';
  const out = [];
  const add = (id, ok, detail) => out.push({ id, ok, detail });
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) { add('token', false, 'No GitHub access key yet'); return { ok: false, steps: out }; }
  const apiBase = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const h = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'axiflow' };
  try {
    const r = await fetch(`${apiBase}/repos/${repo}`, { headers: h, signal: AbortSignal.timeout(10000) });
    if (!r.ok) { add('token', false, r.status === 401 ? 'GitHub says the access key is wrong or expired' : r.status === 404 ? `The key cannot see ${repo} (wrong repository, or the key was made for another one)` : `GitHub answered ${r.status}`); return { ok: false, steps: out }; }
    const j = await r.json();
    const push = j.permissions ? j.permissions.push !== false : true;
    add('token', push, push ? `Can start jobs in ${j.full_name}` : `Can see ${j.full_name} but cannot start jobs: give the key "Contents: read and write"`);
    const w = await fetch(`${apiBase}/repos/${repo}/contents/.github/workflows/claude-generate.yml`, { headers: h, signal: AbortSignal.timeout(10000) });
    add('workflow', w.ok, w.ok ? 'The writing job is in the repository' : 'The writing job (claude-generate.yml) is missing in the repository');
    const sec = await fetch(`${apiBase}/repos/${repo}/actions/secrets?per_page=100`, { headers: h, signal: AbortSignal.timeout(10000) });
    if (sec.ok) {
      const names = new Set(((await sec.json()).secrets || []).map((x) => x.name));
      // remember what was found, so the page's setup steps tick even when they were done outside AxiFlow
      const { setState } = await import('./settings.js');
      const seen = await getState('github_secrets', {});
      let changed = false;
      for (const n of ['CLAUDE_CODE_OAUTH_TOKEN', 'AXIFLOW_CALLBACK_SECRET']) if (names.has(n) && !seen[n]) { seen[n] = new Date().toISOString(); changed = true; }
      if (changed) await setState('github_secrets', seen);
      add('login', names.has('CLAUDE_CODE_OAUTH_TOKEN'), names.has('CLAUDE_CODE_OAUTH_TOKEN') ? 'Your Claude login is saved in GitHub' : 'Your Claude login is not in GitHub yet');
      add('return', names.has('AXIFLOW_CALLBACK_SECRET') && !!process.env.CLAUDE_WORKER_SECRET, names.has('AXIFLOW_CALLBACK_SECRET') ? (process.env.CLAUDE_WORKER_SECRET ? 'The return key is set on both sides' : 'GitHub has a return key but AxiFlow does not') : 'The return key is not in GitHub yet');
    } else add('secrets', null, 'Could not list GitHub secrets (the key needs "Secrets: read and write" for this check)');
  } catch (e) { add('token', false, e.message); }
  return { ok: out.every((x) => x.ok !== false), steps: out };
}

/** Sets up the return key in one go: a new random secret here, the same value saved in GitHub. Only when missing. */
export async function setupReturnKey() {
  const k = await import('./keys.js');
  if (process.env.CLAUDE_WORKER_SECRET && (await k.githubSecretsSeen()).AXIFLOW_CALLBACK_SECRET) throw bad('The return key is already set up');
  if (!process.env.GITHUB_DISPATCH_TOKEN) throw bad('Add the GitHub access key first (step 1)');
  if (!process.env.CLAUDE_WORKER_SECRET) await k.generateKey('CLAUDE_WORKER_SECRET');
  await k.saveGithubSecret({ secret: 'AXIFLOW_CALLBACK_SECRET', from: 'CLAUDE_WORKER_SECRET' });
  return { ok: true };
}
