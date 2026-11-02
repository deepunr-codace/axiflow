// One-time copy of existing uploads into Supabase Storage: everything under "uploads/" in Vercel Blob
// (when BLOB_READ_WRITE_TOKEN is set) and everything in data/uploads. Safe to run again (overwrites).
//   node --env-file-if-exists=.env scripts/copy-uploads-to-supabase.js
import fs from 'node:fs';
import path from 'node:path';
import { saveUpload, usingSupabase, UPLOADS } from '../src/storage.js';

if (!usingSupabase()) { console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY first.'); process.exit(1); }
const type = (k) => (/\.png$/i.test(k) ? 'image/png' : /\.jpe?g$/i.test(k) ? 'image/jpeg' : 'application/octet-stream');
let n = 0;

if (process.env.BLOB_READ_WRITE_TOKEN) {
  const { list } = await import('@vercel/blob');
  let cursor;
  do {
    const page = await list({ prefix: 'uploads/', cursor, limit: 1000 });
    for (const b of page.blobs) {
      const key = b.pathname.replace(/^uploads\//, '');
      const r = await fetch(b.url);
      if (!r.ok) { console.log('  skip (cannot read)', key); continue; }
      await saveUpload(key, Buffer.from(await r.arrayBuffer()), type(key));
      n++;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  console.log(`  Vercel Blob: copied ${n} files`);
}

let local = 0;
const walk = async (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else { const key = path.relative(UPLOADS, p).replace(/\\/g, '/'); await saveUpload(key, fs.readFileSync(p), type(key)); local++; }
  }
};
await walk(UPLOADS);
console.log(`  data/uploads: copied ${local} files`);
console.log('Done.');
