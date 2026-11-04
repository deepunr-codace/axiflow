import crypto from 'node:crypto';

export const BASE_URL = (process.env.BASE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

export const nowISO = () => new Date().toISOString();
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString();
export const addMinutes = (d, n) => new Date(new Date(d).getTime() + n * 60000).toISOString();
export const isDue = (iso) => !!iso && new Date(iso).getTime() <= Date.now();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const token = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');

export function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);
  return { email: email || null, valid };
}

/** Returns E.164 (+<cc><number>) when possible. */
export function normalizePhone(raw, defaultCC = '91') {
  let s = String(raw || '').trim();
  if (!s) return { phone: null, valid: false };
  const hadPlus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!hadPlus) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = defaultCC + digits.slice(1);
    else if (digits.length === 10) digits = defaultCC + digits;
  }
  const valid = digits.length >= 10 && digits.length <= 15;
  return { phone: digits ? '+' + digits : null, valid };
}

export function normalizeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    return new URL(s).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function titleCase(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function render(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? '').toString());
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function money(n, currency = 'INR') {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `${currency} ${Math.round(n || 0)}`;
  }
}

/** Wall-clock parts of `date` in a timezone. */
export function tzParts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, weekday };
}

/** Convert a wall-clock date+time in a timezone to a UTC ISO string. */
export function zonedToUtc(dateStr, hhmm, timeZone) {
  const guess = new Date(`${dateStr}T${hhmm}:00Z`);
  const p = tzParts(guess, timeZone);
  const asIfUtc = new Date(`${p.date}T${p.hhmm}:00Z`).getTime();
  return new Date(guess.getTime() - (asIfUtc - guess.getTime())).toISOString();
}

export function formatInTz(iso, timeZone) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function toCSV(rows, cols) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
}

export const truthy = (v) => v === true || v === 1 || /^(1|true|yes|y|on)$/i.test(String(v ?? '').trim());

/** First name for greetings, skipping honorifics ("Dr. Meera Iyer" → "Meera"). */
/** First name of a contact, or fallback when the CRM contact is really the business (its name is the company name). */
export function contactFirstName(contact, company, fallback = 'there') {
  const norm = (v) => String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const c = norm(contact), co = norm(company);
  if (!c || (co && (c === co || (c.split(' ').length >= 2 && (co.includes(c) || c.includes(co)))))) return fallback;
  return firstName(contact, fallback);
}

export function firstName(full, fallback = 'there') {
  const titles = /^(dr|mr|mrs|ms|miss|prof|shri|smt|sri|er|adv|ca|sir|madam)$/i;
  return String(full || '').replace(/\./g, ' ').split(/\s+/).find((w) => w && !titles.test(w)) || fallback;
}
