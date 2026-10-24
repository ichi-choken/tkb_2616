-- 20261024150000_approved_screens.sql で足した4つを確かめる。
-- 増員して再開（recruit-23・24、requests-26）、ニックネームの無い人の名前（requests-3）、
-- プロフィールの保存（profile-1）、ゲームごとの選択肢（server-10、recruit-15）。
-- 流し方：npx supabase test db
begin;
select plan(28);

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

-- 募集する人（a）、ニックネームを決める人（b）、ニックネームの無い人（c）、ほかの人（d）
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'p1@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'p2@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'other@example.test');
-- 中身を作ったゲーム（9001）と、作っていないゲーム（9002）
insert into public.games (id, name, modes, needs_participant_id_default) values
  (9001, '中身のあるゲーム', '{"ランクマッチ","カジュアル"}', true),
  (9002, '中身の無いゲーム', null, null);

-- プロフィールの保存（profile-1） -------------------------------------------------

select pg_temp.as_user(null);
select throws_ok(
  $$ select public.update_profile(gen_random_uuid(), 'なまえ') $$,
  '42501', null, 'ログインしていない人はプロフィールを保存できない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is(
  public.update_profile(gen_random_uuid(), ' ビー ', '関東', '21:00', '23:00')->>'nickname',
  'ビー', '本人はニックネーム・地方・いつも遊ぶ時間帯を保存できる（前後の空白は除く）');
select is(
  public.update_profile(gen_random_uuid(), 'ビー', '関東', '21:00', null)->>'reason',
  'usual_time_incomplete', 'いつも遊ぶ時間帯は、始まりと終わりの両方が要る');
select is(
  public.update_profile(gen_random_uuid(), E'ビ\nー')->>'reason',
  'nickname_invalid', 'ニックネームに改行は入れられない');
select throws_ok(
  $$ update public.profiles set nickname = 'のっとり' where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'プロフィールの表には直接書けない');

select pg_temp.as_user(null);
select is((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'ビー',
  '保存したニックネームは、ログインしていない人にも見える（profile-1、profile-10）');
select is((select region::text from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), '関東',
  '住んでいる地方も見える（ADR-72）');

-- ゲームごとの選択肢（server-10、recruit-15） -------------------------------------

select is((select needs_participant_id_default from public.games where id = 9001), true,
  '中身のあるゲームは、参加する人のIDが要るかの初期値を持つ（server-10）');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is(
  public.publish_recruitment(gen_random_uuid(), 9001, true, p_mode => '存在しない')->>'reason',
  'unknown_mode', '中身のあるゲームでは、選択肢に無いモードを受け付けない（server-10）');
select is(
  public.publish_recruitment(gen_random_uuid(), 9002, false, p_mode => 'ランクマッチ')->>'reason',
  'unknown_mode', '中身の無いゲームにはモードが無い（recruit-15）');
select is(
  public.publish_recruitment(gen_random_uuid(), 9002, false, p_mode => '')->>'ok',
  'true', '中身の無いゲームでも、モードを入れなければ募集を出せる');

-- 募集を出す。人数1、開始は先、IDが要る
create temp table r1 as
  select (public.publish_recruitment(gen_random_uuid(), 9001, true,
    p_starts_at => now() + interval '1 day', p_capacity => 1, p_mode => 'ランクマッチ')->>'recruitment_id')::uuid as id;
grant select on r1 to anon, authenticated;
select isnt((select id from r1), null, '選択肢にあるモードなら、募集を出せる');

-- ニックネームの無い人の名前（requests-3） ------------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is(public.apply_to_recruitment(gen_random_uuid(), (select id from r1), 'BID01')->>'state', '待っている',
  'ニックネームのある b が参加希望を送る');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select is(public.apply_to_recruitment(gen_random_uuid(), (select id from r1), 'CID01')->>'state', '待っている',
  'ニックネームの無い c が参加希望を送る');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select array_agg(game_account_id order by game_account_id) from public.application_game_ids), array['CID01'],
  '成立する前は、ニックネームの無い人のゲーム内IDだけが見える（requests-3）');
select is(
  public.approve_application(gen_random_uuid(),
    (select id from public.applications where applicant_id = '00000000-0000-0000-0000-00000000000b'))->>'state',
  '成立', 'b を承認する');
select is((select count(*)::int from public.application_game_ids), 1,
  '成立した b の分が見え、満員で終わった c の分は見えない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.application_game_ids), 0, 'ほかの人には、だれのゲーム内IDも見えない');

-- 増員して受付を再開（recruit-23、recruit-24） --------------------------------------

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select public.status(r)::text from public.recruitments r where r.id = (select id from r1)), '満員で終了',
  '人数1で1人成立すると、満員で終了');
select is(public.reopen_with_more_capacity(gen_random_uuid(), (select id from r1), 1)->>'reason', 'not_reopenable',
  '人数を増やさなければ再開できない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is(public.reopen_with_more_capacity(gen_random_uuid(), (select id from r1), 2)->>'reason', 'not_owner',
  '募集する人でなければ再開できない');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is(public.reopen_with_more_capacity(gen_random_uuid(), (select id from r1), 2)->>'status', '出ている',
  '開始前に人数を増やすと、出ている状態に戻る');

-- 開始時刻を過ぎた後の再開は「追加受付中」（requests-26）。時刻を過去に動かして確かめる
reset role;
update public.recruitments set starts_at = now() - interval '1 minute', capacity = 1 where id = (select id from r1);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select public.status(r)::text from public.recruitments r where r.id = (select id from r1)), '締め切りで終了',
  '開始時刻を過ぎると、締め切りで終了');
select is(public.reopen_with_more_capacity(gen_random_uuid(), (select id from r1), 2)->>'status', '追加受付中',
  '開始後に人数を増やすと、追加受付中になる');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select is(public.apply_to_recruitment(gen_random_uuid(), (select id from r1), 'DID01')->>'state', '待っている',
  '追加受付中の募集には、開始後でも参加希望を送れる（requests-26）');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is(
  public.approve_application(gen_random_uuid(),
    (select id from public.applications where applicant_id = '00000000-0000-0000-0000-00000000000d'))->>'status',
  '満員で終了', '追加受付中でも、枠が埋まれば満員で終了');

select is(public.change_recruitment(gen_random_uuid(), (select id from r1), 'cancel')->>'status', '開催中止', '開催を中止する');
select is(public.reopen_with_more_capacity(gen_random_uuid(), (select id from r1), 5)->>'reason', 'not_reopenable',
  '開催中止の後は再開できない');

select * from finish();
rollback;
