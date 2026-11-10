import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ready } from './db.js';
import { seedDefaults, loadSettings } from './settings.js';
import { loadKeys } from './keys.js';
import { api } from './web/api.js';
import { pub } from './web/public.js';
import { cronTick } from './scheduler.js';
import { seedTemplates } from './design/templates.js';

/*
 * The Express app, shared by the local server (src/server.js) and Vercel (api/index.js).
 * Every request first makes sure the database is set up (once per process) and refreshes the
 * settings copy, so serverless instances never serve stale settings.
 */
let booted = null;
export function boot() {
  if (!booted) booted = (async () => { await ready(); await seedDefaults(); await seedTemplates(); })().catch((e) => { booted = null; throw e; });
  return booted;
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));
// @font-face for the classic typefaces (src/design/fonts.js); the template fonts are in styles.css
app.get('/fonts.css', async (_req, res) => {
  const { EXTRA_FONTS } = await import('./design/fonts.js');
  res.type('text/css').set('cache-control', 'public, max-age=86400').send(Object.values(EXTRA_FONTS).map((f) => `@font-face { font-family: "${f.family}"; font-weight: ${f.weight}; src: url(/fonts/${f.file}) format('truetype'); font-display: block; }`).join('\n'));
});
// Fonts of imported PDF templates (src/design/user-fonts.js): public like the other fonts (the code is a hash), so the
// editor's @font-face also loads them through the CRM's proxy
app.get('/fonts/x/:code', async (req, res) => {
  const f = await (await import('./design/user-fonts.js')).fontFile(req.params.code).catch(() => null);
  if (!f) return res.status(404).end();
  res.type(f.type).set('cache-control', 'public, max-age=31536000, immutable').send(f.buf);
});
app.use('/fonts', express.static(path.join(ROOT, 'assets', 'fonts'), { maxAge: '7d' }));
app.use(express.static(path.join(ROOT, 'public')));
// AxiCore 2.0: the same tools app on the team CRM's own address (the CRM proxies /axicore-app/ here), signed in with
// the CRM login. `embedded` switches app.js to the CRM token and adds the way back to the CRM.
app.get(['/axicore-app', '/axicore-app/', '/axicore-app/index.html'], (_req, res) => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
    .replace('<html', '<html class="embedded"').replace('href="/styles.css"', 'href="/axicore-app/styles.css"').replace('src="/app.js"', 'src="/axicore-app/app.js"')
    .replace('<title>AxiFlow</title>', '<title>AxiCore 2.0</title>').replace('<span class="crumb-app">AxiFlow</span>', '<span class="crumb-app">AxiCore 2.0</span>').replace('<div class="p-name">AxiFlow</div>', '<div class="p-name">AxiCore 2.0</div>');
  res.set('cache-control', 'no-store').type('html').send(html);
});
app.use('/axicore-app', express.static(path.join(ROOT, 'public')));

app.use(async (req, res, next) => {
  try { await boot(); await loadSettings(); await loadKeys(); next(); } catch (e) {
    console.error('[boot]', e.message);
    const msg = /DATABASE_URL/.test(e.message) ? e.message : `Cannot reach the database: ${e.message}`;
    if (req.path.startsWith('/api/')) return res.status(503).json({ error: msg });
    res.status(503).type('html').send(`<!doctype html><meta name=viewport content="width=device-width"><title>AxiFlow setup</title><body style="font:16px/1.6 system-ui;background:#0a0a0b;color:#eee;display:grid;place-items:center;min-height:90vh;margin:0"><div style="max-width:560px;padding:24px"><h1 style="font-size:22px">AxiFlow is almost ready</h1><p>${msg.replace(/[<>&]/g, '')}</p></div>`);
  }
});

/**
 * Scheduler endpoint. Vercel Cron calls it with "Authorization: Bearer $CRON_SECRET"; an external pinger
 * (cron-job.org, GitHub Actions) can use ?key=$CRON_SECRET. Runs the daily run when it is due, otherwise a sweep.
 */
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
app.get('/api/cron/tick', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const given = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.query.key || '';
  if (!secret || !safeEqual(given, secret)) return res.status(401).json({ error: 'Unauthorized' });
  (await import('./integrations.js')).seen('cron_tick');
  res.json(await cronTick());
});

const jsonBody = express.json({ limit: '4mb' });
const OWN_LIMIT = ['/api/design/templates/import', '/api/design/images']; // these parse their own bodies
app.use((req, res, next) => (OWN_LIMIT.includes(req.path) ? next() : jsonBody(req, res, next)));
app.use(pub);
app.use('/api', api);
app.use((err, _req, res, _next) => {
  console.error('[app]', err);
  if (!res.headersSent) res.status(500).json({ error: err.message || 'Server error' });
});

export default app;
