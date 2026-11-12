import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { fontName, finish } from '../../public/html-convert.js';

/*
 * A Codeace HTML document → the classic editor's design (owner, 2026-11-12: "use classic editor always. but i need
 * my same pdf structure and styles"). The pages are rendered in Chromium (chrome.js) and converted there by the same
 * code the admin uses (public/html-convert.js); fonts come in through the font importer (Google Fonts by family and
 * weight, the same codes in the editor and the PDF) and pictures are saved as uploads.
 */
const CONVERTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'html-convert.js');
let script = null;
const converterScript = () => (script ??= `${fs.readFileSync(CONVERTER, 'utf8').replace(/^export /gm, '')}
window.__axConvert = { convertPages };`);

/** doc (with content.html) → { pages } in the classic design model. onlyPage = one page number (the price page). */
export async function htmlToDesign(doc, { onlyPage = null } = {}) {
  const { fitPlan, HTML_TEMPLATES } = await import('./index.js');
  const { withPage } = await import('./chrome.js');
  const { html } = await fitPlan(doc); // content that runs over is spread on more pages first
  const size = HTML_TEMPLATES[doc.content.html.template].size;
  const raw = await withPage(html, { ...size, scaleFactor: 2 }, async (page) => {
    await page.addScriptTag({ content: converterScript() });
    const r = await page.evaluate((only) => window.__axConvert.convertPages(document, { onlyPage: only, shots: true }), onlyPage);
    // boxes that clip a decoration: their background captured as a picture (children hidden while it is taken)
    const shots = {};
    for (const h of await page.$$('[data-ax-shot]')) {
      const n = await h.evaluate((e) => { for (const c of e.children) { c.dataset.axVis = c.style.visibility; c.style.visibility = 'hidden'; } return e.dataset.axShot; });
      const buf = await h.screenshot({ type: 'jpeg', quality: 88 });
      shots[`shot:${n}`] = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
      await h.evaluate((e) => { for (const c of e.children) c.style.visibility = c.dataset.axVis || ''; });
    }
    for (const p of r.pages) for (const e of p.elements) if (e.type === 'image' && shots[e.src]) e.src = shots[e.src];
    r.images.push(...Object.values(shots));
    return r;
  });
  const { resolveFont } = await import('../design/user-fonts.js');
  const { saveDataUrl } = await import('../design/model.js');
  const fontCodes = {};
  for (const k of raw.fonts) {
    const n = fontName(k);
    const r = await resolveFont({ name: n.name, bold: n.bold, italic: n.italic }).catch(() => null);
    if (r?.code && !r.builtin) fontCodes[k] = r.code;
  }
  const srcs = {};
  for (const src of raw.images) {
    // the same picture in many documents is saved once (named by its content)
    const name = crypto.createHash('sha256').update(src).digest('hex').slice(0, 16);
    try { srcs[src] = await saveDataUrl(src, 'images', name); } catch { /* left out */ }
  }
  return finish(raw, fontCodes, srcs);
}
