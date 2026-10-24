import { Platform } from 'react-native';
import { signIn, signOut } from './index';
import { linkAccount, linkedAccounts, unlinkAccount } from './links';
import { getSupabase } from '../lib/supabase';
import { createSettingsController, type SettingsPort } from './settings-state';

export function createConnectedSettings() {
  try {
    const client = getSupabase();
    if (!client) return createSettingsController(null);
    const port: SettingsPort = {
      watchUser(listener) {
        const { data: { subscription } } = client.auth.onAuthStateChange((_, session) => {
          listener(session?.user && !session.user.is_anonymous ? session.user.id : null);
        });
        return () => subscription.unsubscribe();
      },
      async signIn(provider) {
        const result = await signIn(provider);
        return result.status === 'authenticated' ? 'completed' : Platform.OS === 'web' ? 'redirecting' : 'cancelled';
      },
      signOut, links: linkedAccounts, link: linkAccount, unlink: unlinkAccount,
    };
    return createSettingsController(port);
  } catch {
    return createSettingsController(null, '接続設定を確認してください。ログイン・連携はまだ利用できません。');
  }
}
