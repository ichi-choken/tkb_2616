-- 最初の動線（募集を出す → 一覧 → 参加したい → 承認 → 成立・合流）に要る表と関数。
--
-- 守り方（仕様のリポジトリ Umi-s-Atelie/hobby-platform の docs/決定/）
--   ADR-63 状態を変えるのは関数だけ。画面には表への書き込みの権限を与えない
--   ADR-64 見える人が違う項目は表を分け、行の権限（RLS）で守る
--   ADR-65 時刻で決まる状態は、保存した時刻とデータベースの時刻を、読むときと操作するときに比べて決める
--   ADR-67 知らせは、きっかけの変更と同じ関数で表に書く
-- コメントの recruit-1 などの ID は、そのリポジトリの spec/ の受け入れ条件を指す。

create schema private;
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 型
-- ---------------------------------------------------------------------------

-- 住んでいる地方（server-1、ADR-30）
create type public.region as enum (
  '北海道・東北', '関東', '甲信越', '北陸', '東海', '近畿', '中国', '四国', '九州・沖縄'
);

-- 募集の状態。名前は spec/server.ts の「募集」の表の状態のまま
create type public.recruitment_status as enum (
  '出ている', '追加受付中', '満員で終了', '手動で終了', '締め切りで終了', '開催中止', '遊び終了'
);

-- 参加希望の状態。名前は spec/server.ts の「参加希望と成立」の表の状態のまま
create type public.application_state as enum (
  '待っている', '成立', '終了', '辞退', '開催中止', '遊び終了'
);

-- 知らせの種類（app-17）
create type public.notification_kind as enum ('参加希望が届いた', '承認された');

-- ---------------------------------------------------------------------------
-- 表
-- ---------------------------------------------------------------------------

-- E-1 利用者。ログインの利用者と1対1。ログインしたときに作る
-- アカウント名（Discord・Google の名前）は誰にも見せないので、ここに写さない（server-17）
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  app_id text unique,                                   -- profile-11
  region public.region,
  usual_time_start time,                                -- いつも遊ぶ時間帯（ADR-35）
  usual_time_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((usual_time_start is null) = (usual_time_end is null))
);

-- E-5 ゲームのタグ。IGDB から取ったものだけ（server-6、ADR-70、ADR-74）
-- 書くのは IGDB を中継する Edge Function（秘密の鍵で書くので、行の権限を通らない）
create table public.games (
  id bigint primary key,                                -- IGDB のゲームの ID
  name text not null,
  alternative_names text[] not null default '{}',       -- 別名・各国の題名（server-8）
  platforms text[] not null default '{}',               -- 出ている機種（server-57）
  cover_image_id text,                                  -- 画像は保存せず IGDB の置き場から出す（ADR-24）
  hide_cover boolean not null default false,            -- ゲーム会社に求められたら絵を出さない（app-13）
  first_release_date date,
  popularity double precision,
  steam_app_id integer unique,
  fetched_at timestamptz not null default now()
);

-- E-7 募集。招待状とアプリ内に出してよい項目だけを持つ（入る場所は recruitment_meetings）
create table public.recruitments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  game_id bigint not null references public.games (id), -- 公開後は変えない（recruit-21、ADR-43）
  -- 条件の欄（recruit-13）
  starts_at timestamptz,                                -- 遊ぶ時間。null は「決めない」
  capacity integer check (capacity >= 1),               -- 募集者を除く人数。null は人数で終わらない（ADR-37）
  voice_chat text,
  skill smallint check (skill between 1 and 9),         -- ADR-75
  enthusiasm smallint check (enthusiasm between 1 and 5), -- ゆるい=1 … ガチ=5（ADR-33）
  usual_time_start time,
  usual_time_end time,
  mode text,
  platform text,
  platform_other text,                                  -- 機種のその他（ADR-34）
  needs_participant_id boolean not null,                -- 参加する人のIDが要るか（ADR-28）
  -- 状態を決める記録。状態そのものは public.status(recruitments) で読むときに決める（ADR-65）
  closed_manually_at timestamptz,                       -- 募集する人が受付を終えた
  cancelled_at timestamptz,                             -- 開催中止（ADR-38）
  play_started_at timestamptz,                          -- 遊び始めの記録。任意（ADR-59）
  play_ended_at timestamptz,                            -- 遊び終え（ADR-58）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((usual_time_start is null) = (usual_time_end is null)),
  check (not (cancelled_at is not null and play_ended_at is not null))
);
create index recruitments_game_id_idx on public.recruitments (game_id);
create index recruitments_owner_id_idx on public.recruitments (owner_id);

-- E-8 合流。募集1件の入る場所と招待URL（ADR-64 で分けた表。ADR-57）
create table public.recruitment_meetings (
  recruitment_id uuid primary key references public.recruitments (id) on delete cascade,
  room_code text check (room_code ~ '^\S+$'),           -- 空白なしの1行（app-23）
  invite_url text check (invite_url ~ '^\S+$'),
  updated_at timestamptz not null default now()
);

-- E-9 参加希望。募集 × 参加する人。そのときの条件も持つ
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references public.recruitments (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  -- そのときの条件
  voice_chat text,
  skill smallint check (skill between 1 and 9),
  enthusiasm smallint check (enthusiasm between 1 and 5),
  usual_time_start time,
  usual_time_end time,
  mode text,
  platform text,
  platform_other text,
  -- 状態を決める記録。状態そのものは public.state(applications) で読むときに決める（ADR-65）
  matched_at timestamptz,                               -- 募集する人が承認して成立した
  ended_at timestamptz,                                 -- 承認待ちのまま、満員・受付終了で終わった
  declined_at timestamptz,                              -- 成立の後に本人が辞退した
  created_at timestamptz not null default now(),
  unique (recruitment_id, applicant_id),                -- 同じ人は1件
  check ((usual_time_start is null) = (usual_time_end is null))
);
create index applications_applicant_id_idx on public.applications (applicant_id);

-- E-10 参加者のゲーム内ID（ADR-64 で分けた表）。参加する人だけが出す（ADR-7）
create table public.application_game_ids (
  application_id uuid primary key references public.applications (id) on delete cascade,
  game_account_id text not null check (game_account_id ~ '^[A-Za-z0-9]+$') -- 英数字だけ（app-23、ADR-36）
);

-- E-12 知らせ。宛先1人への1件（ADR-67）
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  recruitment_id uuid references public.recruitments (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_id_idx on public.notifications (user_id, created_at desc);

-- E-16 操作の記録。画面が作った操作の ID と最初の結果。再送に同じ結果を返す（recruit-18）
-- private に置くので、画面からは読めない
create table private.operations (
  user_id uuid not null references public.profiles (id) on delete cascade,
  op_id uuid not null,
  name text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, op_id)
);

-- ---------------------------------------------------------------------------
-- 読むときに決める状態（ADR-65）
-- PostgREST では計算した列として読める（例：select=*,status,matched_count）
-- ---------------------------------------------------------------------------

-- 成立している人数。辞退した人は数えない
create function public.matched_count(r public.recruitments)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.applications a
  where a.recruitment_id = r.id and a.matched_at is not null and a.declined_at is null
$$;

-- 募集の状態。並びは「募集」の表で、どのきっかけが先に効くか
--   開催中止・遊び終了の後は、ほかのきっかけを無視する
--   手動で終了の後は、締め切りを無視する
--   満員の後に締め切りが来ると、締め切りで終了になる
create function public.status(r public.recruitments)
returns public.recruitment_status
language sql stable security definer set search_path = ''
as $$
  select case
    when r.cancelled_at is not null then '開催中止'
    when r.play_ended_at is not null then '遊び終了'
    when r.closed_manually_at is not null then '手動で終了'
    when r.starts_at is not null and now() >= r.starts_at then '締め切りで終了'
    when r.capacity is not null and public.matched_count(r) >= r.capacity then '満員で終了'
    else '出ている'
  end::public.recruitment_status
$$;

-- 参加希望の状態。並びは「参加希望と成立」の表で、どのきっかけが先に効くか
create function public.state(a public.applications)
returns public.application_state
language sql stable security definer set search_path = ''
as $$
  select case
    when a.declined_at is not null then '辞退'
    when r.cancelled_at is not null then '開催中止'
    when a.matched_at is not null and r.play_ended_at is not null then '遊び終了'
    when a.matched_at is not null then '成立'
    when a.ended_at is not null then '終了'
    when public.status(r) not in ('出ている', '追加受付中') then '終了'
    else '待っている'
  end::public.application_state
  from public.recruitments r
  where r.id = a.recruitment_id
$$;

-- ---------------------------------------------------------------------------
-- 行の権限で使う確かめ（ADR-64）。表を読まずに済むよう security definer にする
-- ---------------------------------------------------------------------------

create function private.is_owner(p_recruitment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.recruitments r
    where r.id = p_recruitment_id and r.owner_id = (select auth.uid())
  )
$$;

-- 合流の情報を渡してよいか。募集する人と、成立した相手だけ（matched-1、matched-17）
-- 開催中止と遊び終了の後は、双方に渡さない（ended-5、requests-17、requests-24、matched-14、matched-21）
create function private.can_see_meeting(p_recruitment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.recruitments r
    where r.id = p_recruitment_id
      and r.cancelled_at is null
      and r.play_ended_at is null
      and (
        r.owner_id = (select auth.uid())
        or exists (
          select 1 from public.applications a
          where a.recruitment_id = r.id
            and a.applicant_id = (select auth.uid())
            and a.matched_at is not null
            and a.declined_at is null
        )
      )
  )
$$;

-- 参加者のゲーム内IDを渡してよいか。本人と、成立した募集の募集する人だけ
-- 開催中止と遊び終了の後は、双方に渡さない（matched-14、matched-21、requests-17、requests-24）
create function private.can_see_game_id(p_application_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.applications a
    join public.recruitments r on r.id = a.recruitment_id
    where a.id = p_application_id
      and r.cancelled_at is null
      and r.play_ended_at is null
      and (
        a.applicant_id = (select auth.uid())
        or (r.owner_id = (select auth.uid()) and a.matched_at is not null and a.declined_at is null)
      )
  )
$$;

grant execute on function private.is_owner(uuid) to anon, authenticated;
grant execute on function private.can_see_meeting(uuid) to anon, authenticated;
grant execute on function private.can_see_game_id(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 行の権限（ADR-64）。書き込みの権限は誰にも与えない（ADR-63）
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.recruitments enable row level security;
alter table public.recruitment_meetings enable row level security;
alter table public.applications enable row level security;
alter table public.application_game_ids enable row level security;
alter table public.notifications enable row level security;
alter table private.operations enable row level security;

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
-- 後のマイグレーションで足す表にも、書き込みの権限を与えない
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;

-- プロフィールはリンクを開いた人に見える（profile-1、profile-10）
create policy "だれでも読める" on public.profiles for select to anon, authenticated using (true);

create policy "だれでも読める" on public.games for select to anon, authenticated using (true);

-- 募集の一覧と募集は、登録なしで見られる（list-1、app-2、ADR-79）
create policy "だれでも読める" on public.recruitments for select to anon, authenticated using (true);

create policy "募集する人と成立した相手" on public.recruitment_meetings for select to authenticated
  using ((select private.can_see_meeting(recruitment_id)));

-- 参加希望は、参加する本人と、その募集の募集する人（requests-1、requests-2）
create policy "本人と募集する人" on public.applications for select to authenticated
  using (applicant_id = (select auth.uid()) or (select private.is_owner(recruitment_id)));

create policy "本人と成立した募集の募集する人" on public.application_game_ids for select to authenticated
  using ((select private.can_see_game_id(application_id)));

create policy "宛先の本人" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- 画面の更新は Realtime で受ける。届くのは行の権限で読める行だけ（ADR-66、matched-8、matched-23）
alter publication supabase_realtime add table
  public.recruitments, public.recruitment_meetings, public.applications, public.notifications;

-- ---------------------------------------------------------------------------
-- ログインしたら利用者を作る（E-1）
-- ---------------------------------------------------------------------------

create function private.create_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_profile();

-- ---------------------------------------------------------------------------
-- 操作（ADR-63）
-- どれも、ログインしていないと 42501 で失敗する（recruit-25、ADR-77、ADR-79）。
-- 受け付けなかったときは、例外ではなく {ok:false, reason, ...} を返す。画面は理由と最新の状態を出す（requests-4）。
-- p_op_id は画面が操作ごとに作る ID。同じ ID の再送には最初の結果を返す（recruit-18）。
-- ---------------------------------------------------------------------------

create function private.require_user()
returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ログインが要る' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- 操作の記録を始める。同じ ID がもうあれば、その結果を返す（無ければ null）
-- 同じ ID の操作が同時に来ても、後のほうは先の操作が終わるまで待ってから結果を読む
create function private.begin_operation(p_user uuid, p_op_id uuid, p_name text)
returns jsonb
language plpgsql set search_path = ''
as $$
begin
  if p_op_id is null then
    raise exception '操作の ID が要る' using errcode = '22023';
  end if;
  insert into private.operations (user_id, op_id, name) values (p_user, p_op_id, p_name)
    on conflict do nothing;
  if found then
    return null;
  end if;
  return (select o.result from private.operations o where o.user_id = p_user and o.op_id = p_op_id);
end;
$$;

create function private.finish_operation(p_user uuid, p_op_id uuid, p_result jsonb)
returns jsonb
language sql set search_path = ''
as $$
  update private.operations set result = p_result where user_id = p_user and op_id = p_op_id;
  select p_result;
$$;

-- 募集を公開する（recruit-14、recruit-18）
create function public.publish_recruitment(
  p_op_id uuid,
  p_game_id bigint,
  p_needs_participant_id boolean,
  p_starts_at timestamptz default null,
  p_capacity integer default null,
  p_voice_chat text default null,
  p_skill smallint default null,
  p_enthusiasm smallint default null,
  p_usual_time_start time default null,
  p_usual_time_end time default null,
  p_mode text default null,
  p_platform text default null,
  p_platform_other text default null,
  p_room_code text default null,
  p_invite_url text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_done jsonb := private.begin_operation(v_uid, p_op_id, 'publish_recruitment');
  v_id uuid;
begin
  if v_done is not null then
    return v_done;
  end if;
  -- 用意したタグしか受け付けない（server-6）
  if not exists (select 1 from public.games g where g.id = p_game_id) then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'unknown_game'));
  end if;

  insert into public.recruitments (
    owner_id, game_id, needs_participant_id, starts_at, capacity, voice_chat, skill, enthusiasm,
    usual_time_start, usual_time_end, mode, platform, platform_other
  ) values (
    v_uid, p_game_id, p_needs_participant_id, p_starts_at, p_capacity, p_voice_chat, p_skill, p_enthusiasm,
    p_usual_time_start, p_usual_time_end, p_mode, p_platform, p_platform_other
  ) returning id into v_id;

  insert into public.recruitment_meetings (recruitment_id, room_code, invite_url)
    values (v_id, nullif(p_room_code, ''), nullif(p_invite_url, ''));

  return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', true, 'recruitment_id', v_id));
end;
$$;

-- 参加希望を送る
create function public.apply_to_recruitment(
  p_op_id uuid,
  p_recruitment_id uuid,
  p_game_account_id text default null,
  p_voice_chat text default null,
  p_skill smallint default null,
  p_enthusiasm smallint default null,
  p_usual_time_start time default null,
  p_usual_time_end time default null,
  p_mode text default null,
  p_platform text default null,
  p_platform_other text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_done jsonb := private.begin_operation(v_uid, p_op_id, 'apply_to_recruitment');
  v_r public.recruitments;
  v_status public.recruitment_status;
  v_existing public.applications;
  v_app_id uuid;
begin
  if v_done is not null then
    return v_done;
  end if;

  -- 募集の行を押さえ、受付終了・中止と同時に来ても、押さえた後の状態で決める
  select * into v_r from public.recruitments where id = p_recruitment_id for update;
  if not found then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'not_found'));
  end if;
  if v_r.owner_id = v_uid then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'own_recruitment'));
  end if;

  -- 送った後の募集には、今の結果を返し、同じ参加希望を足さない
  select * into v_existing from public.applications
    where recruitment_id = p_recruitment_id and applicant_id = v_uid;
  if found then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
      'ok', true, 'application_id', v_existing.id, 'state', public.state(v_existing), 'already', true));
  end if;

  v_status := public.status(v_r);
  if v_status not in ('出ている', '追加受付中') then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
      'ok', false, 'reason', 'not_accepting', 'status', v_status));
  end if;

  -- 参加する人のIDが要る募集では、英数字のゲーム内IDが要る（list-14、app-23）
  if v_r.needs_participant_id and coalesce(p_game_account_id, '') = '' then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'game_account_id_required'));
  end if;
  if p_game_account_id is not null and p_game_account_id <> '' and p_game_account_id !~ '^[A-Za-z0-9]+$' then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'game_account_id_invalid'));
  end if;

  insert into public.applications (
    recruitment_id, applicant_id, voice_chat, skill, enthusiasm, usual_time_start, usual_time_end,
    mode, platform, platform_other
  ) values (
    p_recruitment_id, v_uid, p_voice_chat, p_skill, p_enthusiasm, p_usual_time_start, p_usual_time_end,
    p_mode, p_platform, p_platform_other
  ) returning id into v_app_id;

  if coalesce(p_game_account_id, '') <> '' then
    insert into public.application_game_ids (application_id, game_account_id) values (v_app_id, p_game_account_id);
  end if;

  insert into public.notifications (user_id, kind, recruitment_id, application_id)
    values (v_r.owner_id, '参加希望が届いた', p_recruitment_id, v_app_id);

  return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
    'ok', true, 'application_id', v_app_id, 'state', '待っている'));
end;
$$;

-- 参加希望を承認する（requests-4）。募集する人だけ
-- 募集の行を押さえてから枠を数えるので、同時に承認しても成立人数が募集人数を超えない
create function public.approve_application(p_op_id uuid, p_application_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_done jsonb := private.begin_operation(v_uid, p_op_id, 'approve_application');
  v_app public.applications;
  v_r public.recruitments;
  v_status public.recruitment_status;
  v_state public.application_state;
begin
  if v_done is not null then
    return v_done;
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if not found then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'not_found'));
  end if;
  select * into v_r from public.recruitments where id = v_app.recruitment_id for update;
  if v_r.owner_id <> v_uid then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'not_owner'));
  end if;

  -- 行を押さえた後に読み直す
  select * into v_app from public.applications where id = p_application_id;
  v_state := public.state(v_app);
  if v_state = '成立' then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', true, 'state', v_state, 'already', true));
  end if;

  v_status := public.status(v_r);
  if v_state <> '待っている' or v_status not in ('出ている', '追加受付中') then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
      'ok', false, 'reason', 'not_accepting', 'status', v_status, 'state', v_state));
  end if;

  update public.applications set matched_at = now() where id = p_application_id;

  insert into public.notifications (user_id, kind, recruitment_id, application_id)
    values (v_app.applicant_id, '承認された', v_r.id, p_application_id);

  -- 枠が埋まったら、承認待ちの参加希望は何も知らせずに終わる
  if public.status(v_r) = '満員で終了' then
    update public.applications set ended_at = now()
      where recruitment_id = v_r.id and matched_at is null and ended_at is null;
  end if;

  return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
    'ok', true, 'state', '成立', 'status', public.status(v_r), 'matched_count', public.matched_count(v_r)));
end;
$$;

-- 部屋番号・招待URLを入れる・変える（requests-25）。募集する人だけ
-- 開催中止・遊び終了の前なら、受付終了の後や遊んでいる最中でも変えられる。受付の状態は変えない
-- null の引数はその項目を変えない。空文字はその項目を消す
create function public.update_meeting(
  p_op_id uuid,
  p_recruitment_id uuid,
  p_room_code text default null,
  p_invite_url text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_done jsonb := private.begin_operation(v_uid, p_op_id, 'update_meeting');
  v_r public.recruitments;
  v_m public.recruitment_meetings;
begin
  if v_done is not null then
    return v_done;
  end if;
  select * into v_r from public.recruitments where id = p_recruitment_id for update;
  if not found then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'not_found'));
  end if;
  if v_r.owner_id <> v_uid then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'not_owner'));
  end if;
  if v_r.cancelled_at is not null or v_r.play_ended_at is not null then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
      'ok', false, 'reason', 'not_accepting', 'status', public.status(v_r)));
  end if;

  update public.recruitment_meetings set
    room_code = case when p_room_code is null then room_code else nullif(p_room_code, '') end,
    invite_url = case when p_invite_url is null then invite_url else nullif(p_invite_url, '') end,
    updated_at = now()
  where recruitment_id = p_recruitment_id
  returning * into v_m;

  return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
    'ok', true, 'room_code', v_m.room_code, 'invite_url', v_m.invite_url));
end;
$$;

-- 募集の受付を終える・開催を中止する・遊び始める・遊び終える（requests-10、requests-12、requests-14、requests-22）
-- 募集する人だけ。表で「無視」のきっかけは、何も変えずに今の状態を返す
create function public.change_recruitment(p_op_id uuid, p_recruitment_id uuid, p_action text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_done jsonb := private.begin_operation(v_uid, p_op_id, 'change_recruitment:' || coalesce(p_action, ''));
  v_r public.recruitments;
  v_status public.recruitment_status;
begin
  if v_done is not null then
    return v_done;
  end if;
  if p_action is null or p_action not in ('close', 'cancel', 'start_play', 'end_play') then
    raise exception '操作は close・cancel・start_play・end_play のどれか' using errcode = '22023';
  end if;
  select * into v_r from public.recruitments where id = p_recruitment_id for update;
  if not found then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'not_found'));
  end if;
  if v_r.owner_id <> v_uid then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'not_owner'));
  end if;

  v_status := public.status(v_r);
  if v_status not in ('開催中止', '遊び終了') then
    if p_action = 'close' and v_status in ('出ている', '追加受付中', '満員で終了') then
      update public.recruitments set closed_manually_at = now(), updated_at = now() where id = v_r.id;
      update public.applications set ended_at = now()
        where recruitment_id = v_r.id and matched_at is null and ended_at is null;
    elsif p_action = 'cancel' then
      update public.recruitments set cancelled_at = now(), updated_at = now() where id = v_r.id;
    elsif p_action = 'start_play' and v_r.play_started_at is null then
      update public.recruitments set play_started_at = now(), updated_at = now() where id = v_r.id;
    elsif p_action = 'end_play' then
      update public.recruitments set play_ended_at = now(), updated_at = now() where id = v_r.id;
    end if;
  end if;

  select * into v_r from public.recruitments where id = p_recruitment_id;
  return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
    'ok', true, 'status', public.status(v_r), 'playing', v_r.play_started_at is not null));
end;
$$;

-- そのゲームの募集一覧（list-1、list-4、list-11）
-- 押したリンクの募集を一番上に、次に受け付けている募集、その下に終わった募集
-- 受け付けている募集どうし・終わった募集どうしの並び（合う順）は、server-52 が決まるまで新しい順
create function public.recruitments_for_game(p_game_id bigint, p_first uuid default null)
returns setof public.recruitments
language sql stable security definer set search_path = ''
as $$
  select r.* from public.recruitments r
  where r.game_id = p_game_id
  order by
    (r.id = p_first) desc nulls last,
    (public.status(r) in ('出ている', '追加受付中')) desc,
    r.created_at desc
$$;

revoke execute on function private.require_user from public, anon, authenticated;
revoke execute on function private.begin_operation from public, anon, authenticated;
revoke execute on function private.finish_operation from public, anon, authenticated;
revoke execute on function public.publish_recruitment from public, anon;
revoke execute on function public.apply_to_recruitment from public, anon;
revoke execute on function public.approve_application from public, anon;
revoke execute on function public.update_meeting from public, anon;
revoke execute on function public.change_recruitment from public, anon;
grant execute on function public.publish_recruitment to authenticated;
grant execute on function public.apply_to_recruitment to authenticated;
grant execute on function public.approve_application to authenticated;
grant execute on function public.update_meeting to authenticated;
grant execute on function public.change_recruitment to authenticated;
