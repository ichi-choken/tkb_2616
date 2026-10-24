import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getSupabase } from '../lib/supabase';

import type { LinkStatus } from '../../packages/integrations/src/link-status';

export type LinkProvider = 'steam' | 'discord';
export type { LinkStatus };
const pending = new Map<string, Promise<void>>();
async function request(body: Record<string, unknown>) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase の接続設定が必要です。');
  const { data, error } = await client.functions.invoke('integration-api', { body });
  if (error || data?.error) throw new Error('連携を完了できませんでした。接続設定やログイン状態を確認してください。');
  return data;
}
export async function linkedAccounts(): Promise<LinkStatus[]> { return (await request({ action: 'status' })).links; }
export async function unlinkAccount(provider: LinkProvider) { await request({ action: 'unlink', provider }); }
export function completeAccountLink(callbackUrl: string): Promise<void> {
  const existing = pending.get(callbackUrl);
  if (existing) return existing;
  const url = new URL(callbackUrl);
  const provider: LinkProvider = url.searchParams.has('openid.mode') ? 'steam' : 'discord';
  const result = request({ action: 'complete', provider, callbackUrl }).then(() => {});
  pending.set(callbackUrl, result);
  if (pending.size > 10) pending.delete(pending.keys().next().value!);
  return result;
}
export async function linkAccount(provider: LinkProvider) {
  const data = await request({ action: 'start', provider, client: Platform.OS === 'web' ? 'web' : 'native' });
  if (Platform.OS === 'web') { window.location.assign(data.authorizationUrl); return 'redirecting' as const; }
  const result = await WebBrowser.openAuthSessionAsync(data.authorizationUrl, 'shumitomo://auth/link-callback');
  if (result.type === 'success') {
    const callback = new URL(result.url).searchParams.get('callback');
    if (!callback) throw new Error('連携の戻り先を確認できませんでした。');
    await completeAccountLink(callback);
    return 'completed' as const;
  }
  return 'cancelled' as const;
}
