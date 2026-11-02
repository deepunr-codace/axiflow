import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'crm.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  company TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  industry TEXT,
  city TEXT,
  country TEXT,
  source TEXT,
  service TEXT,
  budget INTEGER,
  notes TEXT,
  pitch TEXT,
  tags TEXT,
  owner TEXT,
  interested TEXT DEFAULT 'unknown',
  wa_opt_in INTEGER DEFAULT 0,
  email_opt_in INTEGER DEFAULT 0,
  consent_source TEXT,
  consent_at TEXT,
  do_not_contact INTEGER DEFAULT 0,
  email_valid INTEGER DEFAULT 0,
  phone_valid INTEGER DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'new',
  stage_changed_at TEXT,
  score INTEGER DEFAULT 0,
  score_reasons TEXT,
  audit_json TEXT,
  recommended_package TEXT,
  brochure_html TEXT,
  brochure_version INTEGER DEFAULT 0,
  brochure_status TEXT DEFAULT 'none',
  approved_by TEXT,
  approved_at TEXT,
  last_contacted_at TEXT,
  last_channel TEXT,
  last_inbound_at TEXT,
  last_inbound_channel TEXT,
  next_action_at TEXT,
  attempts INTEGER DEFAULT 0,
  lost_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_act_lead ON activities(lead_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  template_key TEXT,
  to_addr TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_lead ON messages(lead_id);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TEXT,
  done INTEGER DEFAULT 0,
  done_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  key TEXT PRIMARY KEY,
  label TEXT,
  subject TEXT,
  email_body TEXT,
  wa_body TEXT,
  wa_template_name TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  duration_min INTEGER,
  status TEXT DEFAULT 'scheduled',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  items_json TEXT NOT NULL,
  subtotal REAL, tax REAL, total REAL,
  advance_pct INTEGER,
  status TEXT DEFAULT 'sent',
  decline_reason TEXT,
  created_at TEXT NOT NULL,
  responded_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  proposal_id INTEGER REFERENCES proposals(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  number TEXT,
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  paid_at TEXT,
  payment_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  brief_json TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER,
  done INTEGER DEFAULT 0,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  workflow TEXT,
  step TEXT,
  status TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_lead ON events(lead_id);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  stats_json TEXT
);
`);

// ---- additive migrations (safe on existing databases) ----
const MIGRATIONS = {
  leads: {
    external_id: 'TEXT', pipe: "TEXT DEFAULT 'conversion'", touch_index: 'INTEGER DEFAULT 0',
    next_action_type: 'TEXT', next_action_note: 'TEXT',
    research_json: 'TEXT', pitch_json: 'TEXT', pitch_source: 'TEXT',
    design_html: 'TEXT', design_version: 'INTEGER DEFAULT 0',
    // last Twenty call-outcome / proposal-decision processed (Twenty re-sends the whole record on every update)
    crm_call_key: 'TEXT', crm_proposal_key: 'TEXT',
  },
  tasks: { kind: "TEXT DEFAULT 'todo'", notes: 'TEXT', outcome: 'TEXT' },
  messages: { attachment: 'TEXT' },
  proposals: { content_json: 'TEXT', content_source: 'TEXT' },
};
for (const [table, cols] of Object.entries(MIGRATIONS)) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [col, type] of Object.entries(cols)) if (!have.has(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
// v1 → v2: leads already in a marketing stage belong to that pipe.
db.exec(`UPDATE leads SET pipe = stage WHERE stage IN ('nurture','reengage') AND COALESCE(pipe,'conversion') = 'conversion'`);
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_external ON leads(external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ai_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  purpose TEXT,
  model TEXT,
  input_tokens INTEGER, output_tokens INTEGER, web_searches INTEGER,
  cost_usd REAL,
  ms INTEGER,
  status TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- Standalone AI tools: brochures and proposals made from a form (optionally prefilled from a lead).
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  title TEXT,
  lead_id INTEGER,
  input_json TEXT NOT NULL,
  content_json TEXT,
  items_json TEXT,
  status TEXT NOT NULL DEFAULT 'working',
  source TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

// node:sqlite cannot bind undefined/boolean - normalise params.
function clean(params) {
  if (Array.isArray(params)) return params.map(cleanValue);
  const out = {};
  for (const [k, v] of Object.entries(params || {})) out[k] = cleanValue(v);
  return out;
}
function cleanValue(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}
const plain = (row) => (row ? { ...row } : null);

export function get(sql, params = {}) {
  return plain(db.prepare(sql).get(clean(params)));
}
export function all(sql, params = {}) {
  return db.prepare(sql).all(clean(params)).map(plain);
}
export function run(sql, params = {}) {
  return db.prepare(sql).run(clean(params));
}

const columnCache = new Map();
function columns(table) {
  if (!columnCache.has(table)) {
    columnCache.set(table, new Set(all(`PRAGMA table_info(${table})`).map((c) => c.name)));
  }
  return columnCache.get(table);
}

export function insert(table, data) {
  const cols = columns(table);
  const keys = Object.keys(data).filter((k) => cols.has(k) && k !== 'id');
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((k) => ':' + k).join(',')})`;
  const params = Object.fromEntries(keys.map((k) => [k, data[k]]));
  return Number(run(sql, params).lastInsertRowid);
}

export function update(table, id, data) {
  const cols = columns(table);
  const keys = Object.keys(data).filter((k) => cols.has(k) && k !== 'id');
  if (!keys.length) return 0;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = :${k}`).join(', ')} WHERE id = :id`;
  const params = Object.fromEntries(keys.map((k) => [k, data[k]]));
  params.id = id;
  return run(sql, params).changes;
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
