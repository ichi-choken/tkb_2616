import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  // Auth is client-side. SSR must never share one user's session with another request.
  if (Platform.OS === 'web' && typeof window === 'undefined') return null;
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!key.startsWith('sb_publishable_')) throw new Error('Supabase の公開用キーを設定してください。');
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('Supabase の接続先を確認してください。');
  client = createClient(url, key, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      ...(Platform.OS === 'web' ? {} : { lock: processLock }),
    },
  });
  return client;
}

export function watchAuthRefresh(): () => void {
  let supabase: SupabaseClient | null;
  try { supabase = getSupabase(); } catch {
    // Keep the app open so settings can explain an invalid connection config.
    return () => {};
  }
  if (!supabase || Platform.OS === 'web') return () => {};
  const update = (state: string) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };
  update(AppState.currentState ?? 'active');
  const subscription = AppState.addEventListener('change', update);
  return () => { subscription.remove(); supabase.auth.stopAutoRefresh(); };
}
