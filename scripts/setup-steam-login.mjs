// Steam でログイン（custom:steam）を、Supabase のプロジェクトに作る・直す。
// 管理画面が OAuth2 でも Issuer URL を求めて作れないので、公式の管理用 API（auth.admin.customProviders）で作る。
// 使い方：node scripts/setup-steam-login.mjs <プロジェクトのref>
// Client Secret は .env.edge.local の STEAM_LOGIN_CLIENT_SECRET（Edge Functions に置いたものと同じ値）。
// 秘密の鍵は、この PC の Supabase CLI のログインで取る。どちらの値も表示しない。
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ref = process.argv[2];
if (!/^[a-z0-9]{20}$/.test(ref ?? '')) {
  console.error('使い方：node scripts/setup-steam-login.mjs <プロジェクトのref>');
  process.exit(1);
}
const env = readFileSync(new URL('../.env.edge.local', import.meta.url), 'utf8');
const value = name => (env.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '').trim();
const clientId = value('STEAM_LOGIN_CLIENT_ID');
const clientSecret = value('STEAM_LOGIN_CLIENT_SECRET');
if (!clientId || !clientSecret) {
  console.error('.env.edge.local の STEAM_LOGIN_CLIENT_ID と STEAM_LOGIN_CLIENT_SECRET を入れてください（npm run setup:secrets）');
  process.exit(1);
}
// Without --reveal the CLI masks secret keys. ref is checked above, so the command line is safe to join.
const keys = execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const secretKey = keys.match(/"(sb_secret_[^"]+)"/)?.[1];
if (!secretKey) {
  console.error('秘密の鍵を取れませんでした。npx supabase login を確かめてください');
  process.exit(1);
}

const base = `https://${ref}.supabase.co/functions/v1/steam-auth`;
const provider = {
  name: 'Steam',
  client_id: clientId,
  client_secret: clientSecret,
  authorization_url: `${base}/authorize`,
  token_url: `${base}/token`,
  userinfo_url: `${base}/userinfo`,
  // userinfo returns only the verified SteamID; Steam gives no email (documentation/auth-integrations.md)
  scopes: [],
  pkce_enabled: true,
  email_optional: true,
  enabled: true,
};
const admin = createClient(`https://${ref}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin.customProviders;
const existing = await admin.getProvider('custom:steam');
const { data, error } = existing.data
  ? await admin.updateProvider('custom:steam', provider)
  : await admin.createProvider({ provider_type: 'oauth2', identifier: 'custom:steam', ...provider });
if (error) {
  console.error(`作れませんでした：${error.message}`);
  process.exit(1);
}
console.log(`${existing.data ? '直しました' : '作りました'}：${data.identifier}（${data.enabled ? '有効' : '無効'}）`);
console.log(`Authorization URL：${data.authorization_url}`);
