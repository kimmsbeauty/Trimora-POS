-- Closes the bookings_anon_update_payment_status gap flagged in the
-- 2026-07-16 handover: bookings.id is a sequential bigint, not a UUID, so
-- the old anon UPDATE policy (USING (payment_status = 'pending')) let any
-- caller flip ANY salon's booking by guessing/iterating small integers.
-- Real-world blast radius was assessed as low (only a UI status badge --
-- staff still manually confirm real payment), but it's a genuine
-- unauthenticated cross-tenant write and worth closing properly rather
-- than leaving indefinitely.
--
-- RLS alone can't fix this: a USING clause only sees the row itself, not
-- what the client chose to filter on, so there's no way to require "the
-- caller must know the phone number" via policy alone. The fix is to
-- replace the raw anon UPDATE grant with a SECURITY DEFINER RPC that takes
-- phone as a mandatory function argument and checks it server-side before
-- touching the row.

drop policy if exists "bookings_anon_update_payment_status" on public.bookings;

create or replace function public.claim_booking_payment_status(
  p_booking_id bigint,
  p_phone text,
  p_new_status text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row_count int;
begin
  if p_new_status not in ('awaiting_confirmation', 'pay_later') then
    raise exception 'p_new_status must be awaiting_confirmation or pay_later';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'p_phone is required';
  end if;

  update bookings
  set
    payment_status = p_new_status,
    payment_claimed_at = case
      when p_new_status = 'awaiting_confirmation' then now()
      else payment_claimed_at
    end
  where id = p_booking_id
    and phone = p_phone
    and payment_status = 'pending';

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$function$;

revoke all on function public.claim_booking_payment_status(bigint, text, text) from public;
grant execute on function public.claim_booking_payment_status(bigint, text, text) to anon;
