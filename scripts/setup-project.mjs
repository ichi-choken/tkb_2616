// Supabase のプロジェクト1つ（開発用・デモ用。ADR-81）に、バックエンドの設定をまとめて入れる。何度流してもよい。
//   1. Edge Functions を置く
//   2. Edge Functions の秘密の値を置く（.env.edge.local の、値の入った行）
//   3. Cron が使う呼び先と鍵を Vault に入れる
//   4. Steam の自動更新の Cron を入れる（supabase/cron/integration-sync.sql）
//   5. Steam でログイン（custom:steam）を作る・直す（scripts/setup-steam-login.mjs）
//   6. DB の変更（マイグレーション）が当たっているかを確かめる。当てるのは --with-db のときだけ
// 使い方：node scripts/setup-project.mjs <プロジェクトのref> [--app-url <公開先のURL>] [--with-db]
//   --app-url を付けると、関数を呼んでよい画面と連携の戻り先を、その URL にする。無ければ .env.edge.local の値（手元の localhost）
// 秘密の値は一時フォルダに書き、終わったら消す。画面には出さない。
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const ref = args[0];
const option = name => { const i = args.indexOf(name); return i > 0 ? args[i + 1] : null; };
const appUrl = option('--app-url');
const withDb = args.includes('--with-db');
if (!/^[a-z0-9]{20}$/.test(ref ?? '') || (appUrl !== null && !/^https:\/\/[^/\s]+\/?$|^http:\/\/localhost(:\d+)?\/?$/.test(appUrl))) {
  console.error('使い方：node scripts/setup-project.mjs <プロジェクトのref> [--app-url https://公開先] [--with-db]');
  process.exit(1);
}

const root = new URL('..', import.meta.url);
const env = readFileSync(new URL('.env.edge.local', root), 'utf8');
const lines = env.split(/\r?\n/).filter(l => /^[A-Z_]+=.+/.test(l));
const value = name => lines.find(l => l.startsWith(`${name}=`))?.slice(name.length + 1).trim() ?? '';
if (!value('INTEGRATION_WORKER_KEY') || !value('STEAM_LOGIN_CLIENT_SECRET')) {
  console.error('.env.edge.local がありません。先に npm run setup:secrets で作り、外部サービスの鍵を書いてください');
  process.exit(1);
}
if (!value('TWITCH_CLIENT_ID') || !value('TWITCH_CLIENT_SECRET')) console.warn('注意：TWITCH_CLIENT_ID・TWITCH_CLIENT_SECRET が空です。ゲームを探せません');
const secrets = appUrl
  ? [...lines.filter(l => !/^(APP_ALLOWED_ORIGINS|INTEGRATION_CALLBACK_URL)=/.test(l)),
    `APP_ALLOWED_ORIGINS=${new URL(appUrl).origin}`, `INTEGRATION_CALLBACK_URL=${new URL('/auth/link-callback', appUrl).href}`]
  : lines;

const run = command => execSync(command, { cwd: root, stdio: 'inherit' });
// For steps that carry secrets: never echo the CLI's output, which may repeat the SQL
const quiet = (command, what) => {
  try { return execSync(command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { console.error(`${what}に失敗しました（秘密の値を含むので、詳しい出力は出しません）`); process.exit(1); }
};
const sql = text => `'${text.replace(/'/g, "''")}'`;
const vaultUpsert = (name, secret, description) => `
  select id into v_id from vault.secrets where name = ${sql(name)};
  if v_id is null then perform vault.create_secret(${sql(secret)}, ${sql(name)}, ${sql(description)});
  else perform vault.update_secret(v_id, ${sql(secret)}); end if;`;

const dir = mkdtempSync(join(tmpdir(), 'shumitomo-setup-'));
try {
  console.log(`\n1/6 Edge Functions を置く（${ref}）`);
  run(`npx supabase functions deploy --project-ref ${ref} --use-api`);

  console.log('\n2/6 Edge Functions の秘密の値を置く');
  writeFileSync(join(dir, 'secrets.env'), secrets.join('\n'), { mode: 0o600 });
  quiet(`npx supabase secrets set --env-file "${join(dir, 'secrets.env')}" --project-ref ${ref}`, '秘密の値を置くの');
  console.log(`  置いた：${secrets.map(l => l.split('=')[0]).join(', ')}`);

  console.log('\n3/6 Cron が使う呼び先と鍵を Vault に入れる');
  writeFileSync(join(dir, 'vault.sql'), `do $$ declare v_id uuid; begin
${vaultUpsert('project_url', `https://${ref}.supabase.co`, 'integration-sync の呼び先（scripts/setup-project.mjs）')}
${vaultUpsert('integration_worker_key', value('INTEGRATION_WORKER_KEY'), 'integration-sync の鍵（scripts/setup-project.mjs）')}
end $$;`, { mode: 0o600 });
  quiet(`npx supabase db query --linked --project-ref ${ref} -f "${join(dir, 'vault.sql')}"`, 'Vault に入れるの');
  console.log('  入れた：project_url, integration_worker_key');

  console.log('\n4/6 Steam の自動更新の Cron を入れる（1分ごと）');
  quiet(`npx supabase db query --linked --project-ref ${ref} -f supabase/cron/integration-sync.sql`, 'Cron を入れるの');
  console.log('  入れた：integration-sync');

  console.log('\n5/6 Steam でログインを作る・直す');
  run(`node scripts/setup-steam-login.mjs ${ref}`);

  console.log('\n6/6 DB の変更（マイグレーション）');
  if (withDb) run(`npx supabase db push --project-ref ${ref} --yes`);
  const listed = execSync(`npx supabase migration list --project-ref ${ref}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const missing = JSON.parse(listed.slice(listed.indexOf('{'))).migrations.filter(m => !m.remote).map(m => m.local);
  console.log(missing.length
    ? `  当たっていないもの：${missing.join(', ')}。開発用で確かめてから当てる（ADR-81）：npx supabase db push --project-ref ${ref}`
    : '  全部当たっている');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`
管理画面で残っていること（${ref}）
- 戻り先の許可：https://supabase.com/dashboard/project/${ref}/auth/url-configuration の Redirect URLs に ${new URL('/auth/callback', appUrl ?? 'http://localhost:8081').href}
- Discord・Google でログイン：仕様のリポジトリの docs/開発/外部サービスの用意.md の「2. Discord でログイン」「2. Google でログイン」
- 画面の .env：EXPO_PUBLIC_SUPABASE_URL=https://${ref}.supabase.co と、このプロジェクトの公開用の鍵`);
