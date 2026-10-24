// スマホのアプリ版の日付・時刻の欄。押すと、端末のカレンダーや時計が開く。
// ウェブ版は DateTimeField.web.tsx を使う。
import { useState } from 'react';
import { Platform, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatDate, isISODate, toISO } from './dates';
import { C, useLayout } from './theme';
import { Txt } from './ui';

type Props = { mode: 'date' | 'time'; value: string; onChange: (v: string) => void; label: string; min?: string };

function toDate(mode: 'date' | 'time', value: string) {
  const d = new Date();
  if (mode === 'date' && isISODate(value)) {
    const [y, m, day] = value.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  if (mode === 'time' && /^\d{1,2}:\d{2}$/.test(value)) {
    const [h, mi] = value.split(':').map(Number);
    d.setHours(h, mi, 0, 0);
  }
  return d;
}

export function DateTimeField({ mode, value, onChange, label, min }: Props) {
  const { s } = useLayout();
  const [open, setOpen] = useState(false);
  const shown = mode === 'date' ? (isISODate(value) ? formatDate(value) : '日付を選ぶ') : value || '時刻を選ぶ';
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}
        style={{ minHeight: s(40), borderWidth: 1, borderColor: C.line, borderRadius: s(10), paddingHorizontal: s(10), justifyContent: 'center', backgroundColor: C.bg }}>
        <Txt size={15} weight="bold">{shown}</Txt>
      </Pressable>
      {open ? (
        <DateTimePicker
          mode={mode}
          value={toDate(mode, value)}
          minimumDate={min && isISODate(min) ? toDate('date', min) : undefined}
          minuteInterval={5}
          is24Hour
          locale="ja-JP"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, date) => {
            setOpen(Platform.OS === 'ios' && event.type !== 'dismissed' ? open : false);
            if (event.type !== 'set' || !date) return;
            onChange(mode === 'date' ? toISO(date) : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
            if (Platform.OS === 'ios') setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
