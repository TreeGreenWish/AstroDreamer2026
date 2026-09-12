-- Dream Partner foundation: claim-level interpretation provenance.
-- Existing interpretation text remains intact; new analyses can attach auditable claims.
alter table public.dreams
  add column if not exists provenance_json jsonb not null default '[]'::jsonb,
  add column if not exists provenance_version integer;

alter table public.dreams drop constraint if exists dreams_provenance_json_is_array;
alter table public.dreams add constraint dreams_provenance_json_is_array
  check (jsonb_typeof(provenance_json) = 'array');

comment on column public.dreams.provenance_json is
  'Claim-level sources for an interpretation: dream text, personal history, user context, interpretive traditions, astrology, or AI hypothesis.';
