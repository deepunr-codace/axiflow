import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDefaults, getSettings } from './settings.js';
import { api } from './web/api.js';
import { pub } from './web/public.js';
import { startScheduler } from './scheduler.js';
import { channelStatus } from './pipeline/channels.js';
import { BASE_URL } from './util.js';
import { resumeDocs } from './tools.js';
import { seedTemplates } from './design/templates.js';

seedDefaults();
seedTemplates();
resumeDocs();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const jsonBody = express.json({ limit: '2mb' });
const OWN_LIMIT = ['/api/design/templates/import', '/api/design/images']; // large uploads use their own limits
app.use((req, res, next) => (OWN_LIMIT.includes(req.path) ? next() : jsonBody(req, res, next)));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(pub);
app.use('/api', api);
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')));
app.use('/fonts', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts'), { maxAge: '7d' }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  const ch = channelStatus(getSettings());
  console.log(`\n  AxiFlow running → ${BASE_URL}`);
  console.log(`  Public lead form     → ${BASE_URL}/f`);
  console.log(`  Channels: email=${ch.email}, whatsapp=${ch.whatsapp}`);
  if (!process.env.ADMIN_PASSWORD) console.log('  ⚠  ADMIN_PASSWORD not set; login password is "admin"');
  console.log('');
  if (process.env.SCHEDULER !== 'off') startScheduler();
});
