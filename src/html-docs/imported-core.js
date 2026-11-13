/*
 * Imported HTML templates (owner, 2026-11-13: "add option to upload html files too in template import"): the pure part,
 * shared by AxiFlow (src/html-docs/imported.js) and the GitHub runner's validator (claude-worker/validate.mjs), so it
 * has no imports.
 *
 * A template's text blocks ("slots") are written in a light markup that keeps the original styling:
 *   "\n"          a line break (<br>)
 *   <3> … </3>    the 3rd inline element of the block (a bold word, a coloured span), around other words
 *   <3/>          an empty decoration (coloured dots, an icon box) that stays where it is
 * Anything else is plain text.
 */
export const TOKEN = /<(\/?)(\d{1,3})(\/?)>/g;
export const visible = (t) => String(t ?? '').replace(TOKEN, '');

/** The most characters a block may take: a little more than the template's own text (its box is fixed). */
export const maxLen = (len) => (len <= 12 ? len + 8 : Math.ceil(len * (len <= 60 ? 1.25 : 1.15)));

/** Words that must not be left anywhere (the sample client's name and place), as case-insensitive whole-word tests. */
export function leftovers(text, words) {
  const v = visible(text);
  return (words || []).filter((w) => w && new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(v));
}

/**
 * The answer's texts checked against the job (imported = { words, must, max, lines, li }): problems as plain lines, for
 * the runner's repair round and for AxiFlow's acceptance. must = the ids whose template text names the sample client.
 */
export function importedProblems(result, imported) {
  const out = [];
  const given = new Map();
  for (const t of Array.isArray(result?.texts) ? result.texts : []) if (t && typeof t.id === 'string') given.set(t.id, String(t.text ?? ''));
  const known = new Set(Object.keys(imported?.max || {}));
  const unknown = [...given.keys()].filter((id) => !known.has(id));
  if (unknown.length) out.push(`texts: unknown ids ${unknown.slice(0, 10).join(', ')} (use only the ids of <template_texts>)`);
  const missing = (imported?.must || []).filter((id) => !given.has(id));
  if (missing.length) out.push(`texts: these blocks still describe the sample client and must be rewritten for this business: ${missing.slice(0, 30).join(', ')}`);
  for (const [id, text] of given) {
    if (!known.has(id)) continue;
    const left = leftovers(text, imported.words);
    if (left.length) out.push(`texts ${id}: still names the sample client (${left.join(', ')}): write it for this business`);
    if (!visible(text).trim() && !(imported.li || []).includes(id)) out.push(`texts ${id}: empty (only list items may be empty)`);
    const max = imported.max[id];
    if (max && visible(text).length > max) out.push(`texts ${id}: ${visible(text).length} characters; keep it to ${max}`);
  }
  return out;
}

/** Cuts a block's text to max visible characters at the last whole word, keeping its markers balanced. */
export function cutMarked(text, max) {
  if (visible(text).length <= max) return text;
  const parts = String(text).split(/(<\/?\d{1,3}\/?>)/);
  let out = '', used = 0;
  const open = [];
  for (const p of parts) {
    if (/^<\/?\d{1,3}\/?>$/.test(p)) {
      if (used >= max) break;
      out += p;
      const m = /^<(\/?)(\d+)(\/?)>$/.exec(p);
      if (!m[3]) { if (m[1]) open.splice(open.lastIndexOf(m[2]), 1); else open.push(m[2]); }
      continue;
    }
    if (used + p.length <= max) { out += p; used += p.length; continue; }
    const room = max - used;
    const head = p.slice(0, room);
    const sp = /\s/.test(p[room] || '') ? room : Math.max(head.lastIndexOf(' '), head.lastIndexOf('\n'));
    out += (sp > 0 ? head.slice(0, sp) : used ? '' : head).replace(/[\s,;:—–-]+$/, '');
    used = max;
    break;
  }
  for (const i of open.reverse()) out += `</${i}>`;
  return out.replace(/[\s,;:—–-]+((?:<\/\d+>)*)$/, '$1');
}

/** At most the template's number of line breaks: extra breaks (from the end) become spaces. */
export function fitLines(text, lines) {
  let extra = (String(text).match(/\n/g) || []).length - (lines || 0);
  if (extra <= 0) return text;
  const chars = [...String(text)];
  for (let i = chars.length - 1; i >= 0 && extra > 0; i--) if (chars[i] === '\n') { chars[i] = ' '; extra--; }
  return chars.join('');
}
