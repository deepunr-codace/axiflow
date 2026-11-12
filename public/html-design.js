/*
 * Drag and drop on the real pages of a Codeace HTML document (owner, 2026-11-12: "where is my drag n drop editor?").
 * The pages are the template's own HTML, shown full size in a scaled frame; click any text, card or picture to select
 * it, drag to move, pull the handles to resize, double-click to type, set colours, size, weight and corners in the
 * panel, hide it, or add new text, pictures and boxes. Everything is stored as edits beside the words
 * (src/html-docs/edits.js) and the PDF is printed from the same HTML, so what you see is what is sent.
 * convertToDesign() turns the rendered pages into the classic editor's design model ("Open in classic editor").
 */
import { convertPages, finish, fontName, reencode } from './html-convert.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const rgbHex = (c) => {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(c || '');
  if (!m) return { hex: null, a: 0 };
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { hex: '#' + [m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, '0')).join(''), a };
};
const EDITOR_CSS = `
[data-page]{margin:0 auto 28px!important;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 12px 36px rgba(0,0,0,.28)}
html,body{background:#1b1b1e!important}
body{padding:0!important}
[data-k]:not([data-k$=":"]):hover,[data-a]:hover{outline:1px dashed rgba(106,92,255,.75);outline-offset:1px;cursor:move}
[data-k][contenteditable],[data-a][contenteditable]{outline:2px solid #6A5CFF!important;cursor:text!important}
.hdd-sel{position:absolute;pointer-events:none;outline:2px solid #6A5CFF;z-index:99999}
.hdd-h{position:absolute;width:12px;height:12px;background:#fff;border:2px solid #6A5CFF;border-radius:3px;pointer-events:auto;z-index:100000}
.hdd-h[data-h=e]{right:-8px;top:calc(50% - 6px);cursor:ew-resize}.hdd-h[data-h=s]{bottom:-8px;left:calc(50% - 6px);cursor:ns-resize}.hdd-h[data-h=se]{right:-8px;bottom:-8px;cursor:nwse-resize}`;

/**
 * Mounts the page editor in `host` (the pages column) and its panel in `panel`. ctx = { doc, api, toast, size }.
 * Returns { flush, destroy, convert }.
 */
export async function mountDesign(host, panel, { doc, api, toast, size, onSaved, note = '' }) {
  let edits = { els: {}, added: [] };
  let html = '';
  const past = [], future = [];
  let selKey = null, editing = null, tSave = null, frame = null, fdoc = null, scale = 1, destroyed = false;
  const status = (t) => { const s = document.getElementById('hdStatus'); if (s) s.textContent = t; };

  async function load(fromServer = true) {
    const r = fromServer ? await api(`/tools/docs/${doc.id}/html`) : await api(`/tools/docs/${doc.id}/html-preview`, { body: { edits } });
    if (fromServer) edits = { els: r.edits?.els || {}, added: r.edits?.added || [] };
    html = r.html;
    render();
  }
  function render() {
    const keepScroll = host.scrollTop;
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'hdd-wrap';
    frame = document.createElement('iframe');
    frame.title = 'Pages (edit)';
    frame.className = 'hdd-frame';
    // our own HTML: no scripts may run inside the frame (CSP); the editor works on its DOM from here
    frame.srcdoc = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="script-src 'none'"><style>${EDITOR_CSS}</style>`);
    wrap.append(frame);
    host.append(wrap);
    frame.onload = () => {
      fdoc = frame.contentDocument;
      const fit = () => {
        scale = Math.min(1, (host.clientWidth - 12) / size.width);
        const h = fdoc.documentElement.scrollHeight;
        Object.assign(frame.style, { width: `${size.width + 2}px`, height: `${h}px`, transform: `scale(${scale})`, transformOrigin: '0 0', border: '0', display: 'block' });
        wrap.style.cssText = `width:${Math.ceil((size.width + 2) * scale)}px;height:${Math.ceil(h * scale)}px;overflow:hidden;margin:0 auto`;
      };
      fit();
      fdoc.fonts?.ready.then(fit);
      host.scrollTop = keepScroll;
      bind();
      if (selKey) select(findEl(selKey), true);
    };
  }
  const findEl = (key) => (!fdoc || !key ? null : key.startsWith('a:') ? fdoc.querySelector(`[data-a="${CSS.escape(key.slice(2))}"]`) : fdoc.querySelector(`[data-k="${CSS.escape(key)}"]`));
  const keyOf = (el) => (el?.dataset?.a ? `a:${el.dataset.a}` : el?.dataset?.k || null);
  const isPage = (el) => /:$/.test(el?.dataset?.k || '');
  const addedOf = (key) => edits.added.find((a) => `a:${a.id}` === key);

  // ------------------------------------------------------------------ edits + history + saving
  function commit(mutate, { reload = false } = {}) {
    past.push(clone(edits)); if (past.length > 80) past.shift();
    future.length = 0;
    mutate(edits);
    for (const k of Object.keys(edits.els)) if (!Object.keys(edits.els[k]).length) delete edits.els[k];
    save();
    if (reload) load(false);
  }
  const elEdit = (key) => (edits.els[key] ||= {});
  function save() {
    status('Editing…');
    clearTimeout(tSave);
    tSave = setTimeout(async () => { tSave = null; try { await api(`/tools/docs/${doc.id}`, { method: 'PUT', body: { content: { html: { edits } } } }); status('Saved'); onSaved?.(); } catch (e) { status(''); toast(e.message, true); } }, 700);
  }
  async function flush() { if (tSave) { clearTimeout(tSave); tSave = null; await api(`/tools/docs/${doc.id}`, { method: 'PUT', body: { content: { html: { edits } } } }); status('Saved'); } }
  function undo() { if (!past.length) return; future.push(clone(edits)); edits = past.pop(); save(); load(false); }
  function redo() { if (!future.length) return; past.push(clone(edits)); edits = future.pop(); save(); load(false); }

  // ------------------------------------------------------------------ selection overlay
  let box = null;
  function select(el, keep) {
    if (!fdoc) return;
    box?.remove(); box = null;
    if (!el || isPage(el)) { selKey = null; drawPanel(); return; }
    selKey = keyOf(el);
    box = fdoc.createElement('div');
    box.className = 'hdd-sel';
    box.innerHTML = '<span class="hdd-h" data-h="e"></span><span class="hdd-h" data-h="s"></span><span class="hdd-h" data-h="se"></span>';
    fdoc.body.append(box);
    place();
    if (!keep) drawPanel();
    else drawPanel();
  }
  function place() {
    const el = findEl(selKey);
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    const sx = fdoc.defaultView.scrollX, sy = fdoc.defaultView.scrollY;
    Object.assign(box.style, { left: `${r.left + sx}px`, top: `${r.top + sy}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  // ------------------------------------------------------------------ mouse: select, drag, resize, type
  function bind() {
    let drag = null;
    fdoc.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const handle = e.target.closest?.('.hdd-h');
      if (editing && !e.target.closest('[contenteditable]')) stopTyping(true);
      if (editing) return;
      const el = handle ? findEl(selKey) : e.target.closest?.('[data-a],[data-k]');
      if (!el) { select(null); return; }
      if (!handle) select(el);
      if (isPage(el)) return;
      e.preventDefault();
      const key = keyOf(el), a = addedOf(key), r = el.getBoundingClientRect();
      const ed = a || edits.els[key] || {};
      drag = { key, el, a, handle: handle?.dataset.h, x0: e.clientX, y0: e.clientY, tx: a ? a.x : ed.tx || 0, ty: a ? a.y : ed.ty || 0, w: a ? a.w : r.width, h: a ? a.h : r.height, moved: false };
    });
    fdoc.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      drag.moved = true;
      const s = drag.el.style;
      if (drag.handle) {
        const w = Math.max(8, Math.round(drag.w + (drag.handle !== 's' ? dx : 0))), h = Math.max(8, Math.round(drag.h + (drag.handle !== 'e' ? dy : 0)));
        if (drag.handle !== 's') { s.width = `${w}px`; s.maxWidth = 'none'; s.flex = '0 0 auto'; s.boxSizing = 'border-box'; }
        if (drag.handle !== 'e') { s.height = `${h}px`; s.minHeight = '0'; s.boxSizing = 'border-box'; }
        drag.nw = drag.handle !== 's' ? w : null; drag.nh = drag.handle !== 'e' ? h : null;
      } else if (drag.a) { s.left = `${Math.round(drag.tx + dx)}px`; s.top = `${Math.round(drag.ty + dy)}px`; drag.nx = Math.round(drag.tx + dx); drag.ny = Math.round(drag.ty + dy); }
      else { s.translate = `${Math.round(drag.tx + dx)}px ${Math.round(drag.ty + dy)}px`; drag.nx = Math.round(drag.tx + dx); drag.ny = Math.round(drag.ty + dy); }
      place();
    });
    fdoc.addEventListener('mouseup', () => {
      const d = drag; drag = null;
      if (!d?.moved) return;
      commit((E) => {
        const a = d.a && E.added.find((x) => x.id === d.a.id);
        if (d.handle) { if (a) { if (d.nw) a.w = d.nw; if (d.nh) a.h = d.nh; } else { const o = (E.els[d.key] ||= {}); if (d.nw) o.w = d.nw; if (d.nh) o.h = d.nh; } }
        else if (a) { a.x = d.nx; a.y = d.ny; } else { const o = (E.els[d.key] ||= {}); o.tx = d.nx; o.ty = d.ny; }
      });
      drawPanel();
    });
    fdoc.addEventListener('dblclick', (e) => {
      const el = e.target.closest?.('[data-a],[data-k]');
      if (!el || isPage(el) || !typeable(el)) return;
      select(el);
      startTyping(el);
    });
    const keys = (e) => onKey(e);
    fdoc.addEventListener('keydown', keys);
    fdoc.defaultView.addEventListener('resize', place);
  }
  const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN', 'BR', 'SMALL', 'A']);
  const typeable = (el) => el.tagName !== 'IMG' && (el.dataset.a ? !el.querySelector('img') && !!addedOf(`a:${el.dataset.a}`) && addedOf(`a:${el.dataset.a}`).type === 'text' : !!el.textContent.trim() && [...el.children].every((c) => INLINE.has(c.tagName) && !c.querySelector('img,div,p')));
  function startTyping(el) {
    editing = { el, key: keyOf(el), before: el.innerText };
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    const sel = fdoc.getSelection(); const rg = fdoc.createRange(); rg.selectNodeContents(el); rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg);
  }
  function stopTyping(keepText) {
    if (!editing) return;
    const { el, key, before } = editing; editing = null;
    el.removeAttribute('contenteditable');
    const text = el.innerText.replace(/\n$/, '');
    if (!keepText) { el.innerText = before; return; }
    if (text === before) return;
    commit((E) => { const a = E.added.find((x) => `a:${x.id}` === key); if (a) a.text = text; else (E.els[key] ||= {}).text = text; });
    place();
  }
  function onKey(e) {
    if (destroyed) return;
    const t = e.target;
    if (editing) { if (e.key === 'Escape') { e.preventDefault(); stopTyping(false); } return; }
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && t.ownerDocument === document) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (!selKey) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
    if (e.key === 'Escape') { e.preventDefault(); const el = findEl(selKey); select(el?.parentElement?.closest('[data-k],[data-a]') || null); return; }
    if (e.key === 'Enter') { const el = findEl(selKey); if (el && typeable(el)) { e.preventDefault(); startTyping(el); } return; }
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) {
      e.preventDefault();
      const key = selKey, el = findEl(key);
      commit((E) => { const a = E.added.find((x) => `a:${x.id}` === key); if (a) { a.x += mv[0]; a.y += mv[1]; } else { const o = (E.els[key] ||= {}); o.tx = (o.tx || 0) + mv[0]; o.ty = (o.ty || 0) + mv[1]; } });
      const a = addedOf(key), o = edits.els[key];
      if (el) { if (a) { el.style.left = `${a.x}px`; el.style.top = `${a.y}px`; } else el.style.translate = `${o.tx || 0}px ${o.ty || 0}px`; }
      place();
    }
  }
  const docKeys = (e) => { if (frame && document.body.contains(frame)) onKey(e); };
  document.addEventListener('keydown', docKeys);

  function removeSel() {
    const key = selKey;
    if (!key) return;
    if (addedOf(key)) commit((E) => { E.added = E.added.filter((x) => `a:${x.id}` !== key); }, { reload: true });
    else { commit((E) => { (E.els[key] ||= {}).hidden = true; }); const el = findEl(key); if (el) el.style.visibility = 'hidden'; }
    select(null);
  }

  // ------------------------------------------------------------------ the panel
  function drawPanel() {
    const el = findEl(selKey);
    const a = addedOf(selKey);
    const head = `<div class="hdd-tools">
      <button class="btn sm" data-add="text"><span class="mi">title</span>Text</button>
      <label class="btn sm"><span class="mi">image</span>Picture<input type="file" accept="image/*" hidden data-add-img></label>
      <button class="btn sm" data-add="box"><span class="mi">rectangle</span>Box</button>
      <span class="spacer"></span>
      <button class="btn sm icon-only" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo"${past.length ? '' : ' disabled'}><span class="mi">undo</span></button>
      <button class="btn sm icon-only" data-act="redo" title="Redo (Ctrl+Y)" aria-label="Redo"${future.length ? '' : ' disabled'}><span class="mi">redo</span></button>
    </div>`;
    if (!el) {
      const n = Object.keys(edits.els).length + edits.added.length;
      panel.innerHTML = `${head}<p class="small muted" style="margin:14px 2px">Click anything on a page to select it. Drag to move, pull the handles to resize, double-click text to type. Delete hides it; Esc selects the box around it; Ctrl+Z undoes.</p>
      ${n ? `<p class="small muted" style="margin:6px 2px">${n} change${n === 1 ? '' : 's'} on the pages.</p><button class="btn sm ghost" data-act="reset-all"><span class="mi">restart_alt</span>Undo all page changes</button>` : ''}
      ${note}`;
      return;
    }
    const cs = fdoc.defaultView.getComputedStyle(el);
    const col = rgbHex(cs.color).hex || '#111111';
    const bgc = rgbHex(cs.backgroundColor);
    const isImg = el.tagName === 'IMG' || (a && a.type === 'image');
    const kind = a ? ({ text: 'Added text', image: 'Added picture', box: 'Added box' })[a.type] : isImg ? 'Picture' : typeable(el) ? 'Text' : 'Box';
    const ed = a || edits.els[selKey] || {};
    panel.innerHTML = `${head}
    <div class="hdd-props">
      <div class="row" style="gap:8px;align-items:center"><b class="grow">${esc(kind)}</b>${!a ? '<button class="btn sm ghost" data-act="parent" title="Select the box around it (Esc)"><span class="mi">north_west</span>Parent</button>' : ''}</div>
      ${!isImg ? `<label class="hd-field"><span>Text colour</span><input type="color" data-p="color" value="${col}"></label>` : ''}
      ${!isImg ? `<label class="hd-field"><span>Fill</span><span class="row" style="gap:6px"><input type="color" data-p="bg" value="${bgc.a > 0 ? bgc.hex : '#ffffff'}"><button class="btn sm ghost" data-act="nofill">No fill</button></span></label>` : ''}
      ${!isImg ? `<div class="row" style="gap:8px"><label class="hd-field grow"><span>Text size</span><input type="number" min="4" max="300" data-p="size" value="${Math.round(parseFloat(cs.fontSize))}"></label>
      <label class="hd-field grow"><span>Weight</span><select data-p="weight" data-native>${[300, 400, 500, 600, 700, 800].map((w) => `<option${Number(cs.fontWeight) === w ? ' selected' : ''}>${w}</option>`).join('')}</select></label></div>` : ''}
      <div class="row" style="gap:8px"><label class="hd-field grow"><span>Corners</span><input type="number" min="0" max="500" data-p="radius" value="${Math.round(parseFloat(cs.borderTopLeftRadius) || 0)}"></label>
      <label class="hd-field grow"><span>Layer</span><button class="btn sm" data-act="front"><span class="mi">flip_to_front</span>To front</button></label></div>
      ${a?.type === 'image' ? '<label class="btn sm"><span class="mi">image</span>Replace picture<input type="file" accept="image/*" hidden data-replace-img></label>' : ''}
      ${typeable(el) ? '<button class="btn sm" data-act="type"><span class="mi">edit</span>Edit text</button>' : ''}
      <div class="row" style="gap:8px;margin-top:6px">
        <button class="btn sm ghost danger" data-act="delete"><span class="mi">delete</span>${a ? 'Delete' : 'Hide'}</button>
        ${!a && Object.keys(ed).length ? '<button class="btn sm ghost" data-act="reset"><span class="mi">restart_alt</span>Reset</button>' : ''}
      </div>
      <p class="small muted">${a ? '' : 'Changes here stay on this page. Text typed on the page wins over the Words form for that text.'}</p>
    </div>`;
  }
  panel.addEventListener('input', (e) => {
    const p = e.target.dataset.p;
    if (!p || !selKey) return;
    const el = findEl(selKey);
    let v = e.target.value;
    if (['size', 'radius'].includes(p)) v = Number(v);
    if (p === 'weight') v = Number(v);
    const css = { color: 'color', bg: 'background', size: 'fontSize', weight: 'fontWeight', radius: 'borderRadius' }[p];
    if (el) el.style[css] = typeof v === 'number' && p !== 'weight' ? `${v}px` : String(v);
    clearTimeout(panel._t);
    panel._t = setTimeout(() => commit((E) => { const a = E.added.find((x) => `a:${x.id}` === selKey); (a || (E.els[selKey] ||= {}))[p] = v; }), 250);
    place();
  });
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-add]');
    if (!b) return;
    const act = b.dataset.act, add = b.dataset.add;
    if (add) return addEl(add);
    if (act === 'undo') return undo();
    if (act === 'redo') return redo();
    if (act === 'reset-all') { if (confirm('Undo every change made on the pages? The words stay.')) commit((E) => { E.els = {}; E.added = []; }, { reload: true }); return; }
    const key = selKey, el = findEl(key);
    if (!key) return;
    if (act === 'parent') return select(el?.parentElement?.closest('[data-k],[data-a]') || null);
    if (act === 'delete') return removeSel();
    if (act === 'reset') return commit((E) => { delete E.els[key]; }, { reload: true });
    if (act === 'nofill') { if (el) el.style.background = 'none'; return commit((E) => { const a = E.added.find((x) => `a:${x.id}` === key); (a || (E.els[key] ||= {})).bg = 'none'; }); }
    if (act === 'front') return commit((E) => { const a = E.added.find((x) => `a:${x.id}` === key); const o = a || (E.els[key] ||= {}); o.z = Math.min(99, (o.z || 0) + 1); }, { reload: true });
    if (act === 'type' && el) return startTyping(el);
  });
  panel.addEventListener('change', async (e) => {
    const inp = e.target;
    if (!inp.matches('[data-add-img],[data-replace-img]') || !inp.files[0]) return;
    const src = await upload(inp.files[0]);
    if (!src) return;
    if (inp.matches('[data-replace-img]')) { const key = selKey; commit((E) => { const a = E.added.find((x) => `a:${x.id}` === key); if (a) a.src = src; }, { reload: true }); }
    else addEl('image', src);
  });

  async function upload(file) {
    if (file.size > 8e6) { toast('Choose a picture under 8 MB', true); return null; }
    let url = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(file); });
    if (!/^data:image\/(png|jpeg)/.test(url) || url.length > 4.2e6) url = await reencode(url, 2200);
    try { return (await api('/design/images', { body: { image: url } })).src; } catch (err) { toast(err.message, true); return null; }
  }
  /** Which page is in the middle of the view, and the point there (page coordinates). */
  function pageInView() {
    const pages = [...fdoc.querySelectorAll('[data-page]')];
    const mid = (host.scrollTop + host.clientHeight / 2) / scale;
    const pg = pages.find((p) => p.offsetTop <= mid && p.offsetTop + p.offsetHeight >= mid) || pages[0];
    return { n: Number(pg.dataset.page), y: Math.max(40, Math.min(pg.offsetHeight - 200, mid - pg.offsetTop - 60)) };
  }
  function addEl(type, src) {
    const { n, y } = pageInView();
    const id = `a${Date.now().toString(36)}`;
    const base = { id, type, page: n, x: 80, y: Math.round(y) };
    const el = type === 'text' ? { ...base, w: 420, h: 60, text: 'New text', size: 24, weight: 600, color: '#111111' }
      : type === 'box' ? { ...base, w: 240, h: 140, bg: '#D7261E', radius: 20 } : { ...base, w: 320, h: 220, src, radius: 20 };
    selKey = `a:${id}`;
    commit((E) => { E.added.push(el); }, { reload: true });
  }

  await load(true);
  drawPanel();
  return {
    flush,
    destroy() { destroyed = true; document.removeEventListener('keydown', docKeys); },
    convert: async () => convertToDesign(fdoc, { api }),
  };
}

/**
 * The rendered pages → the classic design model (public/html-convert.js), with the fonts brought in through the font
 * importer and the pictures uploaded, ready for POST /api/tools/docs/:id/classic.
 */
export async function convertToDesign(fdoc, { api }) {
  const raw = await convertPages(fdoc);
  const fontCodes = {}, srcs = {};
  for (const k of raw.fonts) { const n = fontName(k); const r = await api('/design/fonts/resolve', { body: { name: n.name, bold: n.bold, italic: n.italic } }).catch(() => null); if (r?.code) fontCodes[k] = r.code; }
  for (const src of raw.images) { try { srcs[src] = (await api('/design/images', { body: { image: src } })).src; } catch { /* left out */ } }
  return finish(raw, fontCodes, srcs);
}
