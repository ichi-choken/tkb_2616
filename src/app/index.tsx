import { ShumitomoApp, type LiveScreens } from '../../app/App';
import { AppBar, Card, Empty, Note, Stack } from '../../app/src/ui';
import { useStore } from '../../app/src/store';
import { ConnectedSettingsScreen } from '../settings/ConnectedSettings';
import { getSupabase } from '../lib/supabase';
import { liveScreens } from '../live/screens';
import { SteamPreview } from '../local/SteamPreview';
import { useLocalIntegrations } from '../local/useLocalIntegrations';

function MissingConnection() {
  const { go } = useStore();
  return <Card><Empty title="募集DBの接続設定が必要です" text="接続先を設定すると、実際の募集・参加希望・承認を使えます。" button={{ label: '設定を開く', onPress: () => go('settings') }} /></Card>;
}
const missingScreens: LiveScreens = Object.fromEntries(Object.keys(liveScreens).map(name => [name, MissingConnection]));

function LocalSettings() {
  let configured = false;
  try { configured = !!getSupabase(); } catch { /* The connection notice stays visible. */ }
  return <Stack><AppBar title="設定" /><SteamPreview />{configured ? <ConnectedSettingsScreen steamOnly /> : <Card pad><Note>募集・参加・承認には、チーム用DBの接続設定が必要です。</Note></Card>}</Stack>;
}

export default function Home() {
  const local = useLocalIntegrations();
  let configured = false;
  try { configured = !!getSupabase(); } catch { /* Settings displays the configuration error. */ }
  return <ShumitomoApp
    settingsScreen={local ? LocalSettings : ConnectedSettingsScreen}
    liveScreens={configured ? liveScreens : missingScreens}
    modeLabel={configured ? 'DB接続版' : local ? 'ローカル実接続' : '接続未設定'}
    profileSupplement={<Stack><Note>プロフィールの編集内容はこの端末に保存します。フレンドはデモデータです。</Note>{local ? <SteamPreview /> : null}</Stack>}
  />;
}
