import fs from 'node:fs';
import path from 'node:path';
import { img, fontCss, esc, DIR } from './assets.js';

/*
 * "Codeace Growth Plan": the landscape A4 brochure made for Nirapara (Downloads/Nirapara Ecom Growth Brochure - Premium,
 * 2026-11-11), rebuilt from its own HTML: the CSS is that file's, verbatim (assets/html-docs/brochure.css), and the page
 * markup below is the same; only the words and the lists change per lead.
 * Pages: cover → challenge → opportunity → journey (4 steps) → plan (3 goals) → idea pages (2 or 4 ideas each) →
 * economics → delivery → results and next steps.
 */
export const SIZE = { width: 297 / 25.4 * 96, height: 210 / 25.4 * 96, paper: { width: '297mm', height: '210mm' }, cssPage: true }; // printed by its own @page size, like the reference
let CSS = null;
const css = () => (CSS ??= fs.readFileSync(path.join(DIR, 'brochure.css'), 'utf8'));
const two = (n) => String(n).padStart(2, '0');
const dots = (list) => `<ul class="dots">${(list || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
const NEW = '<span class="new">NEW</span>';
const head = (label, folio, isNew) => `<div class="head"><span class="label">${esc(label)}${isNew ? NEW : ''}</span><span class="folio">${two(folio)}</span></div>`;
const foot = (ctx) => `<div class="foot"><span><b>${esc(ctx.client)}</b> × Codeace</span><span>${esc(ctx.tag)}</span></div>`;
const CHECK = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5.2 4 7.6 8.6 2.4" fill="none" stroke="#A61E1A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// "₹399–999": the en dash set smaller, as in the reference
const figure = (v) => esc(v).replace(/–/g, '<small>–</small>');
// keep "sign-ups" on one line in the metrics grid (the reference used a non-breaking hyphen there)
const nobreak = (t) => esc(t).replace(/(\w)-(\w)/g, '$1&#8209;$2');

function cover(ctx, c) {
  return `<section class="page cover" data-page="1">
  <div class="sun"></div>
  ${c.script_word ? `<div class="mal">${esc(c.script_word)}</div>` : ''}
  <div class="top"><img src="${img('brochure-codeace-white.png')}" alt="Codeace"><span>${esc(ctx.tag)}</span></div>
  <h1>${esc(c.title)}${c.title_em ? ` <em>${esc(c.title_em)}</em>` : ''}</h1>
  <p class="sub">${esc(c.subtitle)}</p>
  <div class="bottom"><div>Prepared for<br><b>${esc(ctx.client)}</b></div><div style="text-align:right">Codeace<br>${esc(ctx.date)}</div></div>
</section>`;
}

function challenge(ctx, n, c) {
  return `<section class="page" data-page="${n}">
  ${head(c.label || 'The challenge', n)}
  <div class="split">
    <div>
      <h2>${esc(c.title)}</h2>
      ${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ''}
      ${c.statement ? `<p class="statement">${esc(c.statement)}</p>` : ''}
    </div>
    <div>
      <div class="rows" data-fit>
        ${(c.rows || []).slice(0, 3).map((r) => `<div class="row"><h3>${esc(r.title)}</h3>${dots(r.points)}</div>`).join('\n        ')}
      </div>
    </div>
  </div>
  ${c.gap ? `<div class="gap"><span class="k">${esc(c.gap_label || 'The gap')}</span><p>${esc(c.gap)}</p></div>` : ''}
  ${foot(ctx)}
</section>`;
}

function opportunity(ctx, n, o) {
  return `<section class="page" data-page="${n}">
  ${head(o.label || 'The opportunity', n)}
  <h2>${esc(o.title)}</h2>
  <div class="six" data-fit>
    ${(o.items || []).slice(0, 6).map((it) => `<div><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></div>`).join('\n    ')}
  </div>
  ${o.approach ? `<div class="band red"><h3>${esc(o.approach.title)}</h3><p>${esc(o.approach.text)}</p></div>` : ''}
  ${foot(ctx)}
</section>`;
}

function journey(ctx, n, j) {
  const hot = Number.isInteger(j.highlight) ? j.highlight : 2;
  return `<section class="page" data-page="${n}">
  ${head(j.label || 'The customer journey', n)}
  <h2>${esc(j.title)}</h2>
  ${j.lead ? `<p class="lead">${esc(j.lead)}</p>` : ''}
  <div class="steps" data-fit>
    ${(j.steps || []).slice(0, 4).map((s, i) => `<div class="step${i === hot ? ' hot' : ''}"><span class="dot"></span><span class="n">Step ${i + 1}</span><h3>${esc(s.title)}</h3>${s.quote ? `<q>${esc(s.quote)}</q>` : ''}<p>${esc(s.text)}</p></div>`).join('\n    ')}
  </div>
  ${j.bridge ? `<div class="band soft"><h3>${esc(j.bridge.title)}</h3><p>${esc(j.bridge.text)}</p></div>` : ''}
  ${foot(ctx)}
</section>`;
}

function plan(ctx, n, p, ideas) {
  const goals = (p.goals || []).slice(0, 3);
  const KEYS = ['', ' convert', ' retain'];
  const idx = ideas.map((it, i) => ({ ...it, no: i + 1 }));
  return `<section class="page" data-page="${n}">
  ${head(p.label || 'The plan', n)}
  <h2>${esc(p.title)}</h2>
  <div class="goals" data-fit>
    ${goals.map((g, gi) => `<div class="goal${KEYS[gi]}"><div class="gname">${esc(g.name)}</div><p class="gsub">${esc(g.sub)}</p>
      ${idx.filter((it) => (it.goal ?? 0) === gi).map((it) => `<div class="idea"><i>${it.no}</i>${esc(it.short || it.title)}${it.new ? '<span class="pill">NEW</span>' : ''}</div>`).join('')}${g.note ? `
      <p class="note">${esc(g.note)}</p>` : ''}</div>`).join('\n    ')}
  </div>
  ${foot(ctx)}
</section>`;
}

function ideaCard(it, no, pair) {
  return `<div class="card${it.featured ? ' dark' : ''}"><span class="num">${two(no)}</span><div><h3>${esc(it.title)}</h3>${pair && it.intro ? `<p class="intro">${esc(it.intro)}</p>` : ''}${dots(it.points)}${!pair && it.why ? `<p class="why">${esc(it.why)}</p>` : ''}</div></div>`;
}
function ideaPage(ctx, n, pg, ideas, first) {
  const list = ideas.slice(first, first + pg.count);
  const pair = list.length <= 2;
  const last = first + list.length;
  const label = pg.label || (list.length === 1 ? `Idea ${first + 1}` : pair ? `Ideas ${first + 1} and ${last}` : `Ideas ${first + 1} to ${last}`);
  return `<section class="page" data-page="${n}">
  ${head(label, n, pg.new ?? list.every((it) => it.new))}
  <h2>${esc(pg.title)}</h2>
  <div class="${pair ? 'pair' : 'quad'}${list.length === 1 ? ' solo' : ''}" data-fit>
    ${list.map((it, i) => ideaCard(it, first + i + 1, pair)).join('\n    ')}
  </div>
  ${foot(ctx)}
</section>`;
}

function economics(ctx, n, e) {
  return `<section class="page" data-page="${n}">
  ${head(e.label || 'Order economics', n, e.new)}
  <h2>${esc(e.title)}</h2>
  ${e.lead ? `<p class="lead">${esc(e.lead)}</p>` : ''}
  <div class="figs" data-fit>
    ${(e.figures || []).slice(0, 6).map((f) => `<div class="fig"><div class="v">${figure(f.value)}</div><div class="t">${esc(f.title)}</div><p>${esc(f.text)}</p></div>`).join('\n    ')}
  </div>
  ${e.note ? `<p class="fine">${esc(e.note)}</p>` : ''}
  ${foot(ctx)}
</section>`;
}

function delivery(ctx, n, d) {
  const phases = (d.phases || []).slice(0, 3);
  return `<section class="page" data-page="${n}">
  ${head(d.label || 'Delivery', n)}
  <h2>${esc(d.title)}</h2>
  <div class="deliver" data-fit>
    <div class="incl"><h3>${esc(d.includes_title || 'What we build')}</h3>
      <ul>
        ${(d.includes || []).slice(0, 12).map((t) => `<li>${CHECK}${esc(t)}</li>`).join('\n        ')}
      </ul></div>
    <div class="phases">
      ${phases.map((p, i) => `<div class="phase${i === 0 ? ' now' : ''}"><span class="when">${esc(p.when)}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></div>`).join('\n      ')}
    </div>
  </div>
  ${foot(ctx)}
</section>`;
}

function results(ctx, n, r) {
  const c = ctx.contact;
  return `<section class="page" data-page="${n}">
  ${head(r.label || 'Results and next steps', n)}
  <h2>${esc(r.title || 'How we will measure success')}</h2>
  <div class="metrics">
    ${(r.metrics || []).slice(0, 8).map((m) => `<div>${nobreak(m)}</div>`).join('')}
  </div>
  ${r.note ? `<p class="fine">${esc(r.note)}</p>` : ''}
  <div class="h4">Next steps</div>
  <div class="next">
    ${(r.next || []).slice(0, 3).map((t, i) => `<div><i>${i + 1}</i><span>${esc(t)}</span></div>`).join('\n    ')}
  </div>
  <div class="cta">
    <p>${esc(r.cta_before || 'Let us build what comes next for')}${r.cta_em ? ` <em>${esc(r.cta_em)}</em>` : ''}${esc(/^[A-Za-z0-9]/.test(r.cta_after || '') ? ' ' + r.cta_after : r.cta_after || '')}</p>
    <div class="who"><img src="${img('brochure-codeace-white.png')}" alt="Codeace"><br>${esc(c.phone)} · ${esc(c.email)}<br>${esc(c.website)} · ${esc(c.place)}</div>
  </div>
</section>`;
}

/** Idea pages: given counts, else 4 per page, or 2 when the ideas are long (many points, intros). */
export function ideaPlan(b) {
  const ideas = b.ideas || [];
  if ((b.idea_pages || []).length && b.idea_pages.reduce((a, p) => a + (p.count || 0), 0) === ideas.length) return b.idea_pages;
  const pages = [];
  for (let i = 0; i < ideas.length;) {
    const long = ideas.slice(i, i + 2).some((it) => (it.points || []).length > 4 || it.intro);
    const count = long ? Math.min(2, ideas.length - i) : Math.min(4, ideas.length - i);
    pages.push({ count, title: b.idea_titles?.[pages.length] || '' });
    i += count;
  }
  return pages;
}

/** The whole brochure. ctx = { client, tag, date, contact: { phone, email, website, place } }. */
export function brochureHtml(b, ctx, split = {}) {
  const pages = [cover(ctx, b.cover || {})];
  let n = 2;
  if (b.challenge) pages.push(challenge(ctx, n++, b.challenge));
  if (b.opportunity) pages.push(opportunity(ctx, n++, b.opportunity));
  if (b.journey) pages.push(journey(ctx, n++, b.journey));
  const ideas = b.ideas || [];
  if (b.plan && ideas.length) pages.push(plan(ctx, n++, b.plan, ideas));
  let first = 0;
  for (const pg of split.ideaPages || ideaPlan(b)) { pages.push(ideaPage(ctx, n++, pg, ideas, first)); first += pg.count; }
  if (b.economics) pages.push(economics(ctx, n++, b.economics));
  if (b.delivery) pages.push(delivery(ctx, n++, b.delivery));
  pages.push(results(ctx, n++, b.results || {}));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(ctx.title || `${ctx.client} · ${ctx.tag}`)}</title>
<style>${fontCss('brochure-fonts.css')}</style>
<style>
${css()}
/* added for AxiFlow: an idea alone on its page (long ideas split by the fit check) uses the full width */
.pair.solo { grid-template-columns: 1fr; }
.pair.solo ul.dots { columns: 2; column-gap: 13mm; }
.pair.solo ul.dots li { break-inside: avoid; }
</style>
</head>
<body>
${pages.join('\n\n')}
</body>
</html>`;
}
