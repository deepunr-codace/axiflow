/*
 * AxiFlow dropdowns: every <select> is shown as our own button + menu, matching the app in both themes.
 * The real <select> stays in the page (hidden) and remains the source of truth, so forms, `.value`,
 * `.onchange` and saving keep working unchanged. Programmatic `select.value = …` updates the button too.
 * Opt out with <select data-native>. Multi-selects and list boxes (size) are left as they are.
 */
const done = new WeakSet();
let menu = null; // { el, sel, btn, active, onKey, onDown, onScroll }

export function enhanceSelects(root = document) {
  if (root.matches?.('select')) enhance(root);
  root.querySelectorAll?.('select:not([multiple]):not([size]):not([data-native])').forEach(enhance);
}

/** Upgrades selects already on the page and any added later (views, dialogs, editor panels). */
export function autoEnhanceSelects() {
  enhanceSelects(document);
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) enhanceSelects(n);
  }).observe(document.body, { childList: true, subtree: true });
}

function enhance(sel) {
  if (done.has(sel) || sel.multiple || sel.size > 1 || sel.hasAttribute('data-native')) return;
  done.add(sel);
  const wrap = document.createElement('span');
  wrap.className = 'xsel';
  for (const c of sel.classList) wrap.classList.add(c);
  if (sel.style.width) wrap.style.width = sel.style.width;
  sel.parentNode.insertBefore(wrap, sel);
  wrap.append(sel);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'xsel-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const label = sel.closest('label')?.childNodes[0]?.textContent?.trim() || sel.getAttribute('aria-label') || sel.name || '';
  if (label) btn.setAttribute('aria-label', label);
  btn.innerHTML = '<span class="xsel-val"></span><span class="mi" aria-hidden="true">expand_more</span>';
  wrap.append(btn);
  sel.classList.add('xsel-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');

  const sync = () => {
    const o = sel.options[sel.selectedIndex];
    btn.querySelector('.xsel-val').textContent = o ? o.text : '';
    btn.classList.toggle('placeholder', !o || o.value === '');
    btn.disabled = sel.disabled;
  };
  // keep the button in step when code sets .value / .selectedIndex directly
  const proto = HTMLSelectElement.prototype;
  for (const p of ['value', 'selectedIndex']) {
    const d = Object.getOwnPropertyDescriptor(proto, p);
    Object.defineProperty(sel, p, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(); } });
  }
  sel.addEventListener('change', sync);
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  btn.addEventListener('click', () => (menu?.sel === sel ? close() : open(sel, btn)));
  btn.addEventListener('keydown', (e) => {
    if (menu?.sel === sel) return; // the open menu handles keys itself
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(sel, btn); }
  });
  sync();
}

// ------------------------------------------------------------------ menu
function options(sel) {
  const items = [];
  for (const child of sel.children) {
    if (child.tagName === 'OPTGROUP') {
      items.push({ group: child.label });
      for (const o of child.children) items.push({ o });
    } else if (child.tagName === 'OPTION') items.push({ o: child });
  }
  return items;
}

function open(sel, btn) {
  close();
  const el = document.createElement('div');
  el.className = 'xsel-menu';
  el.setAttribute('role', 'listbox');
  const opts = [...sel.options];
  for (const it of options(sel)) {
    if (it.group !== undefined) { el.insertAdjacentHTML('beforeend', `<div class="xsel-group"></div>`); el.lastChild.textContent = it.group; continue; }
    const i = opts.indexOf(it.o);
    const row = document.createElement('div');
    row.className = 'xsel-opt' + (i === sel.selectedIndex ? ' selected' : '') + (it.o.disabled ? ' disabled' : '') + (it.o.value === '' ? ' is-empty' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(i === sel.selectedIndex));
    row.dataset.i = i;
    row.innerHTML = '<span class="xsel-text"></span><span class="mi" aria-hidden="true">check</span>';
    row.firstChild.textContent = it.o.text;
    el.append(row);
  }
  // inside a modal dialog the menu must live in the dialog (top layer), otherwise in <body>
  (sel.closest('dialog[open]') || document.body).append(el);
  place(el, btn);
  btn.setAttribute('aria-expanded', 'true');
  btn.closest('.xsel').classList.add('open');

  const rows = () => [...el.querySelectorAll('.xsel-opt:not(.disabled)')];
  const setActive = (row) => {
    el.querySelectorAll('.xsel-opt.active').forEach((r) => r.classList.remove('active'));
    if (row) { row.classList.add('active'); row.scrollIntoView({ block: 'nearest' }); }
    menu.active = row;
  };
  let typed = '', typedAt = 0;
  const onKey = (e) => {
    const list = rows();
    const at = list.indexOf(menu.active);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(e.key)) e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(list[Math.min(list.length - 1, at + 1)] || list[0]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(list[Math.max(0, at - 1)] || list[0]); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(list[0]); }
    else if (e.key === 'End') { e.preventDefault(); setActive(list[list.length - 1]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (menu.active) choose(Number(menu.active.dataset.i)); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
    else if (e.key.length === 1 && /\S/.test(e.key)) { // type to jump
      typed = Date.now() - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
      typedAt = Date.now();
      const hit = list.find((r) => r.textContent.trim().toLowerCase().startsWith(typed));
      if (hit) setActive(hit);
    }
  };
  const onDown = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) close(); };
  const onScroll = (e) => { if (!el.contains(e.target)) close(); };
  el.addEventListener('mousemove', (e) => { const r = e.target.closest('.xsel-opt:not(.disabled)'); if (r && r !== menu.active) setActive(r); });
  el.addEventListener('click', (e) => { const r = e.target.closest('.xsel-opt:not(.disabled)'); if (r) choose(Number(r.dataset.i)); });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', close);
  menu = { el, sel, btn, active: null, onKey, onDown, onScroll };
  setActive(el.querySelector('.xsel-opt.selected:not(.disabled)') || rows()[0]);
}

function place(el, btn) {
  const r = btn.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  el.style.minWidth = `${Math.max(r.width, 180)}px`;
  el.style.maxWidth = `${Math.max(r.width, Math.min(420, vw - 16))}px`;
  const h = Math.min(el.scrollHeight, 320);
  const below = vh - r.bottom - 8, above = r.top - 8;
  const up = below < h && above > below;
  el.style.maxHeight = `${Math.max(120, Math.min(320, up ? above - 6 : below - 6))}px`;
  el.style.top = up ? '' : `${r.bottom + 6}px`;
  el.style.bottom = up ? `${vh - r.top + 6}px` : '';
  el.style.left = `${Math.max(8, Math.min(r.left, vw - el.offsetWidth - 8))}px`;
  el.classList.toggle('up', up);
}

function choose(i) {
  const { sel } = menu;
  if (sel.selectedIndex !== i) {
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  close(true);
}

function close(refocus = false) {
  if (!menu) return;
  const { el, btn, onKey, onDown, onScroll } = menu;
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('pointerdown', onDown, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', close);
  el.remove();
  btn.setAttribute('aria-expanded', 'false');
  btn.closest('.xsel')?.classList.remove('open');
  menu = null;
  if (refocus && btn.isConnected) btn.focus();
}
