// 画面に収まるモーダル。
// どの機種・ブラウザでも、見出しと閉じるボタンが画面の外に出ないように、見えている高さに合わせて縮め、中身はスクロールさせる。
// - ウェブ：react-native-web は visualViewport で高さを測るので、ブラウザのタブやブックマークバー、スマホのキーボードの分が引かれる
// - アプリ：キーボードの高さは自分で引く。ノッチやホームバーは安全な余白で避ける
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, shadow, useLayout } from './theme';
import { Row, Txt } from './ui';

// キーボードの高さ（アプリのみ。ウェブは 0）
function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

// iOS の Safari では、キーボードが出ると見えている範囲が下にずれることがある。そのずれ
function useViewportOffsetTop() {
  const [top, setTop] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const on = () => setTop(Math.max(0, Math.round(vv.offsetTop)));
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return top;
}

// モーダルに使える高さ。中の部品（候補の一覧など）の高さを決めるのにも使う
export function useFitHeight() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { s, wide } = useLayout();
  const margin = wide ? s(24) : 0;
  return Math.max(200, height - keyboard - insets.top - (wide ? 0 : s(12)) - margin * 2);
}

export function FitModal({ title, onClose, children, footer }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { s, wide } = useLayout();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const offsetTop = useViewportOffsetTop();
  const { height } = useWindowDimensions();
  const maxHeight = useFitHeight();

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      {/* 見えている範囲だけを覆う。キーボードが出ていれば、その上までを使う */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: offsetTop, height: height - keyboard }}>
        <Pressable onPress={onClose} accessibilityLabel="閉じる"
          style={{
            flex: 1, backgroundColor: C.overlay, alignItems: 'center',
            justifyContent: wide ? 'center' : 'flex-end',
            paddingTop: insets.top + (wide ? s(24) : s(12)), paddingBottom: wide ? s(24) : 0,
          }}>
          <Pressable onPress={() => {}} style={[{
            width: '100%', maxWidth: s(560), maxHeight, backgroundColor: C.card, overflow: 'hidden',
            borderRadius: s(16), borderBottomLeftRadius: wide ? s(16) : 0, borderBottomRightRadius: wide ? s(16) : 0,
          }, shadow]}>
            {/* 見出しと閉じるボタンは、中身をスクロールしても上に残す */}
            <Row style={{ paddingHorizontal: s(18), paddingTop: s(16), paddingBottom: s(10), borderBottomWidth: 1, borderColor: C.line }}>
              <Txt size={18} weight="display" style={{ flex: 1 }}>{title}</Txt>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="閉じる" hitSlop={10}><Txt size={22} color={C.muted}>×</Txt></Pressable>
            </Row>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: s(18), paddingTop: s(12) }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? (
              <View style={{ paddingHorizontal: s(18), paddingTop: s(10), paddingBottom: s(14) + (wide ? 0 : insets.bottom), borderTopWidth: 1, borderColor: C.line }}>
                {footer}
              </View>
            ) : (wide ? null : <View style={{ height: insets.bottom }} />)}
          </Pressable>
        </Pressable>
      </View>
    </Modal>
  );
}
