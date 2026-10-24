-- Review with 担当② before moving into supabase/migrations/.
-- This draft does not alter application profiles, recruitments, matches or their policies.
begin;

create table public.integration_link_guards (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('steam', 'discord')),
  generation uuid not null default gen_random_uuid(),
  primary key(user_id, provider)
);
create table public.integration_attempts (
  state_hash text primary key,
  provider text not null check (provider in ('steam', 'discord')),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  return_to text not null,
  generation uuid not null,
  consumed_at timestamptz,
  created_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > created_at)
);
create index integration_attempts_expiry_idx on public.integration_attempts(expires_at);
create index integration_attempts_user_idx on public.integration_attempts(user_id);

create table public.integration_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('steam', 'discord')),
  external_id text not null,
  token_ciphertext text,
  revision uuid not null default gen_random_uuid(),
  snapshot jsonb,
  next_attempt_at timestamptz,
  lease_until timestamptz,
  unique(user_id, provider),
  check ((provider = 'steam' and token_ciphertext is null) or provider = 'discord')
);
create index integration_links_due_idx on public.integration_links(next_attempt_at)
  where next_attempt_at is not null;

-- Every operation goes through an authenticated Edge Function. These tables
-- contain provider data / encrypted credentials and are not a public profile.
alter table public.integration_attempts enable row level security;
alter table public.integration_links enable row level security;
alter table public.integration_link_guards enable row level security;
revoke all on public.integration_attempts, public.integration_links, public.integration_link_guards from public, anon, authenticated;
grant select, insert, update, delete on public.integration_attempts, public.integration_links, public.integration_link_guards to service_role;

-- A generation invalidates authentication already in flight when unlink is pressed.
-- All three routines lock the same guard before modifying the attempt or link.
create function public.integration_begin_link(p_user uuid, p_provider text, p_session uuid, p_state text, p_return text, p_created timestamptz, p_expires timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare g uuid;
begin
  insert into public.integration_link_guards(user_id, provider) values(p_user,p_provider) on conflict do nothing;
  select generation into g from public.integration_link_guards where user_id=p_user and provider=p_provider for update;
  insert into public.integration_attempts(state_hash,provider,user_id,session_id,return_to,generation,created_at,expires_at)
    values(p_state,p_provider,p_user,p_session,p_return,g,p_created,p_expires);
end; $$;
create function public.integration_finish_link(p_user uuid, p_provider text, p_session uuid, p_state text, p_external text, p_ciphertext text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare g uuid; spent text;
begin
  select generation into g from public.integration_link_guards where user_id=p_user and provider=p_provider for update;
  delete from public.integration_attempts where state_hash=p_state and user_id=p_user and provider=p_provider and session_id=p_session
    and generation=g and consumed_at is not null and expires_at>clock_timestamp() returning state_hash into spent;
  if spent is null then return false; end if;
  insert into public.integration_links(user_id,provider,external_id,token_ciphertext,next_attempt_at,snapshot)
    values(p_user,p_provider,p_external,p_ciphertext,
      case when p_provider='steam' then clock_timestamp() else null end,
      case when p_provider='discord' then jsonb_build_object('status','available','value',jsonb_build_object('discordId',p_external),
        'lastSuccessAt',clock_timestamp(),'attemptedAt',clock_timestamp(),'nextAttemptAt',null) else null end)
    on conflict(user_id,provider) do update set external_id=excluded.external_id, token_ciphertext=excluded.token_ciphertext,
      revision=gen_random_uuid(), snapshot=excluded.snapshot, next_attempt_at=excluded.next_attempt_at, lease_until=null;
  return true;
end; $$;
create function public.integration_unlink(p_user uuid, p_provider text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.integration_link_guards(user_id,provider) values(p_user,p_provider)
    on conflict(user_id,provider) do update set generation=gen_random_uuid();
  delete from public.integration_attempts where user_id=p_user and provider=p_provider;
  delete from public.integration_links where user_id=p_user and provider=p_provider;
end; $$;
revoke all on function public.integration_begin_link(uuid,text,uuid,text,text,timestamptz,timestamptz), public.integration_finish_link(uuid,text,uuid,text,text,text), public.integration_unlink(uuid,text) from public, anon, authenticated;
grant execute on function public.integration_begin_link(uuid,text,uuid,text,text,timestamptz,timestamptz), public.integration_finish_link(uuid,text,uuid,text,text,text), public.integration_unlink(uuid,text) to service_role;

commit;
