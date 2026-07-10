-- Feature-parity item #6 (customer feedback + ratings/reviews).
-- Additive, nullable -- mirrors sales.feedback_token exactly.
--
-- public_auto_job_rating_lookup mirrors public_rating_lookup's exact
-- security pattern: only feedback_token, client name, and date are
-- exposed to anon -- never payment, commission, vehicle, or any other
-- job detail. Grants verified live: anon has SELECT only (no INSERT/
-- UPDATE/DELETE/TRUNCATE), matching public_rating_lookup precisely.

alter table public.auto_jobs
  add column feedback_token text;

create view public.public_auto_job_rating_lookup as
select j.feedback_token, c.name as client, j.completed_at::date as date
from public.auto_jobs j
join public.customers c on c.id = j.customer_id
where j.feedback_token is not null;

grant select on public.public_auto_job_rating_lookup to anon, authenticated;
revoke insert, update, delete, truncate on public.public_auto_job_rating_lookup from anon, authenticated;
