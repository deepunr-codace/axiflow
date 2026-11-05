export const STAGES = [
  { id: 'new', label: 'New', group: 'Intake' },
  { id: 'prepared', label: 'Call script ready: waiting for the call', group: 'Intake' },
  { id: 'qualified', label: 'Qualified (interested)', group: 'Conversion' },
  { id: 'researching', label: 'Pitch maker: researching', group: 'Conversion' },
  { id: 'brochure_ready', label: 'Pitch & design: needs approval', group: 'Conversion' },
  { id: 'brochure_approved', label: 'Approved: queued to send', group: 'Conversion' },
  { id: 'needs_manual', label: 'Needs manual contact', group: 'Conversion' },
  { id: 'contacted', label: 'Contacted', group: 'Conversion' },
  { id: 'follow_up_1', label: 'Follow-up 1 done', group: 'Conversion' },
  { id: 'follow_up_2', label: 'Follow-up 2 done', group: 'Conversion' },
  { id: 'nurture', label: 'Nurture pipe (undecided)', group: 'Marketing' },
  { id: 'reengage', label: 'Re-engage pipe (said no)', group: 'Marketing' },
  { id: 'replied', label: 'Replied', group: 'Sales' },
  { id: 'meeting_booked', label: 'Meeting booked', group: 'Sales' },
  { id: 'proposal_sent', label: 'Proposal sent', group: 'Sales' },
  { id: 'won', label: 'Won: awaiting advance', group: 'Delivery' },
  { id: 'onboarding', label: 'Onboarding: awaiting brief', group: 'Delivery' },
  { id: 'in_development', label: 'In development', group: 'Delivery' },
  { id: 'delivered', label: 'Delivered: final invoice', group: 'Delivery' },
  { id: 'completed', label: 'Completed', group: 'Closed' },
  { id: 'closed_no_reply', label: 'Closed: no reply', group: 'Closed' },
  { id: 'not_interested', label: 'Not interested (final)', group: 'Closed' },
  { id: 'lost', label: 'Lost', group: 'Closed' },
  { id: 'do_not_contact', label: 'Do not contact', group: 'Closed' },
];

export const STAGE_IDS = new Set(STAGES.map((s) => s.id));
export const TERMINAL = new Set(['completed', 'closed_no_reply', 'not_interested', 'lost', 'do_not_contact']);
/** Stages where a reply from the lead moves them to "replied". */
export const PRE_REPLY = new Set(['new', 'prepared', 'nurture', 'reengage', 'qualified', 'researching', 'brochure_ready', 'brochure_approved', 'needs_manual', 'contacted', 'follow_up_1', 'follow_up_2', 'closed_no_reply']);
export const PIPES = {
  conversion: 'Conversion (interested → pitch maker)',
  nurture: 'Marketing: Nurture (undecided)',
  reengage: 'Marketing: Re-engage (said no)',
};
export const SERVICES = ['website', 'ecommerce', 'redesign', 'webapp', 'seo', 'landing'];
export const SOURCES = ['crm', 'manual', 'web_form', 'api', 'csv', 'referral', 'google_ads', 'meta_ads', 'justdial', 'indiamart', 'linkedin', 'cold_list'];
