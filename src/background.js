/*
 * Work that continues after the response has been sent (AI generation, CRM sync, pipeline steps).
 * Locally it simply runs; on Vercel it is registered with waitUntil so the function stays alive until
 * the work finishes (up to the function's maxDuration, see vercel.json).
 */
let waitUntil = null;
if (process.env.VERCEL) {
  try { ({ waitUntil } = await import('@vercel/functions')); } catch { /* not on Vercel */ }
}

export function background(fn, label = 'background') {
  const p = Promise.resolve().then(fn).catch((e) => console.error(`[${label}]`, e?.stack || e?.message || e));
  if (waitUntil) waitUntil(p);
  return p;
}
