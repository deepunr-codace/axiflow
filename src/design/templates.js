import fs from 'node:fs';
import path from 'node:path';
import { db, get, all, insert, update, run } from '../db.js';
import { nowISO } from '../util.js';
import { cleanDesign, cloneDesign, saveDataUrl, newId, UPLOADS } from './model.js';

/*
 * Design templates for the brochure / proposal tools.
 *  mode 'smart' → built-in layout (src/design/layouts.js) driven by structured AI copy
 *  mode 'fixed' → a stored design (imported from a PDF or saved from a document);
 *                 the AI rewrites its text boxes for each client.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS design_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  design_json TEXT,
  sample_company TEXT,
  source TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`);

const parse = (j) => { try { return j ? JSON.parse(j) : null; } catch { return null; } };

export function seedTemplates() {
  for (const kind of ['brochure', 'proposal']) {
    if (!get(`SELECT 1 FROM design_templates WHERE kind = :kind AND mode = 'smart'`, { kind })) {
      const now = nowISO();
      const anyDefault = get(`SELECT 1 FROM design_templates WHERE kind = :kind AND is_default = 1`, { kind });
      insert('design_templates', { kind, name: kind === 'brochure' ? 'Axilume Default Brochure' : 'Axilume Default Proposal', mode: 'smart', source: 'builtin', is_default: anyDefault ? 0 : 1, created_at: now, updated_at: now });
    }
  }
}

export const listTemplates = (kind) => all(
  `SELECT id, kind, name, mode, source, is_default, sample_company, created_at, updated_at FROM design_templates WHERE kind = :kind ORDER BY is_default DESC, id`, { kind },
);

export function getTemplate(id) {
  const t = get(`SELECT * FROM design_templates WHERE id = :id`, { id });
  return t ? { ...t, design: parse(t.design_json) } : null;
}

export function defaultTemplate(kind) {
  return getTemplate(get(`SELECT id FROM design_templates WHERE kind = :kind ORDER BY is_default DESC, id LIMIT 1`, { kind })?.id);
}

export function setDefault(id) {
  const t = getTemplate(id);
  if (!t) throw new Error('Template not found');
  run(`UPDATE design_templates SET is_default = CASE WHEN id = :id THEN 1 ELSE 0 END WHERE kind = :kind`, { id, kind: t.kind });
}

export function renameTemplate(id, name) {
  const n = String(name || '').trim().slice(0, 80);
  if (!n) throw new Error('Name is required');
  update('design_templates', id, { name: n, updated_at: nowISO() });
}

export function deleteTemplate(id) {
  const t = getTemplate(id);
  if (!t) return;
  if (t.mode === 'smart') throw new Error('The built-in template cannot be deleted');
  run(`DELETE FROM design_templates WHERE id = :id`, { id });
  fs.rmSync(path.join(UPLOADS, 'templates', String(id)), { recursive: true, force: true });
  if (t.is_default) seedDefaultAfterDelete(t.kind);
}
function seedDefaultAfterDelete(kind) {
  const first = get(`SELECT id FROM design_templates WHERE kind = :kind ORDER BY mode = 'smart' DESC, id LIMIT 1`, { kind });
  if (first) setDefault(first.id);
}

/** "Save as template" from a document's current design. */
export function saveAsTemplate({ kind, name, design, company }) {
  const now = nowISO();
  const d = cloneDesign(cleanDesign(design));
  if (company) {
    const esc = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const p of d.pages) for (const e of p.elements) if (e.type === 'text') e.text = e.text.replace(new RegExp(esc, 'gi'), '{{company}}');
  }
  return insert('design_templates', { kind, name: String(name || 'My template').slice(0, 80), mode: 'fixed', design_json: d, sample_company: '', source: 'saved', created_at: now, updated_at: now });
}

/**
 * Import from a PDF converted in the browser: each page arrives as a text-free background
 * image (data URL) plus the text boxes found on it.
 */
export function importTemplate({ kind, name, sample_company, pages }) {
  if (!['brochure', 'proposal'].includes(kind)) throw new Error('Choose brochure or proposal');
  if (!Array.isArray(pages) || !pages.length || pages.length > 60) throw new Error('No pages found in the PDF');
  const now = nowISO();
  const id = insert('design_templates', { kind, name: String(name || 'Imported template').slice(0, 80), mode: 'fixed', design_json: { pages: [] }, sample_company: String(sample_company || '').slice(0, 120), source: 'pdf', created_at: now, updated_at: now });
  try {
    const out = pages.map((p, i) => ({
      id: newId(), w: p.w, h: p.h,
      bg: { color: '#ffffff', image: p.bg ? saveDataUrl(p.bg, `templates/${id}`, `page-${i + 1}`) : '' },
      elements: (p.elements || []).map((e) => ({ ...e, id: newId() })),
    }));
    update('design_templates', id, { design_json: cleanDesign({ pages: out }), updated_at: nowISO() });
  } catch (e) {
    run(`DELETE FROM design_templates WHERE id = :id`, { id });
    fs.rmSync(path.join(UPLOADS, 'templates', String(id)), { recursive: true, force: true });
    throw e;
  }
  return id;
}
