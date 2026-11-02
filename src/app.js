import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ready } from './db.js';
import { seedDefaults, loadSettings } from './settings.js';
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
app.use('/fonts', express.static(path.join(ROOT, 'assets', 'fonts'), { maxAge: '7d' }));
app.use(express.static(path.join(ROOT, 'public')));

app.use(async (_req, _res, next) => {
  try { await boot(); await loadSettings(); next(); } catch (e) { next(e); }
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
