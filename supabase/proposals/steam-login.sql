-- DB担当へ渡す追加案。個人・クラウドDBには未適用。
-- Supabase custom OAuth2 (custom:steam) の短命な認証情報だけを保存する。
-- auth.users / auth.identities / profiles / 募集・成立のテーブルは変更しない。
begin;
create table public.integration_login_attempts (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  expires_at timestamptz not null
);
create table public.integration_login_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  steam_id text not null check (steam_id ~ '^[0-9]{17}$'),
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  redirect_uri text not null,
  expires_at timestamptz not null
);
create table public.integration_login_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  steam_id text not null check (steam_id ~ '^[0-9]{17}$'),
  expires_at timestamptz not null
);
create index integration_login_attempts_expiry on public.integration_login_attempts(expires_at);
create index integration_login_codes_expiry on public.integration_login_codes(expires_at);
create index integration_login_tokens_expiry on public.integration_login_tokens(expires_at);
alter table public.integration_login_attempts enable row level security;
alter table public.integration_login_codes enable row level security;
alter table public.integration_login_tokens enable row level security;
revoke all on public.integration_login_attempts, public.integration_login_codes, public.integration_login_tokens from public, anon, authenticated;
grant select, insert, delete on public.integration_login_attempts, public.integration_login_codes, public.integration_login_tokens to service_role;

create function public.integration_login_consume_attempt(p_hash text, p_now timestamptz)
returns jsonb language sql security invoker set search_path='' as $$
  delete from public.integration_login_attempts where state_hash=p_hash and expires_at>p_now returning payload;
$$;
create function public.integration_login_consume_code(p_hash text, p_challenge text, p_redirect text, p_now timestamptz)
returns jsonb language sql security invoker set search_path='' as $$
  delete from public.integration_login_codes
  where code_hash=p_hash and challenge=p_challenge and redirect_uri=p_redirect and expires_at>p_now
  returning jsonb_build_object('steamId',steam_id,'challenge',challenge,'redirectUri',redirect_uri);
$$;
revoke all on function public.integration_login_consume_attempt(text,timestamptz), public.integration_login_consume_code(text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.integration_login_consume_attempt(text,timestamptz), public.integration_login_consume_code(text,text,text,timestamptz) to service_role;
commit;
