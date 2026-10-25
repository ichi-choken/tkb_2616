-- API で取る情報（Steam のプレイ時間など）を自動で更新するため、1分ごとに Edge Function integration-sync を起こす
-- （server-101・server-103、ADR-40）。いつ取りに行くかは integration_links.next_attempt_at が持つので、起こすのが遅れても正しさは崩れない。
-- 呼び先と鍵は Vault から読む（scripts/setup-project.mjs が入れる）。ここには書かない。無いあいだは何も呼ばない。
-- マイグレーションにしないのは、手元のテスト（PGlite）に pg_cron と Vault が無く、手元の開発でも要らないため。
-- 入れ方：node scripts/setup-project.mjs <プロジェクトのref>。同じ名前で入れ直すと上書きになる（Supabase Cron）。
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'integration-sync',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/integration-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-integration-worker-key', (select decrypted_secret from vault.decrypted_secrets where name = 'integration_worker_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'integration_worker_key')
  $job$
);
