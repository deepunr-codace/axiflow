import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const TTL_MS = 7 * 24 * 3600e3;

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}

export function login(req, res) {
  if (!safeEqual(req.body?.password || '', PASSWORD)) return res.status(401).json({ error: 'Wrong password' });
  const exp = String(Date.now() + TTL_MS);
  const secure = (process.env.BASE_URL || '').startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${exp}.${sign(exp)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}${secure}`);
  res.json({ ok: true });
}

export function logout(_req, res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
}

export function isAuthed(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return false;
  const [exp, sig] = sid.split('.');
  return !!sig && safeEqual(sig, sign(exp)) && Number(exp) > Date.now();
}

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Not logged in' });
}

/** Constant-time check of a shared secret sent in a header. */
export function checkSecret(provided, expected) {
  return !!expected && !!provided && safeEqual(provided, expected);
}

/** Tiny fixed-window rate limiter for public endpoints. */
export function rateLimit({ windowMs = 60000, max = 20 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) hits.set(key, { start: now, n: 1 });
    else if (++h.n > max) return res.status(429).send('Too many requests, please try again in a minute.');
    if (hits.size > 5000) hits.clear();
    next();
  };
}
