import { getSupabase } from './supabase';
import type { SteamTrust } from '../../packages/integrations/src/trust';

export type UserSteamTrust = SteamTrust & { userId: string };
// Trust indicators for recruitment owners or applicants (list-9, requests-1). Pass the game shown
// to learn whether they own it and their playtime. Users without a Steam link are not in the result.
export async function steamTrustOf(userIds: string[], gameIds: number[] = []): Promise<UserSteamTrust[]> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase の接続設定が必要です。');
  const { data, error } = await client.functions.invoke('steam-trust', { body: { userIds, gameIds } });
  if (error) throw new Error('Steamの情報を読み込めませんでした。');
  return data.users;
}
