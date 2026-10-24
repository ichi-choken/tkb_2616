-- 最初の動線の表と関数を、ログインしていない人・募集する人・参加する人・ほかの人の立場で確かめる。
-- 流し方：npx supabase test db
begin;
select plan(47);

-- 立場を切り替える。null ならログインしていない人
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  if p is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  end if;
end $$;

-- 募集する人（a）、参加する人（b・c）、ほかの人（d）
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'p1@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'p2@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'other@example.test');
insert into public.games (id, name) values (1, 'テスト用のゲーム');

select is((select count(*)::int from public.profiles), 4, 'ログインした人には利用者ができる');

-- 募集を出す ------------------------------------------------------------------

select pg_temp.as_user(null);
select throws_ok(
  $$ select public.publish_recruitment(gen_random_uuid(), 1, true) $$,
  '42501', null, 'ログインしていない人は募集を出せない（recruit-25）');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is(
  public.publish_recruitment('10000000-0000-0000-0000-000000000001', 1, true, p_capacity => 1, p_room_code => 'ROOM1')->>'ok',
  'true', '募集する人は募集を出せる');
create temp table r1 as
  select (public.publish_recruitment('10000000-0000-0000-0000-000000000001', 1, true)->>'recruitment_id')::uuid as id;
grant select on r1 to anon, authenticated;
select is((select count(*)::int from public.recruitments), 1, '同じ公開操作の再送では、同じ募集を返して重ねない（recruit-18）');
select is(
  public.publish_recruitment(gen_random_uuid(), 999, false)->>'reason',
  'unknown_game', '用意していないゲームでは募集を出せない（server-6）');
select throws_ok(
  $$ insert into public.recruitments (owner_id, game_id, needs_participant_id)
     values ('00000000-0000-0000-0000-00000000000a', 1, false) $$,
  '42501', null, '画面は表に直接書けない（ADR-63）');

-- 見える人 --------------------------------------------------------------------

select pg_temp.as_user(null);
select is((select public.status(r) from public.recruitments r where r.id = (select id from r1)), '出ている',
  'ログインしていない人も募集を見られる（list-1）');
select is((select count(*)::int from public.recruitment_meetings), 0, 'ログインしていない人には入る場所が見えない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select room_code from public.recruitment_meetings), 'ROOM1', '募集する人には入る場所が見える');

-- 参加したい ------------------------------------------------------------------

select is(
  public.apply_to_recruitment(gen_random_uuid(), (select id from r1), 'OWNER1')->>'reason',
  'own_recruitment', '自分の募集には参加希望を送れない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is(
  public.apply_to_recruitment(gen_random_uuid(), (select id from r1))->>'reason',
  'game_account_id_required', 'IDが要る募集では、ゲーム内IDが要る（list-14）');
select is(
  public.apply_to_recruitment(gen_random_uuid(), (select id from r1), 'abc-123')->>'reason',
  'game_account_id_invalid', 'ゲーム内IDは英数字だけ（app-23）');
select is(
  public.apply_to_recruitment(gen_random_uuid(), (select id from r1), 'PLAYER1', p_skill => 5::smallint)->>'state',
  '待っている', '参加する人は参加希望を送れる');
select is(
  public.apply_to_recruitment(gen_random_uuid(), (select id from r1), 'PLAYER1')->>'already',
  'true', '同じ募集への参加希望は1件。送った後は今の結果を返す');
select is((select count(*)::int from public.applications), 1, '参加希望は重ならない');
select is((select count(*)::int from public.recruitment_meetings), 0, '承認を待っている人には入る場所が見えない');
select is((select game_account_id from public.application_game_ids), 'PLAYER1', '自分のゲーム内IDは見える');

create temp table b_app as select id from public.applications;
grant select on b_app to anon, authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select is(
  public.apply_to_recruitment(gen_random_uuid(), (select id from r1), 'PLAYER2')->>'ok',
  'true', '2人目も参加希望を送れる');
select is((select count(*)::int from public.applications), 1, 'ほかの人の参加希望は見えない');
create temp table c_app as select id from public.applications;
grant select on c_app to anon, authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.applications), 2, '募集する人には、届いた参加希望が見える');
select is((select count(*)::int from public.application_game_ids), 0, '承認する前は、参加者のゲーム内IDは見えない');
select is(
  (select count(*)::int from public.notifications where kind = '参加希望が届いた'),
  2, '参加希望が届くと、募集する人に知らせが届く（app-17）');

-- 承認 ------------------------------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select is(
  public.approve_application(gen_random_uuid(), (select id from b_app))->>'reason',
  'not_owner', '募集する人でなければ承認できない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is(
  public.approve_application('20000000-0000-0000-0000-000000000001', (select id from b_app))->>'status',
  '満員で終了', '承認すると成立し、枠が埋まると満員で終了になる（requests-4）');
select is(
  public.approve_application('20000000-0000-0000-0000-000000000001', (select id from b_app))->>'status',
  '満員で終了', '同じ承認の再送には、最初の結果を返す');
select is(
  public.approve_application(gen_random_uuid(), (select id from c_app))->>'reason',
  'not_accepting', '満員の募集では、新しく成立しない（requests-4）');
select is((select public.matched_count(r) from public.recruitments r where r.id = (select id from r1)), 1,
  '成立人数は募集人数を超えない');
select is((select game_account_id from public.application_game_ids), 'PLAYER1',
  '成立した相手のゲーム内IDだけが、募集する人に見える');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select public.state(a) from public.applications a), '成立', '承認された人は成立になる');
select is((select room_code from public.recruitment_meetings), 'ROOM1', '成立した相手には入る場所が見える（matched-1）');
select is((select count(*)::int from public.notifications where kind = '承認された'), 1,
  '承認されると、参加する人に知らせが届く（app-17）');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select is((select public.state(a) from public.applications a), '終了', '枠が埋まると、承認待ちの参加希望は終わる');
select is((select count(*)::int from public.recruitment_meetings), 0, '成立していない人には入る場所が見えない');

-- 合流の情報の変更と、遊び終え --------------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is(
  public.update_meeting(gen_random_uuid(), (select id from r1), 'ROOM2')->>'reason',
  'not_owner', '入る場所を変えられるのは募集する人だけ');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is(
  public.update_meeting(gen_random_uuid(), (select id from r1), 'ROOM2', 'https://example.test/i')->>'room_code',
  'ROOM2', '満員の後も、入る場所と招待URLを変えられる（requests-25）');
select is((select public.status(r) from public.recruitments r where r.id = (select id from r1)), '満員で終了',
  '入る場所を変えても、受付の状態は変わらない');
select is(
  public.change_recruitment(gen_random_uuid(), (select id from r1), 'end_play')->>'status',
  '遊び終了', '募集する人は遊びを終えられる（requests-22）');
select is((select count(*)::int from public.recruitment_meetings), 0, '遊び終了の後は、募集する人にも入る場所を渡さない');
select is((select count(*)::int from public.application_game_ids), 0, '遊び終了の後は、ゲーム内IDを渡さない');
select is(
  public.update_meeting(gen_random_uuid(), (select id from r1), 'ROOM3')->>'reason',
  'not_accepting', '遊び終了の後は、入る場所を変えられない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select public.state(a) from public.applications a), '遊び終了', '成立した人も遊び終了になる');
select is((select count(*)::int from public.recruitment_meetings), 0, '遊び終了の後は、参加した人にも入る場所を渡さない');

-- 締め切り・受付終了・開催中止 --------------------------------------------------

reset role;
insert into public.recruitments (id, owner_id, game_id, needs_participant_id, starts_at)
  values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 1, false, now() - interval '1 minute');
insert into public.recruitment_meetings (recruitment_id) values ('30000000-0000-0000-0000-000000000001');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is(
  public.apply_to_recruitment(gen_random_uuid(), '30000000-0000-0000-0000-000000000001')->>'status',
  '締め切りで終了', '開始時刻を過ぎた募集には、参加希望を送れない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
create temp table r3 as
  select (public.publish_recruitment(gen_random_uuid(), 1, false, p_room_code => 'ROOMX')->>'recruitment_id')::uuid as id;
grant select on r3 to anon, authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.apply_to_recruitment(gen_random_uuid(), (select id from r3));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.apply_to_recruitment(gen_random_uuid(), (select id from r3));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.approve_application(gen_random_uuid(),
  (select a.id from public.applications a where a.recruitment_id = (select id from r3) and a.applicant_id = '00000000-0000-0000-0000-00000000000b'));
select is(
  public.change_recruitment(gen_random_uuid(), (select id from r3), 'close')->>'status',
  '手動で終了', '募集する人は受付を終えられる（requests-10）');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select is((select public.state(a) from public.applications a where a.recruitment_id = (select id from r3)), '終了',
  '受付を終えると、承認待ちの参加希望は終わる');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.change_recruitment(gen_random_uuid(), (select id from r3), 'cancel');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select public.state(a) from public.applications a where a.recruitment_id = (select id from r3)), '開催中止',
  '開催中止の後、成立した人は開催中止になる');
select is((select count(*)::int from public.recruitment_meetings where recruitment_id = (select id from r3)), 0,
  '開催中止の後は、入る場所を渡さない（ended-5、matched-14）');

select * from finish();
rollback;
