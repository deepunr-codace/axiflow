import { getSettings, getState, setState } from './settings.js';
import { all, get } from './db.js';
import { BASE_URL } from './util.js';

/*
 * Integrations page (owner, 2026-11-05: "provide detailed integration settings in sidebar and settings"):
 * one status object for every connection AxiFlow uses, plus live tests. Secrets are only reported as set / not set,
 * never returned.
 */
const set = (name) => !!process.env[name];
const envs = (...names) => names.map((n) => ({ name: n, set: set(n) }));

/** Records that an integration was used (webhook received, callback, cron tick); shown as "last seen". */
export async function seen(key, note = '') {
  try {
    const st = await getState('integrations', {});
    st[key] = { at: new Date().toISOString(), note: String(note).slice(0, 200) };
    await setState('integrations', st);
  } catch { /* never block a webhook for this */ }
}

export async function integrationsStatus() {
  const s = getSettings();
  const seenAt = await getState('integrations', {});
  const atomic = await import('./atomic.js');
  const crm = await atomic.atomicStatus().catch((e) => ({ error: e.message }));
  const cw = await import('./claude-worker.js');
  const sched = await getState('scheduler', {});
  const { aiStatus } = await import('./ai/claude.js');
  const { channelStatus } = await import('./pipeline/channels.js');
  const claudeDocs = await all(`SELECT id, kind, title, status, error, input_json, updated_at FROM docs WHERE input_json LIKE '%"claude":%' ORDER BY id DESC LIMIT 8`).catch(() => []);
  const tpl = await all(`SELECT id, kind, name, source, is_default FROM design_templates ORDER BY kind, is_default DESC, id`).catch(() => []);
  const storage = set('SUPABASE_URL') && (set('SUPABASE_SECRET_KEY') || set('SUPABASE_SERVICE_ROLE_KEY')) ? 'supabase' : set('BLOB_READ_WRITE_TOKEN') ? 'blob' : 'local';
  const outbox = await get(`SELECT COUNT(*)::int AS n FROM crm_outbox WHERE status IN ('pending', 'failed')`).catch(() => ({ n: 0 }));
  return {
    base_url: BASE_URL,
    live: /^https:/.test(BASE_URL),
    crm: {
      ...crm,
      env: envs('CRM_SUPABASE_URL', 'CRM_SUPABASE_SECRET_KEY'),
      webhook_url: `${BASE_URL}/webhooks/atomic`,
      webhook_secret_set: set('WEBHOOK_SECRET'),
      last_webhook: seenAt.crm_webhook || null,
      waiting_writes: outbox?.n || 0,
      settings: s.atomic,
    },
    claude: {
      engine: cw.engineOf(s),
      engines: cw.ENGINES,
      model: cw.engineModel(s),
      mode: !!s.claude?.mode,
      on: cw.claudeOn(s),
      host: cw.claudeHost(),
      missing: cw.claudeMissing(),
      env: envs('GITHUB_DISPATCH_TOKEN', 'CLAUDE_WORKER_SECRET'),
      repo_secrets: ['CLAUDE_CODE_OAUTH_TOKEN', 'AXIFLOW_CALLBACK_SECRET', 'CRON_SECRET'], // set in GitHub, cannot be read from here
      callback_url: `${BASE_URL}/webhooks/claude-result`,
      workflow: '.github/workflows/claude-generate.yml',
      last_result: seenAt.claude_result || null,
      settings: s.claude,
      recent: claudeDocs.map((d) => {
        let c = {};
        try { c = JSON.parse(d.input_json).claude || {}; } catch { /* old row */ }
        return { engine: c.engine || 'github', id: d.id, kind: d.kind, title: d.title, status: d.status, error: d.error, attempts: c.attempts || 0, run_url: c.run_url || null, job: c.job?.kind || null, waiting: !!c.waiting, done: !!c.done, dispatched_at: c.dispatched_at || null, updated_at: d.updated_at };
      }),
    },
    templates: {
      list: tpl,
      auto: s.automation?.auto_template || {},
    },
    scheduler: {
      cron_secret_set: set('CRON_SECRET'),
      tick_url: `${BASE_URL}/api/cron/tick`,
      last_tick: seenAt.cron_tick || null,
      last_daily_run: sched.last_daily_run || sched.last_run || null,
      daily_time: s.schedule?.daily_time, timezone: s.schedule?.timezone,
    },
    storage: {
      kind: storage,
      bucket: process.env.SUPABASE_BUCKET || 'axiflow-uploads',
      env: envs('SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_BUCKET', 'BLOB_READ_WRITE_TOKEN'),
    },
    database: { kind: set('DATABASE_URL') ? 'postgres' : 'embedded', env: envs('DATABASE_URL') },
    ai: { ...(await aiStatus().catch(() => ({}))), env: envs('OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY') },
    channels: { ...channelStatus(s), env: envs('SMTP_HOST', 'SMTP_USER', 'WA_TOKEN', 'WA_PHONE_NUMBER_ID') },
    login: { env: envs('ADMIN_PASSWORD', 'SESSION_SECRET') },
  };
}

/** Live tests: 'crm' reads one CRM row; 'github' checks the token can see the repo and its workflow. */
export async function testIntegration(name) {
  const t0 = Date.now();
  const done = (ok, detail) => ({ ok, detail, ms: Date.now() - t0 });
  if (name === 'crm') {
    const atomic = await import('./atomic.js');
    if (!atomic.atomicKeys()) return done(false, 'CRM_SUPABASE_URL and CRM_SUPABASE_SECRET_KEY are not set');
    try {
      const rows = await atomic.rest('GET', 'companies?select=id&limit=1');
      return done(true, `Connected to ${atomic.crmHost()} (read ${Array.isArray(rows) ? rows.length : 0} row)`);
    } catch (e) { return done(false, e.message); }
  }
  if (name === 'github') {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    const repo = getSettings().claude?.github_repo || '';
    if (!token) return done(false, 'GITHUB_DISPATCH_TOKEN is not set');
    const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
    const h = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'axiflow' };
    try {
      const r = await fetch(`${api}/repos/${repo}`, { headers: h, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return done(false, `GitHub answered ${r.status} for ${repo}${r.status === 404 ? ' (wrong repo name, or the token cannot see it)' : r.status === 401 ? ' (token expired or wrong)' : ''}`);
      const j = await r.json();
      const w = await fetch(`${api}/repos/${repo}/contents/.github/workflows/claude-generate.yml`, { headers: h, signal: AbortSignal.timeout(10000) });
      const canPush = j.permissions ? j.permissions.push : null;
      return done(w.ok && canPush !== false, `Repo ${j.full_name} (${j.private ? 'private' : 'public'}); workflow file ${w.ok ? 'found' : 'missing'}; token ${canPush === false ? 'cannot start workflows (needs Contents: read and write)' : 'may start workflows'}`);
    } catch (e) { return done(false, e.message); }
  }
  throw new Error('Unknown integration');
}
