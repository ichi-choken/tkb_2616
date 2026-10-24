import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../.env.edge.local', import.meta.url);
try { await readFile(target); console.log('.env.edge.local は既に存在します。上書きしません。'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const template = await readFile(new URL('../supabase/.env.example', import.meta.url), 'utf8');
  const content = template.replace(/^INTEGRATION_TOKEN_KEY=$/m, `INTEGRATION_TOKEN_KEY=${randomBytes(32).toString('base64')}`)
    .replace(/^INTEGRATION_WORKER_KEY=$/m, `INTEGRATION_WORKER_KEY=${randomBytes(32).toString('hex')}`)
    .replace(/^STEAM_LOGIN_CLIENT_SECRET=$/m, `STEAM_LOGIN_CLIENT_SECRET=${randomBytes(32).toString('hex')}`);
  await writeFile(target, content, { flag: 'wx', mode: 0o600 });
  console.log('.env.edge.local を作成しました。外部サービスの設定は空欄です。秘密の値は表示しません。');
}
