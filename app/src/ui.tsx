// 画面をまたいで使う部品
import { type ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GAMES, HEAT, SKILLS, type GameTag, type Person, type Profile } from './data';
import { C, F, shadow, useLayout } from './theme';

/* ---------- 文字 ---------- */

type TxtProps = {
  children?: ReactNode;
  size?: number;
  weight?: 'regular' | 'medium' | 'bold' | 'display';
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};
export function Txt({ children, size = 15, weight = 'regular', color = C.ink, style, numberOfLines }: TxtProps) {
  const { s } = useLayout();
  const family = weight === 'display' ? F.display : F[weight];
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: family, fontSize: s(size), lineHeight: s(size * 1.55), color }, style]}>
      {children}
    </Text>
  );
}

/* ---------- 並べ方 ---------- */

export function Row({ children, gap = 8, wrap, style }: { children: ReactNode; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  const { s } = useLayout();
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: s(gap), flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}
export function Stack({ children, gap = 14, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const { s } = useLayout();
  return <View style={[{ gap: s(gap) }, style]}>{children}</View>;
}

// スマホでは縦に並び、広い画面では左右に並ぶ
export function Cols({ left, right, even }: { left: ReactNode; right: ReactNode; even?: boolean }) {
  const { wide, s } = useLayout();
  if (!wide) return <Stack>{left}{right}</Stack>;
  return (
    <View style={{ flexDirection: 'row', gap: s(24), alignItems: 'flex-start' }}>
      <Stack style={{ flex: even ? 1 : 5, minWidth: 0 }}>{left}</Stack>
      <Stack style={{ flex: even ? 1 : 7, minWidth: 0 }}>{right}</Stack>
    </View>
  );
}

// 広い画面では、子を2列（とても広ければ3列）のカードに並べる
export function Grid({ children }: { children: ReactNode[] }) {
  const { wide, width, s } = useLayout();
  const n = !wide ? 1 : width >= 1500 ? 3 : 2;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(12) }}>
      {children.map((child, i) => (
        <View key={i} style={{ width: n === 1 ? '100%' : `${100 / n - 1.5}%` }}>{child}</View>
      ))}
    </View>
  );
}

/* ---------- 見出しとカード ---------- */

export function AppBar({ title, right, onBack, lead }: { title: string; right?: ReactNode; onBack?: () => void; lead?: ReactNode }) {
  const { s, wide } = useLayout();
  return (
    <Row style={{ paddingTop: s(wide ? 24 : 18), paddingBottom: s(10), borderBottomWidth: 1, borderColor: C.line }}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="戻る" hitSlop={10}>
          <Txt size={26} color={C.muted}>‹</Txt>
        </Pressable>
      ) : null}
      {lead}
      <Txt size={wide ? 22 : 20} weight="display" style={{ flex: 1 }}>{title}</Txt>
      {right}
    </Row>
  );
}

export function Card({ children, style, pad }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const { s } = useLayout();
  return <View style={[{ backgroundColor: C.card, borderRadius: s(12), padding: pad ? s(12) : 0 }, shadow, style]}>{children}</View>;
}

export function Block({ title, count, right, children }: { title: string; count?: number; right?: ReactNode; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Row gap={6}>
        <Txt size={13} weight="bold" color={C.muted}>{title}</Txt>
        {count !== undefined ? <Txt size={13} weight="bold">{count}</Txt> : null}
        <View style={{ flex: 1 }} />
        {right}
      </Row>
      {children}
    </Stack>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.line }} />;
}

export function Note({ children, color = C.muted, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Txt size={12} color={color} style={style}>{children}</Txt>;
}

/* ---------- ボタン ---------- */

type BtnProps = { label: string; onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> };

export function MainButton({ label, onPress, disabled, style }: BtnProps) {
  const { s } = useLayout();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[{ opacity: disabled ? 0.45 : 1 }, style]}>
      <LinearGradient colors={C.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: s(12), paddingVertical: s(12), paddingHorizontal: s(16), alignItems: 'center' }}>
        <Txt size={16} weight="bold" color="#fff">{label}</Txt>
      </LinearGradient>
    </Pressable>
  );
}

export function SubButton({ label, onPress, disabled, danger, style }: BtnProps & { danger?: boolean }) {
  const { s } = useLayout();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={[{ borderWidth: 1, borderColor: C.line, borderRadius: s(10), paddingVertical: s(6), paddingHorizontal: s(14), backgroundColor: C.card, opacity: disabled ? 0.45 : 1, alignItems: 'center' }, style]}>
      <Txt size={14} weight="bold" color={danger ? C.danger : C.ink}>{label}</Txt>
    </Pressable>
  );
}

export function MiniButton({ label, onPress, done }: BtnProps & { done?: boolean }) {
  const { s } = useLayout();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ borderWidth: 1, borderColor: done ? C.ok : C.line, backgroundColor: done ? C.okBg : C.card, borderRadius: 999, paddingVertical: s(3), paddingHorizontal: s(12) }}>
      <Txt size={12} weight="bold" color={done ? C.ok : C.accent}>{label}</Txt>
    </Pressable>
  );
}

// 押すと進む丸いボタン。ok は承認・フレンドになるなどの緑
export function PillButton({ label, onPress, disabled, ok }: BtnProps & { ok?: boolean }) {
  const { s } = useLayout();
  const box: ViewStyle = { borderRadius: 999, paddingVertical: s(6), paddingHorizontal: s(14), alignItems: 'center' };
  if (disabled) {
    return <View style={[box, { backgroundColor: C.restBg }]}><Txt size={13} weight="bold" color={C.muted}>{label}</Txt></View>;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {ok ? (
        <View style={[box, { backgroundColor: C.ok }]}><Txt size={13} weight="bold" color="#fff">{label}</Txt></View>
      ) : (
        <LinearGradient colors={C.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={box}>
          <Txt size={13} weight="bold" color="#fff">{label}</Txt>
        </LinearGradient>
      )}
    </Pressable>
  );
}

export function TextButton({ label, onPress, danger, disabled }: BtnProps & { danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} hitSlop={6} style={{ opacity: disabled ? 0.45 : 1 }}>
      <Txt size={13} weight="bold" color={danger ? C.danger : C.accent} style={{ textDecorationLine: 'underline' }}>{label}</Txt>
    </Pressable>
  );
}

// デモの中だけで使う、時間を進めるボタン
export function DemoButton({ label, onPress }: BtnProps) {
  const { s } = useLayout();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#8a90a6', borderRadius: s(8), paddingVertical: s(4), paddingHorizontal: s(10), alignSelf: 'flex-start' }}>
      <Txt size={12} weight="bold">{label}</Txt>
    </Pressable>
  );
}

// 選んだものが塗られる丸い選択肢
export function Opt({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { s } = useLayout();
  const box: ViewStyle = { borderRadius: 999, paddingVertical: s(3), paddingHorizontal: s(12), borderWidth: 1 };
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {on ? (
        <LinearGradient colors={C.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[box, { borderColor: 'transparent' }]}>
          <Txt size={13} weight="bold" color="#fff">{label}</Txt>
        </LinearGradient>
      ) : (
        <View style={[box, { borderColor: C.line, backgroundColor: C.card }]}><Txt size={13}>{label}</Txt></View>
      )}
    </Pressable>
  );
}
export function Opts<T extends string | number>({ items, value, onChange }: { items: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <Row gap={6} wrap>
      {items.map((v) => <Opt key={String(v)} label={String(v)} on={v === value} onPress={() => onChange(v)} />)}
    </Row>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { s } = useLayout();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }}>
      <Row>
        <View style={{ width: s(20), height: s(20), borderRadius: s(5), borderWidth: 2, borderColor: value ? C.accent : C.line, backgroundColor: value ? C.accent : C.card, alignItems: 'center', justifyContent: 'center' }}>
          {value ? <Ionicons name="checkmark" size={s(14)} color="#fff" /> : null}
        </View>
        <Txt size={14} weight="bold">{label}</Txt>
      </Row>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { mono?: boolean }) {
  const { s } = useLayout();
  const { style, mono, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor="#9aa0b5"
      {...rest}
      style={[{
        minHeight: s(40), borderWidth: 1, borderColor: C.line, borderRadius: s(10), paddingHorizontal: s(10), paddingVertical: s(6),
        backgroundColor: C.bg, fontSize: s(15), fontFamily: mono ? F.bold : F.regular, color: C.ink,
      }, style]}
    />
  );
}

/* ---------- 小さな表示 ---------- */

// ゲームの絵：IGDBのカバーの代わりの色。絵の上に文字を重ねない（app-12）
export function Art({ tag, size = 52 }: { tag: GameTag; size?: number }) {
  const { s } = useLayout();
  return (
    <LinearGradient colors={GAMES[tag].colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: s(size), height: s(size * 4 / 3), borderRadius: s(6) }} />
  );
}

export function Avatar({ p, small }: { p: Profile | Person; small?: boolean }) {
  const { s } = useLayout();
  const size = s(small ? 32 : 56);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center', borderWidth: small ? 0 : 3, borderColor: '#fff' }}>
      <Txt size={small ? 14 : 24} weight="bold" color="#fff">{p.nickname.slice(0, 1)}</Txt>
    </View>
  );
}

export function HeatTag({ value }: { value: number }) {
  const { s } = useLayout();
  return (
    <Row gap={4}>
      <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: C.heat[value] }} />
      <Txt size={12} weight="bold" color={C.heat[value]}>{HEAT[value]}</Txt>
    </Row>
  );
}

export function Badge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'rest' | 'danger' }) {
  const { s } = useLayout();
  const bg = { ok: C.okBg, warn: C.warnBg, rest: C.restBg, danger: C.dangerBg }[tone];
  const fg = { ok: C.ok, warn: C.warn, rest: C.rest, danger: C.danger }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: s(8), alignSelf: 'flex-start' }}>
      <Txt size={11} weight="bold" color={fg}>{label}</Txt>
    </View>
  );
}

export function Reasons({ items }: { items: string[] }) {
  const { s } = useLayout();
  return (
    <Row gap={4} wrap>
      {items.map((x) => (
        <View key={x} style={{ backgroundColor: C.okBg, borderRadius: 999, paddingHorizontal: s(8), paddingVertical: s(1) }}>
          <Txt size={12} weight="bold" color={C.ok}>{x}</Txt>
        </View>
      ))}
    </Row>
  );
}

export function Trust({ value }: { value: string | null | undefined }) {
  const { s } = useLayout();
  if (!value) return <Note>連携なし</Note>;
  return (
    <Row gap={4}>
      <Ionicons name="shield-checkmark-outline" size={s(13)} color={C.ok} />
      <Txt size={12} color={C.ok}>{value}</Txt>
    </Row>
  );
}

export function Chip({ label, locked, common, children }: { label: string; locked?: boolean; common?: boolean; children?: ReactNode }) {
  const { s } = useLayout();
  return (
    <Row gap={4} style={{
      borderWidth: 1, borderStyle: locked ? 'dashed' : 'solid', borderColor: common ? C.ok : C.line,
      backgroundColor: common ? C.okBg : C.card, borderRadius: 999, paddingVertical: s(2), paddingHorizontal: s(11),
    }}>
      {common ? <Ionicons name="checkmark" size={s(12)} color={C.ok} /> : null}
      {locked ? <Ionicons name="lock-closed-outline" size={s(12)} color={C.muted} /> : null}
      <Txt size={13} weight={locked ? 'regular' : 'bold'} color={locked ? C.muted : C.ink}>{label}</Txt>
      {children}
    </Row>
  );
}

// 空（ui-2）：見出しと、次に何をすればよいか。ボタンは任意
export function Empty({ title, text, button }: { title: string; text: string; button?: { label: string; onPress: () => void } }) {
  const { s } = useLayout();
  return (
    <Stack gap={6} style={{ alignItems: 'center', paddingVertical: s(28), paddingHorizontal: s(16) }}>
      <Txt size={15} weight="bold" style={{ textAlign: 'center' }}>{title}</Txt>
      {text ? <Note style={{ textAlign: 'center' }}>{text}</Note> : null}
      {button ? <SubButton label={button.label} onPress={button.onPress} style={{ marginTop: s(4) }} /> : null}
    </Stack>
  );
}

/* ---------- 段階を選ぶスライダー ---------- */

// 点を並べた段階スライダー。押した点の値になる
function StepSlider({ count, value, color, onChange, startLabel, endLabel, label, valueText }: {
  count: number; value: number; color: string; onChange?: (v: number) => void;
  startLabel: string; endLabel: string; label: string; valueText: string;
}) {
  const { s } = useLayout();
  const dot = s(count > 5 ? 16 : 18);
  return (
    <Row gap={8}>
      <Txt size={11} color={C.muted} style={{ width: s(34) }}>{startLabel}</Txt>
      <View style={{ flex: 1, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: valueText }}>
        <View style={{ position: 'absolute', left: dot / 2, right: dot / 2, height: 2, backgroundColor: C.line }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: count }, (_, i) => (
            <Pressable key={i} onPress={onChange ? () => onChange(i) : undefined} disabled={!onChange} hitSlop={6}
              accessibilityRole="button" accessibilityLabel={`${label} ${i + 1}`}
              style={{
                width: dot, height: dot, borderRadius: dot / 2, borderWidth: 2,
                borderColor: i <= value ? color : C.line, backgroundColor: i <= value ? color : C.card,
                ...(i === value ? { transform: [{ scale: 1.15 }] } : null),
              }} />
          ))}
        </View>
      </View>
      <Txt size={11} color={C.muted} style={{ width: s(34), textAlign: 'right' }}>{endLabel}</Txt>
    </Row>
  );
}

// 熱量のスライダーは、ゆるい→ガチの順に並ぶ（profile-5）
export function HeatSlider({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return <StepSlider count={HEAT.length} value={value} color={C.heat[value]} onChange={onChange}
    startLabel="ゆるい" endLabel="ガチ" label="熱量" valueText={HEAT[value]} />;
}

// 実力は1〜9。大きいほど上手い（ADR-75）
export function SkillSlider({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return <StepSlider count={SKILLS.length} value={value - 1} color={C.accent} onChange={onChange ? (i) => onChange(i + 1) : undefined}
    startLabel="1" endLabel="9" label="実力" valueText={String(value)} />;
}

/* ---------- 権利の表示 ---------- */

// ゲームの名前と画像の出どころと権利（app-11、app-22）
export function RightsNote({ onOpen }: { onOpen: (url: string) => void }) {
  return (
    <Txt size={11} color={C.muted}>
      ゲームの名前と画像は{' '}
      <Text onPress={() => onOpen('https://www.igdb.com/')} style={{ textDecorationLine: 'underline' }}>IGDB.com</Text>
      {' '}から。画像の権利は各ゲーム会社にあります。外してほしいときは運営までご連絡ください。
    </Txt>
  );
}
