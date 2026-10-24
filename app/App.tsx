// Shumitomo のフロント（デモ）。Expo（React Native）と TypeScript で、スマホのアプリとウェブを1つのコードで作る
import { useRef, useEffect } from 'react';
import { Platform, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
// 和文フォントは1つで約2MBあるので、使う太さだけを読む
import { DelaGothicOne_400Regular } from '@expo-google-fonts/dela-gothic-one/400Regular';
import { ZenKakuGothicNew_400Regular } from '@expo-google-fonts/zen-kaku-gothic-new/400Regular';
import { ZenKakuGothicNew_700Bold } from '@expo-google-fonts/zen-kaku-gothic-new/700Bold';
import { ROUTE_TAB, StoreProvider, resolveRoute, useStore, type Tab } from './src/store';
import { C, shadow, useLayout } from './src/theme';
import { Row, Txt } from './src/ui';
import { PersonScreen, ProfileScreen, SearchIdScreen } from './src/screens/Profile';
import { CreateScreen, RequestsScreen } from './src/screens/Recruit';
import { ListScreen, MatchedScreen } from './src/screens/Join';
import { ConnectionsScreen } from './src/screens/Connections';
import { SettingsScreen, resetSettings } from './src/screens/Settings';

export default function App() {
  const [loaded] = useFonts({
    DelaGothicOne_400Regular,
    ZenKakuGothicNew_400Regular,
    ZenKakuGothicNew_700Bold,
  });
  // ウェブでは読み込みを待たずに表示し、届いたフォントから差し替える
  if (!loaded && Platform.OS !== 'web') return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Shell />
        <StatusBar style="dark" />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { s: st } = useStore();
  const { s, wide } = useLayout();
  const route = resolveRoute(st);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [route.name, route.params.id]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <DemoBar />
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(32) }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: wide ? 1600 : undefined, alignSelf: 'center', paddingHorizontal: s(wide ? 28 : 16) }}>
          <Screen />
        </View>
      </ScrollView>
      <TabBar current={ROUTE_TAB[route.name]} />
      <Toast />
    </SafeAreaView>
  );
}

function Screen() {
  const { s: st } = useStore();
  const { name, params } = resolveRoute(st);
  switch (name) {
    case 'profile': return <ProfileScreen />;
    case 'person': return <PersonScreen id={params.id} />;
    case 'search-id': return <SearchIdScreen />;
    case 'create': return <CreateScreen game={params.game} />;
    case 'requests': return <RequestsScreen />;
    case 'list': return <ListScreen />;
    case 'matched': return <MatchedScreen />;
    case 'connections': return <ConnectionsScreen />;
    case 'settings': return <SettingsScreen />;
  }
}

/* ---------- デモ用の帯 ---------- */

function DemoBar() {
  const { reset, go } = useStore();
  const { s, wide } = useLayout();
  return (
    <Row style={{ paddingVertical: s(8), paddingHorizontal: s(wide ? 28 : 12), backgroundColor: C.stage, borderBottomWidth: 1, borderColor: '#cfd5e3' }}>
      <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ink, borderRadius: s(6), paddingHorizontal: s(6) }}>
        <Txt size={12} weight="bold">デモ</Txt>
      </View>
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => { resetSettings(); reset(); }} accessibilityRole="button"><Txt size={12} color={C.muted} style={{ textDecorationLine: 'underline' }}>最初から</Txt></Pressable>
      <Pressable onPress={() => go('settings')} accessibilityRole="button" accessibilityLabel="設定" hitSlop={8} style={{ marginLeft: s(12) }}>
        <Ionicons name="settings-outline" size={s(18)} color={C.muted} />
      </Pressable>
    </Row>
  );
}

/* ---------- 下のタブ（app-7）：すべての画面に出る ---------- */

const TABS: { tab: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { tab: 'profile', label: 'プロフィール', icon: 'person-outline' },
  { tab: 'recruit', label: '募集', icon: 'megaphone-outline' },
  { tab: 'connections', label: 'フレンド', icon: 'people-outline' },
];

function TabBar({ current }: { current: Tab }) {
  const { go } = useStore();
  const { s } = useLayout();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line, paddingBottom: insets.bottom }, shadow]}>
      <View style={{ flexDirection: 'row', width: '100%', maxWidth: s(640), alignSelf: 'center' }}>
        {TABS.map(({ tab, label, icon }) => {
          const on = tab === current;
          return (
            <Pressable key={tab} onPress={() => go(tab === 'recruit' ? 'recruit' : tab)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: s(8), gap: 2 }}>
              <Ionicons name={icon} size={s(22)} color={on ? C.accent : C.muted} />
              <Txt size={11} weight="bold" color={on ? C.accent : C.muted}>{label}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Toast() {
  const { toastText } = useStore();
  const { s } = useLayout();
  if (!toastText) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: s(90), alignItems: 'center' }}>
      <View style={{ backgroundColor: C.ink, borderRadius: s(12), paddingVertical: s(10), paddingHorizontal: s(16), maxWidth: '90%' }}>
        <Txt size={14} color="#fff">{toastText}</Txt>
      </View>
    </View>
  );
}
