import PDFDocument from 'pdfkit';
import { registerFonts, wordmark, toBuffer, clean, BLUE, INK, GREY, RULE, TINT } from './brand.js';

/**
 * Call script PDF (A4, agency brand). Text flows over as many pages as needed, so the content is
 * never squeezed; each section starts with a blue label and a rule.
 */
export function scriptPdf(c, input, settings) {
  return c.swot ? swotPdf(c, input, settings) : callScriptPdf(c, input, settings);
}

const QUAD = { strengths: ['Strengths', '#0f8a4f', '#e8f6ee'], weaknesses: ['Weaknesses', '#c2410c', '#fdf0e8'], opportunities: ['Opportunities', '#2d4bd8', '#eaecf8'], threats: ['Threats', '#9f1239', '#fbeaef'] };

/** SWOT report (A4): summary, a 2×2 SWOT grid, then "How we solve it" as service rows. */
function swotPdf(c, input, settings) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: clean(`SWOT analysis: ${input.company}`), Author: clean(settings.agency.name) } });
  registerFonts(doc);
  const L = 56, W = doc.page.width - 112, bottom = doc.page.height - 56;
  const title = clean(`SWOT analysis: ${input.company}`);
  const meta = [input.vertical, input.city, input.website, new Date().toISOString().slice(0, 10)].filter(Boolean).map(clean).join('  ·  ');
  const band = Math.max(150, 66 + doc.font('PB').fontSize(26).heightOfString(title, { width: W }) + (meta ? 22 : 0) + 26);
  doc.rect(0, 0, doc.page.width, band).fill(BLUE);
  wordmark(doc, L, 34, settings.agency.name, { size: 14 });
  doc.font('PB').fontSize(26).fillColor('#ffffff').text(title, L, 66, { width: W });
  if (meta) doc.font('PR').fontSize(10.5).fillColor('#dfe5ff').text(meta, L, doc.y + 4, { width: W });
  doc.y = band + 26;
  const heading = (label) => {
    if (doc.y > bottom - 90) doc.addPage();
    doc.moveDown(0.6);
    doc.font('PS').fontSize(13).fillColor(BLUE).text(label, L, doc.y, { width: W });
    const y = doc.y + 3;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.8).strokeColor(RULE).stroke();
    doc.y = y + 8;
  };

  if (c.pitch_point) {
    const top = doc.y, h = doc.font('PM').fontSize(11).heightOfString(clean(c.pitch_point), { width: W - 28 }) + 20;
    doc.roundedRect(L, top, W, h, 8).fill(TINT);
    doc.font('PM').fontSize(11).fillColor(INK).text(clean(c.pitch_point), L + 14, top + 10, { width: W - 28 });
    doc.y = top + h + 4;
  }
  if (c.swot.summary) { heading('Summary'); doc.font('PR').fontSize(11).fillColor(INK).text(clean(c.swot.summary), L, doc.y, { width: W, lineGap: 2.5 }); }

  heading('SWOT');
  const gap = 12, cw = (W - gap) / 2, pad = 12;
  const boxH = (k) => {
    let h = pad + 20;
    for (const v of c.swot[k] || []) h += doc.font('PR').fontSize(10).heightOfString(clean(v), { width: cw - pad * 2 - 12, lineGap: 1.5 }) + 6;
    return h + pad - 6;
  };
  const drawBox = (k, x, y, h) => {
    const [label, col, bg] = QUAD[k];
    doc.roundedRect(x, y, cw, h, 8).fill(bg);
    doc.rect(x, y + 8, 3, h - 16).fill(col);
    doc.font('PS').fontSize(12).fillColor(col).text(label, x + pad, y + pad, { width: cw - pad * 2 });
    let yy = y + pad + 20;
    for (const v of c.swot[k] || []) {
      doc.circle(x + pad + 3, yy + 6, 2).fill(col);
      doc.font('PR').fontSize(10).fillColor(INK).text(clean(v), x + pad + 12, yy, { width: cw - pad * 2 - 12, lineGap: 1.5 });
      yy = doc.y + 6;
    }
  };
  for (const [a, b] of [['strengths', 'weaknesses'], ['opportunities', 'threats']]) {
    const h = Math.max(boxH(a), boxH(b));
    if (doc.y + h > bottom) doc.addPage();
    const y = doc.y;
    drawBox(a, L, y, h); drawBox(b, L + cw + gap, y, h);
    doc.y = y + h + gap;
  }

  if (c.solutions?.length) {
    heading('How we solve it');
    const sw = 136;
    for (const r of c.solutions) {
      const tw = W - sw - 14;
      const body = [r.how, r.outcome && `Result: ${r.outcome}`].filter(Boolean).map(clean).join('\n');
      const h = doc.font('PS').fontSize(10.5).heightOfString(clean(r.problem), { width: tw }) + 3 + doc.font('PR').fontSize(10).heightOfString(body, { width: tw, lineGap: 1.5 }) + 16;
      if (doc.y + h > bottom) doc.addPage();
      const y = doc.y;
      doc.roundedRect(L, y + 6, sw - 10, 20, 10).fill(BLUE);
      doc.font('PS').fontSize(9).fillColor('#ffffff').text(clean(r.service), L, y + 11.5, { width: sw - 10, align: 'center' });
      doc.font('PS').fontSize(10.5).fillColor(INK).text(clean(r.problem), L + sw + 4, y + 6, { width: tw });
      doc.font('PR').fontSize(10).fillColor(GREY).text(body, L + sw + 4, doc.y + 3, { width: tw, lineGap: 1.5 });
      doc.y = y + h;
      doc.moveTo(L, doc.y - 4).lineTo(L + W, doc.y - 4).lineWidth(0.5).strokeColor(RULE).stroke();
    }
  }
  return toBuffer(doc);
}

function callScriptPdf(c, input, settings) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: clean(`Call script: ${input.company}`), Author: clean(settings.agency.name) } });
  registerFonts(doc);
  const W = doc.page.width - 112;

  // header band
  doc.rect(0, 0, doc.page.width, 150).fill(BLUE);
  wordmark(doc, 56, 34, settings.agency.name, { size: 14 });
  doc.font('PB').fontSize(26).fillColor('#ffffff').text(clean(`Call script: ${input.company}`), 56, 66, { width: W });
  const meta = [input.contact_name, input.vertical, input.city, input.website].filter(Boolean).map(clean).join('  ·  ');
  if (meta) doc.font('PR').fontSize(10.5).fillColor('#dfe5ff').text(meta, 56, doc.y + 4, { width: W });
  doc.y = 176;

  const section = (label) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.6);
    doc.font('PS').fontSize(13).fillColor(BLUE).text(label, 56, doc.y, { width: W });
    const y = doc.y + 3;
    doc.moveTo(56, y).lineTo(56 + W, y).lineWidth(0.8).strokeColor(RULE).stroke();
    doc.y = y + 8;
  };
  const para = (t, opts = {}) => doc.font(opts.font || 'PR').fontSize(opts.size || 11).fillColor(opts.color || INK).text(clean(t), 56 + (opts.indent || 0), doc.y, { width: W - (opts.indent || 0), lineGap: 2.5, paragraphGap: opts.gap ?? 5 });
  const item = (title, detail) => {
    if (doc.y > doc.page.height - 100) doc.addPage();
    para(title, { font: 'PS', gap: 1 });
    if (detail) para(detail, { color: GREY, gap: 7 });
  };

  if (c.pitch_point) {
    const top = doc.y;
    const h = doc.font('PM').fontSize(11).heightOfString(clean(c.pitch_point), { width: W - 28 }) + 20;
    doc.roundedRect(56, top, W, h, 8).fill(TINT);
    doc.font('PM').fontSize(11).fillColor(INK).text(clean(c.pitch_point), 70, top + 10, { width: W - 28 });
    doc.y = top + h + 4;
  }
  section('Introduction');
  para(c.introduction);
  section('Opportunities for them');
  for (const o of c.opportunities || []) item(o.title, o.detail);
  section('Three main pitching points');
  (c.pitch_points || []).forEach((p, i) => item(`${i + 1}. ${p.point}`, p.detail));
  section('Questions to understand their needs');
  for (const q of c.questions || []) para(`•  ${q}`, { gap: 4 });
  section('If they say…');
  for (const o of c.objections || []) item(`“${o.objection}”`, o.response);
  section('Booking the meeting');
  if (c.booking?.ask) item('Ask', c.booking.ask);
  if (c.booking?.if_yes) item('If yes', c.booking.if_yes);
  if (c.booking?.if_not_now) item('If not now', c.booking.if_not_now);
  doc.addPage();
  doc.font('PB').fontSize(18).fillColor(INK).text('Word-for-word script', 56, 56, { width: W });
  doc.moveDown(0.5);
  for (const line of String(c.script || '').split('\n')) {
    if (!line.trim()) { doc.moveDown(0.5); continue; }
    const cue = /^\s*\[.*\]\s*$/.test(line);
    para(line, { font: cue ? 'PM' : 'PR', color: cue ? BLUE : INK, size: 11.5, gap: 3 });
  }
  return toBuffer(doc);
}
