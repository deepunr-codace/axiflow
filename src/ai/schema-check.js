/**
 * A small JSON-schema check for the subset the Claude jobs use (object, required, additionalProperties, array, string,
 * integer, number, boolean, enum, null, anyOf, type lists). Dependency-free: used by the GitHub worker's validator
 * (claude-worker/validate.mjs) and by the API engines when they ask for JSON text instead of strict structured output
 * (src/claude-worker.js runOnApi). Returns a list of problems; empty = OK.
 */
export function checkSchema(v, s, path = '$', out = []) {
  if (!s) return out;
  if (s.anyOf) {
    const ok = s.anyOf.some((alt) => checkSchema(v, alt, path, []).length === 0);
    if (!ok) out.push(`${path}: does not match any allowed form${v === null ? ' (null not allowed here)' : ''}`);
    return out;
  }
  const t = s.type;
  if (Array.isArray(t)) { if (!t.some((x) => checkSchema(v, { ...s, type: x }, path, []).length === 0)) out.push(`${path}: should be ${t.join(' or ')}`); return out; }
  if (t === 'null') { if (v !== null) out.push(`${path}: should be null`); return out; }
  if (t === 'string') { if (typeof v !== 'string') out.push(`${path}: should be a string`); else if (s.enum && !s.enum.includes(v)) out.push(`${path}: should be one of ${s.enum.join(', ')}`); return out; }
  if (t === 'integer') { if (!Number.isInteger(v)) out.push(`${path}: should be a whole number`); else if (s.enum && !s.enum.includes(v)) out.push(`${path}: should be one of ${s.enum.join(', ')}`); return out; }
  if (t === 'number') { if (typeof v !== 'number') out.push(`${path}: should be a number`); return out; }
  if (t === 'boolean') { if (typeof v !== 'boolean') out.push(`${path}: should be true or false`); return out; }
  if (t === 'array') { if (!Array.isArray(v)) out.push(`${path}: should be a list`); else v.forEach((x, i) => checkSchema(x, s.items, `${path}[${i}]`, out)); return out; }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { out.push(`${path}: should be an object`); return out; }
    for (const k of s.required || []) if (!(k in v)) out.push(`${path}.${k}: missing`);
    if (s.additionalProperties === false) for (const k of Object.keys(v)) if (!(k in (s.properties || {}))) out.push(`${path}.${k}: not allowed`);
    for (const [k, sub] of Object.entries(s.properties || {})) if (k in v) checkSchema(v[k], sub, `${path}.${k}`, out);
  }
  return out;
}
