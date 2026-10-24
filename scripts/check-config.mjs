import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;
const failures = [];
const validate = (name, predicate = value => !!value) => {
  if (!predicate(process.env[name] ?? '')) failures.push(name);
};
validate('EXPO_PUBLIC_SUPABASE_URL', value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } });
validate('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', value => value.startsWith('sb_publishable_'));
for (const name of ['APP_ALLOWED_ORIGINS', 'STEAM_WEB_API_KEY', 'DISCORD_LINK_CLIENT_ID', 'DISCORD_LINK_CLIENT_SECRET', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET']) validate(name);
validate('INTEGRATION_CALLBACK_URL', value => { try { const url = new URL(value); return url.protocol === 'https:' && url.pathname === '/auth/link-callback' && !url.search && !url.hash; } catch { return false; } });
validate('INTEGRATION_TOKEN_KEY', value => /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').length === 32);
validate('INTEGRATION_WORKER_KEY', value => value.length >= 32);
validate('STEAM_LOGIN_CLIENT_ID');
validate('STEAM_LOGIN_CLIENT_SECRET', value => value.length >= 32);
for (const provider of process.env.DISCORD_SYNC_INTERVAL_MS ? ['DISCORD'] : []) {
  for (const kind of ['INTERVAL', 'RETRY', 'STALE']) validate(`${provider}_SYNC_${kind}_MS`, value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= (kind === 'STALE' ? 0 : 1));
}
if (!config.owner) failures.push('app.json: expo.owner');
if (!config.extra?.eas?.projectId) failures.push('app.json: expo.extra.eas.projectId');
if (!config.ios?.bundleIdentifier) failures.push('app.json: expo.ios.bundleIdentifier');
if (!config.android?.package) failures.push('app.json: expo.android.package');
if (process.env.EXPO_PUBLIC_ENABLE_PUSH === 'true' && process.env.NOTIFICATION_TRANSPORT !== 'expo') failures.push('NOTIFICATION_TRANSPORT (client/server mismatch)');
console.log('公開前の設定確認（値は表示しません）');
for (const name of failures) console.log(`未設定・要確認: ${name}`);
console.log('OAuth提供元の設定・招待権限・本番での実動作は、このスクリプトでは確認できません。');
console.log(failures.length ? `${failures.length} 件の設定が必要です。` : 'ローカル設定の形式確認は完了しました。');
process.exitCode = failures.length ? 1 : 0;
