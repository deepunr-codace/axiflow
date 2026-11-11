import { img, fontCss, esc, br } from './assets.js';

/*
 * "CodeAce Proposal": the A4 proposal the owner made in Claude (Downloads/Nirapara Shopify Store Proposal — CodeAce,
 * 2026-11-11), rebuilt from its own markup: every style below is copied from that file; only the words, the lists and
 * the prices change per lead. 794 × 1123 CSS px pages, Manrope, red #D7261E and black #111111.
 * Pages: cover → executive summary → project scope (5 per page) → website structure → one page per feature group →
 * delivery timeline → investment (AxiFlow's line items, never the AI's) → deliverables and terms → contact.
 */
export const SIZE = { width: 794, height: 1123, paper: { width: '210mm', height: '297mm' }, scale: (210 / 25.4 * 96) / 794 };
const RED = '#D7261E';

const PAGE = 'width: 794px; height: 1123px; box-sizing: border-box; padding: 48px 56px 72px; background: #FFFFFF; color: #111111; font-family: \'Manrope\', system-ui, sans-serif; display: flex; flex-direction: column; gap: 28px; position: relative';
const footBar = '<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: linear-gradient(90deg, #D7261E 0 28%, #111111 28% 100%)"></div>';
const two = (n) => String(n).padStart(2, '0');

function page(ctx, n, eyebrow, title, body) {
  return `<div class="pg" data-page="${n}" data-bottom="72" style="${PAGE}">
<div style="display: flex; justify-content: space-between; align-items: center; height: 30px"><img src="${img('codeace-dark.png')}" alt="CodeAce IT Solutions LLP" style="height: 30px; width: auto; display: block"><span style="font-size: 13px; font-weight: 700">${two(n)}</span></div>
<div style="display: flex; flex-direction: column; gap: 10px">
<p style="margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #D7261E">${esc(eyebrow)}</p>
<h2 style="margin: 0; font-size: 44px; line-height: 1.05; font-weight: 500; letter-spacing: -0.04em">${esc(title)}</h2>
<div style="height: 2px; margin-top: 8px; background: linear-gradient(90deg, #D7261E 0 64px, #E6E6E6 64px 100%)"></div>
</div>
${body}
<p style="position: absolute; left: 56px; bottom: 24px; margin: 0; font-size: 12px; color: #4D4D4D">${esc(ctx.footer)}</p>
${footBar}
</div>`;
}
const para = (t) => `<p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333">${esc(t)}</p>`;
const bullet = (t, { dash = RED, color = '' } = {}) => `<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.45${color ? `; color: ${color}` : ''}"><span style="flex: 0 0 10px; height: 2px; margin-top: 10px; background: ${dash}"></span><span>${esc(t)}</span></div>`;
const TONES = {
  grey: { box: 'background: #F2F2F2;', dash: RED, color: '' },
  red: { box: 'background: #D7261E; color: #FFFFFF;', dash: '#FFFFFF', color: '' },
  dark: { box: 'background: #111111; color: #FFFFFF;', dash: RED, color: '#E6E6E6' },
};
function card(c) {
  const t = TONES[c.tone] || TONES.grey;
  return `<div style="${t.box} border-radius: 18px; padding: 22px 24px; display: flex; flex-direction: column; gap: 10px">
<p style="margin: 0 0 2px; font-size: 18px; font-weight: 700">${esc(c.title)}</p>
${(c.points || []).map((p) => bullet(p, t)).join('\n')}
</div>`;
}
const note = (n) => !n ? '' : typeof n === 'string'
  ? `<p style="margin: 0; font-size: 14px; line-height: 1.55; color: #4D4D4D">${esc(n)}</p>`
  : `<div style="background: #F2F2F2; border-radius: 18px; padding: 22px 24px; font-size: 15px; line-height: 1.55; color: #333333">${n.bold ? `<b style="color: #111111">${esc(n.bold)}</b> ` : ''}${esc(n.text)}</div>`;

// ------------------------------------------------------------------ pages
function cover(ctx, d) {
  return `<div class="pg" data-flatten data-page="1" style="${ctx.photoBg('cover')} width: 794px; height: 1123px; box-sizing: border-box; padding: 48px 48px 64px; font-family: 'Manrope', system-ui, sans-serif; color: #111111; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden">
<img src="${img('codeace-white.png')}" alt="CodeAce IT Solutions LLP" style="height: 40px; width: auto; align-self: flex-start; display: block">
<div style="background: #FFFFFF; border-radius: 24px; padding: 44px 40px 40px; display: flex; flex-direction: column; gap: 28px">
<p style="margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #D7261E">${esc(d.eyebrow)}</p>
<h1 style="margin: 0; font-size: 46px; line-height: 1.05; font-weight: 600; letter-spacing: -0.035em">${esc(d.title)}</h1>
<div style="display: flex; align-items: center; gap: 12px">
<span style="flex: 1; height: 2px; background: #D7261E"></span>
<span style="flex: 0 0 36px; height: 36px; border-radius: 10px; background: #D7261E; color: #FFFFFF; font-size: 34px; font-weight: 700; line-height: 1; display: flex; justify-content: center; padding-top: 6px; box-sizing: border-box">*</span>
<span style="flex: 1; height: 2px; background: #D7261E"></span>
</div>
<div style="display: flex; justify-content: space-between; gap: 32px">
<div><p style="margin: 0 0 6px; font-size: 14px; color: #4D4D4D">Prepared For:</p><p style="margin: 0; font-size: 22px; font-weight: 600">${esc(ctx.client)}</p></div>
<div><p style="margin: 0 0 6px; font-size: 14px; color: #4D4D4D">Prepared By:</p><p style="margin: 0; font-size: 22px; font-weight: 600">${esc(ctx.agency)}</p></div>
</div>
</div>
${footBar}
</div>`;
}

function summary(ctx, n, s) {
  const stat = (x, i) => i === 0
    ? `<div style="background: #D7261E; color: #FFFFFF; border-radius: 16px; padding: 18px 20px"><p style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1">${esc(x.value)}</p><p style="margin: 4px 0 0; font-size: 14px">${esc(x.label)}</p></div>`
    : `<div style="background: #F2F2F2; border-radius: 16px; padding: 18px 20px"><p style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1">${esc(x.value)}</p><p style="margin: 4px 0 0; font-size: 14px; color: #4D4D4D">${esc(x.label)}</p></div>`;
  return page(ctx, n, s.eyebrow || 'Overview', s.title || 'Executive Summary', `${(s.paragraphs || []).map(para).join('\n')}
<div data-flatten style="${ctx.photoBg('strip')} height: 250px; border-radius: 20px; padding: 28px 32px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-end; color: #FFFFFF">
<p style="margin: 0 0 6px; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #FF8A80">${esc(s.approach_label || 'Our approach')}</p>
<p style="margin: 0; font-size: 30px; line-height: 1.1; font-weight: 600; letter-spacing: -0.02em">${br(s.approach)}</p>
</div>
${(s.stats || []).length ? `<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px">
${s.stats.slice(0, 3).map(stat).join('\n')}
</div>` : ''}
${s.closing ? para(s.closing) : ''}`);
}

function scopePage(ctx, n, intro, items, start) {
  const row = (it, i) => `<div style="display: flex; gap: 18px; ${it.dark ? 'background: #111111; color: #FFFFFF;' : 'background: #F2F2F2;'} border-radius: 18px; padding: 20px 22px"><span style="flex: 0 0 40px; height: 40px; border-radius: 12px; background: #D7261E; color: #FFFFFF; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center">${two(start + i)}</span><div><p style="margin: 0 0 4px; font-size: 18px; font-weight: 700">${esc(it.title)}</p><p style="margin: 0; font-size: 15px; line-height: 1.55; color: ${it.dark ? '#D9D9D9' : '#4D4D4D'}">${esc(it.text)}</p></div></div>`;
  return page(ctx, n, ctx.d.scope.eyebrow || 'What we will do', ctx.d.scope.title || 'Project Scope', `${intro ? para(intro) : ''}
<div data-fit style="display: flex; flex-direction: column; gap: 14px">
${items.map(row).join('\n')}
</div>`);
}

function structure(ctx, n, s) {
  const pages = (s.pages || []).slice(0, 24);
  const half = Math.ceil(pages.length / 2);
  const col = (list, start) => `<div style="display: flex; flex-direction: column">
${list.map((p, i) => `<div style="display: flex; gap: 14px; padding: 12px 0; border-top: 1px solid #E2E2E2;${i === list.length - 1 ? ' border-bottom: 1px solid #E2E2E2;' : ''} font-size: 15px"><b style="width: 24px; color: #D7261E">${two(start + i)}</b><span>${esc(p)}</span></div>`).join('\n')}
</div>`;
  return page(ctx, n, s.eyebrow || 'Site map', s.title || 'Website Structure', `${s.intro ? para(s.intro) : ''}
<div data-fit style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px">
${col(pages.slice(0, half), 1)}
${col(pages.slice(half), half + 1)}
</div>
${s.note ? `<div style="background: #F2F2F2; border-radius: 18px; padding: 20px 22px; font-size: 15px; line-height: 1.55; color: #333333">${s.note_bold ? `<b style="color: #111111">${esc(s.note_bold)}</b> ` : ''}${esc(s.note)}</div>` : ''}`);
}

function features(ctx, n, g, i) {
  const cards = (g.cards || []).slice(0, 4);
  let body;
  const image = g.image ? ctx.src(g.image) : null;
  if (image && cards.length >= 2) { // two cards beside a picture, the rest below (the "Pack QR" page)
    body = `<div data-fit style="display: flex; gap: 20px">
<div style="flex: 1; display: flex; flex-direction: column; gap: 16px">
${cards.slice(0, 2).map(card).join('\n')}
</div>
<img src="${image}" alt="${esc(g.image_alt || '')}" style="width: 262px; height: 410px; object-fit: cover; border-radius: 18px; display: block; flex: 0 0 262px">
</div>
${cards.slice(2).map((c) => card(c).replace('<div ', '<div data-fit ')).join('\n')}`;
  } else if (cards.length === 4) {
    body = `<div data-fit style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px">
${cards.map(card).join('\n')}
</div>`;
  } else {
    body = `<div data-fit style="display: flex; flex-direction: column; gap: 16px">
${cards.map(card).join('\n')}
</div>`;
  }
  return page(ctx, n, g.eyebrow || 'Detailed features', `${i + 1}. ${g.title}`, `${body}
${note(g.note)}`);
}

function timeline(ctx, n, t) {
  const steps = t.steps || [];
  const step = (s, i) => `<div style="display: flex; gap: 20px; padding: 16px 0; border-top: 1px solid #E2E2E2${i === steps.length - 1 ? '; border-bottom: 1px solid #E2E2E2' : ''}"><span style="flex: 0 0 92px; height: 32px; border-radius: 999px; background: ${i === steps.length - 1 ? '#111111' : '#D7261E'}; color: #FFFFFF; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center">${esc(s.label)}</span><div><p style="margin: 0 0 2px; font-size: 17px; font-weight: 700">${esc(s.title)}</p><p style="margin: 0; font-size: 15px; line-height: 1.5; color: #4D4D4D">${esc(s.text)}</p></div></div>`;
  const after = (a, i) => i === 0
    ? `<div style="background: #F2F2F2; border-radius: 18px; padding: 20px 22px"><p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #B81F18">${esc(a.label)}</p><p style="margin: 0 0 6px; font-size: 17px; font-weight: 700">${esc(a.title)}</p><p style="margin: 0; font-size: 15px; line-height: 1.5; color: #4D4D4D">${esc(a.text)}</p></div>`
    : `<div style="background: #111111; color: #FFFFFF; border-radius: 18px; padding: 20px 22px"><p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #FF8A80">${esc(a.label)}</p><p style="margin: 0 0 6px; font-size: 17px; font-weight: 700">${esc(a.title)}</p><p style="margin: 0; font-size: 15px; line-height: 1.5; color: #E6E6E6">${esc(a.text)}</p></div>`;
  return page(ctx, n, t.eyebrow || 'How it rolls out', t.title || 'Delivery Timeline', `${t.intro ? para(t.intro) : ''}
<div data-fit style="display: flex; flex-direction: column">
${steps.map(step).join('\n')}
</div>
${(t.after || []).length ? `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px">
${t.after.slice(0, 2).map(after).join('\n')}
</div>` : ''}`);
}

function investment(ctx, n, v) {
  // The reference's table, as rows of blocks: a background on a table row is printed once per cell, which leaves a
  // hairline seam between the two columns in some PDF viewers (found 2026-11-11); one block per row has none.
  const R = 'display: grid; grid-template-columns: minmax(0, 1fr) 170px';
  const rows = ctx.items.map((it, i) => `<div style="${R};${i % 2 ? ' background: #F7F7F7;' : ''} border-top: 1px solid #E2E2E2"><div style="padding: 14px 20px; font-weight: 600">${esc(it.name)}</div><div style="padding: 14px 20px; text-align: right">${esc(ctx.money(it.price))}</div></div>`).join('\n');
  return page(ctx, n, v.eyebrow || 'Pricing', v.title || 'Investment', `${v.intro ? para(v.intro) : ''}
<div data-fit style="width: 100%; font-size: 15px; line-height: normal; border: 1px solid #E2E2E2; border-radius: 16px; overflow: hidden">
<div style="${R}; background: #111111; color: #FFFFFF"><div style="text-align: left; padding: 15px 20px; font-weight: 700">Module / Component</div><div style="text-align: right; padding: 15px 20px; font-weight: 700">Cost (${esc(ctx.currency)})</div></div>
${rows}
<div style="${R}; background: #D7261E; color: #FFFFFF"><div style="padding: 16px 20px; font-weight: 700; font-size: 16px">Total</div><div style="padding: 16px 20px; text-align: right; font-weight: 700; font-size: 16px">${esc(ctx.money(ctx.total))}${ctx.taxNote ? ` + ${esc(ctx.taxNote)}` : ''}</div></div>
</div>
${v.retainer ? `<div style="background: #F2F2F2; border-radius: 18px; padding: 20px 22px; font-size: 15px; line-height: 1.55; color: #333333">${v.retainer_bold ? `<b style="color: #111111">${esc(v.retainer_bold)}</b> ` : ''}${esc(v.retainer)}</div>` : ''}
${v.note ? `<p style="margin: auto 0 0; font-size: 14px; line-height: 1.55; color: #4D4D4D; font-style: italic"><b>Note:</b> ${esc(v.note)}</p>` : ''}`);
}

function terms(ctx, n, d) {
  const dl = d.deliverables || {};
  return page(ctx, n, d.terms_eyebrow || 'What you receive', d.terms_title || 'Deliverables & Terms', `<div style="background: #F2F2F2; border-radius: 18px; padding: 22px 24px; display: flex; flex-direction: column; gap: 14px">
<p style="margin: 0; font-size: 18px; font-weight: 700">Deliverables</p>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px">
${(dl.items || []).map((t) => bullet(t)).join('\n')}
</div>
${dl.note ? `<p style="margin: 4px 0 0; font-size: 14px; font-style: italic; color: #4D4D4D">${esc(dl.note)}</p>` : ''}
</div>
<div data-fit style="display: flex; flex-direction: column; gap: 12px">
<p style="margin: 0; font-size: 18px; font-weight: 700">Terms &amp; Conditions</p>
${(d.terms || []).map((t) => `<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.5; color: #333333"><span style="flex: 0 0 10px; height: 2px; margin-top: 11px; background: #D7261E"></span><span>${esc(t)}</span></div>`).join('\n')}
</div>`);
}

const ICON = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.9 2z"></path>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M22 7l-10 6L2 7"></path>',
  web: '<circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"></path>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle>',
};
function contact(ctx, n, d) {
  const row = (icon, label, value) => `<div style="display: flex; gap: 14px; align-items: center"><span style="flex: 0 0 44px; height: 44px; border-radius: 50%; background: #D7261E; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[icon]}</svg></span><div><p style="margin: 0; font-size: 14px; color: #4D4D4D">${label}</p><p style="margin: 0; font-size: 17px; font-weight: 600">${esc(value)}</p></div></div>`;
  const c = ctx.contact;
  return `<div class="pg" data-flatten data-page="${n}" style="${ctx.photoBg('cover')} width: 794px; height: 1123px; box-sizing: border-box; padding: 56px 48px 64px; font-family: 'Manrope', system-ui, sans-serif; color: #111111; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden">
<div style="display: flex; flex-direction: column; gap: 20px; padding: 0 8px">
<img src="${img('codeace-white.png')}" alt="CodeAce IT Solutions LLP" style="height: 36px; width: auto; align-self: flex-start; display: block">
<h2 style="margin: 0; font-size: 44px; line-height: 1.08; font-weight: 600; letter-spacing: -0.035em; color: #FFFFFF">${esc(d.closing || `Let's Build ${ctx.client}'s Next Chapter.`)}</h2>
</div>
<div style="background: #FFFFFF; border-radius: 24px; padding: 40px; display: flex; flex-direction: column; gap: 24px">
<div style="display: flex; flex-direction: column; gap: 14px">
<h3 style="margin: 0; font-size: 32px; line-height: 1.1; font-weight: 600; letter-spacing: -0.03em">Have Questions? Contact Us</h3>
<div style="height: 2px; background: linear-gradient(90deg, #D7261E 0 64px, #E6E6E6 64px 100%)"></div>
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 24px">
${row('phone', 'Phone', c.phone)}
${row('email', 'Email', c.email)}
${row('web', 'Website', c.website)}
${row('pin', 'Location', c.location)}
</div>
</div>
${footBar}
</div>`;
}

/**
 * The whole document. data = the content (see SCHEMA in index.js); ctx = { client, agency, items, money, currency,
 * total, taxNote, contact, footer, photos: { cover, strip }, src(srcString) → url }. split = page plan overrides from
 * the fit check: { scope: n per page }.
 */
export function proposalHtml(d, ctx, split = {}) {
  const c = { ...ctx, d };
  c.photoBg = (which) => {
    const p = ctx.photos?.[which];
    if (which === 'strip') return p ? `background-color: #141414; background-image: linear-gradient(90deg, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.6) 45%, rgba(10,10,10,0) 75%), url('${p}'); background-size: cover; background-position: right top; background-repeat: no-repeat;` : 'background-color: #141414; background-image: radial-gradient(120% 140% at 100% 0%, #5a1310 0%, #2a0d0b 38%, #141414 70%);';
    return p ? `background-color: #141414; background-image: url('${p}'); background-size: cover; background-position: center top; background-repeat: no-repeat;` : 'background-color: #141414; background-image: radial-gradient(110% 70% at 70% 22%, #4a100d 0%, #2a0c0a 40%, #141414 72%);';
  };
  const pages = [cover(c, d)];
  let n = 2;
  pages.push(summary(c, n++, d.summary || {}));
  // scope cards: at most 6 per page (fewer when the fit check says so), spread evenly: 10 → 5 + 5 as in the reference
  const items = d.scope?.items || [];
  const max = split.scope || 6;
  const per = Math.ceil(items.length / Math.max(1, Math.ceil(items.length / max))) || max;
  for (let i = 0; i < items.length; i += per) { pages.push(scopePage(c, n++, i === 0 ? d.scope.intro : '', items.slice(i, i + per), i + 1)); }
  if ((d.structure?.pages || []).length) pages.push(structure(c, n++, d.structure));
  (d.features || []).forEach((g, i) => pages.push(features(c, n++, g, i)));
  if ((d.timeline?.steps || []).length) pages.push(timeline(c, n++, d.timeline));
  pages.push(investment(c, n++, d.investment || {}));
  pages.push(terms(c, n++, d));
  pages.push(contact(c, n++, d));
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(ctx.title || 'Proposal')}</title>
<style>${fontCss('manrope.css')}</style>
<style>
@page { size: 210mm 297mm; margin: 0 }
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
