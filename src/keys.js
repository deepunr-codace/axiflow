import crypto from 'node:crypto';
import { registerSchema, all, get, run } from './db.js';

/*
 * Bring your own keys (owner, 2026-11-05: "add options to add keys. BYOK + this claude integration").
 * API keys and secrets can be added in Integrations instead of .env / Vercel. They are stored encrypted
 * (AES-256-GCM; the key is derived from KEYS_SECRET, else SESSION_SECRET), never sent back to the browser
 * (only the last 4 characters), and applied to process.env so every module reads them as before.
 * A key saved here wins over the server's environment variable; removing it brings the server's value back.
 * Not possible here: DATABASE_URL (needed to read this table), ADMIN_PASSWORD, SESSION_SECRET, KEYS_SECRET.
 */
registerSchema(`
CREATE TABLE IF NOT EXISTS app_keys (
  name TEXT PRIMARY KEY,
  value_enc TEXT NOT NULL,
  last4 TEXT,
  updated_at TEXT NOT NULL
);`);

/** The keys that may be set here, grouped for the Integrations page. gen = AxiFlow can generate a random secret. */
export const KEY_DEFS = [
  { name: 'ANTHROPIC_API_KEY', group: 'claude', label: 'Anthropic API key', hint: 'console.anthropic.com → API keys. Lets Claude write the tools on your API key (engine "Claude API"), and powers the editor assistant.', prefix: 'sk-ant-' },
  { name: 'GITHUB_DISPATCH_TOKEN', group: 'github', label: 'GitHub token', hint: 'Fine-grained token for this repo: Contents read and write (starts the workflow). Add Secrets read and write to let AxiFlow save the repo secrets for you.', prefix: 'github_pat_' },
  { name: 'CLAUDE_WORKER_SECRET', group: 'github', label: 'Callback secret', hint: 'Shared with the GitHub repo secret AXIFLOW_CALLBACK_SECRET. Generate one, then save it to GitHub.', gen: true, github: 'AXIFLOW_CALLBACK_SECRET' },
  { name: 'PEXELS_API_KEY', group: 'images', label: 'Pexels API key', hint: 'pexels.com/api → Your API key (free). Photos that fit each lead\'s vertical; free for commercial use, no credit needed.' },
  { name: 'UNSPLASH_ACCESS_KEY', group: 'images', label: 'Unsplash access key', hint: 'unsplash.com/developers → New application → Access Key (free). Premium editorial photos; AxiFlow records each photographer.' },
  { name: 'CRM_SUPABASE_URL', group: 'crm', label: 'CRM Supabase URL', hint: 'https://<project>.supabase.co of the team CRM.', plain: true },
  { name: 'CRM_SUPABASE_SECRET_KEY', group: 'crm', label: 'CRM secret key', hint: 'The CRM project\'s secret (service) key. AxiFlow stays read-only except the allowed writes.' },
  { name: 'WEBHOOK_SECRET', group: 'sync', label: 'CRM trigger secret', hint: 'Checked on /webhooks/atomic. If you change it, run the CRM trigger SQL again with the new value.', gen: true },
  { name: 'CRON_SECRET', group: 'sync', label: 'Scheduler secret', hint: 'Checked on /api/cron/tick. Also the GitHub repo secret CRON_SECRET (30-minute pinger).', gen: true, github: 'CRON_SECRET' },
  { name: 'SMTP_HOST', group: 'email', label: 'SMTP host', plain: true },
  { name: 'SMTP_PORT', group: 'email', label: 'SMTP port', plain: true },
  { name: 'SMTP_USER', group: 'email', label: 'SMTP user', plain: true },
  { name: 'SMTP_PASS', group: 'email', label: 'SMTP password' },
  { name: 'SMTP_FROM', group: 'email', label: 'From address', plain: true },
  { name: 'WA_TOKEN', group: 'whatsapp', label: 'WhatsApp token' },
  { name: 'WA_PHONE_NUMBER_ID', group: 'whatsapp', label: 'WhatsApp phone number id', plain: true },
];
const DEF = Object.fromEntries(KEY_DEFS.map((d) => [d.name, d]));

const SERVER_ENV = Object.fromEntries(KEY_DEFS.map((d) => [d.name, process.env[d.name]])); // the server's own values
const applied = new Set();

function cipherKey() {
  const base = process.env.KEYS_SECRET || process.env.SESSION_SECRET || '';
  if (!base && process.env.VERCEL) throw new Error('SESSION_SECRET is not set, so keys cannot be stored safely');
  return crypto.createHash('sha256').update(`axiflow-keys:${base || 'local-dev'}`).digest();
}
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
function decrypt(blob) {
  const [v, iv, tag, enc] = String(blob).split(':');
  if (v !== 'v1') throw new Error('unknown format');
  const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

let loadedAt = 0;
const broken = new Set();
/** Reads the saved keys into process.env (every 30 s at most, or at once with force). */
export async function loadKeys({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < 30000) return;
  loadedAt = Date.now();
  let rows = [];
  try { rows = await all(`SELECT name, value_enc FROM app_keys`); } catch { return; }
  const seenNow = new Set();
  broken.clear();
  for (const r of rows) {
    if (!DEF[r.name]) continue;
    try { process.env[r.name] = decrypt(r.value_enc); seenNow.add(r.name); applied.add(r.name); } catch { broken.add(r.name); }
  }
  for (const n of [...applied]) if (!seenNow.has(n)) { // removed: back to the server's own value
    if (SERVER_ENV[n] === undefined) delete process.env[n]; else process.env[n] = SERVER_ENV[n];
    applied.delete(n);
  }
  (await import('./ai/claude.js')).resetClient?.();
}

const tail = (v) => (v.length > 8 ? v.slice(-4) : '');
/** What is set, where, and the last 4 characters of keys saved here (never the value). */
export async function keysStatus() {
  const rows = Object.fromEntries((await all(`SELECT name, last4, updated_at FROM app_keys`).catch(() => [])).map((r) => [r.name, r]));
  return KEY_DEFS.map((d) => ({
    name: d.name, group: d.group, label: d.label, hint: d.hint || '', gen: !!d.gen, github: d.github || null, plain: !!d.plain, prefix: d.prefix || '',
    source: rows[d.name] ? (broken.has(d.name) ? 'unreadable' : 'app') : SERVER_ENV[d.name] ? 'server' : null,
    last4: rows[d.name]?.last4 || (SERVER_ENV[d.name] ? tail(SERVER_ENV[d.name]) : ''),
    value: d.plain ? (process.env[d.name] || '') : undefined, // plain settings (hosts, ids, URLs) may be shown
    updated_at: rows[d.name]?.updated_at || null,
  }));
}

export async function saveKey(name, value) {
  const d = DEF[name];
  if (!d) throw new Error('This key cannot be set here');
  const v = String(value ?? '').trim();
  if (!v) throw new Error('Paste the key first');
  if (v.length > 4000) throw new Error('That is too long for a key');
  if (/\s/.test(v) && !d.plain) throw new Error('A key has no spaces; check what was pasted');
  if (name === 'CRM_SUPABASE_URL' && !/^https:\/\/[\w.-]+$/.test(v.replace(/\/+$/, ''))) throw new Error('Use the project URL, like https://abcd.supabase.co');
  const now = new Date().toISOString();
  await run(`INSERT INTO app_keys (name, value_enc, last4, updated_at) VALUES (:name, :enc, :last4, :now)
    ON CONFLICT (name) DO UPDATE SET value_enc = EXCLUDED.value_enc, last4 = EXCLUDED.last4, updated_at = EXCLUDED.updated_at`,
  { name, enc: encrypt(v), last4: d.plain ? '' : tail(v), now });
  await loadKeys({ force: true });
  return { ok: true };
}

export async function removeKey(name) {
  if (!DEF[name]) throw new Error('Unknown key');
  await run(`DELETE FROM app_keys WHERE name = :name`, { name });
  await loadKeys({ force: true });
  return { ok: true, source: SERVER_ENV[name] ? 'server' : null };
}

/** A new random secret for a gen key. The value is returned once, so it can be copied (e.g. into the CRM SQL). */
export async function generateKey(name) {
  if (!DEF[name]?.gen) throw new Error('This key cannot be generated');
  const value = crypto.randomBytes(32).toString('base64url');
  await saveKey(name, value);
  return { ok: true, value };
}

/**
 * Saves a GitHub Actions repo secret (sealed with the repo's public key, as GitHub requires).
 * from = an AxiFlow key whose value is copied (CLAUDE_WORKER_SECRET → AXIFLOW_CALLBACK_SECRET), or value = pasted
 * (CLAUDE_CODE_OAUTH_TOKEN, which AxiFlow never stores). Needs a token with Secrets read and write.
 */
export async function saveGithubSecret({ secret, from, value }) {
  const ALLOWED = ['AXIFLOW_CALLBACK_SECRET', 'CRON_SECRET', 'CLAUDE_CODE_OAUTH_TOKEN'];
  if (!ALLOWED.includes(secret)) throw new Error('This GitHub secret cannot be set from here');
  const v = from ? process.env[from] : String(value || '').trim();
  if (!v) throw new Error(from ? `${from} is not set yet` : 'Paste the value first');
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) throw new Error('Add the GitHub token first');
  const repo = (await import('./settings.js')).getSettings().claude?.github_repo;
  const apiBase = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const h = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'axiflow', 'content-type': 'application/json' };
  const pk = await fetch(`${apiBase}/repos/${repo}/actions/secrets/public-key`, { headers: h, signal: AbortSignal.timeout(10000) });
  if (!pk.ok) throw new Error(pk.status === 403 || pk.status === 404 ? 'The GitHub token cannot manage secrets: give it "Secrets: read and write" for this repo' : `GitHub answered ${pk.status}`);
  const { key, key_id } = await pk.json();
  const sodium = (await import('libsodium-wrappers')).default;
  await sodium.ready;
  const sealed = sodium.crypto_box_seal(sodium.from_string(v), sodium.from_base64(key, sodium.base64_variants.ORIGINAL));
  const r = await fetch(`${apiBase}/repos/${repo}/actions/secrets/${secret}`, { method: 'PUT', headers: h, body: JSON.stringify({ encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id }), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`GitHub answered ${r.status} while saving ${secret}`);
  await setGithubSeen(secret);
  return { ok: true };
}
async function setGithubSeen(secret) {
  const { getState, setState } = await import('./settings.js');
  const st = await getState('github_secrets', {});
  st[secret] = new Date().toISOString();
  await setState('github_secrets', st);
}

/** Live test of an AI key: a tiny request that costs (almost) nothing. */
export async function testAiKey(provider) {
  const t0 = Date.now();
  try {
    if (provider === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('Not set');
      const r = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(r.status === 401 ? 'Anthropic says the key is invalid' : `Anthropic answered ${r.status}`);
      return { ok: true, detail: 'Anthropic accepted the key', ms: Date.now() - t0 };
    }
    if (provider === 'stock') { const r = await (await import('./images.js')).testStock(); return { ...r, ms: Date.now() - t0 }; }
    throw new Error('Unknown provider');
  } catch (e) { return { ok: false, detail: e.message, ms: Date.now() - t0 }; }
}

export const githubSecretsSeen = async () => (await (await import('./settings.js')).getState('github_secrets', {}));
export const hasAppKey = async (name) => !!(await get(`SELECT 1 FROM app_keys WHERE name = :name`, { name }));
