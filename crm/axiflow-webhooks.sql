-- AxiFlow: tell AxiFlow whenever CRM data changes.
-- Run once in the CRM's Supabase project (vedzrmwpojeyykjkkqyy) → SQL Editor.
-- Replace <WEBHOOK_SECRET> with the WEBHOOK_SECRET value from AxiFlow's .env / Vercel settings.
--
-- How it works: after any insert, update or delete on the tables below, the database sends one small
-- POST to AxiFlow (one per statement, so a bulk import of 500 leads sends one request, not 500).
-- AxiFlow ignores the body; the request only makes it read the CRM right away. pg_net sends it in the
-- background, so CRM saves are never slowed down or blocked if AxiFlow is unreachable.

create extension if not exists pg_net;

create or replace function public.axiflow_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://axiflow-v1.vercel.app/webhooks/atomic',
    body := jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'at', now()),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<WEBHOOK_SECRET>'),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

-- Only the triggers may run it (it holds the secret).
revoke all on function public.axiflow_notify() from public, anon, authenticated;

-- One statement-level trigger per table AxiFlow reads.
do $$
declare t text;
begin
  foreach t in array array['companies', 'contacts', 'deals', 'brochures', 'proposal', 'call_logs', 'call_assignments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists axiflow_notify on public.%I', t);
      execute format('create trigger axiflow_notify after insert or update or delete on public.%I for each statement execute function public.axiflow_notify()', t);
    end if;
  end loop;
end $$;

-- Check: the triggers that now exist
select event_object_table as "table", string_agg(event_manipulation, ', ') as events
from information_schema.triggers
where trigger_name = 'axiflow_notify'
group by event_object_table
order by 1;

-- Check after saving something in the CRM: the last requests sent and AxiFlow's answers (200 = received)
-- select id, status_code, content, created from net._http_response order by id desc limit 5;

-- To remove everything again:
-- do $$ declare t text; begin foreach t in array array['companies','contacts','deals','brochures','proposal','call_logs','call_assignments'] loop
--   if to_regclass('public.' || t) is not null then execute format('drop trigger if exists axiflow_notify on public.%I', t); end if;
-- end loop; end $$;
-- drop function if exists public.axiflow_notify();
