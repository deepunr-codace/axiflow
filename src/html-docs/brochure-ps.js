import { img, fontCss, esc, br } from './assets.js';

/*
 * "CodeAce Growth Brochure": the landscape brochure in the CodeAce proposal look that the owner made in Claude
 * (Downloads/Nirapara Ecom Growth Brochure — Proposal Style, 2026-11-11; owner 2026-11-12: "add this to brochure
 * template and make this default"). Rebuilt from that file's own page markup: every style below is copied from it;
 * only the words, the lists, the client and the photos change per lead. 1123 × 794 CSS px pages, Manrope, red
 * #D7261E, grey #F2F2F2 and a black-to-red gradient.
 * Pages: cover → contents → challenge → opportunity → journey → plan (3 goals) → idea pages (4 ideas each; 2 beside a
 * statement card; 4 beside a picture) → order economics → delivery → results and next steps.
 */
// the reference PDF is exactly 1123 × 794 px (842.25 × 595.5 pt): printed by its own @page size (a width given to
// page.pdf() came out 843 pt wide and shifted every edge)
export const SIZE = { width: 1123, height: 794, cssPage: true };
/** Photos a document can carry (form buttons); without them the areas show the design's dark gradients. */
export const PHOTOS = [['cover', 'Cover photo'], ['challenge', 'Challenge photo'], ['ideas', 'Idea page picture'], ['cta', 'Closing photo']];

const RED = '#D7261E';
const DARK155 = 'linear-gradient(155deg, #3A3A3A 0%, #141414 45%, #0A0A0A 70%, #6E120D 100%)';
const DARK160 = 'linear-gradient(160deg, #3A3A3A 0%, #141414 45%, #0A0A0A 70%, #6E120D 100%)';
const two = (n) => String(n).padStart(2, '0');
/** "**bold**" in a lead → <b> in the given colour (the reference bolds a few words in some leads). */
const rich = (t, color = '#111111') => br(t).replace(/\*\*(.+?)\*\*/g, `<b style="color: ${color}">$1</b>`);
const quoted = (q) => { const t = String(q || '').trim().replace(/^["“]|["”]$/g, ''); return t ? `"${t}"` : ''; };

const PAGE = "width: 1123px; height: 794px; box-sizing: border-box; padding: 48px; background: #FFFFFF; color: #111111; font-family: 'Manrope', system-ui, sans-serif; display: flex; flex-direction: column; gap: 28px";

function header(ctx, n, second) {
  return `<div style="display: flex; justify-content: space-between; align-items: center; height: 32px; font-size: 12px; line-height: 1.35; color: #4D4D4D">
<img src="${img('codeace-dark.png')}" alt="CodeAce IT Solutions LLP" style="height: 32px; width: auto; display: block">
<div style="display: flex; gap: 64px"><span>Prepared for ${esc(ctx.client)}<br>${esc(ctx.date)}</span><span>${esc(ctx.docName)}${second ? `<br>${esc(second)}` : ''}</span></div>
<span style="font-weight: 700; font-size: 14px; color: #111111">${two(n)}</span>
</div>`;
}
function titleRow(eyebrow, title, lead, leadBold) {
  return `<div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 48px">
<div><p style="margin: 0 0 12px; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #D7261E">${esc(eyebrow)}</p><h2 style="margin: 0; font-size: 56px; line-height: 1; font-weight: 500; letter-spacing: -0.04em">${br(title)}</h2></div>
<p style="margin: 0; width: 340px; flex: 0 0 340px; font-size: 16px; line-height: 1.5; color: #4D4D4D">${rich(lead, leadBold)}</p>
</div>`;
}
const page = (ctx, n, second, eyebrow, title, lead, body, leadBold) => `<div class="pg" data-page="${n}" data-bottom="48" style="${PAGE}">
${header(ctx, n, second)}
${titleRow(eyebrow, title, lead, leadBold)}
${body}
</div>`;

// cards: grey / red / dark (the gradient's angle differs by page in the reference)
const TONE = {
  grey: { box: 'background: #F2F2F2;', dash: RED, row: '', text: 'color: #4D4D4D', label: '#B81F18' },
  red: { box: 'background: #D7261E; color: #FFFFFF;', dash: '#FFFFFF', row: '', text: '', label: '#FFE3E0' },
  dark: { box: `background: ${DARK160}; color: #FFFFFF;`, dash: RED, row: '; color: #E6E6E6', text: 'color: #E6E6E6', label: '#FF8A80' },
};
const tone = (t, deg) => (t === 'dark' && deg === 155 ? { ...TONE.dark, box: `background: ${DARK155}; color: #FFFFFF;` } : TONE[t] || TONE.grey);
const dash = (t, T) => `<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.45${T.row}"><span style="flex: 0 0 10px; height: 2px; margin-top: 10px; background: ${T.dash}"></span><span>${esc(t)}</span></div>`;
const num = (n) => `<p style="margin: 0; font-size: 32px; font-weight: 500; letter-spacing: -0.03em; line-height: 1">${two(n)}</p>`;
const cardTitle = (t) => `<p style="margin: 0; font-size: 18px; font-weight: 700; line-height: 1.3">${esc(t)}</p>`;
function pointCard(n, title, points, t, deg) {
  const T = tone(t, deg);
  return `<div style="${T.box} border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 12px">
${num(n)}
${cardTitle(title)}
${(points || []).map((p) => dash(p, T)).join('\n')}
</div>`;
}
const textP = (t, T) => `<p style="margin: 0; font-size: 15px; line-height: 1.45${T.text ? `; ${T.text}` : ''}">${esc(t)}</p>`;

// ------------------------------------------------------------------ pages
function cover(ctx, d) {
  const c = d.cover || {};
  const stat = (s) => `<div><p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1">${esc(s.value)}</p><p style="margin: 0; font-size: 12px; color: #4D4D4D">${esc(s.label)}</p></div>`;
  return `<div class="pg" data-page="1" style="${PAGE}">
${header(ctx, 1, ctx.website)}
<div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 48px">
<div>
<p style="margin: 0 0 12px; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #D7261E">${esc(c.label)}</p>
<h1 style="margin: 0; font-size: 88px; line-height: 0.95; font-weight: 500; letter-spacing: -0.045em">${br(c.title)}</h1>
</div>
<div style="width: 340px; flex: 0 0 340px; display: flex; flex-direction: column; gap: 24px">
<p style="margin: 0; font-size: 18px; line-height: 1.4; font-weight: 500; color: #4D4D4D">${rich(c.lead)}</p>
${(c.stats || []).length ? `<div style="display: flex; gap: 40px">
${c.stats.slice(0, 3).map(stat).join('\n')}
</div>` : ''}
</div>
</div>
<div data-flatten style="${ctx.photoBg('cover')} flex-grow: 1; border-radius: 20px; padding: 32px; color: #FFFFFF; display: flex; flex-direction: column; justify-content: space-between">
<span style="align-self: flex-start; border: 1px solid #FFFFFF; border-radius: 999px; padding: 8px 16px; font-size: 13px; font-weight: 600">Prepared for ${esc(ctx.client)}</span>
<div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 48px">
<p style="margin: 0; font-size: 40px; line-height: 1.08; font-weight: 600; letter-spacing: -0.02em">${br(c.headline)}</p>
<div style="width: 340px; flex: 0 0 340px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px">
<p style="margin: 0; font-size: 15px; line-height: 1.5; color: #E6E6E6">${esc(c.text)}</p>
<span style="flex: 0 0 64px; height: 64px; border-radius: 14px; background: #D7261E; color: #FFFFFF; font-size: 60px; font-weight: 700; line-height: 1; display: flex; justify-content: center; padding-top: 10px; box-sizing: border-box">*</span>
</div>
</div>
</div>
</div>`;
}

function contents(ctx, n, c, ranges) {
  const look = [
    { box: 'background: #D7261E; color: #FFFFFF;', text: '', pages: '#FFE3E0', line: '#FFFFFF' },
    { box: 'background: #F2F2F2;', text: '; color: #4D4D4D', pages: '#4D4D4D', line: '#111111' },
    { box: `background: ${DARK155}; color: #FFFFFF;`, text: '; color: #E6E6E6', pages: '#C9C9C9', line: '#FFFFFF' },
    { box: 'background: #F2F2F2;', text: '; color: #4D4D4D', pages: '#4D4D4D', line: '#111111' },
  ];
  const part = (p, i) => { const L = look[i % 4]; return `<div style="${L.box} border-radius: 20px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between">
<div><p style="margin: 0 0 8px; font-size: 18px; font-weight: 700; line-height: 1.3">${esc(p.title)}</p><p style="margin: 0; font-size: 15px; line-height: 1.45${L.text}">${esc(p.text)}</p><p style="margin: 8px 0 0; font-size: 12px; font-weight: 600; color: ${L.pages}">${esc(ranges[i] || '')}</p></div>
<p style="margin: 0; font-size: 88px; line-height: 1; font-weight: 500; letter-spacing: -0.04em; border-bottom: 2px solid ${L.line}; padding-bottom: 8px">${two(i + 1)}</p>
</div>`; };
  return page(ctx, n, 'Contents', 'Contents', c.title, c.lead, `<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px">
${(c.parts || []).slice(0, 4).map(part).join('\n')}
</div>`);
}

function challenge(ctx, n, c) {
  const rows = (c.rows || []).slice(0, 3);
  const tones = ['grey', 'grey', 'red'];
  return page(ctx, n, c.label, `01 · ${c.label}`, c.title, c.lead, `<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(${rows.length + 1}, minmax(0, 1fr)); gap: 16px">
<div data-flatten style="${ctx.photoBg('challenge')} color: #FFFFFF; border-radius: 20px; padding: 24px; display: flex; flex-direction: column; justify-content: flex-end">
<p style="margin: 0; font-size: 24px; line-height: 1.25; font-weight: 700">${esc(c.statement)}</p>
</div>
${rows.map((r, i) => pointCard(i + 1, r.title, r.points, tones[i] || 'grey')).join('\n')}
</div>`);
}

function opportunity(ctx, n, o) {
  const tones = ['red', 'grey', 'grey', 'grey', 'dark', 'grey'];
  const item = (it, i) => { const T = tone(tones[i % 6], 155); return `<div style="${T.box} border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 12px">
${num(i + 1)}
${cardTitle(it.title)}
${textP(it.text, T)}
</div>`; };
  const items = (o.items || []).slice(0, 6);
  return page(ctx, n, o.label, `02 · ${o.label}`, o.title, o.lead, `<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(${Math.max(1, Math.ceil(items.length / 3))}, minmax(0, 1fr)); gap: 16px">
${items.map(item).join('\n')}
</div>`);
}

function journey(ctx, n, j) {
  const step = (s, i) => {
    const red = i === Number(j.highlight);
    const L = red ? '#FFE3E0' : '#B81F18';
    return `<div style="${red ? 'background: #D7261E; color: #FFFFFF;' : 'background: #F2F2F2;'} border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 12px">
${num(i + 1)}
${cardTitle(s.title)}
<div><p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${L}">${esc(j.think_label || 'They think')}</p><p style="margin: 0; font-size: 15px; line-height: 1.45; font-style: italic">${esc(quoted(s.quote))}</p></div>
<div><p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${L}">${esc(j.do_label || 'We do')}</p><p style="margin: 0; font-size: 15px; line-height: 1.45${red ? '' : '; color: #4D4D4D'}">${esc(s.text)}</p></div>
</div>`;
  };
  const steps = (j.steps || []).slice(0, 4);
  return page(ctx, n, j.label, `02 · ${j.label}`, j.title, j.lead, `<div style="flex-grow: 1; display: flex; flex-direction: column; gap: 16px">
<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(${Math.max(1, steps.length)}, minmax(0, 1fr)); gap: 16px">
${steps.map(step).join('\n')}
</div>
${j.bridge?.title || j.bridge?.text ? `<div style="background: linear-gradient(100deg, #111111 0%, #1E1E1E 55%, #7A120D 100%); color: #FFFFFF; border-radius: 20px; padding: 22px 24px; display: flex; gap: 24px; align-items: center">
<p style="margin: 0; flex: 0 0 240px; font-size: 18px; font-weight: 700">${esc(j.bridge.title)}</p>
<p style="margin: 0; font-size: 15px; line-height: 1.45; color: #E6E6E6">${esc(j.bridge.text)}</p>
</div>` : ''}
</div>`);
}

function plan(ctx, n, p, ideas) {
  const look = [
    { box: 'background: #F2F2F2;', sub: '#4D4D4D', line: '#D9D9D9', pill: 'color: #FFFFFF; background: #D7261E', note: '#4D4D4D' },
    { box: 'background: #D7261E; color: #FFFFFF;', sub: '#FFE3E0', line: '#E8645D', pill: 'color: #D7261E; background: #FFFFFF', note: '#FFFFFF' },
    { box: `background: ${DARK160}; color: #FFFFFF;`, sub: '#C9C9C9', line: '#3A3A3A', pill: 'color: #FFFFFF; background: #D7261E', note: '#E6E6E6' },
  ];
  const col = (g, gi) => {
    const L = look[gi];
    const list = ideas.map((it, i) => ({ ...it, n: i + 1 })).filter((it) => Number(it.goal) === gi);
    const row = (it, i) => `<div style="display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid ${L.line};${i === list.length - 1 ? ` border-bottom: 1px solid ${L.line};` : ''} font-size: 15px${it.new ? '; align-items: center' : ''}"><b style="width: 24px">${two(it.n)}</b><span>${esc(it.short || it.title)}</span>${it.new ? `<span style="margin-left: auto; font-size: 11px; font-weight: 700; ${L.pill}; border-radius: 999px; padding: 2px 8px">NEW</span>` : ''}</div>`;
    return `<div style="${L.box} border-radius: 20px; padding: 24px; display: flex; flex-direction: column">
<p style="margin: 0 0 4px; font-size: 24px; font-weight: 700">${esc(g.name)}</p>
<p style="margin: 0 0 16px; font-size: 15px; color: ${L.sub}">${esc(g.sub)}</p>
${list.map(row).join('\n')}
${g.note ? `<p style="margin: auto 0 0; font-size: 15px; line-height: 1.45; color: ${L.note}">${esc(g.note)}</p>` : ''}
</div>`;
  };
  return page(ctx, n, p.label, `03 · ${p.label}`, p.title, p.lead, `<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">
${(p.goals || []).slice(0, 3).map(col).join('\n')}
</div>`, RED);
}

/** "Ideas 1 to 4", "Ideas 9 and 10", "Idea 5". */
const ideaRange = (a, b) => (a === b ? `Idea ${a}` : b === a + 1 ? `Ideas ${a} and ${b}` : `Ideas ${a} to ${b}`);
const DEFAULT_TONES = [['red', 'grey', 'grey', 'dark'], ['dark', 'grey', 'red', 'grey']];

function ideaPage(ctx, n, pg, list, start, pageIndex) {
  const range = ideaRange(start, start + list.length - 1);
  const allNew = list.length && list.every((x) => x.new);
  const t = (it, i) => it.tone || (pg.statement ? ['grey', 'dark'][i % 2] : DEFAULT_TONES[pageIndex % 2][i % 4]);
  const cards = list.map((it, i) => pointCard(start + i, it.title, it.points, t(it, i))).join('\n');
  const photo = pg.photo ? ctx.photo('ideas') : null;
  let body;
  if (photo) { // four ideas 2 × 2 beside a picture (reference page 10)
    body = `<div style="flex-grow: 1; display: flex; gap: 16px">
<div style="flex-grow: 1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 16px">
${cards}
</div>
<div style="width: 340px; flex: 0 0 340px; border-radius: 20px; overflow: hidden; background: #111111">
<img src="${photo}" alt="${esc(pg.photo_alt || '')}" style="width: 100%; height: 100%; object-fit: cover; object-position: center; display: block">
</div>
</div>`;
  } else if (pg.statement) { // a statement card, then the ideas (reference page 9)
    body = `<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(${list.length + 1}, minmax(0, 1fr)); gap: 16px">
<div style="background: linear-gradient(160deg, #E8483F 0%, #D7261E 30%, #7A120D 70%, #1A0503 100%); color: #FFFFFF; border-radius: 20px; padding: 24px; display: flex; flex-direction: column; justify-content: flex-end">
<p style="margin: 0; font-size: 24px; line-height: 1.25; font-weight: 700">${esc(pg.statement)}</p>
</div>
${cards}
</div>`;
  } else {
    body = `<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(${Math.max(list.length, 2)}, minmax(0, 1fr)); gap: 16px">
${cards}
</div>`;
  }
  return page(ctx, n, range, `03 · ${range}${allNew ? ' · New' : ''}`, pg.title, pg.lead, body);
}

function economics(ctx, n, e) {
  const tones = ['red', 'grey', 'grey', 'grey', 'dark', 'grey'];
  const fig = (f, i) => { const T = tone(tones[i % 6]); return `<div style="${T.box} border-radius: 20px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between">
<p style="margin: 0; font-size: 44px; font-weight: 600; letter-spacing: -0.04em; line-height: 1">${esc(f.value)}</p>
<div><p style="margin: 0 0 4px; font-size: 18px; font-weight: 700">${esc(f.title)}</p>${textP(f.text, T)}</div>
</div>`; };
  const figs = (e.figures || []).slice(0, 6);
  return page(ctx, n, e.label, `04 · ${e.label}`, e.title, e.lead, `<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(${Math.max(1, Math.ceil(figs.length / 3))}, minmax(0, 1fr)); gap: 16px">
${figs.map(fig).join('\n')}
</div>
${e.note ? `<p style="margin: -12px 0 0; font-size: 12px; color: #4D4D4D">${esc(e.note)}</p>` : ''}`);
}

function delivery(ctx, n, dl) {
  const inc = (dl.includes || []).slice(0, 12);
  const looks = [
    { box: 'background: #D7261E; color: #FFFFFF;', when: '#FFE3E0', text: '', line: '#FFFFFF' },
    { box: 'background: #F2F2F2;', when: '#B81F18', text: '; color: #4D4D4D', line: '#111111' },
    { box: `background: ${DARK160}; color: #FFFFFF;`, when: '#FF8A80', text: '; color: #E6E6E6', line: '#FFFFFF' },
  ];
  const phase = (p, i) => { const L = looks[i % 3]; return `<div style="${L.box} border-radius: 20px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between">
<div><p style="margin: 0 0 4px; font-size: 18px; font-weight: 700; line-height: 1.3">${esc(p.title)}</p><p style="margin: 0 0 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${L.when}">${esc(p.when)}</p><p style="margin: 0; font-size: 15px; line-height: 1.45${L.text}">${esc(p.text)}</p></div>
<p style="margin: 0; font-size: 72px; line-height: 1; font-weight: 500; letter-spacing: -0.04em; border-bottom: 2px solid ${L.line}; padding-bottom: 8px">${two(i + 1)}</p>
</div>`; };
  return page(ctx, n, dl.label, `04 · ${dl.label}`, dl.title, dl.lead, `<div data-fit style="flex-grow: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px">
<div style="background: #F2F2F2; border-radius: 20px; padding: 24px; display: flex; flex-direction: column">
<p style="margin: 0 0 12px; font-size: 18px; font-weight: 700; line-height: 1.3">${esc(dl.includes_title)}</p>
${inc.map((t, i) => `<p style="margin: 0; padding: 7px 0; border-top: 1px solid #D9D9D9;${i === inc.length - 1 ? ' border-bottom: 1px solid #D9D9D9;' : ''} font-size: 15px">${esc(t)}</p>`).join('\n')}
</div>
${(dl.phases || []).slice(0, 3).map(phase).join('\n')}
</div>`);
}

function results(ctx, n, r) {
  const metric = (m, i) => `<div style="${i === Number(r.highlight) ? 'background: #D7261E; color: #FFFFFF;' : 'background: #F2F2F2;'} border-radius: 14px; padding: 14px 18px; font-size: 15px; font-weight: 700">${esc(m)}</div>`;
  const next = (t, i) => `<div style="border: 1px solid #111111; border-radius: 20px; padding: 18px 24px; display: flex; gap: 16px; align-items: center"><span style="font-size: 32px; font-weight: 500; letter-spacing: -0.03em; color: #D7261E">${two(i + 1)}</span><span style="font-size: 15px; line-height: 1.4; font-weight: 600">${esc(t)}</span></div>`;
  const c = ctx.contact;
  // the reference had "[Phone] · [Email]" placeholders on one line; the real ones are longer, so one per line
  const reach = [c.phone, c.email].filter(Boolean).map(esc).join('<br>');
  return page(ctx, n, r.label, `04 · ${r.label}`, r.title, r.lead, `<div style="flex-grow: 1; display: flex; flex-direction: column; gap: 16px">
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px">
${(r.metrics || []).slice(0, 8).map(metric).join('\n')}
</div>
${(r.next || []).length ? `<div style="display: grid; grid-template-columns: repeat(${Math.min(3, r.next.length)}, minmax(0, 1fr)); gap: 16px">
${r.next.slice(0, 3).map(next).join('\n')}
</div>` : ''}
<div data-flatten style="${ctx.photoBg('cta')} flex-grow: 1; color: #FFFFFF; border-radius: 20px; padding: 32px; display: flex; justify-content: space-between; align-items: flex-end; gap: 48px">
<p style="margin: 0; font-size: 40px; line-height: 1.08; font-weight: 600; letter-spacing: -0.02em">${br(r.closing)}</p>
<div style="width: 340px; flex: 0 0 340px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px">
<p style="margin: 0; font-size: 15px; line-height: 1.5; color: #E6E6E6">${esc(ctx.agency)}${reach ? `<br>${reach}` : ''}</p>
<span style="flex: 0 0 64px; height: 64px; border-radius: 14px; background: #D7261E; color: #FFFFFF; font-size: 60px; font-weight: 700; line-height: 1; display: flex; justify-content: center; padding-top: 10px; box-sizing: border-box">*</span>
</div>
</div>
</div>`);
}

// ------------------------------------------------------------------ the page plan
/**
 * Idea pages: each data.idea_pages entry takes 4 ideas (2 when it has a statement card); ideas left over get pages of
 * their own. split.ideaPages (from the fit check) = [{ page: index into idea_pages, count, plain }] replaces that plan;
 * plain = a continuation page (same heading, no statement card or picture).
 */
const MORE = { title: 'More Ideas,\nSame Goals', lead: '', statement: '' };
export function ideaPlan(d, split = {}) {
  const ideas = d.ideas || [];
  const pages = d.idea_pages || [];
  const out = [];
  if (Array.isArray(split.ideaPages) && split.ideaPages.reduce((t, p) => t + (Number(p.count) || 0), 0) === ideas.length) {
    let i = 0;
    for (const p of split.ideaPages) {
      const base = pages[p.page] || MORE;
      out.push({ pg: p.plain ? { ...base, statement: '', photo: false } : base, page: p.page, start: i, count: Number(p.count) });
      i += Number(p.count);
    }
    return out;
  }
  let i = 0, k = 0;
  while (i < ideas.length) {
    const pg = pages[k] || MORE;
    const count = Math.max(1, Number(pg.count) || (pg.statement ? 2 : 4));
    out.push({ pg, page: k, start: i, count: Math.min(count, ideas.length - i) });
    i += count; k++;
  }
  return out;
}
/** The page number of every part (for the contents page and the fit check). */
export function pagePlan(d, split = {}) {
  const has = (k) => !!d[k];
  let n = 1; const at = {};
  at.contents = ++n;
  if (has('challenge')) at.challenge = ++n;
  if (has('opportunity')) at.opportunity = ++n;
  if (has('journey')) at.journey = ++n;
  if (has('plan') && (d.ideas || []).length) at.plan = ++n;
  const ideas = ideaPlan(d, split);
  at.ideas = ideas.map(() => ++n);
  if (has('economics')) at.economics = ++n;
  if (has('delivery')) at.delivery = ++n;
  if (has('results')) at.results = ++n;
  return { at, ideas, last: n };
}
const span = (a, b) => (!a ? '' : !b || a === b ? `Page ${two(a)}` : `Pages ${two(a)} to ${two(b)}`);

/**
 * The whole document. ctx = { client, date, docName, website, agency, contact: { phone, email }, photos: { cover,
 * challenge, ideas, cta } (resolved URLs) }.
 */
export function brochurePsHtml(d, ctx, split = {}) {
  const c = { ...ctx };
  c.photo = (which) => ctx.photos?.[which] || null;
  c.photoBg = (which) => {
    const p = c.photo(which);
    if (which === 'cover') return p ? `background-color: #141414; background-image: linear-gradient(90deg, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.7) 35%, rgba(10,10,10,0.05) 68%, rgba(10,10,10,0) 100%), linear-gradient(0deg, rgba(10,10,10,0.88) 0%, rgba(10,10,10,0) 55%), url('${p}'); background-size: cover; background-position: right top; background-repeat: no-repeat;` : 'background-color: #141414; background-image: radial-gradient(120% 140% at 100% 0%, #5a1310 0%, #2a0d0b 38%, #141414 70%);';
    if (which === 'challenge') return p ? `background-color: #1A0503; background-image: linear-gradient(0deg, rgba(40,6,4,0.92) 0%, rgba(60,8,5,0.45) 32%, rgba(0,0,0,0) 58%), url('${p}'); background-size: cover; background-position: center top; background-repeat: no-repeat;` : `background: ${DARK160};`;
    return p ? `background-color: #141414; background-image: linear-gradient(90deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.55) 40%, rgba(10,10,10,0) 70%), linear-gradient(0deg, rgba(10,10,10,0.8) 0%, rgba(10,10,10,0) 60%), url('${p}'); background-size: cover; background-position: right center; background-repeat: no-repeat;` : 'background-color: #141414; background-image: radial-gradient(120% 160% at 100% 100%, #5a1310 0%, #2a0d0b 38%, #141414 70%);';
  };
  const P = pagePlan(d, split);
  const a = P.at;
  const ideaEnd = a.ideas.length ? a.ideas[a.ideas.length - 1] : a.plan;
  const ranges = [
    span(a.challenge),
    span(a.opportunity || a.journey, a.journey || a.opportunity),
    span(a.plan || a.ideas[0], ideaEnd),
    span(a.economics || a.delivery || a.results, a.results || a.delivery || a.economics),
  ];
  const pages = [cover(c, d), contents(c, a.contents, d.contents || {}, ranges)];
  if (a.challenge) pages.push(challenge(c, a.challenge, d.challenge));
  if (a.opportunity) pages.push(opportunity(c, a.opportunity, d.opportunity));
  if (a.journey) pages.push(journey(c, a.journey, d.journey));
  if (a.plan) pages.push(plan(c, a.plan, d.plan, d.ideas || []));
  P.ideas.forEach((p, k) => pages.push(ideaPage(c, a.ideas[k], p.pg, d.ideas.slice(p.start, p.start + p.count), p.start + 1, k)));
  if (a.economics) pages.push(economics(c, a.economics, d.economics));
  if (a.delivery) pages.push(delivery(c, a.delivery, d.delivery));
  if (a.results) pages.push(results(c, a.results, d.results));
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(ctx.title || 'Brochure')}</title>
<style>${fontCss('manrope-2.css')}</style>
<style>
@page { size: 1123px 794px; margin: 0 }
html, body { margin: 0; padding: 0; background: #FFFFFF }
body{margin:0}
a{color:#D7261E}a:hover{color:#A81B14}
.pg { page-break-after: always; break-after: page; overflow: hidden }
.pg:last-child { page-break-after: auto; break-after: auto }
</style>
</head>
<body>
${pages.join('\n')}
</body></html>`;
}
