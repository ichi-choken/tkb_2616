-- 承認済みの画面の条件のうち、20261024043000_first_flow.sql でまだ満たせていなかった4つを足す。
--   1. 増員して受付を再開し、開始後なら「追加受付中」にする（recruit-23、recruit-24、requests-26）
--   2. ニックネームの無い人は、届いた参加希望でゲーム内IDを名前として出す（requests-3）
--   3. プロフィールのニックネーム・住んでいる地方・いつも遊ぶ時間帯を保存する（profile-1、requests-3）
--   4. ゲームごとの選択肢（モードと、参加する人のIDが要るかの初期値）を持ち、選択肢に無いモードを受け付けない
--      （server-10、server-11、recruit-13、recruit-15）
-- コメントの ID は、仕様のリポジトリ Umi-s-Atelie/hobby-platform の spec/ の受け入れ条件を指す。

-- ---------------------------------------------------------------------------
-- 4. ゲームごとの選択肢（server-10）。中身を作っていないゲームは null（server-11、recruit-15）
-- 書くのは、IGDB を中継する Edge Function と、中身を確かめて入れる人（ADR-73）
-- ---------------------------------------------------------------------------

alter table public.games
  add column modes text[],                          -- そのゲームでよく使う条件（例：ランクマッチ／カジュアル）
  add column needs_participant_id_default boolean;  -- 参加する人のIDが要るかの初期値（ADR-28、recruit-13）

-- ---------------------------------------------------------------------------
-- 1. 増員して受付を再開した記録。開始時刻を過ぎてから再開したときだけ入れる（requests-26）
-- ---------------------------------------------------------------------------

alter table public.recruitments
  add column extra_reception_at timestamptz;

-- 募集の状態。追加受付中の募集は、開始時刻を過ぎても受け付け、満員になれば満員で終了になる（recruit-23）
create or replace function public.status(r public.recruitments)
returns public.recruitment_status
language sql stable security definer set search_path = ''
as $$
  select case
    when r.cancelled_at is not null then '開催中止'
    when r.play_ended_at is not null then '遊び終了'
    when r.closed_manually_at is not null then '手動で終了'
    when r.extra_reception_at is not null then
      case when r.capacity is not null and public.matched_count(r) >= r.capacity then '満員で終了' else '追加受付中' end
    when r.starts_at is not null and now() >= r.starts_at then '締め切りで終了'
    when r.capacity is not null and public.matched_count(r) >= r.capacity then '満員で終了'
    else '出ている'
  end::public.recruitment_status
$$;

-- 受付が終わった自分の募集を、人数を増やして再開する（recruit-23、recruit-24）。募集する人だけ
-- 増やした人数が、今の人数と成立人数より多いときだけ。開催中止・遊び終了の後はできない
create function public.reopen_with_more_capacity(p_op_id uuid, p_recruitment_id uuid, p_new_capacity integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_done jsonb := private.begin_operation(v_uid, p_op_id, 'reopen_with_more_capacity');
  v_r public.recruitments;
  v_status public.recruitment_status;
  v_matched integer;
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

  v_status := public.status(v_r);
  v_matched := public.matched_count(v_r);
  if v_status not in ('満員で終了', '手動で終了', '締め切りで終了')
     or v_r.capacity is null or p_new_capacity is null
     or p_new_capacity <= v_r.capacity or p_new_capacity <= v_matched then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
      'ok', false, 'reason', 'not_reopenable', 'status', v_status, 'capacity', v_r.capacity, 'matched_count', v_matched));
  end if;

  update public.recruitments set
    capacity = p_new_capacity,
    closed_manually_at = null,
    extra_reception_at = case when starts_at is not null and now() >= starts_at then now() end,
    updated_at = now()
  where id = v_r.id
  returning * into v_r;

  return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
    'ok', true, 'status', public.status(v_r), 'capacity', v_r.capacity, 'matched_count', public.matched_count(v_r)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. 参加者のゲーム内IDを渡してよいか（requests-3）
-- 本人と、募集する人。募集する人には、成立した人の分と、承認待ちでニックネームの無い人の分（届いた参加希望で名前として出す）
-- 開催中止と遊び終了の後は、双方に渡さない（matched-14、matched-21、requests-17、requests-24）
-- ---------------------------------------------------------------------------

create or replace function private.can_see_game_id(p_application_id uuid)
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
        or (
          r.owner_id = (select auth.uid())
          and a.declined_at is null
          and (
            a.matched_at is not null
            or (
              a.ended_at is null
              and not exists (select 1 from public.profiles p where p.id = a.applicant_id and p.nickname is not null)
            )
          )
        )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. プロフィールを保存する（profile-1）。本人だけ。渡した値でそのまま置き換え、null は消す
-- アプリID（profile-11）は、使える文字と長さが決まっていない（Q-25）ので、ここでは変えない
-- ---------------------------------------------------------------------------

create function public.update_profile(
  p_op_id uuid,
  p_nickname text default null,
  p_region public.region default null,
  p_usual_time_start time default null,
  p_usual_time_end time default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_done jsonb := private.begin_operation(v_uid, p_op_id, 'update_profile');
  v_nickname text := nullif(btrim(p_nickname), '');
  v_p public.profiles;
begin
  if v_done is not null then
    return v_done;
  end if;
  if v_nickname ~ '[\r\n]' then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'nickname_invalid'));
  end if;
  if (p_usual_time_start is null) <> (p_usual_time_end is null) then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'usual_time_incomplete'));
  end if;

  insert into public.profiles (id, nickname, region, usual_time_start, usual_time_end)
  values (v_uid, v_nickname, p_region, p_usual_time_start, p_usual_time_end)
  on conflict (id) do update set
    nickname = excluded.nickname, region = excluded.region,
    usual_time_start = excluded.usual_time_start, usual_time_end = excluded.usual_time_end,
    updated_at = now()
  returning * into v_p;

  return private.finish_operation(v_uid, p_op_id, jsonb_build_object(
    'ok', true, 'nickname', v_p.nickname, 'region', v_p.region,
    'usual_time_start', v_p.usual_time_start, 'usual_time_end', v_p.usual_time_end));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 募集を公開する（recruit-14、recruit-18）。20261024043000_first_flow.sql の関数に、モードの確かめを足す
-- 中身を作っていないゲームにはモードが無く（recruit-15）、中身のあるゲームは、その選択肢から選ぶ（server-10）
-- ---------------------------------------------------------------------------

create or replace function public.publish_recruitment(
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
  v_game public.games;
  v_id uuid;
begin
  if v_done is not null then
    return v_done;
  end if;
  -- 用意したタグしか受け付けない（server-6）
  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'unknown_game'));
  end if;
  if nullif(p_mode, '') is not null and (v_game.modes is null or not (p_mode = any (v_game.modes))) then
    return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', false, 'reason', 'unknown_mode'));
  end if;

  insert into public.recruitments (
    owner_id, game_id, needs_participant_id, starts_at, capacity, voice_chat, skill, enthusiasm,
    usual_time_start, usual_time_end, mode, platform, platform_other
  ) values (
    v_uid, p_game_id, p_needs_participant_id, p_starts_at, p_capacity, p_voice_chat, p_skill, p_enthusiasm,
    p_usual_time_start, p_usual_time_end, nullif(p_mode, ''), p_platform, p_platform_other
  ) returning id into v_id;

  insert into public.recruitment_meetings (recruitment_id, room_code, invite_url)
    values (v_id, nullif(p_room_code, ''), nullif(p_invite_url, ''));

  return private.finish_operation(v_uid, p_op_id, jsonb_build_object('ok', true, 'recruitment_id', v_id));
end;
$$;

revoke execute on function public.reopen_with_more_capacity from public, anon;
revoke execute on function public.update_profile from public, anon;
grant execute on function public.reopen_with_more_capacity to authenticated;
grant execute on function public.update_profile to authenticated;
