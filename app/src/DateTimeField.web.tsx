// ウェブ版の日付・時刻の欄。ブラウザの入力欄を使うので、PCでもスマホでも、
// 押すとカレンダーや時刻の選択が開く（Chrome・Edge・Safari・Firefox）。
import { createElement } from 'react';
import { C, F, useLayout } from './theme';

type Props = { mode: 'date' | 'time'; value: string; onChange: (v: string) => void; label: string; min?: string };

export function DateTimeField({ mode, value, onChange, label, min }: Props) {
  const { s } = useLayout();
  return createElement('input', {
    type: mode,
    value,
    min,
    step: mode === 'time' ? 300 : undefined, // 時刻は5分きざみ
    'aria-label': label,
    onChange: (e: { target: { value: string } }) => { if (e.target.value) onChange(e.target.value); },
    // 欄のどこを押しても選択を開く（対応していないブラウザでは、ふつうの入力欄として打てる）
    onClick: (e: { currentTarget: { showPicker?: () => void } }) => { try { e.currentTarget.showPicker?.(); } catch { /* 開けないブラウザでは打つだけ */ } },
    style: {
      minHeight: s(40), boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: s(10),
      padding: `${s(6)}px ${s(10)}px`, background: C.bg, color: C.ink, fontSize: s(15), fontFamily: F.bold,
      cursor: 'pointer', colorScheme: 'light', minWidth: s(mode === 'date' ? 170 : 120),
    },
  });
}
