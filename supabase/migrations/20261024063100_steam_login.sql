-- Steam でのログイン（ADR-84）に要る、短い間だけの認証の情報。
--
-- Steam の OpenID 2.0 を、Supabase の独自のログイン（custom:steam、OAuth2）に包む Edge Function（steam-auth）だけが使う。
-- state・code・userinfo 用のトークンは、ハッシュだけを持つ。画面（anon・authenticated）には何も見せない。
-- auth.users・auth.identities・profiles と、募集・成立の表は変えない。

create table public.integration_login_attempts (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  expires_at timestamptz not null
);

-- code は PKCE の確かめに通ったときに1回だけ使える
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

create index integration_login_attempts_expiry on public.integration_login_attempts (expires_at);
create index integration_login_codes_expiry on public.integration_login_codes (expires_at);
create index integration_login_tokens_expiry on public.integration_login_tokens (expires_at);

alter table public.integration_login_attempts enable row level security;
alter table public.integration_login_codes enable row level security;
alter table public.integration_login_tokens enable row level security;
revoke all on public.integration_login_attempts, public.integration_login_codes, public.integration_login_tokens
  from public, anon, authenticated;
grant select, insert, delete on public.integration_login_attempts, public.integration_login_codes, public.integration_login_tokens
  to service_role;

create function public.integration_login_consume_attempt(p_hash text, p_now timestamptz)
returns jsonb
language sql security invoker set search_path = ''
as $$
  delete from public.integration_login_attempts where state_hash = p_hash and expires_at > p_now returning payload;
$$;

-- 確かめの値か戻り先が違うときは、code を使わずに残す
create function public.integration_login_consume_code(p_hash text, p_challenge text, p_redirect text, p_now timestamptz)
returns jsonb
language sql security invoker set search_path = ''
as $$
  delete from public.integration_login_codes
  where code_hash = p_hash and challenge = p_challenge and redirect_uri = p_redirect and expires_at > p_now
  returning jsonb_build_object('steamId', steam_id, 'challenge', challenge, 'redirectUri', redirect_uri);
$$;

revoke all on function
  public.integration_login_consume_attempt (text, timestamptz),
  public.integration_login_consume_code (text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.integration_login_consume_attempt (text, timestamptz),
  public.integration_login_consume_code (text, text, text, timestamptz)
  to service_role;
