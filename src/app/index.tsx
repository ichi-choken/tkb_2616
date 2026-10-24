import { ShumitomoApp } from '../../app/App';
import { ConnectedSettingsScreen } from '../settings/ConnectedSettings';
import { getSupabase } from '../lib/supabase';
import { liveScreens } from '../live/screens';

// Keep the existing demo navigation. Settings uses real Auth / integrations; with a Supabase
// connection, recruiting and joining use the real database too. Without one, the demo stays as it is.
export default function Home() {
  return <ShumitomoApp settingsScreen={ConnectedSettingsScreen} liveScreens={getSupabase() ? liveScreens : undefined} />;
}
