-- Persistent cache for server-side AI results.
create table if not exists public.ai_cache (
  cache_key text primary key,
  cache_type text not null,
  payload jsonb not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_cache_type_idx on public.ai_cache (cache_type);
create index if not exists ai_cache_expires_at_idx on public.ai_cache (expires_at);

alter table public.ai_cache enable row level security;
revoke all on table public.ai_cache from anon, authenticated;
grant select, insert, update, delete on table public.ai_cache to service_role;

-- Track enrichment separately so AI/image failures never threaten the raw dream.
alter table public.dreams
  add column if not exists enrichment_status text not null default 'raw',
  add column if not exists interpreted_at timestamptz,
  add column if not exists image_generated_at timestamptz,
  add column if not exists interpretation_error text,
  add column if not exists image_error text;

alter table public.dreams drop constraint if exists dreams_enrichment_status_check;
alter table public.dreams add constraint dreams_enrichment_status_check
  check (enrichment_status in ('raw','interpreting','interpreted','image_failed','complete'));
