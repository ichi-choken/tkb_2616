import { ShumitomoApp } from '../../app/App';
import { SettingsScreen } from '../../app/src/screens/Settings';
import { ConnectedSettingsScreen } from '../settings/ConnectedSettings';
import { getSupabase } from '../lib/supabase';
import { liveScreens } from '../live/screens';
import { SteamPreview } from '../local/SteamPreview';
import { useLocalIntegrations } from '../local/useLocalIntegrations';

function LocalSettings() {
  return <SettingsScreen accountPanel={<SteamPreview />} steamOnly />;
}
function SteamOnlyConnectedSettings() {
  return <ConnectedSettingsScreen steamOnly />;
}

export default function Home() {
  const local = useLocalIntegrations();
  let configured = false;
  let invalid = false;
  try { configured = !!getSupabase(); } catch { invalid = true; }
  // Only implemented DB screens replace their demo counterparts. A failed DB request
  // remains an error on the real screen; it must never look like a successful demo write.
  return <ShumitomoApp
    settingsScreen={configured ? (local ? SteamOnlyConnectedSettings : ConnectedSettingsScreen) : invalid ? ConnectedSettingsScreen : local ? LocalSettings : SettingsScreen}
    liveScreens={configured ? liveScreens : undefined}
    modeLabel={configured ? 'DB接続版' : local ? 'Steam実接続・ほかはデモ' : undefined}
  />;
}
