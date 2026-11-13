-- Brochure fix guide 2026-11-13, section 6.6: a rejection reason on the CRM's brochures row, so a regenerated brochure
-- knows why the last one was not approved. Run by the CRM team in the CRM's Supabase SQL editor (AxiFlow only reads the
-- CRM). The CRM's approve / not-approve control should then ask for the reason and save it in this column.
-- AxiFlow reads it already (src/crm-leads.js crmLead → brochures[].rejection_reason) and puts it in the next brief
-- ("LAST REJECTION"); until the column exists the brief says "no reason given".

ALTER TABLE public.brochures ADD COLUMN IF NOT EXISTS rejection_reason text;

-- check
-- SELECT id, status, rejection_reason FROM public.brochures ORDER BY id DESC LIMIT 5;
-- undo
-- ALTER TABLE public.brochures DROP COLUMN IF EXISTS rejection_reason;
