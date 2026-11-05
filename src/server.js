// Local / long-running server: `npm start`. On Vercel the same app is served by api/index.js.
import app, { boot } from './app.js';
import { getSettings, loadSettings } from './settings.js';
import { startScheduler } from './scheduler.js';
import { channelStatus } from './pipeline/channels.js';
import { BASE_URL } from './util.js';
import { resumeDocs } from './tools.js';
import { usingRemote } from './db.js';

await boot();
await loadSettings();
await (await import('./keys.js')).loadKeys({ force: true });
await resumeDocs();

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  const ch = channelStatus(getSettings());
  console.log(`\n  AxiFlow running → ${BASE_URL}`);
  console.log(`  Database             → ${usingRemote ? 'Postgres (DATABASE_URL)' : 'embedded Postgres in data/pg'}`);
  console.log(`  Public lead form     → ${BASE_URL}/f`);
  console.log(`  Channels: email=${ch.email}, whatsapp=${ch.whatsapp}`);
  if (!process.env.ADMIN_PASSWORD) console.log('  ⚠  ADMIN_PASSWORD not set; login password is "admin"');
  console.log('');
  if (process.env.SCHEDULER !== 'off') startScheduler();
});
