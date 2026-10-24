import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { createAuthFlow } from './flow';
import { getSupabase } from '../lib/supabase';
import { unregisterPush } from '../notifications/push';
import { externalBrowserMessage, needsExternalBrowser } from './browser-environment';

let flow: ReturnType<typeof createAuthFlow> | null = null;
export function authRedirectUri(): string {
  return Platform.OS === 'web'
    ? new URL('/auth/callback', window.location.origin).href
    : makeRedirectUri({ scheme: 'shumitomo', path: 'auth/callback' });
}
export function getAuthFlow() {
  if (flow) return flow;
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase の接続設定が必要です。');
  flow = createAuthFlow(supabase.auth, authRedirectUri(), async (url, returnTo) => {
    if (Platform.OS === 'web') { window.location.assign(url); return null; }
    const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
    return result.type === 'success' ? result.url : null;
  });
  return flow;
}
export function authErrorMessage(error: unknown): string {
  return error instanceof Error && ['Supabase の接続設定が必要です。', externalBrowserMessage].includes(error.message)
    ? error.message : 'ログインを完了できませんでした。もう一度お試しください。';
}
export async function signIn(provider: 'google' | 'discord') {
  if (provider === 'google' && Platform.OS === 'web' && needsExternalBrowser(navigator.userAgent)) throw new Error(externalBrowserMessage);
  return getAuthFlow().signIn(provider);
}
export async function signOut() {
  // Remove this session's device before invalidating the credential used to unregister it.
  await unregisterPush();
  await getAuthFlow().signOut();
}
