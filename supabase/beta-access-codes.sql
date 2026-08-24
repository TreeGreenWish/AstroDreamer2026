alter table public.beta_invites
  add column if not exists auth_user_id uuid,
  add column if not exists setup_code_hash text,
  add column if not exists setup_code_expires_at timestamptz,
  add column if not exists setup_code_used_at timestamptz,
  add column if not exists recovery_code_hash text,
  add column if not exists recovery_code_expires_at timestamptz,
  add column if not exists recovery_code_used_at timestamptz;

update public.beta_invites bi
set auth_user_id = u.id
from auth.users u
where bi.auth_user_id is null
  and lower(u.email) = lower(bi.email);

create index if not exists beta_invites_auth_user_id_idx
  on public.beta_invites(auth_user_id);
