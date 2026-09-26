-- Race-safe duplicate protection for authenticated dream submissions.
-- Mirrors the API's existing definition of "same dream" while enforcing it in Postgres.

create unique index if not exists dreams_user_semantic_dedupe_idx
on public.dreams (
  user_id,
  title,
  content,
  date,
  time_known,
  (coalesce(time, time '00:00:00')),
  location_name
)
where user_id is not null;
