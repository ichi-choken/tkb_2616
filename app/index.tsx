import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

// Startup placeholder. The product screens are owned by 担当①.
export default function Home() {
  return <View style={styles.page}>
    <Text style={styles.title}>Shumitomo</Text>
    <Text>遊びたい気持ちで、つながろう。</Text>
    {(__DEV__ || process.env.EXPO_PUBLIC_ENABLE_AUTH_DIAGNOSTICS === 'true') && <Link href="/dev/auth">開発用の接続確認</Link>}
  </View>;
}
const styles = StyleSheet.create({ page: { flex: 1, padding: 32, gap: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf8ff' }, title: { fontSize: 36, fontWeight: '700', color: '#554282' } });
