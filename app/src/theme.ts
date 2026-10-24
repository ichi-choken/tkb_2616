import { useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';

export type DesignId = 'clear' | 'play' | 'night';
type Palette = {
  stage: string; bg: string; card: string; surface: string; ink: string; muted: string;
  line: string; accent: string; accentSoft: string; onAccent: string; hero: string;
  grad: readonly [string, string]; ok: string; okBg: string; warn: string; warnBg: string;
  rest: string; restBg: string; danger: string; dangerBg: string; heat: string[];
  overlay: string; toast: string; toastText: string;
};
type Design = {
  id: DesignId; number: string; name: string; description: string; dark: boolean;
  radius: number; border: number; heading: string; palette: Palette;
};
const sans = 'ZenKakuGothicNew_700Bold';
export const DESIGNS: Record<DesignId, Design> = {
  clear: {
    id: 'clear', number: '01', name: 'クリア', description: '明るく、すっきり。', dark: false,
    radius: 22, border: 1, heading: sans,
    palette: {
      stage: '#ffffff', bg: '#f6f5f9', card: '#ffffff', surface: '#f7f7fb',
      ink: '#252435', muted: '#6d6a7f', line: '#e9e7ef', accent: '#6b50d2',
      accentSoft: '#eee9ff', onAccent: '#ffffff', hero: '#eae5fa', grad: ['#6b50d2', '#6b50d2'],
      ok: '#28775f', okBg: '#e8f4ed', warn: '#93632b', warnBg: '#faf1df',
      rest: '#767286', restBg: '#efedf4', danger: '#bb405b', dangerBg: '#fcebf0',
      heat: ['#3873aa', '#36816a', '#966c28', '#bb6931', '#ba4c45'],
      overlay: '#19142b66', toast: '#29243d', toastText: '#ffffff',
    },
  },
  play: {
    id: 'play', number: '02', name: 'ポップ', description: '好きなことを、もっと楽しく。', dark: false,
    radius: 18, border: 2, heading: 'DelaGothicOne_400Regular',
    palette: {
      stage: '#fffdf5', bg: '#fff9e9', card: '#fffefa', surface: '#fff3c9',
      ink: '#30283f', muted: '#74647a', line: '#d7cce2', accent: '#7041cd',
      accentSoft: '#e9dcff', onAccent: '#ffffff', hero: '#e6d6ff', grad: ['#7041cd', '#7041cd'],
      ok: '#29734d', okBg: '#def2ce', warn: '#8c5a12', warnBg: '#ffedb1',
      rest: '#736378', restBg: '#efe7f2', danger: '#b83c58', dangerBg: '#ffe3e9',
      heat: ['#3072a5', '#287950', '#916518', '#ba5b27', '#bf3a4b'],
      overlay: '#30283f88', toast: '#30283f', toastText: '#ffffff',
    },
  },
  night: {
    id: 'night', number: '03', name: 'ナイト', description: '心地よく、じっくり。', dark: true,
    radius: 16, border: 1, heading: sans,
    palette: {
      stage: '#141720', bg: '#10131b', card: '#1a1f2b', surface: '#222837',
      ink: '#f1f1f7', muted: '#a6adbf', line: '#313749', accent: '#b9a4ff',
      accentSoft: '#342c4d', onAccent: '#20182f', hero: '#2b2645', grad: ['#b9a4ff', '#b9a4ff'],
      ok: '#8ad7b2', okBg: '#1d382f', warn: '#edc47d', warnBg: '#3c3020',
      rest: '#a8adc2', restBg: '#2b3041', danger: '#ffa1b3', dangerBg: '#422735',
      heat: ['#88bff0', '#8ad7b2', '#edc47d', '#f3ae84', '#f49d9c'],
      overlay: '#070911bb', toast: '#e7e3f6', toastText: '#252033',
    },
  },
};
export const DESIGN_IDS: DesignId[] = ['clear', 'play', 'night'];
function initialDesign(): DesignId {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'play';
  const value = new URLSearchParams(window.location.search).get('design');
  return DESIGN_IDS.includes(value as DesignId) ? value as DesignId : 'play';
}
let selected = initialDesign();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => selected;

// Existing screens share these tokens. Publish all tokens before notifying React.
export const C: Palette = { ...DESIGNS[selected].palette };
export const F = { display: DESIGNS[selected].heading, regular: 'ZenKakuGothicNew_400Regular', medium: sans, bold: sans };
function makeShadow(id: DesignId): ViewStyle {
  return id === 'play'
    ? { shadowColor: '#30283f', shadowOpacity: 0.11, shadowRadius: 0, shadowOffset: { width: 2, height: 2 }, elevation: 2 }
    : { shadowColor: '#282039', shadowOpacity: id === 'night' ? 0 : 0.035, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: id === 'night' ? 0 : 1 };
}
export const shadow: ViewStyle = makeShadow(selected);
export function selectDesign(id: DesignId) {
  if (!DESIGN_IDS.includes(id) || selected === id) return;
  selected = id;
  Object.assign(C, DESIGNS[id].palette);
  F.display = DESIGNS[id].heading;
  Object.assign(shadow, makeShadow(id));
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('design', id);
    window.history.replaceState(window.history.state, '', url.toString());
  }
  listeners.forEach(listener => listener());
}

export const WIDE = 900;
export function useLayout() {
  const id = useSyncExternalStore(subscribe, getSnapshot, () => 'play' as DesignId);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  // 広い画面では列を増やす。文字や余白まで拡大して情報量を減らさない。
  const k = 1;
  const s = (n: number) => Math.round(n * k);
  return { wide, width, s, k, design: DESIGNS[id] };
}
