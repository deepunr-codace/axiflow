import fs from 'node:fs';
import path from 'node:path';
import { registerSchema, addColumns, get, all, insert, update, run } from '../db.js';
import { nowISO } from '../util.js';
import { cleanDesign, cloneDesign, saveDataUrl, newId, UPLOADS } from './model.js';

/*
 * Design templates for the brochure / proposal tools.
 *  mode 'smart' → built-in layout (src/design/layouts.js) driven by structured AI copy
 *  mode 'fixed' → a stored design (imported from a PDF or saved from a document);
 *                 the AI rewrites its text boxes for each client.
 */
registerSchema(`
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
// Deleted built-in templates are hidden, not removed (owner, 2026-11-12: "add delete option for each template"):
// the seeding re-adds a missing built-in row at every start, and documents made with it keep their template.
addColumns('design_templates', { hidden_at: 'TEXT' });

const parse = (j) => { try { return j ? JSON.parse(j) : null; } catch { return null; } };

export async function seedTemplates() {
  await run(`UPDATE design_templates SET name = REPLACE(name, 'Axilume', 'Codeace') WHERE source = 'builtin' AND name LIKE 'Axilume%'`); // agency renamed 2026-11-04
  // Codeace Growth Deck (owner's brochure template, 2026-11-05): added once and made the default brochure template.
  if (!await get(`SELECT 1 FROM design_templates WHERE kind = 'brochure' AND source = 'builtin-deck'`)) {
    const now = nowISO();
    const id = await insert('design_templates', { kind: 'brochure', name: 'Codeace Growth Deck', mode: 'smart', source: 'builtin-deck', is_default: 0, created_at: now, updated_at: now });
    await run(`UPDATE design_templates SET is_default = CASE WHEN id = :id THEN 1 ELSE 0 END WHERE kind = 'brochure'`, { id });
  }
  // Codeace Editorial (the editorial design of the owner's template package, 2026-11-05): added once, default unchanged.
  if (!await get(`SELECT 1 FROM design_templates WHERE kind = 'brochure' AND source = 'builtin-editorial'`)) {
    const now = nowISO();
    await insert('design_templates', { kind: 'brochure', name: 'Codeace Editorial', mode: 'smart', source: 'builtin-editorial', is_default: 0, created_at: now, updated_at: now });
  }
  // "Claude designs (no template)" (owner, 2026-11-05): Claude Code lays out every slide itself (src/ai/claude-freeform.js).
  if (!await get(`SELECT 1 FROM design_templates WHERE kind = 'brochure' AND source = 'builtin-claude'`)) {
    const now = nowISO();
    await insert('design_templates', { kind: 'brochure', name: 'Claude designs (no template)', mode: 'smart', source: 'builtin-claude', is_default: 0, created_at: now, updated_at: now });
  }
  // Codeace Signature (owner, 2026-11-10: premium brochures, one look per website package): added once, default unchanged.
  for (const [source, name] of [['builtin-signature-precision', 'Codeace Precision'], ['builtin-signature-mono', 'Codeace Mono'], ['builtin-signature-bold', 'Codeace Bold'], ['builtin-signature-commerce', 'Codeace Commerce'], ['builtin-growth', 'Codeace Business Website']]) {
    if (await get(`SELECT 1 FROM design_templates WHERE kind = 'brochure' AND source = :source`, { source })) continue;
    const now = nowISO();
    await insert('design_templates', { kind: 'brochure', name, mode: 'smart', source, is_default: 0, created_at: now, updated_at: now });
  }
  // Two server instances starting together both added the rows (seen live, 2026-11-10): keep the oldest of each.
  await run(`UPDATE docs SET template_id = (SELECT MIN(k.id) FROM design_templates k WHERE k.source = (SELECT d.source FROM design_templates d WHERE d.id = docs.template_id))
    WHERE template_id IN (SELECT a.id FROM design_templates a JOIN design_templates b ON b.source = a.source AND b.id < a.id WHERE a.source LIKE 'builtin-signature-%' OR a.source = 'builtin-growth')`);
  await run(`DELETE FROM design_templates WHERE (source LIKE 'builtin-signature-%' OR source = 'builtin-growth') AND id NOT IN (SELECT MIN(id) FROM design_templates WHERE source LIKE 'builtin-signature-%' OR source = 'builtin-growth' GROUP BY source)`);
  for (const kind of ['brochure', 'proposal']) {
    if (!await get(`SELECT 1 FROM design_templates WHERE kind = :kind AND mode = 'smart' AND source = 'builtin'`, { kind })) {
      const now = nowISO();
      const anyDefault = await get(`SELECT 1 FROM design_templates WHERE kind = :kind AND is_default = 1`, { kind });
      await insert('design_templates', { kind, name: kind === 'brochure' ? 'Codeace Default Brochure' : 'Codeace Default Proposal', mode: 'smart', source: 'builtin', is_default: anyDefault ? 0 : 1, created_at: now, updated_at: now });
    }
  }
}

export const listTemplates = async (kind) => await all(
  `SELECT id, kind, name, mode, source, is_default, sample_company, created_at, updated_at FROM design_templates WHERE kind = :kind AND hidden_at IS NULL ORDER BY is_default DESC, id`, { kind },
);

export async function getTemplate(id) {
  const t = await get(`SELECT * FROM design_templates WHERE id = :id`, { id });
  return t ? { ...t, design: parse(t.design_json) } : null;
}

export async function defaultTemplate(kind) {
  return await getTemplate((await get(`SELECT id FROM design_templates WHERE kind = :kind AND hidden_at IS NULL ORDER BY is_default DESC, id LIMIT 1`, { kind }))?.id);
}

export async function setDefault(id) {
  const t = await getTemplate(id);
  if (!t || t.hidden_at) throw new Error('Template not found');
  await run(`UPDATE design_templates SET is_default = CASE WHEN id = :id THEN 1 ELSE 0 END WHERE kind = :kind`, { id, kind: t.kind });
}

export async function renameTemplate(id, name) {
  const n = String(name || '').trim().slice(0, 80);
  if (!n) throw new Error('Name is required');
  await update('design_templates', id, { name: n, updated_at: nowISO() });
}

export async function deleteTemplate(id) {
  const t = await getTemplate(id);
  if (!t || t.hidden_at) return;
  const left = await get(`SELECT COUNT(*)::int AS n FROM design_templates WHERE kind = :kind AND hidden_at IS NULL AND id <> :id`, { kind: t.kind, id });
  if (!left?.n) throw new Error(`This is the last ${t.kind} template: add or import another one first`);
  if (t.mode === 'fixed') {
    await run(`DELETE FROM design_templates WHERE id = :id`, { id });
    fs.rmSync(path.join(UPLOADS, 'templates', String(id)), { recursive: true, force: true });
  } else {
    // built-in (smart / html): hidden, so it is not seeded again and its documents keep their layout
    await run(`UPDATE design_templates SET hidden_at = :now, is_default = 0 WHERE id = :id`, { id, now: nowISO() });
  }
  if (t.is_default) await seedDefaultAfterDelete(t.kind);
}
async function seedDefaultAfterDelete(kind) {
  const first = await get(`SELECT id FROM design_templates WHERE kind = :kind AND hidden_at IS NULL ORDER BY mode = 'html' DESC, mode = 'smart' DESC, id LIMIT 1`, { kind });
  if (first) await setDefault(first.id);
}

/** "Save as template" from a document's current design. */
export async function saveAsTemplate({ kind, name, design, company }) {
  const now = nowISO();
  const d = cloneDesign(cleanDesign(design));
  if (company) {
    const esc = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const p of d.pages) for (const e of p.elements) if (e.type === 'text') e.text = e.text.replace(new RegExp(esc, 'gi'), '{{company}}');
  }
  return await insert('design_templates', { kind, name: String(name || 'My template').slice(0, 80), mode: 'fixed', design_json: d, sample_company: '', source: 'saved', created_at: now, updated_at: now });
}

/**
 * Import from a PDF converted in the browser: each page arrives as a text-free background
 * image (data URL) plus the text boxes found on it.
 */
export async function importTemplate({ kind, name, sample_company, pages }) {
  if (!['brochure', 'proposal'].includes(kind)) throw new Error('Choose brochure or proposal');
  if (!Array.isArray(pages) || !pages.length || pages.length > 60) throw new Error('No pages found in the PDF');
  const now = nowISO();
  const id = await insert('design_templates', { kind, name: String(name || 'Imported template').slice(0, 80), mode: 'fixed', design_json: { pages: [] }, sample_company: String(sample_company || '').slice(0, 120), source: 'pdf', created_at: now, updated_at: now });
  try {
    const out = [];
    for (const [i, p] of pages.entries()) {
      const bg = !p.bg ? '' : /^upload:images\/[\w-]+\.(jpg|png)$/.test(p.bg) ? p.bg : await saveDataUrl(p.bg, `templates/${id}`, `page-${i + 1}`);
      out.push({ id: newId(), w: p.w, h: p.h, bg: { color: '#ffffff', image: bg }, elements: (p.elements || []).map((e) => ({ ...e, id: newId() })) });
    }
    await update('design_templates', id, { design_json: cleanDesign({ pages: out }), updated_at: nowISO() });
  } catch (e) {
    await run(`DELETE FROM design_templates WHERE id = :id`, { id });
    fs.rmSync(path.join(UPLOADS, 'templates', String(id)), { recursive: true, force: true });
    throw e;
  }
  return id;
}
