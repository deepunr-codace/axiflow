/*
 * Pitch Script Maker: form + recent scripts (#/script) and the script page (#/script/:id).
 * The script page is plain text sections (not a canvas): edit anything, it saves by itself.
 */
let H; // { $, $$, api, esc, toast, busy, modal, view }
export function setupScripts(helpers) { H = helpers; }

const I = (n) => `<span class="mi">${n}</span>`;
let pollTimer = null;
let saveTimer = null;

export async function renderScripts(id) {
  clearTimeout(pollTimer);
  if (id && id !== 'new') return renderScript(Number(id));
  if (!id) return H.docList('script');
  const opts = await H.api('/tools/options?kind=script');
  const pre = sessionStorage.getItem('script-lead');
  sessionStorage.removeItem('script-lead');
  H.view.innerHTML = `
  <p><a class="back-link" href="#/script">${I('arrow_back')}All scripts</a></p>
  <div class="hello"><h2>New pitch script</h2><p>A call script for the telecaller, written for one business: an introduction, the opportunities we see, three pitching points, questions to ask and how to book the meeting. ${opts.ai.enabled ? 'AI checks their website and the web first (about a minute).' : 'AI is off (no API key), so it uses the standard script for the vertical. You can edit everything.'}</p></div>
  <div class="tool-new">
    <form class="card" id="scriptForm">
      <label>CRM lead *<select id="fromLead" required><option value="">${opts.leads.length ? 'Pick a lead from the CRM' : 'No CRM leads yet'}</option>${opts.leads.map((l) => `<option value="${l.id}">${H.esc(l.company)}${l.city ? `, ${H.esc(l.city)}` : ''}</option>`).join('')}</select></label>
      <div class="form-grid" style="margin-top:14px">
        <label class="full">Business name *<input name="company" required maxlength="120"></label>
        <label>Contact person<input name="contact_name" maxlength="120"></label>
        <label>Phone / WhatsApp<input name="phone" maxlength="40" inputmode="tel"></label>
        <label>Vertical<select name="vertical"><option value="">Choose…</option>${opts.verticals.map((v) => `<option>${H.esc(v)}</option>`).join('')}</select></label>
        <label>Place<input name="city" maxlength="80"></label>
        <label>Current website<input name="website" maxlength="200" placeholder="Leave empty if none"></label>
        <label>Script language<select name="language">${opts.languages.map((l) => `<option>${H.esc(l)}</option>`).join('')}</select></label>
        <label class="full">What we know about them<textarea name="notes" maxlength="6000" placeholder="e.g. sells spices wholesale and retail, active on Instagram, no online orders, owner prefers WhatsApp…"></textarea></label>
        ${opts.ai.enabled ? '<label class="check full"><input type="checkbox" name="research" checked> Research the business on the web first (better script, about a minute more)</label>' : ''}
      </div>
      <input type="hidden" name="lead_id">
      <div class="row" style="margin-top:16px"><a class="btn ghost" href="#/script">Cancel</a><span class="spacer"></span><button class="btn primary">${I('record_voice_over')}Write script</button></div>
    </form>
  </div>`;
  const f = H.$('#scriptForm');
  const fill = async (leadId) => {
    f.elements.lead_id.value = leadId || '';
    if (!leadId) return;
    const p = await H.api(`/tools/prefill/${leadId}`);
    for (const k of ['company', 'contact_name', 'city', 'website', 'notes', 'phone']) if (p[k] !== undefined && f.elements[k]) f.elements[k].value = p[k] || '';
    const v = opts.verticals.find((x) => p.industry && x.toLowerCase().split(/[ ,&]+/).some((w) => w.length > 3 && p.industry.toLowerCase().includes(w)));
    if (v) f.elements.vertical.value = v;
  };
  H.$('#fromLead').onchange = (e) => fill(e.target.value);
  if (pre) { H.$('#fromLead').value = pre; fill(pre); }
  f.onsubmit = (e) => {
    e.preventDefault();
    H.busy(e.submitter, async () => {
      const body = Object.fromEntries(new FormData(f));
      body.research = !!f.elements.research?.checked;
      const r = await H.api('/tools/script', { body });
      location.hash = `#/script/${r.id}`;
    });
  };
}

// ---------------------------------------------------------------- script page
const listEditor = (key, rows, a, b, la, lb) => `<div class="sc-list" data-list="${key}">${rows.map((r) => `<div class="sc-row"><input data-a value="${H.esc(r[a] || '')}" placeholder="${la}"><textarea data-b rows="2" placeholder="${lb}">${H.esc(r[b] || '')}</textarea><button type="button" class="btn ghost sm icon-only" data-rm aria-label="Remove">${I('close')}</button></div>`).join('')}</div>
  <button type="button" class="btn sm" data-add="${key}">${I('add')}Add</button>`;

async function renderScript(id) {
  const d = await H.api(`/tools/docs/${id}`);
  const c = d.content || {};
  const meta = [d.input.contact_name, d.input.vertical, d.input.city].filter(Boolean).map(H.esc).join(' · ');
  if (d.status !== 'ready') {
    H.view.innerHTML = `<p><a class="back-link" href="#/script">${I('arrow_back')}All scripts</a></p>
      <div class="card"><h2>${H.esc(d.title)}</h2><p class="muted">${d.status === 'error' ? `Could not write the script: ${H.esc(d.error || 'unknown error')}` : 'Writing the script: checking their website, researching the business and drafting the call…'}</p>
      ${d.status === 'error' ? `<button class="btn primary" id="retry">${I('refresh')}Try again</button>` : '<div class="bar"><div class="indet"></div></div>'}</div>`;
    if (d.status === 'error') H.$('#retry').onclick = (e) => H.busy(e.target, async () => { await H.api(`/tools/docs/${id}/regenerate`, { body: {} }); renderScript(id); });
    else pollTimer = setTimeout(() => location.hash === `#/script/${id}` && renderScript(id), 2500);
    return;
  }
  H.view.innerHTML = `
  <p><a class="back-link" href="#/script">${I('arrow_back')}All scripts</a></p>
  <div class="row sc-head">
    <div class="grow"><h2 style="margin:0;font-size:24px">${H.esc(d.title)}</h2>
      <div class="small muted" style="margin-top:4px">${meta}${d.input.website ? ` · <a href="${H.esc(d.input.website)}" target="_blank" rel="noopener">${H.esc(d.input.website.replace(/^https?:\/\//, ''))}${I('open_in_new')}</a>` : ''}${d.input.phone ? ` · <a href="tel:${H.esc(d.input.phone)}">${I('call')}${H.esc(d.input.phone)}</a>` : ''}</div></div>
    <span class="tag${d.source === 'claude' ? ' claude' : ''}">${d.source === 'claude' ? 'Written by Claude' : d.source === 'ai' ? 'Written by AI' : 'Standard script'}</span><span class="small muted" id="scStatus">Saved</span>
    <button class="btn" id="scCopy">${I('content_copy')}Copy script</button>
    <a class="btn" href="/api/tools/docs/${id}/pdf?download=1">${I('download')}PDF</a>
    ${d.lead_id ? `<button class="btn primary" id="scUse" title="Saves it as this lead's call script; the CRM gets it with the next sync">${I('send')}Use for this lead's calls</button>` : ''}
    <details class="dd"><summary class="btn sm">More${I('expand_more')}</summary><div>
      <button data-act="regen">${I('auto_awesome')}Write it again</button>
      <button data-act="del" class="danger">${I('delete')}Delete</button></div></details>
  </div>
  ${d.error ? `<div class="card next-action small" style="margin-top:12px">${H.esc(d.error)}</div>` : ''}
  <form id="scForm" class="sc-form">
    <div class="card sc-point"><label>Pitch point (for the CRM)<input name="pitch_point" value="${H.esc(c.pitch_point || '')}"></label></div>
    <div class="grid g2">
      <div class="card"><h2>${I('waving_hand')}Introduction</h2><textarea name="introduction" rows="4">${H.esc(c.introduction || '')}</textarea></div>
      <div class="card"><h2>${I('event')}Booking the meeting</h2>
        <label>Ask<textarea name="booking.ask" rows="2">${H.esc(c.booking?.ask || '')}</textarea></label>
        <label style="margin-top:10px">If yes<textarea name="booking.if_yes" rows="2">${H.esc(c.booking?.if_yes || '')}</textarea></label>
        <label style="margin-top:10px">If not now<textarea name="booking.if_not_now" rows="2">${H.esc(c.booking?.if_not_now || '')}</textarea></label></div>
    </div>
    <div class="card"><h2>${I('lightbulb')}Opportunities for them</h2>${listEditor('opportunities', c.opportunities || [], 'title', 'detail', 'Opportunity', 'Why it matters for them')}</div>
    <div class="card"><h2>${I('format_list_numbered')}Three main pitching points</h2>${listEditor('pitch_points', c.pitch_points || [], 'point', 'detail', 'Point', 'What to say')}</div>
    <div class="grid g2">
      <div class="card"><h2>${I('help')}Questions to ask</h2><p class="small muted">One per line.</p><textarea name="questions" rows="7">${H.esc((c.questions || []).join('\n'))}</textarea></div>
      <div class="card"><h2>${I('forum')}If they say…</h2>${listEditor('objections', c.objections || [], 'objection', 'response', 'Objection', 'Reply')}</div>
    </div>
    <div class="card"><div class="row"><h2 class="grow" style="margin:0">${I('record_voice_over')}Word-for-word script</h2><span class="small muted">[pause] and [listen] are cues for the caller</span></div>
      <textarea name="script" class="sc-script" rows="22">${H.esc(c.script || '')}</textarea></div>
  </form>`;

  const f = H.$('#scForm');
  const read = () => {
    const lists = {};
    for (const box of H.$$('[data-list]', f)) {
      const [a, b] = { opportunities: ['title', 'detail'], pitch_points: ['point', 'detail'], objections: ['objection', 'response'] }[box.dataset.list];
      lists[box.dataset.list] = H.$$('.sc-row', box).map((r) => ({ [a]: H.$('[data-a]', r).value, [b]: H.$('[data-b]', r).value })).filter((x) => x[a] || x[b]);
    }
    return {
      pitch_point: f.elements.pitch_point.value, introduction: f.elements.introduction.value,
      questions: f.elements.questions.value.split('\n').map((s) => s.trim()).filter(Boolean),
      booking: { ask: f.elements['booking.ask'].value, if_yes: f.elements['booking.if_yes'].value, if_not_now: f.elements['booking.if_not_now'].value },
      script: f.elements.script.value, ...lists,
    };
  };
  const save = () => {
    clearTimeout(saveTimer);
    H.$('#scStatus').textContent = 'Saving…';
    saveTimer = setTimeout(async () => {
      try { await H.api(`/tools/docs/${id}`, { method: 'PUT', body: { content: read() } }); H.$('#scStatus').textContent = 'Saved'; } catch (e) { H.$('#scStatus').textContent = 'Not saved'; H.toast(e.message, true); }
    }, 700);
  };
  f.addEventListener('input', save);
  f.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { rm.closest('.sc-row').remove(); save(); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      const box = H.$(`[data-list="${add.dataset.add}"]`, f);
      box.insertAdjacentHTML('beforeend', `<div class="sc-row"><input data-a placeholder="New"><textarea data-b rows="2"></textarea><button type="button" class="btn ghost sm icon-only" data-rm aria-label="Remove">${I('close')}</button></div>`);
      H.$('.sc-row:last-child [data-a]', box).focus();
    }
  });
  H.$('#scCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(f.elements.script.value); H.toast('Script copied'); } catch { f.elements.script.select(); H.toast('Press Ctrl+C to copy'); }
  };
  if (H.$('#scUse')) H.$('#scUse').onclick = (e) => H.busy(e.target, async () => { clearTimeout(saveTimer); await H.api(`/tools/docs/${id}`, { method: 'PUT', body: { content: read() } }); await H.api(`/tools/docs/${id}/use-for-lead`, { body: {} }); H.toast("Saved as the lead's call script"); });
  H.$$('.dd [data-act]').forEach((b) => (b.onclick = () => H.busy(b, async () => {
    if (b.dataset.act === 'regen') { if (!confirm('Write the script again? Your edits will be replaced.')) return; await H.api(`/tools/docs/${id}/regenerate`, { body: {} }); renderScript(id); }
    if (b.dataset.act === 'del') { if (!confirm(`Delete the script for ${d.title}?`)) return; await H.api(`/tools/docs/${id}`, { method: 'DELETE' }); H.toast('Script deleted'); location.hash = '#/script'; }
  })));
}
