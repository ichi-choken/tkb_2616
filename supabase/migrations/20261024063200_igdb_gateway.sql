-- IGDB に問い合わせる回数の決まりを、Edge Function（igdb-search）のどの実体からでも守るための共有の枠。
-- 間隔は 250 ミリ秒（1秒に4回）、同時に問い合わせるのは 8 件まで。画面（anon・authenticated）には何も見せない。

create table public.integration_api_budgets (
  service text primary key check (service = 'igdb'),
  next_at timestamptz not null default '-infinity'
);
insert into public.integration_api_budgets (service) values ('igdb');

create table public.integration_api_leases (
  id uuid primary key default gen_random_uuid(),
  service text not null references public.integration_api_budgets (service),
  expires_at timestamptz not null
);
create index integration_api_leases_service_idx on public.integration_api_leases (service, expires_at);

alter table public.integration_api_budgets enable row level security;
alter table public.integration_api_leases enable row level security;
revoke all on public.integration_api_budgets, public.integration_api_leases from public, anon, authenticated;
grant select, insert, update, delete on public.integration_api_budgets, public.integration_api_leases to service_role;

-- 問い合わせてよければ {lease_id}、待つなら {retry_after_ms} を返す。使い終えた枠は呼んだ側が消す
create function public.integration_claim_igdb()
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  budget_at timestamptz;
  current_at timestamptz;
  lease_id uuid;
begin
  select next_at into budget_at from public.integration_api_budgets where service = 'igdb' for update;
  current_at := clock_timestamp();
  delete from public.integration_api_leases where service = 'igdb' and expires_at <= current_at;
  if budget_at > current_at then
    return jsonb_build_object('retry_after_ms', ceil(extract(epoch from (budget_at - current_at)) * 1000));
  end if;
  if (select count(*) from public.integration_api_leases where service = 'igdb') >= 8 then
    return jsonb_build_object('retry_after_ms', 1000);
  end if;
  update public.integration_api_budgets set next_at = current_at + interval '250 milliseconds' where service = 'igdb';
  insert into public.integration_api_leases (service, expires_at)
    values ('igdb', current_at + interval '15 seconds') returning id into lease_id;
  return jsonb_build_object('lease_id', lease_id);
end;
$$;

revoke all on function public.integration_claim_igdb () from public, anon, authenticated;
grant execute on function public.integration_claim_igdb () to service_role;
