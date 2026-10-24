-- 参加者のゲーム内IDを、募集する人に承認の前から渡す（server-28、requests-2、ADR-90）。
-- 規約違反のIDなどに、承認する前に気づけるようにするため。
-- コメントの ID は、仕様のリポジトリ Umi-s-Atelie/hobby-platform の spec/ と docs/決定/ を指す。

-- 本人と、募集する人。募集する人には、成立した人の分と、承認待ちの人の分
-- 開催中止と遊び終了の後は、双方に渡さない（matched-14、matched-21、requests-17、requests-24）
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
          and (a.matched_at is not null or a.ended_at is null)
        )
      )
  )
$$;
