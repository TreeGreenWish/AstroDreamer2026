-- Dreams can explicitly record that no meaningful clock time is known.
-- Existing rows remain exact-time records; unknown-time rows persist NULL rather
-- than a fabricated midnight/noon value.
alter table public.dreams
  add column if not exists time_known boolean not null default true;

alter table public.dreams
  alter column time drop not null;

update public.dreams
set time_known = true
where time_known is null;
