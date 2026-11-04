import PDFDocument from 'pdfkit';
import { registerFonts, wordmark, toBuffer, clean, BLUE, INK, GREY, RULE, TINT } from './brand.js';

/**
 * Call script PDF (A4, agency brand). Text flows over as many pages as needed, so the content is
 * never squeezed; each section starts with a blue label and a rule.
 */
export function scriptPdf(c, input, settings) {
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
