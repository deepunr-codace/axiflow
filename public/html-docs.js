/*
 * Codeace HTML-template documents (src/html-docs): the pages are the template's own HTML, shown in a scaled frame, and
 * every text of the document is edited in a form beside them (live preview, autosave). The PDF is printed from the
 * same HTML on the server, so what is shown is what is sent.
 */
let H = null;
export function setupHtmlDocs(helpers) { H = helpers; }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pageCount = (html) => (html.match(/data-page="/g) || []).length || 1;

/**
 * The document's pages in one iframe, scaled to `width`. only = a page number to show just that page (template cards).
 */
export function framePages(html, size, width, { only = null, gap = 18 } = {}) {
  const s = width / size.width;
  const n = only ? 1 : pageCount(html);
  const extra = `<style>html,body{background:transparent!important;overflow:hidden!important}
${only ? `[data-page]:not([data-page="${only}"]){display:none!important}` : `[data-page]{margin-bottom:${gap / s}px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 10px 30px rgba(0,0,0,.18)}`}</style>`;
  const wrap = document.createElement('div');
  wrap.className = 'hd-frame';
  wrap.style.cssText = `width:${width}px;height:${Math.ceil(n * size.height * s + (only ? 0 : (n - 1) * gap))}px;overflow:hidden;position:relative`;
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-same-origin');
  f.setAttribute('loading', 'lazy');
  f.title = 'Document pages';
  f.style.cssText = `position:absolute;left:0;top:0;border:0;width:${size.width}px;height:${Math.ceil(n * (size.height + (only ? 0 : gap / s)))}px;transform:scale(${s});transform-origin:0 0;pointer-events:none;background:transparent`;
  f.srcdoc = html.replace('</head>', `${extra}</head>`);
  wrap.append(f);
  return wrap;
}

// ------------------------------------------------------------------ the form
const LABELS = { doc_name: 'Brochure name', idea_pages: 'Idea pages', think_label: 'Label: what the customer thinks', do_label: 'Label: what we do', headline: 'Headline on the photo', new: 'Marked NEW', statement: 'Statement card', includes_title: 'List heading', tag: 'Brochure name', doc_type: 'Document type', script_word: 'Name in Malayalam (cover)', title_em: 'Title, italic end', cta_before: 'Closing line, start', cta_em: 'Closing line, italic part', cta_after: 'Closing line, end', note_bold: 'Note, bold start', retainer_bold: 'Retainer, bold start', includes_title: 'List heading', idea_titles: 'Idea page headings', highlight: 'Highlighted step (0-3)', goal: 'Goal (0 attract, 1 convert, 2 retain)', short: 'Short name (plan page)', featured: 'Dark signature card', dark: 'Dark card', tone: 'Card colour (grey, red, dark)' };
const human = (k) => LABELS[k] || String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const blankLike = (v) => (typeof v === 'string' ? '' : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : Array.isArray(v) ? [] : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankLike(x)])) : '');
// fields not shown in the form; the older Codeace Growth Plan keeps its page plan in idea_pages, the CodeAce Growth
// Brochure has idea page headings there and NEW marks the owner may change
const SKIP_BASE = ['photos', 'image', 'image_alt', 'eyebrow', 'photo', 'photo_alt', 'count'];
let SKIP = new Set([...SKIP_BASE, 'idea_pages', 'new']);

function field(path, key, value) {
  const id = `f-${path}`;
  if (typeof value === 'boolean') return `<label class="check hd-check"><input type="checkbox" data-path="${esc(path)}" ${value ? 'checked' : ''}> ${esc(human(key))}</label>`;
  if (typeof value === 'number') return `<label class="hd-field"><span>${esc(human(key))}</span><input type="number" data-path="${esc(path)}" data-num value="${esc(value)}"></label>`;
  if (typeof value === 'string') {
    // a line break in the text (two-line headings) needs a box that keeps it
    const long = value.length > 60 || value.includes('\n') || /text|lead|paragraph|subtitle|note|gap|approach|retainer|closing|intro|statement|why/.test(path);
    return `<label class="hd-field" for="${esc(id)}"><span>${esc(human(key))}</span>${long ? `<textarea id="${esc(id)}" data-path="${esc(path)}" rows="${Math.min(6, Math.max(2, Math.ceil(value.length / 52)))}">${esc(value)}</textarea>` : `<input id="${esc(id)}" data-path="${esc(path)}" value="${esc(value)}">`}</label>`;
  }
  return '';
}
function block(path, key, value) {
  if (SKIP.has(key)) return '';
  if (Array.isArray(value)) {
    const items = value.map((v, i) => {
      const p = `${path}.${i}`;
      const inner = v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).map(([k, x]) => block(`${p}.${k}`, k, x)).join('') : block(p, `${human(key).replace(/s$/, '')} ${i + 1}`, v);
      return `<div class="hd-item">${inner}<button class="btn ghost sm icon-only hd-del" data-del="${esc(path)}" data-i="${i}" title="Remove" aria-label="Remove"><span class="mi">close</span></button></div>`;
    }).join('');
    return `<div class="hd-list"><div class="hd-list-h">${esc(human(key))} <span class="muted small">(${value.length})</span></div>${items}<button class="btn sm ghost hd-add" data-add="${esc(path)}"><span class="mi">add</span>Add</button></div>`;
  }
  if (value && typeof value === 'object') return `<fieldset class="hd-group"><legend>${esc(human(key))}</legend>${Object.entries(value).map(([k, x]) => block(`${path}.${k}`, k, x)).join('')}</fieldset>`;
  return field(path, key, value);
}
const getAt = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setAt(o, path, v) { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }

/** What Claude checked before writing (brochures): each fact with its source, and what it could not confirm. */
function factCheck(v) {
  if (!v || !((v.facts || []).length || (v.sources || []).length)) return '';
  const label = { confirmed: 'Checked online', from_crm: 'From the CRM', from_swot: 'From the SWOT', removed: 'Not confirmed, left out' };
  const n = (s) => (v.facts || []).filter((f) => f.status === s).length;
  const link = (u) => (/^https?:\/\//.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48))}</a>` : esc(u || ''));
  return `<details class="hd-sec hd-facts"><summary>Fact check: ${n('confirmed')} checked online, ${n('from_crm') + n('from_swot')} from the CRM / SWOT, ${n('removed') + (v.not_found || []).length} left out</summary>
  ${['confirmed', 'from_crm', 'from_swot', 'removed'].map((s) => (v.facts || []).filter((f) => f.status === s).length ? `<p class="small" style="margin:10px 0 4px"><b>${label[s]}</b></p>${(v.facts || []).filter((f) => f.status === s).map((f) => `<div class="small" style="margin:4px 0 4px 10px">${esc(f.claim)}${f.source ? ` <span class="muted">· ${link(f.source)}</span>` : ''}</div>`).join('')}` : '').join('')}
  ${(v.not_found || []).length ? `<p class="small" style="margin:10px 0 4px"><b>Looked for, not found</b></p>${v.not_found.map((x) => `<div class="small muted" style="margin:4px 0 4px 10px">${esc(x)}</div>`).join('')}` : ''}
  ${(v.sources || []).length ? `<p class="small" style="margin:10px 0 4px"><b>Sources</b></p>${v.sources.map((s) => `<div class="small" style="margin:4px 0 4px 10px">${link(s.url)} <span class="muted">${esc(s.used_for)}</span></div>`).join('')}` : ''}
</details>`;
}

/** The page of one HTML document: pages on the left, the words on the right. */
export async function renderHtmlDoc(kind, d, noun) {
  const { $, api, toast, busy, modal, view } = H;
  const r = await api(`/tools/docs/${d.id}/html`);
  let data = JSON.parse(JSON.stringify(r.data));
  SKIP = new Set(r.template === 'builtin-html-brochure-ps' ? SKIP_BASE : [...SKIP_BASE, 'idea_pages', 'new']);
  document.getElementById('pageTitle').textContent = '';
  const isProposal = kind === 'proposal';
  view.innerHTML = `
  <div class="ed-head">
    <a class="btn ghost sm icon-only" href="#/${kind}" aria-label="Back to all ${noun}s" title="Back"><span class="mi">arrow_back</span></a>
    <input class="ed-title" value="${esc(d.title)}" maxlength="120" title="Document name">
    <span class="small muted">${esc(d.source === 'claude' ? 'Written by Claude' : d.source === 'template' ? 'Standard copy' : d.source || '')} · ${esc(d.template?.name || '')}</span>
    <span class="spacer"></span>
    <div class="seg" id="hdMode" role="tablist" aria-label="Edit mode"><button data-m="design" title="Drag and drop on the pages"><span class="mi">drag_pan</span>Design</button><button data-m="words" title="Every text in a form"><span class="mi">notes</span>Words</button></div>
    <span class="small muted" id="hdStatus"></span>
    ${isProposal ? '<button class="btn sm" id="hdPrices"><span class="mi">payments</span>Prices</button>' : ''}
    <a class="btn primary sm" id="dlBtn" href="/api/tools/docs/${d.id}/pdf?download=1">Download PDF</a>
    <button class="btn sm" id="copyLink">Copy share link</button>
    <details class="dd"><summary class="btn sm">More<span class="mi">expand_more</span></summary><div>
      <a href="/api/tools/docs/${d.id}/pdf" target="_blank">Open the PDF<span class="mi">open_in_new</span></a>
      <button id="classicBtn">Open in classic editor</button>
      <button id="regenBtn">Write it again</button>
      <button class="danger" id="delBtn">Delete</button></div></details>
  </div>
  <div class="hd-layout">
    <div class="hd-pages" id="hdPages"></div>
    <aside class="hd-form card" id="hdDesign" hidden></aside>
    <aside class="hd-form card" id="hdForm">
      <div class="sec-h"><h2>Words</h2><span class="spacer"></span><span class="small muted">The design stays as it is</span></div>
      ${Object.values(r.edits?.els || {}).some((x) => typeof x.text === 'string') ? '<p class="small muted" style="margin:0 0 8px">Some texts were typed on the pages (Design); those win over the fields here.</p>' : ''}
      ${(r.photos || []).length ? `<div class="hd-photos">${r.photos.map(([k, label]) => `<label class="btn sm"><span class="mi">image</span>${esc(label)}<input type="file" accept="image/*" data-photo="${esc(k)}" hidden></label>`).join('')}${r.photos.some(([k]) => data.photos?.[k]) ? '<button class="btn sm ghost" id="hdNoPhotos">Remove photos</button>' : ''}</div>` : ''}
      ${factCheck(r.verification)}
      <div id="hdFields"></div>
    </aside>
  </div>`;
  const pagesEl = $('#hdPages');
  const show = (html) => {
    const sc = pagesEl.scrollTop;
    pagesEl.innerHTML = '';
    pagesEl.append(framePages(html, r.size, Math.min(pagesEl.clientWidth - 8, r.size.width * 1.0)));
    pagesEl.scrollTop = sc;
  };
  show(r.html);
  const drawForm = () => {
    $('#hdFields').innerHTML = Object.entries(data).map(([k, v]) => SKIP.has(k) ? '' : (v && typeof v === 'object' ? `<details class="hd-sec"${k === 'cover' || k === 'summary' ? ' open' : ''}><summary>${esc(human(k))}</summary>${Array.isArray(v) ? block(k, k, v) : Object.entries(v).map(([kk, x]) => block(`${k}.${kk}`, kk, x)).join('')}</details>` : `<div class="hd-sec hd-top">${field(k, k, v)}</div>`)).join('');
  };
  drawForm();
  let tPrev = null, tSave = null;
  const status = (t) => { $('#hdStatus').textContent = t; };
  const changed = () => {
    status('Editing…');
    clearTimeout(tPrev); clearTimeout(tSave);
    tPrev = setTimeout(async () => { try { show((await api(`/tools/docs/${d.id}/html-preview`, { body: { data } })).html); } catch (e) { toast(e.message, true); } }, 500);
    tSave = setTimeout(async () => { try { await api(`/tools/docs/${d.id}`, { method: 'PUT', body: { content: { html: { data } } } }); status('Saved'); } catch (e) { status(''); toast(e.message, true); } }, 1400);
  };
  const flush = async () => { if (tSave) { clearTimeout(tSave); tSave = null; await api(`/tools/docs/${d.id}`, { method: 'PUT', body: { content: { html: { data } } } }); status('Saved'); } };
  $('#hdFields').addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    setAt(data, el.dataset.path, el.type === 'checkbox' ? el.checked : el.dataset.num !== undefined ? Number(el.value) || 0 : el.value);
    changed();
  });
  $('#hdFields').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]'), del = e.target.closest('[data-del]');
    if (!add && !del) return;
    e.preventDefault();
    if (add) { const list = getAt(data, add.dataset.add); list.push(list.length ? blankLike(list[list.length - 1]) : ''); }
    else getAt(data, del.dataset.del).splice(Number(del.dataset.i), 1);
    const open = [...document.querySelectorAll('.hd-sec[open] > summary')].map((s) => s.textContent);
    drawForm();
    document.querySelectorAll('.hd-sec > summary').forEach((s) => { if (open.includes(s.textContent)) s.parentElement.open = true; });
    changed();
  });
  document.querySelectorAll('[data-photo]').forEach((inp) => (inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    if (f.size > 4e6) return toast('Choose a photo under 4 MB', true);
    const url = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(f); });
    const { src } = await api('/design/images', { body: { image: url } });
    data.photos = { ...(data.photos || {}), [inp.dataset.photo]: src };
    changed();
    toast('Photo added');
  }));
  const np = $('#hdNoPhotos');
  if (np) np.onclick = () => { data.photos = {}; changed(); np.remove(); };
  $('.ed-title').onchange = (e) => api(`/tools/docs/${d.id}`, { method: 'PUT', body: { title: e.target.value } }).then(() => toast('Renamed')).catch((err) => toast(err.message, true));
  $('#dlBtn').onclick = async (e) => { e.preventDefault(); await flush(); location.href = e.currentTarget.href; };
  $('#copyLink').onclick = async () => { await flush(); try { await navigator.clipboard.writeText(d.share_url); toast('Share link copied'); } catch { prompt('Copy this link:', d.share_url); } };
  $('#regenBtn').onclick = (e) => { if (!confirm('Write it again? Your edits to the words will be replaced.')) return; busy(e.target, async () => { await api(`/tools/docs/${d.id}/regenerate`, { body: {} }); location.reload(); }); };
  $('#delBtn').onclick = async () => { if (!confirm(`Delete this ${noun}?`)) return; await api(`/tools/docs/${d.id}`, { method: 'DELETE' }); location.hash = `#/${kind}`; };
  // ---------------------------------------------------------------- Design mode (drag and drop on the pages)
  let design = null;
  const setMode = async (m) => {
    try { localStorage.setItem('axf-hd-mode', m); } catch { /* private window */ }
    document.querySelectorAll('#hdMode [data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    if (m === 'design') {
      if (design) return;
      await flush();
      $('#hdForm').hidden = true; $('#hdDesign').hidden = false;
      const { mountDesign } = await import('./html-design.js');
      const v = r.verification, facts = v?.facts || [];
      const note = facts.length ? `<p class="small muted" style="margin:14px 2px 0"><span class="mi in">fact_check</span> Fact check: ${facts.filter((f) => f.status === 'confirmed').length} facts checked online, ${facts.filter((f) => /^from_/.test(f.status)).length} from the CRM / SWOT, ${facts.filter((f) => f.status === 'removed').length + (v.not_found || []).length} left out. Details under Words.</p>` : '';
      design = await mountDesign(pagesEl, $('#hdDesign'), { doc: d, api, toast, size: r.size, note });
    } else {
      if (!design) { $('#hdForm').hidden = false; return; }
      await design.flush(); design.destroy(); design = null;
      $('#hdDesign').hidden = true; $('#hdForm').hidden = false;
      show((await api(`/tools/docs/${d.id}/html`)).html);
    }
  };
  document.querySelectorAll('#hdMode [data-m]').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
  let startMode = 'design';
  try { startMode = localStorage.getItem('axf-hd-mode') || 'design'; } catch { /* private window */ }
  await setMode(startMode === 'words' ? 'words' : 'design');
  $('#classicBtn').onclick = (e) => busy(e.target, async () => {
    if (!confirm(`Make a copy of this ${noun} in the classic editor? The copy is a new document for the same lead (boxes, texts and pictures you can drag); this one stays as it is.`)) return;
    await setMode('design');
    await design.flush();
    toast('Converting the pages…');
    const conv = await design.convert();
    const { id } = await api(`/tools/docs/${d.id}/classic`, { body: { design: conv } });
    toast('Copy made: opening the classic editor');
    location.hash = `#/${kind}/${id}`;
  });

  const pr = $('#hdPrices');
  if (pr) pr.onclick = () => {
    const items = JSON.parse(JSON.stringify(d.items || []));
    const dlg = modal('Prices', `<p class="small muted">The price table of the proposal. Amounts in ${esc(d.currency || 'INR')}; tax is added as "+ ${esc(d.tax_label || 'GST')}".</p><div id="hdItems"></div><button class="btn sm ghost" id="hdAddItem"><span class="mi">add</span>Add a row</button>`, '<button class="btn primary" id="hdSaveItems">Save prices</button>');
    const draw = () => { $('#hdItems', dlg).innerHTML = items.map((it, i) => `<div class="row" style="gap:8px;margin:6px 0"><input class="grow" data-i="${i}" data-k="name" value="${esc(it.name)}"><input style="width:130px" type="number" data-i="${i}" data-k="price" value="${esc(it.price)}"><button class="btn ghost sm icon-only" data-x="${i}" aria-label="Remove"><span class="mi">close</span></button></div>`).join(''); };
    draw();
    $('#hdItems', dlg).oninput = (e) => { const el = e.target; if (el.dataset.k) items[el.dataset.i][el.dataset.k] = el.dataset.k === 'price' ? Number(el.value) || 0 : el.value; };
    $('#hdItems', dlg).onclick = (e) => { const x = e.target.closest('[data-x]'); if (x) { items.splice(Number(x.dataset.x), 1); draw(); } };
    $('#hdAddItem', dlg).onclick = () => { items.push({ name: '', price: 0 }); draw(); };
    $('#hdSaveItems', dlg).onclick = (e) => busy(e.target, async () => {
      const saved = await api(`/tools/docs/${d.id}`, { method: 'PUT', body: { items } });
      d.items = saved.items;
      dlg.close();
      show((await api(`/tools/docs/${d.id}/html-preview`, { body: { data } })).html);
      toast('Prices saved');
    });
  };
  return { flush: async () => { await flush(); if (design) { await design.flush(); design.destroy(); design = null; } } };
}
