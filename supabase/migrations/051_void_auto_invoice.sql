-- Adds the ability to void an issued invoice. auto_invoices.status's CHECK
-- constraint has allowed 'void' since it was first created, but no RPC or
-- UI ever implemented it -- flagged in the 2026-07-16 handover.
--
-- Only 'issued' -> 'void' is allowed, mirroring the existing
-- issue_auto_invoice / mark_auto_invoice_paid gating (each RPC only allows
-- exactly one status transition). A 'paid' invoice is NOT voidable here --
-- reversing a paid invoice is a refund, a different (and more delicate)
-- operation with its own reconciliation concerns, not a void.

alter table public.auto_invoices
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

create or replace function public.void_auto_invoice(
  p_invoice_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_salon_id uuid;
  v_invoice_salon uuid;
  v_status text;
begin
  v_salon_id := auth_salon_id();
  if v_salon_id is null then
    raise exception 'Access denied: no salon session';
  end if;

  select salon_id, status into v_invoice_salon, v_status
  from auto_invoices where id = p_invoice_id for update;

  if not found or v_invoice_salon != v_salon_id then
    raise exception 'Invoice not found for this salon';
  end if;
  if v_status != 'issued' then
    raise exception 'Only an issued invoice can be voided (use delete for a draft, or a refund for a paid invoice)';
  end if;

  update auto_invoices
  set status = 'void', voided_at = now(), void_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_invoice_id;
end;
$function$;

-- This project has a default-privileges rule that grants EXECUTE on new
-- functions directly to anon/authenticated at creation time, independent
-- of PUBLIC -- discovered live while writing this migration (a REVOKE
-- ... FROM PUBLIC alone left anon still holding EXECUTE). Revoke from
-- anon explicitly on any function not meant to be anon-callable; don't
-- assume a PUBLIC-only revoke is sufficient (see README's REVOKE gotcha
-- note, sharpened after this).
revoke all on function public.void_auto_invoice(uuid, text) from anon, public;
grant execute on function public.void_auto_invoice(uuid, text) to authenticated;
