import PDFDocument from 'pdfkit';

/*
 * Brochure Maker + proposal PDF. Pure pdfkit (no headless browser), so it runs on any server.
 * Standard PDF fonts only cover Latin-1, so all text goes through `t()`.
 */

const A4 = { w: 595.28, h: 841.89 };
const M = 50; // page margin
const INK = '#16181d';
const MUTED = '#5d6470';
const LINE = '#e4e2dc';
const SOFT = '#f6f5f2';
const OK = '#16794c';
const BAD = '#b42318';

const KEEP = /[•–—‘’“”…€]/;
/** Makes any text safe for the built-in PDF fonts. */
export function t(s) {
  return [...String(s ?? '')
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/[→➜]/g, '->')
    .replace(/✓|✔/g, '')]
    .filter((c) => c.charCodeAt(0) <= 0xff || KEEP.test(c))
    .join('')
    .replace(/\s+\n/g, '\n')
    .trim();
}

export function pdfMoney(n, currency = 'INR') {
  const num = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
  return currency === 'INR' ? `Rs. ${num}` : `${currency} ${num}`;
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

const poss = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const hex = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(String(c || '').trim()) ? String(c).trim() : fallback);
/** Mixes a colour toward white (amount 0..1) for soft backgrounds. */
function tint(c, amount) {
  const n = parseInt(c.slice(1), 16);
  const mix = (v) => Math.round(v + (255 - v) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function isDark(c) {
  const n = parseInt(c.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 150;
}

function newDoc(title, author) {
  return new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: t(title), Author: t(author) } });
}

/** Footer with agency contact + page numbers on every page. */
function footer(doc, s, label) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin must not trigger a new page
    const y = A4.h - 34;
    doc.save().moveTo(M, y - 8).lineTo(A4.w - M, y - 8).lineWidth(0.5).strokeColor(LINE).stroke().restore();
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(t(`${s.agency.name} · ${s.agency.phone} · ${s.agency.email}`), M, y, { width: 360, lineBreak: false })
      .text(t(`${label} · ${i + 1}/${range.count}`), A4.w - M - 150, y, { width: 150, align: 'right', lineBreak: false });
    doc.page.margins.bottom = keep;
  }
}

function ensure(doc, h) {
  if (doc.y + h > A4.h - 70) doc.addPage();
}

function heading(doc, text, color = INK) {
  ensure(doc, 60);
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(16).fillColor(color).text(t(text), M, doc.y);
  doc.moveDown(0.4);
}

function para(doc, text, opts = {}) {
  if (!text) return;
  doc.font('Helvetica').fontSize(opts.size || 10.5).fillColor(opts.color || INK).text(t(text), M, doc.y, { width: A4.w - 2 * M, lineGap: 3 });
  doc.moveDown(0.5);
}

function bullets(doc, items, color) {
  for (const it of items || []) {
    if (!it) continue;
    ensure(doc, 30);
    const y = doc.y;
    doc.save().circle(M + 4, y + 6, 2.6).fill(color || INK).restore();
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(t(it), M + 16, y, { width: A4.w - 2 * M - 16, lineGap: 2.5 });
    doc.moveDown(0.35);
  }
  doc.moveDown(0.3);
}

// ===================================================================== brochure

/**
 * Brochure Maker: cover → where you stand → homepage concept (drawn from the design brief)
 * → recommendation, process, results and call to action.
 */
export async function brochurePdf({ lead, audit, pitch, research, settings: s, bookingUrl, designUrl }) {
  const pkg = s.packages.find((p) => p.id === (pitch?.recommended_package || lead.recommended_package)) || s.packages[0];
  const brief = pitch?.design_brief || {};
  const pal = [...(brief.palette || []), '#2f5bea', '#7a5af8', '#ffb547', '#16181d', '#f7f7f5'];
  const primary = hex(pal[0], '#2f5bea');
  const accent = hex(pal[2], '#ffb547');
  const dark = hex(pal[3], '#16181d');
  const cur = s.billing.currency;
  const doc = newDoc(`${lead.company}: website plan by ${s.agency.name}`, s.agency.name);

  // ---- page 1: cover
  doc.rect(0, 0, A4.w, 470).fill(primary);
  const onPrimary = isDark(primary) ? '#ffffff' : INK;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(onPrimary).text(t(s.agency.name.toUpperCase()), M, 50, { characterSpacing: 1.5 });
  doc.font('Helvetica').fontSize(11).fillColor(onPrimary).opacity(0.85)
    .text(t(`Prepared for ${lead.company}${lead.city ? ` · ${lead.city}` : ''}`), M, 150).opacity(1);
  doc.font('Helvetica-Bold').fontSize(30).fillColor(onPrimary)
    .text(t(pitch?.headline || `A website that wins ${lead.company} more customers`), M, 175, { width: A4.w - 2 * M, lineGap: 4 });
  doc.moveDown(0.6).font('Helvetica').fontSize(13).fillColor(onPrimary).opacity(0.9)
    .text(t(pitch?.hook || 'A personalised plan for your business.'), { width: A4.w - 2 * M - 40, lineGap: 3 }).opacity(1);

  const boxes = [
    ['Recommended', pkg.name],
    ['Delivered in', pkg.timeline],
    ['Fixed price', pdfMoney(pkg.price, cur)],
  ];
  const bw = (A4.w - 2 * M - 2 * 14) / 3;
  boxes.forEach(([k, v], i) => {
    const x = M + i * (bw + 14);
    doc.roundedRect(x, 500, bw, 74, 10).fill(SOFT);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(t(k), x + 14, 514, { width: bw - 28 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(t(v), x + 14, 532, { width: bw - 28 });
  });
  if (lead.pitch) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(INK).text(t(`"${lead.pitch}"`), M, 610, { width: A4.w - 2 * M, lineGap: 3 });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(t(`- ${s.agency.sender_name}, ${s.agency.name}`));
  }

  // ---- page 2: where you stand
  doc.addPage();
  if (research?.source === 'ai' && research.business_summary) {
    heading(doc, `About ${lead.company}`);
    para(doc, research.business_summary, { color: MUTED });
  }
  heading(doc, 'Where you stand today');
  const pains = pitch?.pain_points?.length ? pitch.pain_points : (audit?.findings || []).map((f) => f.text);
  bullets(doc, pains.slice(0, 6), BAD);
  if (pitch?.value_props?.length) {
    heading(doc, `What a new website means for ${lead.company}`);
    bullets(doc, pitch.value_props, OK);
  }
  if (research?.competitors?.length && research.source === 'ai') {
    heading(doc, 'What your competitors do online');
    bullets(doc, research.competitors.slice(0, 3).map((c) => `${c.name}: ${c.what_they_do_better_online}`), MUTED);
  }

  // ---- page 3: homepage concept, drawn from the design brief
  doc.addPage();
  heading(doc, 'Your homepage concept');
  para(doc, `A first look at ${poss(lead.company)} new homepage. Style: ${brief.style || 'clean and modern'}.`, { color: MUTED });
  drawConcept(doc, { lead, brief, primary, accent, dark, top: doc.y + 6 });
  doc.y = 660;
  // palette + fonts
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Colours', M, doc.y);
  const sy = doc.y + 6;
  pal.slice(0, 5).map((c) => hex(c, '#cccccc')).forEach((c, i) => {
    doc.roundedRect(M + i * 58, sy, 48, 28, 6).fill(c);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(c.toUpperCase(), M + i * 58, sy + 32, { width: 48, align: 'center' });
  });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Fonts', M + 320, sy - 16);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(t(`${brief.heading_font || 'Poppins'} (headings) · ${brief.body_font || 'Inter'} (text)`), M + 320, sy + 2, { width: 175 });
  if (designUrl) {
    doc.font('Helvetica').fontSize(9.5).fillColor(primary)
      .text('View the full interactive concept online', M + 320, sy + 30, { width: 175, link: designUrl, underline: true });
  }

  // ---- page 4: recommendation + CTA
  doc.addPage();
  heading(doc, `Our recommendation: ${pkg.name}`);
  if (pitch?.package_reason) para(doc, pitch.package_reason, { color: MUTED });
  const py = doc.y + 4;
  doc.roundedRect(M, py, A4.w - 2 * M, 92, 12).fill(tint(primary, 0.9));
  doc.font('Helvetica-Bold').fontSize(28).fillColor(INK).text(pdfMoney(pkg.price, cur), M + 20, py + 18);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(t(`one-time, plus ${s.billing.tax_label} · delivered in ${pkg.timeline}`), M + 20, py + 56);
  doc.y = py + 108;
  bullets(doc, pkg.includes, primary);

  heading(doc, 'How it works');
  const steps = [['Call', 'A 30-minute call to understand your goals.'], ['Proposal', 'Fixed price and timeline, in writing.'], ['Design & build', 'You see progress at every milestone.'], ['Launch & care', 'We host, back up and keep it updated.']];
  const cw = (A4.w - 2 * M - 3 * 10) / 4;
  ensure(doc, 110);
  const sy2 = doc.y;
  steps.forEach(([k, v], i) => {
    const x = M + i * (cw + 10);
    doc.circle(x + 14, sy2 + 14, 14).fill(primary);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(isDark(primary) ? '#ffffff' : INK).text(String(i + 1), x + 4, sy2 + 7, { width: 20, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(t(k), x, sy2 + 36, { width: cw });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(t(v), x, sy2 + 52, { width: cw });
  });
  doc.y = sy2 + 100;

  if (s.agency.portfolio?.length) {
    heading(doc, 'Recent results');
    bullets(doc, s.agency.portfolio.map((p) => `${p.name}: ${p.result}`), OK);
  }

  ensure(doc, 120);
  const cy = doc.y + 8;
  doc.roundedRect(M, cy, A4.w - 2 * M, 104, 12).fill(dark);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff').text("Let's talk", M + 22, cy + 18);
  doc.font('Helvetica').fontSize(10.5).fillColor('#e9ecf2')
    .text(t(bookingUrl
      ? `Reply to this message, call ${s.agency.phone}, or pick a free 30-minute slot:`
      : `Reply to this message or call ${s.agency.phone} to book a free 30-minute call. ${s.agency.email ? `Email: ${s.agency.email}` : ''}`), M + 22, cy + 42, { width: A4.w - 2 * M - 44 });
  if (bookingUrl) {
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(accent).text(t(bookingUrl), M + 22, cy + 68, { width: A4.w - 2 * M - 44, link: bookingUrl, underline: true });
  }

  footer(doc, s, 'Website plan');
  return toBuffer(doc);
}

/** Draws a browser-framed homepage mockup using the brief's palette, headline and sections. */
function drawConcept(doc, { lead, brief, primary, accent, dark, top }) {
  const x = M, w = A4.w - 2 * M, h = 430;
  const onPrimary = isDark(primary) ? '#ffffff' : INK;
  // browser frame
  doc.roundedRect(x, top, w, h, 10).lineWidth(1).strokeColor(LINE).fillAndStroke('#ffffff', LINE);
  doc.rect(x + 0.5, top + 0.5, w - 1, 22).fill(SOFT);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => doc.circle(x + 14 + i * 12, top + 11, 3.5).fill(c));
  doc.roundedRect(x + 60, top + 5, w - 120, 12, 6).fill('#ffffff');
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED).text(t(lead.website || `www.${lead.company.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`), x + 70, top + 8, { width: w - 140, lineBreak: false });
  // nav
  const ny = top + 30;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(t(lead.company), x + 16, ny, { width: 200, lineBreak: false });
  ['Services', 'About', 'Gallery', 'Contact'].forEach((n, i) => doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(n, x + w - 230 + i * 55, ny + 2, { lineBreak: false }));
  // hero
  const hy = top + 54;
  doc.rect(x + 0.5, hy, w - 1, 170).fill(primary);
  doc.save().rect(x + 0.5, hy, w - 1, 170).clip();
  doc.circle(x + w - 70, hy + 40, 60).fillOpacity(0.18).fill(accent).fillOpacity(1);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(20).fillColor(onPrimary).text(t(brief.hero_headline || lead.company), x + 22, hy + 30, { width: w * 0.62, lineGap: 2 });
  doc.font('Helvetica').fontSize(9.5).fillColor(onPrimary).opacity(0.9).text(t(brief.hero_subheadline || ''), x + 22, doc.y + 6, { width: w * 0.55 }).opacity(1);
  const by = Math.min(doc.y + 12, hy + 136);
  doc.roundedRect(x + 22, by, 130, 24, 12).fill(accent);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(isDark(accent) ? '#ffffff' : INK).text(t(brief.primary_cta || 'Get in touch'), x + 22, by + 8, { width: 130, align: 'center', lineBreak: false });
  // section cards
  const sections = (brief.sections || ['Services', 'Why choose us', 'Reviews']).filter((n) => !/hero/i.test(n)).slice(0, 3);
  const cy = hy + 186, cw = (w - 2 * 16 - 2 * 12) / 3;
  sections.forEach((name, i) => {
    const cx = x + 16 + i * (cw + 12);
    doc.roundedRect(cx, cy, cw, 92, 8).fill(tint(primary, 0.92));
    doc.roundedRect(cx + 12, cy + 12, 24, 24, 6).fill(primary);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(t(name), cx + 12, cy + 44, { width: cw - 24, lineBreak: false });
    [0, 1].forEach((k) => doc.roundedRect(cx + 12, cy + 62 + k * 10, (cw - 24) * (k ? 0.6 : 0.9), 5, 2.5).fill(LINE));
  });
  // gallery strip + footer
  const gy = cy + 106;
  [0, 1, 2, 3].forEach((i) => doc.roundedRect(x + 16 + i * ((w - 32 - 30) / 4 + 10), gy, (w - 32 - 30) / 4, 44, 6).fill(tint(accent, 0.55 + i * 0.1)));
  doc.rect(x + 0.5, top + h - 30, w - 1, 29.5).fill(dark);
  doc.font('Helvetica').fontSize(7.5).fillColor('#ffffff').opacity(0.8).text(t(`© ${new Date().getFullYear()} ${lead.company}${lead.city ? ` · ${lead.city}` : ''}`), x + 16, top + h - 19, { lineBreak: false }).opacity(1);
}

// ===================================================================== proposal

/** Proposal PDF from AI-written content + code-computed pricing (prices never come from the AI). */
export async function proposalPdf({ lead, proposal, content, settings: s }) {
  const cur = s.billing.currency;
  const items = JSON.parse(proposal.items_json);
  const primary = '#2f5bea';
  const doc = newDoc(`Proposal for ${lead.company}`, s.agency.name);
  const created = new Date(proposal.created_at);
  const valid = new Date(created.getTime() + 14 * 86400000);
  const d = (x) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // cover
  doc.rect(0, 0, A4.w, 300).fill(INK);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff').text(t(s.agency.name.toUpperCase()), M, 50, { characterSpacing: 1.5 });
  doc.font('Helvetica').fontSize(11).fillColor('#c9ced8').text(`PROPOSAL #${proposal.id}`, M, 140, { characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(28).fillColor('#ffffff').text(t(content.title || `Website proposal for ${lead.company}`), M, 160, { width: A4.w - 2 * M, lineGap: 3 });
  const meta = [['Prepared for', `${lead.contact_name ? `${lead.contact_name}, ` : ''}${lead.company}`], ['Date', d(created)], ['Valid until', d(valid)], ['Prepared by', `${s.agency.sender_name}, ${s.agency.name}`]];
  meta.forEach(([k, v], i) => {
    const y = 330 + i * 34;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k, M, y);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK).text(t(v), M + 110, y - 1, { width: A4.w - 2 * M - 110 });
  });
  doc.roundedRect(M, 490, A4.w - 2 * M, 80, 12).fill(tint(primary, 0.9));
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Total investment', M + 20, 506);
  doc.font('Helvetica-Bold').fontSize(24).fillColor(INK).text(pdfMoney(proposal.total, cur), M + 20, 524);
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(t(`incl. ${s.billing.tax_label} ${s.billing.tax_pct}% · ${proposal.advance_pct}% advance to start`), M + 260, 530, { width: 230, align: 'right' });

  // body
  doc.addPage();
  heading(doc, 'Summary');
  para(doc, content.executive_summary);
  if (content.understanding?.length) { heading(doc, 'What you need'); bullets(doc, content.understanding, primary); }
  if (content.scope?.length) {
    heading(doc, 'Scope of work');
    for (const sc of content.scope) {
      ensure(doc, 50);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(t(sc.item), M, doc.y);
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(t(sc.description), M, doc.y + 2, { width: A4.w - 2 * M, lineGap: 2 });
      doc.moveDown(0.6);
    }
  }
  if (content.deliverables?.length) { heading(doc, 'Deliverables'); bullets(doc, content.deliverables, OK); }
  if (content.timeline?.length) {
    heading(doc, 'Timeline');
    for (const ph of content.timeline) {
      ensure(doc, 40);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(t(ph.phase), M, y, { width: 170 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(primary).text(t(ph.duration), M + 175, y, { width: 90 });
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(t(ph.details), M + 270, y, { width: A4.w - 2 * M - 270 });
      doc.y = Math.max(doc.y, y + 16) + 6;
    }
  }

  // investment table (numbers from code)
  heading(doc, 'Investment');
  const colX = [M, A4.w - M - 170, A4.w - M - 90];
  const row = (cells, bold, shade) => {
    ensure(doc, 34);
    const y = doc.y;
    const h = Math.max(22, doc.font('Helvetica').fontSize(10).heightOfString(t(cells[0]), { width: colX[1] - M - 10 }) + 10);
    if (shade) doc.rect(M, y - 4, A4.w - 2 * M, h).fill(SOFT);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(INK);
    doc.text(t(cells[0]), colX[0] + 6, y, { width: colX[1] - M - 10 });
    doc.text(t(cells[1]), colX[1], y, { width: 70, align: 'right' });
    doc.text(t(cells[2]), colX[2], y, { width: 84, align: 'right' });
    doc.y = y + h;
  };
  row(['Item', 'Qty', 'Amount'], true, true);
  for (const it of items) row([`${it.name}${it.detail ? `\n${it.detail}` : ''}`, String(it.qty), pdfMoney(it.qty * it.price, cur)]);
  doc.moveTo(M, doc.y).lineTo(A4.w - M, doc.y).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.y += 6;
  row(['Subtotal', '', pdfMoney(proposal.subtotal, cur)]);
  row([`${s.billing.tax_label} ${s.billing.tax_pct}%`, '', pdfMoney(proposal.tax, cur)]);
  row(['Total', '', pdfMoney(proposal.total, cur)], true, true);
  doc.moveDown(0.4);
  para(doc, `Payment: ${proposal.advance_pct}% advance (${pdfMoney((proposal.total * proposal.advance_pct) / 100, cur)}) to start, balance on delivery.`, { color: MUTED, size: 10 });

  if (content.why_us?.length) { heading(doc, `Why ${s.agency.name}`); bullets(doc, content.why_us, primary); }
  if (content.assumptions?.length) { heading(doc, 'Assumptions'); bullets(doc, content.assumptions, MUTED); }

  // how to accept
  ensure(doc, 150);
  const ay = doc.y + 10;
  doc.roundedRect(M, ay, A4.w - 2 * M, 120, 12).fill(INK);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff').text('Ready to start?', M + 22, ay + 18);
  doc.font('Helvetica').fontSize(10.5).fillColor('#e9ecf2').text(
    t(`Simply reply "YES" to our message, or tell our team on the phone. We'll send the advance invoice and kick off. Questions? Call ${s.agency.phone}.`),
    M + 22, ay + 44, { width: A4.w - 2 * M - 44, lineGap: 3 });
  if (content.next_steps?.length) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#c9ced8').text(t(content.next_steps.map((x, i) => `${i + 1}. ${x}`).join('   ')), M + 22, ay + 88, { width: A4.w - 2 * M - 44 });
  }

  footer(doc, s, `Proposal #${proposal.id}`);
  return toBuffer(doc);
}
