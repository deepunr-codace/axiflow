/** Rule-based lead score (0-100). Returns { score, reasons }. */
export function scoreLead(lead, audit, packages) {
  const reasons = [];
  let score = 0;
  const add = (pts, why) => { score += pts; reasons.push(`${pts > 0 ? '+' : ''}${pts} ${why}`); };

  if (lead.interested === 'yes') add(30, 'said they are interested');
  if (lead.interested === 'no') add(-50, 'said not interested');
  if (lead.email_valid) add(8, 'valid email');
  if (lead.phone_valid) add(8, 'valid phone');
  if (lead.wa_opt_in) add(8, 'WhatsApp permission');
  if (lead.email_opt_in) add(6, 'email permission');
  if (['web_form', 'referral'].includes(lead.source)) add(15, `warm source (${lead.source})`);
  else if (['google_ads', 'meta_ads', 'api'].includes(lead.source)) add(10, `inbound source (${lead.source})`);

  if (audit) {
    if (!audit.has_website) add(15, 'no website (high need)');
    else if (audit.unreachable) add(12, 'website down');
    else {
      const high = audit.findings.filter((f) => f.severity === 'high').length;
      if (high) add(Math.min(15, high * 6), `${high} critical website issue(s)`);
      if (audit.findings.length >= 4) add(5, 'many website issues');
    }
  }

  const minPrice = Math.min(...packages.map((p) => p.price));
  if (lead.budget) {
    if (lead.budget >= minPrice * 3) add(15, 'strong budget');
    else if (lead.budget >= minPrice) add(8, 'budget fits');
    else add(-5, 'budget below cheapest package');
  }
  if (lead.do_not_contact) add(-100, 'do-not-contact');
  return { score: Math.max(0, Math.min(100, score)), reasons };
}
