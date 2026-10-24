import { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { getSupabase } from '../../src/lib/supabase';
import { loginProviders } from '../../src/auth/flow';
import { lastUpdatedLabel, linkStatusLabels } from '../../packages/integrations/src/link-status';
import { signIn, authErrorMessage, signOut } from '../../src/auth';
import { registerPush } from '../../src/notifications/push';
import { linkAccount, linkedAccounts, unlinkAccount, type LinkStatus } from '../../src/auth/links';

export default function AuthDiagnostics() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [links, setLinks] = useState<LinkStatus[]>([]);
  useEffect(() => {
    const client = getSupabase();
    setReady(!!client);
    if (!client) return;
    let active = true;
    client.auth.getUser().then(({ data }) => { if (active) setUserId(data.user?.is_anonymous ? null : data.user?.id ?? null); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_, session) => setUserId(session?.user.is_anonymous ? null : session?.user.id ?? null));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  if (!__DEV__ && process.env.EXPO_PUBLIC_ENABLE_AUTH_DIAGNOSTICS !== 'true') return <Redirect href="/" />;
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(authErrorMessage(error)); }
    finally { setBusy(false); }
  }
  return <View style={{ padding: 24, gap: 20 }}>
    <Text style={{ fontSize: 22, fontWeight: '600' }}>開発用・認証の接続確認</Text>
    <Text>{ready ? (userId ? 'ログイン済み' : '未ログイン') : '.env に Supabase の URL と公開用キーを設定してください。'}</Text>
    {userId && <Text selectable>利用者ID：{userId}</Text>}
    {loginProviders.map(provider => <Button key={provider} title={`${{ discord: 'Discord', google: 'Google', steam: 'Steam', apple: 'Apple' }[provider]}でログイン`} disabled={!ready || busy || !!userId} onPress={() => run(() => signIn(provider))} />)}
    <Button title="ログアウト" disabled={!userId || busy} onPress={() => run(signOut)} />
    <Button title="Steamと連携" disabled={!userId || busy} onPress={() => run(() => linkAccount('steam'))} />
    <Button title="Discordの情報を連携" disabled={!userId || busy} onPress={() => run(() => linkAccount('discord'))} />
    <Button title="連携状態を確認" disabled={!userId || busy} onPress={() => run(async () => setLinks(await linkedAccounts()))} />
    <Button title="通知を有効にする（確認用）" disabled={!userId || busy} onPress={() => run(async () => setMessage(`通知の設定：${await registerPush()}`))} />
    {links.map(link => <View key={link.provider} style={{ gap: 8 }}>
      <Text>{link.provider}：{linkStatusLabels[link.status] ?? '確認中'}</Text>
      <Text selectable>連携先ID：{link.externalId}</Text>
      <Text>最終更新：{lastUpdatedLabel(link.lastSuccessAt)}{link.lastSuccessAt ? `（${new Date(link.lastSuccessAt).toLocaleString()}）` : ''}</Text>
      <Button title={`${link.provider}の連携を解除`} disabled={busy} onPress={() => run(async () => { await unlinkAccount(link.provider); setLinks(await linkedAccounts()); })} />
    </View>)}
    {!!message && <Text accessibilityRole="alert">{message}</Text>}
  </View>;
}
