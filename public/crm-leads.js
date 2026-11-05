/*
 * Leads (#/crm, #/crm/:key): live view of the team CRM. Read from the CRM on every visit and
 * refreshed every 30 seconds while the page is open. Nothing here writes to the CRM.
 */
let H; // { $, $$, api, esc, toast, busy, view, fmtDate, fmtDay, money, simplePill }
export function setupCrmLeads(helpers) { H = helpers; }

const I = (n) => `<span class="mi">${n}</span>`;
const REFRESH_MS = 30000;
let timer = null;

const words = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const HEAT = { hot: 'red', warm: 'amber', cold: 'blue' };
const heatTag = (s) => (s ? `<span class="tag ${HEAT[s] || 'grey'}">${H.esc(words(s))}</span>` : '');
const dealTag = (d) => (!d ? '<span class="small muted">No deal</span>'
  : `<span class="tag ${d.stage === 'won' ? 'green' : d.stage === 'lost' || d.archived ? 'grey' : 'purple'}" title="Deal: ${H.esc(d.name || '')}">${H.esc(words(d.stage))}</span>`);
const tel = (p) => (p ? `<a href="tel:${H.esc(String(p).replace(/[^\d+]/g, ''))}">${H.esc(p)}</a>` : '');
const mail = (e) => (e ? `<a href="mailto:${H.esc(e)}">${H.esc(e)}</a>` : '');
const site = (u) => (u ? `<a href="${H.esc(/^https?:/i.test(u) ? u : `https://${u}`)}" target="_blank" rel="noopener">${H.esc(u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</a>` : '');
const since = (iso) => {
  if (!iso) return '';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : H.fmtDate(iso);
};

function liveLine(d) {
  return `<span class="small muted" id="liveAt">${I('sync')} Live from the team CRM${d.read_only ? ' (read only)' : ''} · updated ${since(d.at)}</span>`;
}
function keepFresh(hashPrefix, fn) {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!location.hash.startsWith(hashPrefix) || document.hidden) return;
    fn().catch(() => {});
  }, REFRESH_MS);
}

const FILTERS = [
  ['all', 'All', () => true],
  ['open', 'Open deal', (l) => l.deal && !l.deal.closed],
  ['hot', 'Hot', (l) => l.contact?.status === 'hot'],
  ['closed', 'Won or lost', (l) => l.deal?.closed],
];

export async function renderCrmLeads(key) {
  clearInterval(timer);
  if (key) return renderCrmLead(key);
  const tab = sessionStorage.getItem('crmTab') || 'all';
  let data = await H.api('/atomic/leads');
  if (!data.connected) {
    H.view.innerHTML = `<div class="hello"><h2>Leads</h2></div><div class="card empty">The team CRM is not connected. Add CRM_SUPABASE_URL and CRM_SUPABASE_SECRET_KEY to the server settings, then open this page again.</div>`;
    return;
  }
  H.view.innerHTML = `
  <div class="hello"><h2>Leads</h2><p>Every lead in the team CRM (a company with a deal), as the telecaller sees it. Add, edit and call leads in the CRM; this list follows it.</p></div>
  <div class="toolbar"><div class="seg" id="crmSeg"></div><span class="spacer"></span>
    <input id="crmQ" placeholder="Search name, phone, city" value="${H.esc(sessionStorage.getItem('crmQ') || '')}" style="min-width:220px">
    <button class="btn sm icon-only" id="crmReload" title="Refresh now" aria-label="Refresh now">${I('refresh')}</button></div>
  <div class="row" style="margin:-4px 0 12px" id="crmLive">${liveLine(data)}</div>
  <div id="crmList"></div>`;
  const draw = () => {
    const q = H.$('#crmQ').value.toLowerCase().trim();
    sessionStorage.setItem('crmQ', H.$('#crmQ').value);
    H.$('#crmSeg').innerHTML = FILTERS.map(([k, label, f]) => `<button class="${k === tab ? 'on' : ''}" data-ct="${k}">${label} <span>${data.leads.filter(f).length}</span></button>`).join('');
    H.$$('[data-ct]').forEach((b) => (b.onclick = () => { sessionStorage.setItem('crmTab', b.dataset.ct); renderCrmLeads(); }));
    const f = FILTERS.find(([k]) => k === tab)?.[2] || (() => true);
    const list = data.leads.filter(f).filter((l) => !q || [l.name, l.contact?.name, l.email, l.phone, l.city, l.sector, l.deal?.stage].join(' ').toLowerCase().includes(q));
    H.$('#crmList').innerHTML = list.length ? list.map((l) => `<a class="item row link" href="#/crm/${l.key}">
      <span class="ini">${H.esc(initials(l.name))}</span>
      <div class="grow"><b>${H.esc(l.name)}</b><div class="small muted">${[l.contact?.name, l.contact?.title, l.city, l.sector].filter(Boolean).map(H.esc).join(' · ') || 'No contact yet'}</div></div>
      <span class="small muted crm-phone">${H.esc(l.phone || l.email || '')}</span>
      ${l.contact?.last_outcome ? `<span class="small muted" title="Last call result">${I('call')} ${H.esc(words(l.contact.last_outcome))}</span>` : ''}
      ${heatTag(l.contact?.status)}${dealTag(l.deal)}
      ${l.axiflow ? `<span title="Being worked on in AxiFlow">${H.simplePill(l.axiflow.stage)}</span>` : ''}</a>`).join('')
      : `<div class="card empty">${data.leads.length ? 'No leads match.' : 'The CRM has no leads yet. A company shows up here once it has a deal in the CRM.'}</div>`;
    H.groupItems?.(H.view);
  };
  H.$('#crmQ').oninput = draw;
  const reload = async () => { data = await H.api('/atomic/leads'); H.$('#crmLive').innerHTML = liveLine(data); draw(); };
  H.$('#crmReload').onclick = (e) => H.busy(e.currentTarget, async () => { await reload(); H.toast(`${data.leads.length} leads in the CRM`); });
  draw();
  keepFresh('#/crm', async () => { if (location.hash.replace(/\/$/, '') === '#/crm') await reload(); });
}

const initials = (s) => String(s || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

async function renderCrmLead(key) {
  const draw = (d) => {
    const co = d.company;
    const main = d.contacts.find((c) => c.is_primary) || d.contacts[0];
    const title = co?.name || main?.name || 'Lead';
    const rows = (pairs) => `<table>${pairs.filter(([, v]) => v).map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('') || '<tr><td class="muted">Nothing filled in</td></tr>'}</table>`;
    H.view.innerHTML = `
    <div class="detail-head">
      <div><a class="small muted" href="#/crm">${I('arrow_back')}All leads</a>
        <h2 style="margin-top:6px">${H.esc(title)}</h2>
        <div class="muted">${[co?.sector, co?.city, co?.owner ? `Owner: ${co.owner}` : ''].filter(Boolean).map(H.esc).join(' · ')}</div>
        <div class="row" style="margin-top:8px">${heatTag(main?.status)}${d.deals.map(dealTag).join('')}${d.axiflow ? H.simplePill(d.axiflow.stage) : ''}</div></div>
      <span class="spacer"></span>
      <div class="row">${d.axiflow ? `<a class="btn sm primary" href="#/lead/${d.axiflow.id}">${I('open_in_new')}Open in AxiFlow</a>` : ''}
        <button class="btn sm icon-only" id="crmReload" title="Refresh now" aria-label="Refresh now">${I('refresh')}</button></div>
    </div>
    <div class="row" style="margin:-6px 0 14px" id="crmLive">${liveLine(d)}</div>
    <div id="crmMade"></div>
    ${!d.axiflow ? '<p class="hint">AxiFlow brings this lead in at its next check of the CRM (within a minute), then makes the pitch, call script and brochure.</p>' : ''}
    <div class="grid g2">
      ${co ? `<div class="card"><h2>Company</h2>${rows([
        ['Website', site(co.website)], ['Phone', tel(co.phone)], ['WhatsApp', tel(co.whatsapp)], ['Email', mail(co.email)],
        ['Address', H.esc(co.address || '')], ['Size', co.size ? H.esc(String(co.size)) : ''], ['Lead date', co.lead_date ? H.fmtDay(co.lead_date) : ''],
        ['Pitch point', H.esc(co.pitch_point || '')], ['About', H.esc(co.description || '')],
      ])}</div>` : ''}
      <div class="card"><h2>Contacts <span class="small muted">${d.contacts.length}</span></h2>
        ${d.contacts.map((c) => `<div class="crm-contact"><div class="row"><b>${H.esc(c.name)}</b>${c.is_primary ? '<span class="pill">Main</span>' : ''}${heatTag(c.status)}${c.do_not_contact ? '<span class="tag red">Do not contact</span>' : ''}</div>
          ${rows([['Role', H.esc(c.title || '')], ['Phone', tel(c.phone)], ['WhatsApp', tel(c.whatsapp)], ['Email', mail(c.email)],
            ['Call stage', H.esc(words(c.lead_stage || ''))], ['Last call', c.last_outcome ? `${H.esc(words(c.last_outcome))}${c.last_attempt_at ? ` <span class="small muted">${H.fmtDate(c.last_attempt_at)}</span>` : ''}` : ''],
            ['Next call', c.next_attempt_at ? H.fmtDate(c.next_attempt_at) : ''], ['Attempts', c.retry_count ? String(c.retry_count) : '']])}</div>`).join('') || '<p class="muted">No contacts yet.</p>'}
      </div>
      <div class="card"><h2>Deals <span class="small muted">${d.deals.length}</span></h2>
        ${d.deals.length ? `<table>${d.deals.map((x) => `<tr><td><b>${H.esc(x.name || 'Deal')}</b><div class="small muted">${x.expected_closing_date ? `Expected close ${H.fmtDay(x.expected_closing_date)}` : ''}</div></td><td>${dealTag(x)}</td><td>${x.amount ? H.money(x.amount) : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No deal yet.</p>'}
        ${d.brochures.length ? `<h3>Brochures</h3>${d.brochures.map((b) => `<div class="row small">${b.url ? `<a href="${H.esc(b.url)}" target="_blank" rel="noopener">${H.esc(b.title || 'Brochure')}${I('open_in_new')}</a>` : H.esc(b.title || 'Brochure')}<span class="pill">${H.esc(b.status || '')}</span></div>`).join('')}` : ''}
      </div>
      <div class="card"><h2>Tasks <span class="small muted">${d.tasks.filter((t) => !t.done_date).length} open</span></h2>
        ${d.tasks.map((t) => `<div class="row small" style="padding:4px 0">${I(t.done_date ? 'task_alt' : 'radio_button_unchecked')}<div class="grow">${H.esc(t.text || t.type || 'Task')}<div class="muted">${[t.type, t.on, t.due_date ? `due ${H.fmtDay(t.due_date)}` : ''].filter(Boolean).map(H.esc).join(' · ')}</div></div></div>`).join('') || '<p class="muted">No tasks.</p>'}
      </div>
    </div>
    <div class="card timeline" style="margin-top:16px"><h2>Notes <span class="small muted">${d.notes.length}</span></h2>
      ${d.notes.map((n) => `<div class="tl"><span class="dot note"></span><div><b>${H.esc(n.on || '')}</b> <span class="small muted">${H.fmtDate(n.date)}${n.by ? ` · ${H.esc(n.by)}` : ''}</span>${n.status ? ` ${heatTag(n.status)}` : ''}<pre>${H.esc(n.text || '')}</pre>
        ${(n.attachments || []).map((a) => a?.src ? `<a class="small" href="${H.esc(a.src)}" target="_blank" rel="noopener">${I('attach_file')}${H.esc(a.title || 'Attachment')}</a>` : '').join(' ')}</div></div>`).join('') || '<div class="empty">No notes yet.</div>'}
    </div>`;
    H.$('#crmReload').onclick = (e) => H.busy(e.currentTarget, async () => { draw(await H.api(`/atomic/leads/${encodeURIComponent(key)}`)); H.toast('Up to date'); });
    made(key);
  };
  draw(await H.api(`/atomic/leads/${encodeURIComponent(key)}`));
  keepFresh(`#/crm/${key}`, async () => draw(await H.api(`/atomic/leads/${encodeURIComponent(key)}`)));
}

/** "Made for this lead": pitch script, brochure and proposal from AxiFlow, with quick actions. */
async function made(key) {
  const box = H.$('#crmMade');
  const link = H.view.querySelector('a[href^="#/lead/"]');
  const id = link?.getAttribute('href').split('/').pop();
  if (!box || !id) return;
  const d = await H.api(`/leads/${id}`).catch(() => null);
  if (!d || !H.$('#crmMade')) return;
  const l = d.lead;
  const doc = (k) => d.tool_docs.find((x) => x.kind === k && x.status === 'ready') || d.tool_docs.find((x) => x.kind === k);
  const item = (k, icon, label, open) => {
    const x = doc(k);
    return `<div class="item row"><span class="mi">${icon}</span><div class="grow"><b>${label}</b><div class="small muted">${x ? (x.status === 'ready' ? `Ready · ${H.fmtDate(x.updated_at)}` : x.status === 'working' ? 'Being made…' : H.esc(x.status)) : 'Not made yet'}</div></div>${x ? `<a class="btn sm" href="#/${k}/${x.id}"><span class="mi">edit</span>Open</a>` : open}</div>`;
  };
  box.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="sec-h"><h2>Made by AxiFlow</h2><span class="spacer"></span>${H.simplePill(l.stage)}</div>
    ${item('script', 'record_voice_over', 'Call script', `<a class="btn sm" href="#/script" data-script-lead="${l.id}"><span class="mi">add</span>Write one</a>`)}
    ${item('brochure', 'menu_book', 'Brochure', l.brochure_version ? `<a class="btn sm" target="_blank" href="/pdf/brochure/${l.token}.pdf"><span class="mi">open_in_new</span>PDF</a>` : '')}
    ${item('proposal', 'request_quote', 'Proposal', `<button class="btn sm" id="crmMakeProp"><span class="mi">add</span>Make it</button>`)}
    ${l.brochure_version ? `<p class="small muted" style="margin-top:8px">Brochure link for the client: <a target="_blank" href="/pdf/brochure/${l.token}.pdf">/pdf/brochure/${H.esc(l.token)}.pdf</a>${l.interested === 'yes' ? ' · also in the CRM brochures table' : ''}</p>` : ''}</div>`;
  H.groupItems?.(box);
  const mk = H.$('#crmMakeProp');
  if (mk) mk.onclick = (e) => H.busy(e.currentTarget, async () => { await H.api(`/leads/${l.id}/actions/proposal`, { body: {} }); H.toast('Making the proposal'); setTimeout(() => made(key), 4000); });
}
