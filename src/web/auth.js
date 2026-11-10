import crypto from 'node:crypto';

// On a public deployment the defaults are not allowed: login stays closed until both are set.
const HOSTED = !!process.env.VERCEL;
const SECRET = process.env.SESSION_SECRET || (HOSTED ? '' : 'dev-secret-change-me');
const PASSWORD = process.env.ADMIN_PASSWORD || (HOSTED ? '' : 'admin');
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
  if (!SECRET || !PASSWORD) return res.status(503).json({ error: 'Login is not set up: add ADMIN_PASSWORD and SESSION_SECRET in Vercel > Settings > Environment Variables, then redeploy.' });
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
  if (!SECRET) return false;
  const sid = parseCookies(req).sid;
  if (!sid) return false;
  const [exp, sig] = sid.split('.');
  return !!sig && safeEqual(sig, sign(exp)) && Number(exp) > Date.now();
}

/*
 * AxiCore 2.0 inside the live team CRM (owner, 2026-11-10: "move our axiflow to crm app like in our combined system").
 * The CRM (atomic-crm-flame.vercel.app) proxies /api, /axicore-app, /pdf … to this app, so the tools run on the CRM's
 * own address. The CRM login is the login there: the tools page sends the user's CRM Supabase access token
 * (Authorization: Bearer); we ask the CRM's Supabase who it is and read the role from its sales table.
 * Roles in AXICORE_ROLES (default "admin": the live CRM has admin / manager / bde, no new role is added) get the
 * tools, settings and keys; every other active CRM user may only read documents (OPEN_ROUTES).
 * The AxiFlow password login (cookie) keeps working as before.
 */
const crmConf = () => ({
  url: (process.env.CRM_SUPABASE_URL || '').replace(/\/+$/, ''),
  key: process.env.CRM_SUPABASE_SECRET_KEY || '',
  pub: process.env.CRM_SUPABASE_PUBLISHABLE_KEY || process.env.CRM_SUPABASE_SECRET_KEY || '',
});
export const axicoreRoles = () => String(process.env.AXICORE_ROLES || 'admin').split(',').map((x) => x.trim()).filter(Boolean);
const userCache = new Map();
async function crmUser(token) {
  const hit = userCache.get(token);
  if (hit && hit.at > Date.now() - 60000) return hit.user;
  const { url, pub, key } = crmConf();
  if (!url || !pub || !key) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: pub, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id) return null;
  const s = await fetch(`${url}/rest/v1/sales?select=id,first_name,last_name,email,role,administrator,disabled&user_id=eq.${encodeURIComponent(u.id)}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
  const sale = s.ok ? (await s.json())[0] : null;
  const user = sale && !sale.disabled ? { sale_id: sale.id, name: `${sale.first_name || ''} ${sale.last_name || ''}`.trim() || sale.email, email: sale.email, role: sale.role || (sale.administrator ? 'admin' : 'manager') } : null;
  userCache.set(token, { at: Date.now(), user });
  if (userCache.size > 500) userCache.clear();
  return user;
}

/** Who is calling: { name, role, sale_id? } or null. */
export async function currentUser(req) {
  if (isAuthed(req)) return { name: 'AxiFlow admin', role: axicoreRoles()[0] || 'admin', legacy: true };
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token && token.split('.').length === 3) { try { const u = await crmUser(token); if (u) return u; } catch { /* CRM unreachable */ } }
  return null;
}

/** Routes every signed-in CRM user may use (documents on their leads). Everything else needs an AxiCore role. */
const OPEN_ROUTES = [/^GET \/me$/, /^GET \/axicore\/company\/\d+\/docs$/, /^GET \/tools\/docs\/\d+\/pdf$/];
export async function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  const user = await currentUser(req).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user;
  const open = OPEN_ROUTES.some((re) => re.test(`${req.method} ${req.path}`));
  if (!open && !axicoreRoles().includes(user.role)) return res.status(403).json({ error: 'AxiCore 2.0 is only for CRM admins' });
  next();
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
