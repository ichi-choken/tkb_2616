-- アプリ版への通知（プッシュ）の届け先の端末と、配った記録（ADR-67 の「届け方は別」）。
--
-- 使うのは Edge Function（notification-delivery）だけ。画面（anon・authenticated）には何も見せない。
-- 何を誰に知らせるかは public.notifications（募集・参加希望の関数が書く）が正本で、ここでは決めない。
-- 通知の方式は未決（Q-30）。決まるまで、配る処理は止めてある（NOTIFICATION_TRANSPORT=disabled）。

create table public.integration_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  token_hash text not null unique,
  token_ciphertext text not null,
  updated_at timestamptz not null default now()
);
create index integration_push_devices_user_idx on public.integration_push_devices (user_id);

-- 同じ知らせを同じ端末に2回配らない（event_id と device_id の組で1件）
create table public.integration_push_deliveries (
  event_id uuid not null,
  device_id uuid not null references public.integration_push_devices (id) on delete cascade,
  event jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'provider_received', 'disabled', 'blocked', 'unknown')),
  revision uuid not null default gen_random_uuid(),
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  ticket_id text,
  accepted_at timestamptz,
  primary key (event_id, device_id)
);
create index integration_push_receipts_idx on public.integration_push_deliveries (next_attempt_at) where status = 'accepted';

alter table public.integration_push_devices enable row level security;
alter table public.integration_push_deliveries enable row level security;
revoke all on public.integration_push_devices, public.integration_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.integration_push_devices, public.integration_push_deliveries to service_role;
