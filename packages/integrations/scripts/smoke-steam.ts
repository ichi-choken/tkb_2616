import { SteamClient, IntegrationError } from '../src/index.ts';
const key = process.env.STEAM_WEB_API_KEY;
const id = process.env.STEAM_TEST_ID;
if (!key || !id) {
  console.error('未実行: STEAM_WEB_API_KEY と同意済みの STEAM_TEST_ID が必要です。');
  process.exitCode = 2;
} else {
  try {
    const result = await new SteamClient(key).ownedGames(id);
    console.log(JSON.stringify({ status: result.status, ...(result.status === 'available' ? { count: result.games.length } : {}) }));
  } catch (err) {
    console.error(err instanceof IntegrationError ? err.message : '検証に失敗しました。設定・応答形式を確認してください。');
    process.exitCode = 1;
  }
}
