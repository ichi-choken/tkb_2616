// Shumitomo のフロント（デモ）。Expo（React Native）と TypeScript で、スマホのアプリとウェブを1つのコードで作る
import { useRef, useEffect, type ComponentType } from 'react';
import { Platform, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useFonts } from 'expo-font';
// 和文フォントは1つで約2MBあるので、使う太さだけを読む
import { DelaGothicOne_400Regular } from '@expo-google-fonts/dela-gothic-one/400Regular';
import { ZenKakuGothicNew_400Regular } from '@expo-google-fonts/zen-kaku-gothic-new/400Regular';
import { ZenKakuGothicNew_700Bold } from '@expo-google-fonts/zen-kaku-gothic-new/700Bold';
import { ROUTE_TAB, StoreProvider, resolveRoute, useStore, type Tab } from './src/store';
import { C, shadow, useLayout } from './src/theme';
import { Badge, Row, Txt } from './src/ui';
import { DesignSwitcher } from './src/DesignSwitcher';
import { PersonScreen, ProfileScreen, SearchIdScreen } from './src/screens/Profile';
import { CreateScreen, RequestsScreen } from './src/screens/Recruit';
import { ListScreen, MatchedScreen } from './src/screens/Join';
import { ConnectionsScreen } from './src/screens/Connections';
import { SettingsScreen, resetSettings } from './src/screens/Settings';

export default function App() {
  return <ShumitomoApp />;
}

// 接続先があるとき、募集・一覧・参加の画面を本物のデータの画面に差し替える（ルートの src/live/screens.tsx）
export type LiveScreens = Partial<Record<'recruit' | 'create' | 'requests' | 'list' | 'matched', ComponentType<{ params: Record<string, string> }>>>;

export function ShumitomoApp({ settingsScreen = SettingsScreen, liveScreens }: { settingsScreen?: ComponentType; liveScreens?: LiveScreens }) {
  const { design } = useLayout();
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
        <Shell settingsScreen={settingsScreen} liveScreens={liveScreens} />
        <StatusBar style={design.dark ? 'light' : 'dark'} />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function Shell({ settingsScreen, liveScreens }: { settingsScreen: ComponentType; liveScreens?: LiveScreens }) {
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
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(36) }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: s(wide ? 32 : 18) }}>
          <Screen settingsScreen={settingsScreen} liveScreens={liveScreens} />
        </View>
      </ScrollView>
      <TabBar current={ROUTE_TAB[route.name]} />
      <Toast />
    </SafeAreaView>
  );
}

function Screen({ settingsScreen: Settings, liveScreens }: { settingsScreen: ComponentType; liveScreens?: LiveScreens }) {
  const { s: st } = useStore();
  const Live = liveScreens?.[st.route.name as keyof LiveScreens];
  if (Live) return <Live params={st.route.params ?? {}} />;
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
    case 'settings': return <Settings />;
  }
}

/* ---------- デモ用の帯 ---------- */

function DemoBar() {
  const { reset, go, confirm } = useStore();
  const { s, wide, design } = useLayout();
  return (
    <View style={{ backgroundColor: C.stage, borderBottomWidth: 1, borderColor: C.line }}>
      <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: s(wide ? 32 : 18), paddingTop: s(12), paddingBottom: s(wide ? 12 : 10), gap: s(10) }}>
        <Row gap={12}>
          <Pressable accessibilityRole="button" accessibilityLabel="Shumitomo ホーム" onPress={() => go('profile')}>
            <Txt size={design.id === 'play' ? 19 : 18} weight={design.id === 'play' ? 'display' : 'bold'} style={{ letterSpacing: design.id === 'play' ? -1 : -0.4 }}>shumitomo</Txt>
          </Pressable>
          {wide ? <View style={{ flex: 1, alignItems: 'center' }}><DesignSwitcher /></View> : <View style={{ flex: 1 }} />}
          {wide ? <Badge label="画面デモ" tone="rest" /> : null}
          <Pressable onPress={async () => { if (await confirm('この端末に保存したプロフィールも最初の状態に戻しますか？')) { if (await reset()) resetSettings(); } }} accessibilityRole="button" accessibilityLabel="最初から" hitSlop={4}
            style={({ pressed }) => ({ width: s(32), height: s(32), alignItems: 'center', justifyContent: 'center', borderRadius: s(10), backgroundColor: pressed ? C.accentSoft : 'transparent' })}>
            <Feather name="rotate-ccw" size={s(17)} color={C.muted} />
          </Pressable>
          <Pressable onPress={() => go('settings')} accessibilityRole="button" accessibilityLabel="設定" hitSlop={4}
            style={({ pressed }) => ({ width: s(34), height: s(34), alignItems: 'center', justifyContent: 'center', borderRadius: s(6), backgroundColor: pressed ? C.surface : 'transparent' })}>
            <Feather name="settings" size={s(17)} color={C.ink} />
          </Pressable>
        </Row>
        {!wide ? <Row gap={8}><DesignSwitcher /><Badge label="デモ" tone="rest" /></Row> : null}
      </View>
    </View>
  );
}

/* ---------- 下のタブ（app-7）：すべての画面に出る ---------- */

const TABS: { tab: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { tab: 'profile', label: 'プロフィール', icon: 'user' },
  { tab: 'recruit', label: '募集', icon: 'clipboard' },
  { tab: 'connections', label: 'フレンド', icon: 'users' },
];

function TabBar({ current }: { current: Tab }) {
  const { go } = useStore();
  const { s, wide, design } = useLayout();
  const insets = useSafeAreaInsets();
  const pop = design.id === 'play';
  return (
    <View style={{ paddingHorizontal: pop ? 0 : s(14), paddingTop: pop ? 0 : s(8), paddingBottom: Math.max(insets.bottom, pop ? 0 : s(wide ? 16 : 10)), backgroundColor: pop ? C.card : C.bg, borderTopWidth: pop ? 1.5 : 0, borderColor: C.ink }}>
      <View style={[{ flexDirection: 'row', width: '100%', maxWidth: s(520), alignSelf: 'center', padding: s(5), borderRadius: pop ? 0 : s(22), backgroundColor: C.card, borderWidth: pop ? 0 : design.border, borderColor: C.line }, pop ? null : shadow]}>
        {TABS.map(({ tab, label, icon }) => {
          const on = tab === current;
          return <Pressable key={tab} onPress={() => go(tab === 'recruit' ? 'recruit' : tab)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: s(55), paddingVertical: s(7), gap: s(4), borderRadius: pop ? 0 : s(16), backgroundColor: pressed ? C.surface : on && !pop ? C.accentSoft : 'transparent' })}>
            <Feather name={icon} size={s(20)} color={on ? C.accent : C.muted} />
            <Txt size={10} weight={on ? 'bold' : 'regular'} color={on ? C.ink : C.muted}>{label}</Txt>
            {pop && on ? <View style={{ height: s(2), width: s(22), backgroundColor: C.accent, position: 'absolute', top: 0 }} /> : null}
          </Pressable>;
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
      <View style={{ backgroundColor: C.toast, borderRadius: s(12), paddingVertical: s(10), paddingHorizontal: s(16), maxWidth: '90%' }}>
        <Txt size={14} color={C.toastText}>{toastText}</Txt>
      </View>
    </View>
  );
}
