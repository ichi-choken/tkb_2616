-- 既存の表・行・適用済みマイグレーションを保持したまま、レビューで確認した3件を直す。
-- 関数の引数・戻り値・実行権限は変えない。CREATE OR REPLACE は既存の権限を保つ。
-- CLI で生成した時刻が既存の 20261024200000 より前だったため、追加分をその後に並べる。

create or replace function public.approve_application(p_op_id uuid, p_application_id uuid)
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

  -- 公開一覧には参加希望の行を渡さない。公開募集の更新を同じ操作で届け、人数と状態を読み直せるようにする。
  -- 人数・状態を二重保存せず、既存の matched_count/status で読む約束を保つ。
  update public.recruitments set updated_at = now() where id = v_r.id;

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


create or replace function public.update_meeting(
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
  -- 保存済み応答にも部屋番号・招待URLがある。再送でも現在の所有者・終了状態を先に確かめる。
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

  if v_done is not null then
    return v_done;
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


-- 締切は時刻から決まるため、ended_at が空でも承認待ちとは限らない。
-- 本人の従来の閲覧範囲は保ち、募集する人には実際に待っている人・成立した人の分だけを渡す。
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
          and public.state(a) in ('待っている', '成立')
        )
      )
  )
$$;
