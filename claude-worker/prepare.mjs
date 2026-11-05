// Splits the dispatch payload: work/job.json (what Claude reads) and work/meta.json (callback details, not for Claude).
import fs from 'node:fs';
const dir = new URL('./work/', import.meta.url);
const p = JSON.parse(fs.readFileSync(new URL('payload.json', dir), 'utf8'));
if (!p?.job?.schema || !p.doc_id || !p.token || !p.callback) throw new Error('payload is missing job, doc_id, token or callback');
fs.writeFileSync(new URL('job.json', dir), JSON.stringify(p.job, null, 2));
fs.writeFileSync(new URL('meta.json', dir), JSON.stringify({ doc_id: p.doc_id, token: p.token, callback: p.callback, kind: p.kind || p.job.kind }));
fs.rmSync(new URL('payload.json', dir));
console.log(`job ready: ${p.job.kind}`);
