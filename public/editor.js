// Canva-style design editor for brochures and proposals (vanilla JS).
// Pages are arrays of positioned elements; the server renders the same data to PDF.

const FONT_W = { PR: 400, PM: 500, PS: 600, PB: 700, UM: 500, US: 600, HR: 400, HM: 500, HS: 600 };
const FONT_FAMILY = { UM: 'Unbounded', US: 'Unbounded', HR: '"Hanken Grotesk"', HM: '"Hanken Grotesk"', HS: '"Hanken Grotesk"' };
const FONT_NAMES = { PR: 'Poppins Regular', PM: 'Poppins Medium', PS: 'Poppins SemiBold', PB: 'Poppins Bold', UM: 'Unbounded Medium', US: 'Unbounded SemiBold', HR: 'Hanken Regular', HM: 'Hanken Medium', HS: 'Hanken SemiBold' };
const CONTENT = 1.4;
let META = null;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fileUrl = (src) => (src?.startsWith('data:') ? src : `/api/design/file?src=${encodeURIComponent(src)}`);
const uid = () => 'e' + Math.random().toString(16).slice(2, 12);

export async function loadMeta(api) {
  META ??= await api('/design/meta');
  return META;
}

// ===================================================================== render
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const listItems = (t) => String(t || '').split('\n').map((s) => s.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);

function money(n) {
  const v = new Intl.NumberFormat(META?.currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
  return META?.currency === 'INR' ? `₹${v}` : `${META?.currency || ''} ${v}`;
}

function textInner(e) {
  const box = document.createElement('div');
  box.className = 'txt';
  Object.assign(box.style, {
    fontFamily: `${FONT_FAMILY[e.font] || 'Poppins'}, sans-serif`, fontWeight: FONT_W[e.font] || 400, fontSize: `${e.size}px`, lineHeight: String(e.lh),
    letterSpacing: `${e.ls}px`, color: e.color, textAlign: e.align,
  });
  if (e.outline) Object.assign(box.style, { color: 'transparent', webkitTextStroke: `${e.outline}px ${e.color}` });
  if (!e.list) { box.textContent = e.text; return box; }
  const ind = e.list === 'icon' ? e.size * 2.3 : e.size * 1.6;
  const lineH = e.lh * e.size;
  listItems(e.text).forEach((it, i) => {
    const li = document.createElement('div');
    li.className = 'li';
    li.style.cssText = `position:relative;padding-left:${ind}px;margin-top:${i ? e.gap : 0}px`;
    li.textContent = it;
    if (e.list === 'icon') {
      const ih = e.size * 1.2;
      const img = document.createElement('img');
      img.src = '/api/design/file?src=asset%3Abrochure%2Fbullet.png';
      img.style.cssText = `position:absolute;left:0;top:${(lineH - ih) / 2}px;height:${ih}px;width:${ih * 1.31}px`;
      li.prepend(img);
    } else {
      const r = Math.max(1.6, e.size * 0.14);
      const dot = document.createElement('span');
      dot.style.cssText = `position:absolute;left:${e.size * 0.45 - r}px;top:${lineH / 2 - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${e.color}`;
      li.prepend(dot);
    }
    box.append(li);
  });
  return box;
}

function iconSvg(e) {
  const ic = META.icons[e.name];
  if (!ic) return '';
  const paint = ic.mode === 'fill' ? `fill="${e.color}" stroke="none"` : `fill="none" stroke="${e.color}" stroke-width="${ic.sw}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="none" ${paint}>${ic.prims.map((p) => (p.t === 'circle' ? `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}"/>` : `<path d="${p.d}"/>`)).join('')}</svg>`;
}

function pricingHtml(e, items) {
  const P = META.pricing;
  const total = (items || []).reduce((a, i) => a + Number(i.price || 0), 0);
  const rows = [{ label: 'Module / Component', value: `Cost (${META.currency})`, head: true }, ...(items || []).map((i) => ({ label: i.name, value: money(i.price) })), { label: 'Total', value: `${money(total).replace('₹', '')} + ${META.tax_label}`, total: true }];
  return `<table class="dprice" style="width:${e.w}px;font-size:${P.size}px">${rows.map((r) => `<tr style="${r.head ? `background:${P.head}` : ''}"><td style="width:${P.col * 100}%;font-weight:700;padding:${P.pad}px;height:${P.minRow}px;border:0.8px solid ${P.line}">${esc(r.label)}</td><td style="padding:${P.pad}px;font-weight:${r.head || r.total ? 700 : 400};border:0.8px solid ${P.line};white-space:nowrap">${esc(r.value)}</td></tr>`).join('')}</table>`;
}

function elementNode(e, items) {
  const el = document.createElement('div');
  el.className = `del del-${e.type}`;
  el.dataset.id = e.id;
  Object.assign(el.style, { left: `${e.x}px`, top: `${e.y}px`, width: `${e.w}px`, opacity: e.opacity ?? 1 });
  if (e.type !== 'text' && e.type !== 'pricing') el.style.height = `${e.h}px`;
  if (e.type === 'text') { el.append(textInner(e)); if (e.rot) el.style.transform = `rotate(${e.rot}deg)`; }
  else if (e.type === 'image') {
    Object.assign(el.style, { backgroundImage: e.src ? `url("${fileUrl(e.src)}")` : 'none', backgroundSize: e.fit === 'fill' ? '100% 100%' : e.fit, backgroundPosition: `${e.ha || 'center'} ${e.va || 'center'}`, backgroundRepeat: 'no-repeat', borderRadius: `${e.radius}px` });
    if (!e.src) el.classList.add('empty-img');
  } else if (e.type === 'shape') {
    const bg = e.gradient ? `linear-gradient(${e.gradient.angle}deg, ${e.gradient.stops.map(([o, c, a]) => `${rgba(c, a)} ${o * 100}%`).join(', ')})` : e.fill === 'none' ? 'transparent' : e.fill;
    Object.assign(el.style, { background: bg, border: e.stroke !== 'none' && e.sw > 0 ? `${e.sw}px solid ${e.stroke}` : 'none', borderRadius: e.shape === 'ellipse' ? '50%' : `${e.radius}px` });
  } else if (e.type === 'icon') el.innerHTML = iconSvg(e);
  else if (e.type === 'pricing') el.innerHTML = pricingHtml(e, items);
  return el;
}

/** Renders one page at its natural size (1 design unit = 1 CSS px). */
export function renderPage(page, items) {
  const pg = document.createElement('div');
  pg.className = 'dpage';
  Object.assign(pg.style, { width: `${page.w}px`, height: `${page.h}px`, backgroundColor: page.bg.color, backgroundImage: page.bg.image ? `url("${fileUrl(page.bg.image)}")` : 'none', backgroundSize: '100% 100%' });
  for (const e of page.elements) pg.append(elementNode(e, items));
  return pg;
}

/** A scaled, non-interactive copy of a page (thumbnails, template cards). */
export function thumb(page, width, items) {
  const s = width / page.w;
  const wrap = document.createElement('div');
  wrap.className = 'dthumb';
  wrap.style.cssText = `width:${width}px;height:${page.h * s}px`;
  const pg = renderPage(page, items);
  pg.style.transform = `scale(${s})`;
  wrap.append(pg);
  return wrap;
}

// ======================================================================= editor
export async function openEditor(root, { doc, api, toast, busy, modal, onChange }) {
  await loadMeta(api);
  await Promise.all(['700 20px Poppins', '600 20px Unbounded', '500 20px Unbounded', '400 20px "Hanken Grotesk"', '500 20px "Hanken Grotesk"', '600 20px "Hanken Grotesk"'].map((f) => document.fonts.load(f).catch(() => {})));
  const S = {
    design: doc.design, items: doc.items, page: 0, sel: null, scale: 1, fitMode: true,
    history: [], future: [], saveTimer: null, editing: null, chat: doc.chat || [],
  };
  const kind = doc.kind;

  root.innerHTML = `
  <div class="ed-shell">
    <aside class="ed-pages"><div class="ed-pages-list"></div><button class="btn sm" data-a="add-page"><span class="mi">add</span>Add page</button></aside>
    <section class="ed-center">
      <div class="ed-toolbar">
        <button class="btn sm" data-a="add-text"><span class="mi">title</span>Text</button>
        <button class="btn sm" data-a="add-image"><span class="mi">image</span>Image</button>
        <button class="btn sm" data-a="add-rect"><span class="mi">crop_square</span>Shape</button>
        <button class="btn sm" data-a="add-ellipse"><span class="mi">circle</span>Circle</button>
        <select class="ed-icon-pick"><option value="">Icon…</option>${Object.keys(META.icons).map((n) => `<option>${n}</option>`).join('')}</select>
        <span class="ed-sep"></span>
        <button class="btn sm ghost" data-a="undo" title="Undo (Ctrl+Z)" aria-label="Undo"><span class="mi">undo</span></button><button class="btn sm ghost" data-a="redo" title="Redo (Ctrl+Y)" aria-label="Redo"><span class="mi">redo</span></button>
        <span class="ed-sep"></span>
        <button class="btn sm ghost" data-a="zoom-out" title="Zoom out" aria-label="Zoom out"><span class="mi">remove</span></button><button class="btn sm ghost ed-zoom" data-a="fit">Fit</button><button class="btn sm ghost" data-a="zoom-in" title="Zoom in" aria-label="Zoom in"><span class="mi">add</span></button>
        <span class="spacer"></span><span class="small muted ed-status">Saved</span>
      </div>
      <div class="ed-stage"><div class="ed-canvas-wrap"></div></div>
    </section>
    <aside class="ed-side">
      <div class="seg ed-tabs"><button class="on" data-tab="props">Edit</button><button data-tab="ai">AI assistant</button></div>
      <div class="ed-props"></div>
      <div class="ed-ai hidden">
        <div class="ed-chat"></div>
        <div class="ed-chips">${(kind === 'brochure'
          ? ['Make the cover title shorter and punchier', 'Change the blue to a deep teal on every page', 'Rewrite the services pages for a dental clinic', 'Make all body text slightly bigger']
          : ['Make the executive summary more persuasive', 'Add a feature for online booking', 'Split Development into Frontend and Backend in the pricing', 'Make the tone more formal'])
          .map((c) => `<button class="btn sm ghost" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <form class="ed-chat-form"><textarea placeholder="Ask for any change… e.g. “make page 2 text bigger” or “rewrite the cover for a gym”" rows="3"></textarea><button class="btn primary sm">Send</button></form>
      </div>
    </aside>
  </div>
  <input type="file" class="ed-file" accept="image/png,image/jpeg,image/webp" hidden>`;

  const stage = $('.ed-stage', root), wrap = $('.ed-canvas-wrap', root);
  const cur = () => S.design.pages[S.page];
  const findEl = (id) => cur().elements.find((e) => e.id === id);
  const status = (t) => { $('.ed-status', root).textContent = t; };

  // ----------------------------------------------------------- history & save
  const snapshot = () => JSON.stringify({ design: S.design, items: S.items, page: S.page });
  function snap() { S.history.push(snapshot()); if (S.history.length > 100) S.history.shift(); S.future = []; }
  function restore(json) { const o = JSON.parse(json); S.design = o.design; S.items = o.items; S.page = Math.min(o.page, S.design.pages.length - 1); S.sel = null; render(); scheduleSave(); }
  function undo() { if (!S.history.length) return; S.future.push(snapshot()); restore(S.history.pop()); }
  function redo() { if (!S.future.length) return; S.history.push(snapshot()); restore(S.future.pop()); }
  async function saveNow() {
    clearTimeout(S.saveTimer);
    S.saveTimer = null;
    status('Saving…');
    try {
      await api(`/tools/docs/${doc.id}`, { method: 'PUT', body: kind === 'proposal' ? { design: S.design, items: S.items } : { design: S.design } });
      status('Saved');
      onChange?.();
    } catch (e) { status('Not saved'); toast(e.message, true); }
  }
  function scheduleSave() { status('Unsaved changes'); clearTimeout(S.saveTimer); S.saveTimer = setTimeout(saveNow, 700); }
  const changed = () => { scheduleSave(); renderThumbs(); };

  // ----------------------------------------------------------------- render
  function fitScale() {
    const p = cur();
    const r = stage.getBoundingClientRect();
    return Math.max(0.1, Math.min((r.width - 48) / p.w, (r.height - 48) / p.h, 2));
  }
  function renderCanvas() {
    const p = cur();
    if (S.fitMode) S.scale = fitScale();
    const pg = renderPage(p, S.items);
    pg.style.transform = `scale(${S.scale})`;
    pg.style.setProperty('--inv', 1 / S.scale);
    wrap.innerHTML = '';
    wrap.style.cssText = `width:${p.w * S.scale}px;height:${p.h * S.scale}px`;
    wrap.append(pg);
    $('.ed-zoom', root).textContent = `${Math.round(S.scale * 100)}%`;
    // measure text heights so selection boxes and the AI see real sizes
    for (const e of p.elements) if (e.type === 'text' || e.type === 'pricing') {
      const node = $(`.del[data-id="${e.id}"]`, pg);
      if (node) { const h = Math.ceil(node.offsetHeight); if (Math.abs(h - e.h) > 1) e.h = h; }
    }
    drawSelection();
  }
  function drawSelection() {
    $$('.del.sel', wrap).forEach((n) => n.classList.remove('sel'));
    $$('.hdl', wrap).forEach((n) => n.remove());
    const e = S.sel && findEl(S.sel);
    if (!e) { renderProps(); return; }
    const node = $(`.del[data-id="${e.id}"]`, wrap);
    if (!node) return;
    node.classList.add('sel');
    if (!e.locked && e.type !== 'pricing') {
      const dirs = e.type === 'text' ? ['w', 'e'] : ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
      for (const d of dirs) { const h = document.createElement('div'); h.className = `hdl hdl-${d}`; h.dataset.dir = d; node.append(h); }
    }
    renderProps();
  }
  let thumbTimer = null;
  function renderThumbs(now = false) {
    clearTimeout(thumbTimer);
    const draw = () => {
      const list = $('.ed-pages-list', root);
      list.innerHTML = '';
      S.design.pages.forEach((p, i) => {
        const item = document.createElement('div');
        item.className = `ed-thumb ${i === S.page ? 'on' : ''}`;
        item.dataset.page = i;
        item.append(thumb(p, 132, S.items));
        item.insertAdjacentHTML('beforeend', `<div class="ed-thumb-bar"><span>${i + 1}</span><span class="spacer"></span>
          <button title="Move up" aria-label="Move up" data-pa="up"><span class="mi">arrow_upward</span></button><button title="Move down" aria-label="Move down" data-pa="down"><span class="mi">arrow_downward</span></button><button title="Duplicate" aria-label="Duplicate" data-pa="dup"><span class="mi">content_copy</span></button><button title="Delete" aria-label="Delete" data-pa="del"><span class="mi">delete</span></button></div>`);
        list.append(item);
      });
    };
    if (now) draw(); else thumbTimer = setTimeout(draw, 250);
  }
  function render() { renderCanvas(); renderThumbs(true); }

  // -------------------------------------------------------------- properties
  const num = (label, key, v, step = 1) => `<label>${label}<input type="number" step="${step}" data-k="${key}" value="${Math.round(v * 100) / 100}"></label>`;
  const colorField = (label, key, v) => `<label>${label}<div class="row ed-color"><input type="color" data-k="${key}" value="${v === 'none' ? '#ffffff' : v}"><input data-k="${key}" data-hex value="${v}"></div></label>`;
  const layerBtns = `<div class="row ed-row"><button class="btn sm" data-a="front">Bring to front</button><button class="btn sm" data-a="back">Send to back</button></div>
    <div class="row ed-row"><button class="btn sm" data-a="dup">Duplicate</button><button class="btn sm danger" data-a="del">Delete</button></div>`;
  function renderProps() {
    const box = $('.ed-props', root);
    const e = S.sel && findEl(S.sel);
    const p = cur();
    if (!e) {
      box.innerHTML = `<h3>Page ${S.page + 1}</h3><p class="small muted">${Math.round(p.w)} × ${Math.round(p.h)} pt · click anything on the page to edit it, double-click text to type.</p>
        ${colorField('Background colour', 'bg.color', p.bg.color)}
        <div class="row ed-row"><button class="btn sm" data-a="bg-image">${p.bg.image ? 'Replace' : 'Add'} background image</button>${p.bg.image ? '<button class="btn sm ghost" data-a="bg-remove">Remove</button>' : ''}</div>`;
      return;
    }
    const pos = `<div class="ed-grid">${num('X', 'x', e.x)}${num('Y', 'y', e.y)}${num('Width', 'w', e.w)}${e.type === 'text' || e.type === 'pricing' ? '' : num('Height', 'h', e.h)}</div>`;
    const op = `<label>Transparency<input type="range" min="0" max="1" step="0.05" data-k="opacity" value="${e.opacity ?? 1}"></label>`;
    let html = '';
    if (e.type === 'text') {
      html = `<h3>Text</h3>
        <div class="ed-grid"><label>Font<select data-k="font">${Object.entries(FONT_NAMES).map(([k, n]) => `<option value="${k}" ${k === e.font ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${num('Size', 'size', e.size, 0.5)}</div>
        ${colorField('Colour', 'color', e.color)}
        <div class="row ed-row seg ed-align">${['left', 'center', 'right'].map((a) => `<button data-align="${a}" class="${e.align === a ? 'on' : ''}">${a}</button>`).join('')}</div>
        <div class="ed-grid">${num('Line height', 'lh', e.lh, 0.05)}${num('Letter spacing', 'ls', e.ls, 0.1)}</div>
        <div class="ed-grid"><label>List<select data-k="list"><option value="">None</option><option value="dot" ${e.list === 'dot' ? 'selected' : ''}>Bullets</option><option value="icon" ${e.list === 'icon' ? 'selected' : ''}>Icon bullets</option></select></label>${e.list ? num('Item gap', 'gap', e.gap) : ''}</div>
        <p class="small muted">Double-click the text on the page to type. In lists, one line = one item.</p>`;
    } else if (e.type === 'image') {
      html = `<h3>Image</h3><div class="row ed-row"><button class="btn sm primary" data-a="replace-image">Replace image</button></div>
        <div class="ed-grid"><label>Fit<select data-k="fit">${['cover', 'contain', 'fill'].map((f) => `<option ${f === e.fit ? 'selected' : ''}>${f}</option>`).join('')}</select></label>${num('Corner radius', 'radius', e.radius)}</div>`;
    } else if (e.type === 'shape') {
      html = `<h3>${e.shape === 'ellipse' ? 'Circle' : 'Shape'}</h3>
        ${e.gradient ? `<p class="small muted">Gradient fill <button class="btn sm ghost" data-a="solid">Use a solid colour</button></p>` : colorField('Fill', 'fill', e.fill)}
        ${e.gradient ? '' : `<label class="check"><input type="checkbox" data-a="nofill" ${e.fill === 'none' ? 'checked' : ''}> No fill</label>`}
        ${colorField('Border', 'stroke', e.stroke === 'none' ? '#ffffff' : e.stroke)}
        <div class="ed-grid">${num('Border width', 'sw', e.stroke === 'none' ? 0 : e.sw, 0.5)}${e.shape === 'rect' ? num('Corner radius', 'radius', e.radius) : ''}</div>`;
    } else if (e.type === 'icon') {
      html = `<h3>Icon</h3><label>Icon<select data-k="name">${Object.keys(META.icons).map((n) => `<option ${n === e.name ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${colorField('Colour', 'color', e.color)}`;
    } else if (e.type === 'pricing') {
      html = `<h3>Pricing table</h3><p class="small muted">Rows come from the price list. Prices are never set by the AI unless you ask it to.</p><div class="row ed-row"><button class="btn sm primary" data-a="prices">Edit prices</button></div>`;
    }
    box.innerHTML = html + pos + op + layerBtns;
  }

  // ------------------------------------------------------------- mutations
  function update(id, patch, { history = true } = {}) {
    const e = findEl(id);
    if (!e) return;
    if (history) snap();
    Object.assign(e, patch);
    renderCanvas();
    changed();
  }
  function addElement(e) {
    snap();
    const p = cur();
    e.id = uid();
    e.opacity ??= 1;
    p.elements.push(e);
    S.sel = e.id;
    renderCanvas();
    changed();
  }
  function setPage(i) { S.page = Math.max(0, Math.min(i, S.design.pages.length - 1)); S.sel = null; S.fitMode = true; render(); }

  async function pickImage() {
    const input = $('.ed-file', root);
    input.value = '';
    return new Promise((resolve) => {
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return resolve(null);
        try { resolve(await uploadImage(f)); } catch (e) { toast(e.message, true); resolve(null); }
      };
      input.click();
    });
  }
  async function uploadImage(file) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    const max = 2400, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const png = file.type === 'image/png' && file.size < 2.5e6; // keep requests under the hosting limit
    const data = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88);
    status('Uploading image…');
    const r = await api('/design/images', { body: { image: data } });
    status('Saved');
    return { src: r.src, w: c.width, h: c.height };
  }

  // ------------------------------------------------------------ text editing
  function startEdit(id) {
    const e = findEl(id);
    const node = $(`.del[data-id="${id}"]`, wrap);
    if (!e || e.type !== 'text' || !node) return;
    S.editing = { id, before: snapshot() };
    const inner = $('.txt', node);
    inner.innerHTML = '';
    inner.textContent = e.list ? listItems(e.text).join('\n') : e.text;
    inner.contentEditable = 'plaintext-only';
    if (inner.contentEditable !== 'plaintext-only') inner.contentEditable = 'true';
    node.classList.add('editing');
    $$('.hdl', node).forEach((h) => h.remove());
    inner.focus();
    const r = document.createRange(); r.selectNodeContents(inner); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    inner.onblur = () => finishEdit();
    inner.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); inner.blur(); } ev.stopPropagation(); };
  }
  function finishEdit() {
    const ed = S.editing;
    if (!ed) return;
    S.editing = null;
    const node = $(`.del[data-id="${ed.id}"]`, wrap);
    const e = findEl(ed.id);
    if (!node || !e) return;
    const text = $('.txt', node).innerText.replace(/ /g, ' ').replace(/\n$/, '');
    if (text !== (e.list ? listItems(e.text).join('\n') : e.text)) {
      S.history.push(ed.before); S.future = [];
      e.text = text;
      changed();
    }
    renderCanvas();
  }

  // ------------------------------------------------------------ pointer work
  let drag = null;
  stage.addEventListener('pointerdown', (ev) => {
    if (S.editing && ev.target.closest('.editing')) return;
    if (S.editing) finishEdit();
    const h = ev.target.closest('.hdl');
    const node = ev.target.closest('.del');
    if (!node) { if (S.sel) { S.sel = null; drawSelection(); } return; }
    const e = findEl(node.dataset.id);
    if (!e) return;
    if (S.sel !== e.id) { S.sel = e.id; drawSelection(); }
    if (e.locked) return;
    ev.preventDefault();
    stage.setPointerCapture(ev.pointerId);
    drag = { id: e.id, dir: h?.dataset.dir || null, sx: ev.clientX, sy: ev.clientY, o: { x: e.x, y: e.y, w: e.w, h: e.h }, moved: false, before: snapshot(), ratio: e.w / e.h };
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const e = findEl(drag.id);
    const dx = (ev.clientX - drag.sx) / S.scale, dy = (ev.clientY - drag.sy) / S.scale;
    if (!drag.moved && Math.hypot(dx, dy) * S.scale < 3) return;
    drag.moved = true;
    const o = drag.o, p = cur();
    if (!drag.dir) {
      let x = o.x + dx, y = o.y + dy;
      const tol = 6 / S.scale;
      if (Math.abs(x + o.w / 2 - p.w / 2) < tol) x = p.w / 2 - o.w / 2;
      if (Math.abs(y + o.h / 2 - p.h / 2) < tol) y = p.h / 2 - o.h / 2;
      if (Math.abs(x) < tol) x = 0;
      if (Math.abs(y) < tol) y = 0;
      e.x = Math.round(x); e.y = Math.round(y);
    } else {
      let { x, y, w, h } = o;
      const d = drag.dir;
      if (d.includes('e')) w = Math.max(10, o.w + dx);
      if (d.includes('w')) { w = Math.max(10, o.w - dx); x = o.x + o.w - w; }
      if (d.includes('s')) h = Math.max(6, o.h + dy);
      if (d.includes('n')) { h = Math.max(6, o.h - dy); y = o.y + o.h - h; }
      const keep = (e.type === 'image' || e.type === 'icon' || ev.shiftKey) && d.length === 2;
      if (keep) { h = w / drag.ratio; if (d.includes('n')) y = o.y + o.h - h; }
      Object.assign(e, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    }
    const node = $(`.del[data-id="${e.id}"]`, wrap);
    Object.assign(node.style, { left: `${e.x}px`, top: `${e.y}px`, width: `${e.w}px` });
    if (e.type !== 'text') node.style.height = `${e.h}px`;
  });
  const endDrag = (ev) => {
    if (ev?.pointerId !== undefined && stage.hasPointerCapture?.(ev.pointerId)) stage.releasePointerCapture(ev.pointerId);
    if (!drag) return;
    if (drag.moved) { S.history.push(drag.before); S.future = []; renderCanvas(); changed(); }
    drag = null;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  // Pointer capture (used for dragging) makes the browser report the double-click on the stage, not on the
  // text box, so find the box under the cursor; fall back to the selected text box.
  stage.addEventListener('dblclick', (ev) => {
    const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.closest?.('.del-text') && stage.contains(el));
    const node = ev.target.closest?.('.del-text') || under?.closest('.del-text');
    const id = node?.dataset.id || (S.sel && findEl(S.sel)?.type === 'text' ? S.sel : null);
    if (id) startEdit(id);
  });

  // --------------------------------------------------- wheel: next / previous slide
  // Scrolling on the canvas moves between slides. When zoomed in, the stage scrolls normally first and only
  // moves on once it is at the top or bottom edge. Ctrl/Cmd + wheel (pinch) is left to the browser.
  let wheelAcc = 0, wheelLock = 0;
  function goPage(i) {
    if (i < 0 || i >= S.design.pages.length || i === S.page) return;
    if (S.editing) finishEdit();
    setPage(i);
    $('.ed-thumb.on', root)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  stage.addEventListener('wheel', (ev) => {
    if (ev.ctrlKey || ev.metaKey || S.editing) return;
    const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
    const atTop = stage.scrollTop <= 0;
    const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 1;
    if ((dy > 0 && !atBottom) || (dy < 0 && !atTop)) { wheelAcc = 0; return; } // let the zoomed page scroll
    ev.preventDefault();
    if (Date.now() < wheelLock) return;
    wheelAcc += dy;
    if (Math.abs(wheelAcc) < 60) return; // ignore tiny trackpad nudges
    const next = S.page + (wheelAcc > 0 ? 1 : -1);
    wheelAcc = 0;
    wheelLock = Date.now() + 450; // one slide per gesture
    goPage(next);
    if (stage.scrollHeight > stage.clientHeight) stage.scrollTop = next > S.page ? 0 : stage.scrollHeight;
  }, { passive: false });

  // ------------------------------------------------------------- keyboard
  let clip = null;
  const onKey = (ev) => {
    if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
    const t = ev.target;
    if (S.editing || t.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const e = S.sel && findEl(S.sel);
    if (mod && ev.key.toLowerCase() === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); }
    else if (mod && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) { ev.preventDefault(); redo(); }
    else if (ev.key === 'PageDown' || (!e && ev.key === 'ArrowDown')) { ev.preventDefault(); goPage(S.page + 1); }
    else if (ev.key === 'PageUp' || (!e && ev.key === 'ArrowUp')) { ev.preventDefault(); goPage(S.page - 1); }
    else if (!e) return;
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); act('del'); }
    else if (mod && ev.key.toLowerCase() === 'd') { ev.preventDefault(); act('dup'); }
    else if (mod && ev.key.toLowerCase() === 'c') { clip = JSON.parse(JSON.stringify(e)); }
    else if (mod && ev.key.toLowerCase() === 'v' && clip) { ev.preventDefault(); addElement({ ...JSON.parse(JSON.stringify(clip)), x: clip.x + 20, y: clip.y + 20 }); }
    else if (ev.key === 'Enter' && e.type === 'text') { ev.preventDefault(); startEdit(e.id); }
    else if (ev.key === 'Escape') { S.sel = null; drawSelection(); }
    else if (ev.key.startsWith('Arrow')) {
      ev.preventDefault();
      const k = ev.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, -k], ArrowDown: [0, k] }[ev.key];
      update(e.id, { x: e.x + d[0], y: e.y + d[1] });
    }
  };
  document.addEventListener('keydown', onKey);

  // --------------------------------------------------------------- actions
  async function act(a) {
    const p = cur();
    const e = S.sel && findEl(S.sel);
    switch (a) {
      case 'undo': return undo();
      case 'redo': return redo();
      case 'fit': S.fitMode = true; return renderCanvas();
      case 'zoom-in': S.fitMode = false; S.scale = Math.min(3, S.scale * 1.2); return renderCanvas();
      case 'zoom-out': S.fitMode = false; S.scale = Math.max(0.1, S.scale / 1.2); return renderCanvas();
      case 'add-text': return addElement({ type: 'text', text: 'Add your text', x: p.w * 0.1, y: p.h * 0.4, w: p.w * 0.5, h: 40, font: 'PM', size: Math.round(p.w / 40), color: p.bg.color.toLowerCase() === '#ffffff' ? '#141413' : '#ffffff', align: 'left', lh: 1.35, ls: 0, list: '', gap: 8 });
      case 'add-rect': return addElement({ type: 'shape', shape: 'rect', x: p.w * 0.35, y: p.h * 0.35, w: p.w * 0.3, h: p.h * 0.2, fill: '#5271ff', stroke: 'none', sw: 1, radius: 12, gradient: null });
      case 'add-ellipse': return addElement({ type: 'shape', shape: 'ellipse', x: p.w * 0.42, y: p.h * 0.4, w: p.w * 0.15, h: p.w * 0.15, fill: '#5271ff', stroke: 'none', sw: 1, radius: 0, gradient: null });
      case 'add-image': {
        const img = await pickImage();
        if (!img) return;
        const w = Math.min(p.w * 0.45, img.w), h = (w * img.h) / img.w;
        return addElement({ type: 'image', src: img.src, x: (p.w - w) / 2, y: (p.h - h) / 2, w, h, fit: 'cover', radius: 0 });
      }
      case 'replace-image': { const img = await pickImage(); if (img && e) update(e.id, { src: img.src }); return; }
      case 'bg-image': { const img = await pickImage(); if (img) { snap(); p.bg.image = img.src; render(); scheduleSave(); } return; }
      case 'bg-remove': snap(); p.bg.image = ''; render(); return scheduleSave();
      case 'solid': return e && update(e.id, { gradient: null, fill: e.gradient?.stops?.[0]?.[1] || '#5271ff' });
      case 'front': if (e) { snap(); p.elements.splice(p.elements.indexOf(e), 1); p.elements.push(e); renderCanvas(); changed(); } return;
      case 'back': if (e) { snap(); p.elements.splice(p.elements.indexOf(e), 1); p.elements.unshift(e); renderCanvas(); changed(); } return;
      case 'dup': if (e) addElement({ ...JSON.parse(JSON.stringify(e)), x: e.x + 20, y: e.y + 20 }); return;
      case 'del': if (e) { snap(); p.elements.splice(p.elements.indexOf(e), 1); S.sel = null; renderCanvas(); changed(); } return;
      case 'add-page': {
        snap();
        S.design.pages.splice(S.page + 1, 0, { id: uid(), w: p.w, h: p.h, bg: { color: p.bg.color, image: '' }, elements: [] });
        setPage(S.page + 1);
        return scheduleSave();
      }
      case 'prices': return editPrices();
    }
  }
  async function pageAction(a, i) {
    const ps = S.design.pages;
    if (a === 'del' && ps.length < 2) return toast('A document needs at least one page', true);
    if (a === 'del' && !confirm(`Delete page ${i + 1}?`)) return;
    snap();
    if (a === 'up' && i > 0) { [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]]; S.page = i - 1; }
    else if (a === 'down' && i < ps.length - 1) { [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]]; S.page = i + 1; }
    else if (a === 'dup') { const c = JSON.parse(JSON.stringify(ps[i])); c.id = uid(); c.elements.forEach((e) => (e.id = uid())); ps.splice(i + 1, 0, c); S.page = i + 1; }
    else if (a === 'del') { ps.splice(i, 1); S.page = Math.min(S.page, ps.length - 1); }
    S.sel = null;
    render();
    scheduleSave();
  }
  function editPrices() {
    const row = (it = { name: '', price: 0 }) => `<div class="row item-row"><input class="grow" data-k="name" value="${esc(it.name)}" placeholder="Module / component"><input data-k="price" inputmode="numeric" style="width:130px" value="${esc(it.price)}"><button type="button" class="btn ghost sm icon-only" data-del aria-label="Remove line"><span class="mi">close</span></button></div>`;
    const d = modal('Prices', `<div id="pRows">${(S.items || []).map(row).join('')}</div><div class="row" style="margin-top:8px"><button class="btn sm" id="pAdd"><span class="mi">add</span>Add line</button><span class="spacer"></span><b id="pTotal"></b></div>`, '<button class="btn primary" id="pSave">Apply</button>');
    const total = () => { $('#pTotal').textContent = `Total ${money($$('#pRows [data-k=price]').reduce((a, el) => a + (Number(String(el.value).replace(/[^\d.]/g, '')) || 0), 0))} + ${META.tax_label}`; };
    const wire = () => { $$('#pRows [data-del]').forEach((b) => (b.onclick = () => { b.closest('.item-row').remove(); total(); })); $$('#pRows input').forEach((i) => (i.oninput = total)); };
    $('#pAdd').onclick = () => { $('#pRows').insertAdjacentHTML('beforeend', row()); wire(); };
    $('#pSave').onclick = () => {
      const items = $$('#pRows .item-row').map((r) => ({ name: $('[data-k=name]', r).value.trim(), price: Math.round(Number(String($('[data-k=price]', r).value).replace(/[^\d.]/g, '')) || 0) })).filter((i) => i.name);
      if (!items.length) return toast('Add at least one line', true);
      snap(); S.items = items; renderCanvas(); changed(); d.close();
    };
    wire(); total();
  }

  // --------------------------------------------------- property panel events
  const props = $('.ed-props', root);
  let pendingSnap = null;
  props.addEventListener('focusin', (ev) => { if (ev.target.matches('[data-k]')) pendingSnap = snapshot(); });
  const applyField = (el) => {
    const k = el.dataset.k;
    let v = el.type === 'number' || el.type === 'range' ? Number(el.value) : el.value;
    if (el.type === 'number' && !Number.isFinite(v)) return;
    if (el.dataset.hex !== undefined || el.type === 'color') { if (!/^#[0-9a-f]{6}$/i.test(v)) return; }
    if (pendingSnap) { S.history.push(pendingSnap); S.future = []; pendingSnap = null; }
    if (k === 'bg.color') { cur().bg.color = v; renderCanvas(); changed(); return; }
    const e = S.sel && findEl(S.sel);
    if (!e) return;
    if (k === 'stroke' && e.stroke === 'none') e.sw = e.sw || 1;
    if (k === 'sw' && v > 0 && e.stroke === 'none') e.stroke = '#ffffff';
    if (k === 'sw' && v === 0) { e.stroke = 'none'; }
    if (k === 'h' && e.type === 'icon') e.w = v;
    if (k === 'w' && e.type === 'icon') e.h = v;
    e[k] = v;
    renderCanvas();
    changed();
  };
  props.addEventListener('input', (ev) => { if (ev.target.matches('[data-k]') && ev.target.type !== 'number') { applyField(ev.target); syncColor(ev.target); } });
  props.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-k]')) { applyField(ev.target); syncColor(ev.target); renderProps(); }
    if (ev.target.dataset.a === 'nofill') { const e = findEl(S.sel); if (e) update(e.id, { fill: ev.target.checked ? 'none' : '#5271ff' }); }
  });
  const syncColor = (el) => { if (el.type === 'color' || el.dataset.hex !== undefined) $$(`[data-k="${el.dataset.k}"]`, props).forEach((o) => { if (o !== el) o.value = el.value; }); };
  props.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.align) { const e = findEl(S.sel); if (e) update(e.id, { align: b.dataset.align }); renderProps(); return; }
    if (b.dataset.a) act(b.dataset.a);
  });
  $('.ed-toolbar', root).addEventListener('click', (ev) => { const b = ev.target.closest('[data-a]'); if (b) act(b.dataset.a); });
  $('.ed-icon-pick', root).onchange = (ev) => {
    const name = ev.target.value;
    ev.target.value = '';
    if (!name) return;
    const p = cur(), s = Math.round(p.w / 14);
    addElement({ type: 'icon', name, x: (p.w - s) / 2, y: (p.h - s) / 2, w: s, h: s, color: p.bg.color.toLowerCase() === '#ffffff' ? '#2f5bff' : '#ffffff' });
  };
  $('.ed-pages', root).addEventListener('click', (ev) => {
    const pa = ev.target.closest('[data-pa]');
    const t = ev.target.closest('.ed-thumb');
    if (pa && t) { ev.stopPropagation(); return pageAction(pa.dataset.pa, Number(t.dataset.page)); }
    if (t) return setPage(Number(t.dataset.page));
    if (ev.target.closest('[data-a="add-page"]')) act('add-page');
  });

  // --------------------------------------------------------- AI assistant
  $$('.ed-tabs button', root).forEach((b) => (b.onclick = () => {
    $$('.ed-tabs button', root).forEach((x) => x.classList.toggle('on', x === b));
    $('.ed-props', root).classList.toggle('hidden', b.dataset.tab !== 'props');
    $('.ed-ai', root).classList.toggle('hidden', b.dataset.tab !== 'ai');
    if (b.dataset.tab === 'ai') $('.ed-chat-form textarea', root).focus();
  }));
  function renderChat() {
    const box = $('.ed-chat', root);
    box.innerHTML = S.chat.length ? S.chat.map((m) => `<div class="msgb ${m.role}">${esc(m.text)}${m.role === 'assistant' && m.applied ? `<div class="small muted">${m.applied} change${m.applied === 1 ? '' : 's'} applied${m.skipped?.length ? ` · ${m.skipped.length} skipped` : ''}</div>` : ''}</div>`).join('')
      : `<p class="small muted">Tell the assistant what to change, in plain words. It edits the pages directly; use Undo (Ctrl+Z) to go back.</p>`;
    box.scrollTop = box.scrollHeight;
  }
  async function sendChat(text) {
    const ta = $('.ed-chat-form textarea', root);
    const msg = (text ?? ta.value).trim();
    if (!msg) return;
    ta.value = '';
    S.chat.push({ role: 'user', text: msg });
    S.chat.push({ role: 'assistant', text: 'Working on it…', pending: true });
    renderChat();
    const btn = $('.ed-chat-form button', root);
    btn.disabled = true;
    try {
      if (S.saveTimer) await saveNow();
      const r = await api(`/tools/docs/${doc.id}/chat`, { body: { message: msg, page: S.page + 1, selected: S.sel } });
      S.chat = r.doc.chat || [];
      if (r.applied) {
        snap();
        S.design = r.doc.design; S.items = r.doc.items;
        S.page = Math.min(S.page, S.design.pages.length - 1);
        if (S.sel && !findEl(S.sel)) S.sel = null;
        render();
        status('Saved');
        onChange?.();
      }
    } catch (e) {
      S.chat = S.chat.filter((m) => !m.pending);
      S.chat.push({ role: 'assistant', text: `Sorry, that failed: ${e.message}` });
    }
    btn.disabled = false;
    renderChat();
  }
  $('.ed-chat-form', root).onsubmit = (ev) => { ev.preventDefault(); sendChat(); };
  $('.ed-chat-form textarea', root).onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendChat(); } };
  $$('[data-chip]', root).forEach((b) => (b.onclick = () => sendChat(b.dataset.chip)));

  const ro = new ResizeObserver(() => { if (S.fitMode) renderCanvas(); });
  ro.observe(stage);
  render();
  renderChat();
  return { flush: () => (S.saveTimer ? saveNow() : null), get state() { return S; } };
}

// ================================================================ PDF import
/**
 * Turns a PDF (e.g. exported from Canva) into a template: each page's artwork becomes a
 * text-free background image, its text becomes editable text boxes at the same positions.
 */
export async function pdfToTemplate(file, onProgress = () => {}) {
  const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > 60) throw new Error('That PDF has more than 60 pages');
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress(n, pdf.numPages);
    const page = await pdf.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2400 / Math.max(vp1.width, vp1.height));
    const vp = page.getViewport({ scale });
    const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); return c; };
    const bg = mk(), full = mk();
    const bctx = bg.getContext('2d', { willReadFrequently: true });
    bctx.fillText = () => {}; bctx.strokeText = () => {};
    await page.render({ canvasContext: bctx, viewport: vp }).promise;
    const fctx = full.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: fctx, viewport: vp }).promise;
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, , , ex, ey] = it.transform;
      const size = Math.hypot(a, b);
      if (size < 3 || Math.abs(b) > 0.01 * size) continue; // skip tiny or rotated text
      let fname = '';
      try { fname = page.commonObjs.get(it.fontName)?.name || ''; } catch { /* unresolved */ }
      items.push({ str: it.str, x: ex, base: vp1.height - ey, w: it.width, size, font: weightOf(fname), color: sampleColor(bctx, fctx, ex * scale, (vp1.height - ey - size * 0.8) * scale, Math.max(it.width, size) * scale, size * scale) });
    }
    pages.push({ w: vp1.width, h: vp1.height, bg: bg.toDataURL('image/jpeg', 0.85), elements: blocksFrom(items) });
  }
  return pages;
}

function weightOf(name) {
  const n = String(name).toLowerCase();
  if (/black|heavy|extrabold|ultrabold|bold/.test(n) && !/semibold|demibold/.test(n)) return 'PB';
  if (/semibold|demibold/.test(n)) return 'PS';
  if (/medium/.test(n)) return 'PM';
  return 'PR';
}

function sampleColor(bctx, fctx, x, y, w, h) {
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
  w = Math.max(1, Math.min(Math.floor(w), bctx.canvas.width - x)); h = Math.max(1, Math.min(Math.floor(h), bctx.canvas.height - y));
  if (w < 1 || h < 1) return '#141413';
  const A = bctx.getImageData(x, y, w, h).data, B = fctx.getImageData(x, y, w, h).data;
  let best = 0;
  const diffs = [];
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
    if (d > 40) { diffs.push([d, i]); if (d > best) best = d; }
  }
  if (!diffs.length) return '#141413';
  let r = 0, g = 0, bl = 0, n = 0;
  for (const [d, i] of diffs) if (d >= best * 0.8) { r += B[i]; g += B[i + 1]; bl += B[i + 2]; n++; }
  const hx = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(bl)}`;
}

/** Groups pdf.js text runs into lines, then lines into text boxes. */
function blocksFrom(items) {
  items.sort((p, q) => p.base - q.base || p.x - q.x);
  const lines = [];
  for (const it of items) {
    const ln = lines.find((l) => Math.abs(l.base - it.base) < it.size * 0.35 && Math.abs(l.size - it.size) < 1.5 && it.x >= l.right - it.size * 0.2 && it.x - l.right < it.size * 1.2);
    if (ln) {
      ln.text += it.x - ln.right > it.size * 0.15 && !/\s$/.test(ln.text) && !/^\s/.test(it.str) ? ' ' + it.str : it.str;
      ln.right = Math.max(ln.right, it.x + it.w);
    } else lines.push({ ...it, text: it.str, left: it.x, right: it.x + it.w });
  }
  lines.sort((p, q) => p.base - q.base || p.left - q.left);
  const blocks = [];
  for (const l of lines) {
    const b = blocks.find((k) => {
      const last = k.lines[k.lines.length - 1];
      const gap = l.base - last.base;
      const sameCol = Math.abs(l.left - k.left) < l.size * 0.8 || Math.abs((l.left + l.right) / 2 - (last.left + last.right) / 2) < l.size;
      return sameCol && Math.abs(l.size - k.size) < 1.5 && l.font === k.font && l.color === k.color && gap > 0 && gap < l.size * 1.9;
    });
    if (b) { b.lines.push(l); b.left = Math.min(b.left, l.left); b.right = Math.max(b.right, l.right); }
    else blocks.push({ lines: [l], left: l.left, right: l.right, size: l.size, font: l.font, color: l.color });
  }
  return blocks.map((b) => {
    const gaps = b.lines.slice(1).map((l, i) => l.base - b.lines[i].base).sort((p, q) => p - q);
    const s = Math.round(b.size * 0.94 * 10) / 10;
    const lh = gaps.length ? Math.min(2.5, Math.max(0.9, gaps[Math.floor(gaps.length / 2)] / s)) : 1.25;
    const centered = b.lines.length > 1 && b.lines.every((l) => Math.abs((l.left + l.right) / 2 - (b.left + b.right) / 2) < b.size * 0.6) && b.lines.some((l) => Math.abs(l.left - b.left) > b.size);
    const w = (b.right - b.left) * 1.12 + 4;
    const first = b.lines[0].base;
    return {
      type: 'text', text: b.lines.map((l) => l.text.trim()).join('\n'),
      x: centered ? b.left - (w - (b.right - b.left)) / 2 : b.left, y: first - ((lh - CONTENT) / 2 + 1.05) * s, w, h: lh * s * b.lines.length,
      font: b.font, size: s, color: b.color, align: centered ? 'center' : 'left', lh: Math.round(lh * 100) / 100, ls: 0, list: '', gap: 8,
    };
  });
}
