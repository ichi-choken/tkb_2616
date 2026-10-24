import { useWindowDimensions } from 'react-native';

// 見た目はホワイトモードのみ
export const C = {
  stage: '#e8ebf2',
  bg: '#f5f6fa',
  card: '#ffffff',
  ink: '#141a2e',
  muted: '#5d6582',
  line: '#e1e5ef',
  accent: '#6c5cf0',
  grad: ['#4f5bf2', '#8743f0'] as const,
  ok: '#12855f',
  okBg: '#e1f4ec',
  warn: '#b8740a',
  warnBg: '#fbf0dc',
  rest: '#5f6c89',
  restBg: '#eaedf4',
  danger: '#c4314b',
  dangerBg: '#fdebee',
  // 熱量：ゆるい → ガチ
  heat: ['#1c7ed6', '#12855f', '#b8740a', '#e8590c', '#d9401f'],
};

export const F = {
  display: 'DelaGothicOne_400Regular',
  regular: 'ZenKakuGothicNew_400Regular',
  medium: 'ZenKakuGothicNew_700Bold',
  bold: 'ZenKakuGothicNew_700Bold',
};

// PCでは、ThinkPad X1 Carbon で見やすかった大きさ（スマホの約1.33倍）にそろえる
export const WIDE = 900;
export function useLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const k = wide ? 1.33 : 1;
  const s = (n: number) => Math.round(n * k);
  return { wide, width, s, k };
}

export const shadow = {
  shadowColor: '#141a2e',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
