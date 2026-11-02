import { getSettings } from '../settings.js';
import { runJson, aiEnabled, obj, str, arr } from './claude.js';
import { managerSystem } from './playbook.js';
import { describeDesign, applyOps } from '../design/model.js';

/*
 * Two AI jobs on designs:
 *  fillTemplate → rewrites every text box of a fixed template (imported/saved) for a new client
 *  chatEdit     → the editor's assistant: turns a chat request into edit operations
 */

// ------------------------------------------------------- template filling
export async function fillTemplate(design, input, { kind, sampleCompany = '', research = null }) {
  const boxes = [];
  design.pages.forEach((p, pi) => p.elements.forEach((e) => {
    if (e.type === 'text' && e.text.trim().length > 1) boxes.push({ id: e.id, page: pi + 1, chars: e.text.length, size: e.size, text: e.text.slice(0, 1200) });
  }));
  if (!aiEnabled() || !boxes.length) return { design, source: 'template' };
  const s = getSettings();
  const schema = obj({ texts: arr(obj({ id: str(), text: str() }), 'one entry per text box that should change; omit boxes to keep them unchanged') });
  try {
    const out = await runJson({
      purpose: `fill_${kind}`, effort: s.ai.effort_writing, schema, maxTokens: 24000,
      system: managerSystem(`adapt a ${kind} template for a new client`),
      prompt: `This ${kind} template was written for another client${sampleCompany ? ` ("${sampleCompany}")` : ''}. Rewrite its text boxes for the new client so the document reads as if made for them.

New client: ${input.company} · Industry: ${input.industry || 'unknown'} · City: ${input.city || 'unknown'} · Website: ${input.website || 'none'} · Contact: ${input.contact_name || 'unknown'}
${input.package ? `Package: ${input.package}` : ''}
Notes: <untrusted>${input.notes || 'none'}</untrusted>
Research: <untrusted>${research ? JSON.stringify({ summary: research.business_summary, sells: research.what_they_sell, customers: research.target_customers }) : 'none'}</untrusted>

Rules:
- Keep each box close to its original length (±15% characters) and keep line breaks where the original has them; the layout is fixed.
- Keep our agency's own facts (company description, contact details, stats, terms, prices) unchanged unless they name the old client or its industry.
- Replace the old client's name, industry and specifics with the new client's.
- Do not invent facts about the new client.

Text boxes (JSON): <untrusted>${JSON.stringify(boxes)}</untrusted>`,
    });
    const byId = new Map((out.texts || []).map((t) => [t.id, t.text]));
    const d = JSON.parse(JSON.stringify(design));
    for (const p of d.pages) for (const e of p.elements) if (byId.has(e.id) && typeof byId.get(e.id) === 'string') e.text = byId.get(e.id);
    return { design: d, source: 'ai' };
  } catch (e) {
    return { design, source: `template (AI failed: ${e.message})`.slice(0, 200) };
  }
}

// ------------------------------------------------------------- chat edits
const OP_SCHEMA = obj({
  op: { type: 'string', enum: ['set_text', 'set_props', 'delete_element', 'add_text', 'add_shape', 'set_page_bg', 'duplicate_page', 'delete_page', 'move_page', 'set_items'] },
  page: { type: 'integer', description: '1-based page number (0 if not needed)' },
  element: str('element id ("" if not needed)'),
  text: str('new text for set_text / add_text ("" otherwise)'),
  props_json: str('JSON object of properties for set_props / add_text / add_shape / set_page_bg / move_page {"to":n} / set_items {"items":[{"name","price"}]}; "{}" if not needed'),
});
const CHAT_SCHEMA = obj({ reply: str('short, friendly answer to show the user: what you changed, or a question if the request is unclear'), ops: arr(OP_SCHEMA) });

export async function chatEdit({ design, items, history, message, context }) {
  if (!aiEnabled()) return { reply: 'The AI assistant needs an API key (ANTHROPIC_API_KEY). You can still edit everything directly on the page.', ops: [], design, items, applied: 0, skipped: [] };
  const s = getSettings();
  const out = await runJson({
    purpose: 'design_chat', effort: s.ai.effort_writing, schema: CHAT_SCHEMA, maxTokens: 16000,
    system: managerSystem('edit a client brochure / proposal design on request, like a design assistant in Canva'),
    prompt: `You edit a ${context.kind} for ${context.company} by returning operations on its elements.

Coordinates are in points from the top-left of each page. Text properties: font (PR regular, PM medium, PS semibold, PB bold), size, color (#hex), align (left|center|right), lh (line height multiple), ls (letter spacing), list (""|"dot"|"icon"), x, y, w. Shapes: fill, stroke, sw, radius, opacity. Images: fit, radius, opacity (images cannot be generated). ${items ? 'The pricing table shows these line items; change prices only if the user asks, with set_items.' : ''}
Keep the design consistent: when shortening or lengthening text, keep it inside its box; prefer editing existing elements over adding new ones; never invent client facts or prices. If the request is unclear, ask in "reply" and return no ops.
The user is looking at page ${context.page}${context.selected ? ` and has selected element ${context.selected}` : ''}.

${items ? `Line items: ${JSON.stringify(items)}\n` : ''}Document (JSON): <untrusted>${JSON.stringify(describeDesign(design))}</untrusted>

Conversation so far: <untrusted>${JSON.stringify((history || []).slice(-10))}</untrusted>

User request: <untrusted>${message}</untrusted>`,
  });
  const res = applyOps(design, items, out.ops || []);
  return { reply: out.reply || 'Done.', ops: out.ops || [], ...res };
}
