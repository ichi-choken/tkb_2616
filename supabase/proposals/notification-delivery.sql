-- Q-30 candidate only. Review with 担当② before creating a migration.
-- The application notification inbox / recipient decision belongs to 担当②.
begin;
create table public.integration_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  token_hash text not null unique,
  token_ciphertext text not null,
  updated_at timestamptz not null default now()
);
create index integration_push_devices_user_idx on public.integration_push_devices(user_id);
create table public.integration_push_deliveries (
  event_id uuid not null,
  device_id uuid not null references public.integration_push_devices(id) on delete cascade,
  event jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'provider_received', 'disabled', 'blocked', 'unknown')),
  revision uuid not null default gen_random_uuid(),
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  ticket_id text,
  accepted_at timestamptz,
  primary key (event_id, device_id)
);
create index integration_push_receipts_idx on public.integration_push_deliveries(next_attempt_at) where status='accepted';
alter table public.integration_push_devices enable row level security;
alter table public.integration_push_deliveries enable row level security;
revoke all on public.integration_push_devices, public.integration_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.integration_push_devices, public.integration_push_deliveries to service_role;
commit;
