-- 112_pet_invoice_messages.sql
--
-- Trimora Pet -- delivery log for invoices sent straight from the server (email / WhatsApp).
--
-- STATUS: NOT APPLIED. Written for review. Per the standing Pet rule it is applied to production
-- only after an explicit "apply 112". The pet-send-invoice edge function needs it (it logs every
-- attempt and uses the log for its sending limits), so deploy the function AFTER applying this.
--
-- WHAT THIS IS: one row per send attempt made by the pet-send-invoice edge function. The function
-- writes with the service role (bypasses RLS); the app can only READ its own business's rows
-- (to show "last sent to ... on ..." and avoid accidental double sends). Rows are append-only.
--
-- WHAT IT DOES NOT DO: "sent" means the provider ACCEPTED the message. It is not proof the customer
-- read it. No provider webhooks are handled, so there is no delivered/read state.
--
-- ADDITIVE ONLY: one new table. Nothing existing changes.
--
-- ROLLBACK (loses send history only):
--   drop table if exists public.pet_invoice_messages;
--   drop function if exists public.pet_invoice_messages_immutable();

create table public.pet_invoice_messages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  invoice_id uuid not null references public.pet_invoices(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null check (btrim(recipient) <> '' and char_length(recipient) <= 254),
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  error text check (error is null or char_length(error) <= 200),
  created_at timestamptz not null default now()
);
create index pet_invoice_messages_invoice_idx on public.pet_invoice_messages (salon_id, invoice_id, created_at desc);
create index pet_invoice_messages_salon_idx on public.pet_invoice_messages (salon_id, created_at desc);

create function public.pet_invoice_messages_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'pet_invoice_messages is append-only';
end;
$$;
create trigger pet_invoice_messages_no_change before update on public.pet_invoice_messages
  for each row execute function public.pet_invoice_messages_immutable();

alter table public.pet_invoice_messages enable row level security;
create policy "pet_invoice_messages_select_own_salon" on public.pet_invoice_messages for select to authenticated
  using (salon_id = auth_salon_id());
revoke all on public.pet_invoice_messages from anon;
revoke all on public.pet_invoice_messages from authenticated;
grant select on public.pet_invoice_messages to authenticated;
