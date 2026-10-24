import { ShumitomoApp } from '../../app/App';
import { ConnectedSettingsScreen } from '../settings/ConnectedSettings';

// Keep the existing demo navigation; only settings uses real Auth / integrations.
export default function Home() {
  return <ShumitomoApp settingsScreen={ConnectedSettingsScreen} />;
}
