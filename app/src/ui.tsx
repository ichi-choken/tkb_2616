// 画面をまたいで使う部品
import { type ReactNode } from 'react';
import { Image, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { GAMES, HEAT, SKILLS, type GameTag, type Person, type Profile } from './data';
import { C, F, shadow, useLayout } from './theme';
import { DEMO_COVERS } from './demo-covers';

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
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: family, fontSize: s(size), lineHeight: s(size * 1.5), letterSpacing: weight === 'display' ? -0.4 : 0, color }, style]}>
      {children}
    </Text>
  );
}

/* ---------- 並べ方 ---------- */

export function Row({ children, gap = 8, wrap, style }: { children: ReactNode; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  const { s } = useLayout();
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: s(gap), flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}
export function Stack({ children, gap = 16, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const { s } = useLayout();
  return <View style={[{ gap: s(gap) }, style]}>{children}</View>;
}

// スマホでは縦に並び、広い画面では左右に並ぶ
export function Cols({ left, right, even }: { left: ReactNode; right: ReactNode; even?: boolean }) {
  const { wide, s } = useLayout();
  if (!wide) return <Stack>{left}{right}</Stack>;
  return (
    <View style={{ flexDirection: 'row', gap: s(20), alignItems: 'flex-start' }}>
      <Stack style={{ flex: even ? 1 : 5, minWidth: 0 }}>{left}</Stack>
      <Stack style={{ flex: even ? 1 : 7, minWidth: 0 }}>{right}</Stack>
    </View>
  );
}

// 広い画面では、子を2列（とても広ければ3列）のカードに並べる
export function Grid({ children, columns }: { children: ReactNode[]; columns?: number }) {
  const { wide, width, s } = useLayout();
  const n = columns ?? (!wide ? 1 : width >= 1500 ? 3 : 2);
  return (
    <View style={{ gap: s(12) }}>
      {Array.from({ length: Math.ceil(children.length / n) }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row', gap: s(12), alignItems: 'flex-start' }}>
          {Array.from({ length: n }, (_, col) => <View key={col} style={{ flex: 1, minWidth: 0 }}>{children[row * n + col]}</View>)}
        </View>
      ))}
    </View>
  );
}

/* ---------- 見出しとカード ---------- */

// rightNextToTitle：right を見出しのすぐ右に置く
export function AppBar({ title, right, onBack, lead, subtitle, rightNextToTitle }: { title: string; right?: ReactNode; onBack?: () => void; lead?: ReactNode; subtitle?: string; rightNextToTitle?: boolean }) {
  const { s, wide, design } = useLayout();
  return (
    <Stack gap={4} style={{ paddingTop: s(wide ? 20 : 14) }}>
      <Row gap={12} style={{ alignItems: 'center' }}>
        {onBack ? <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="戻る" hitSlop={8}
          style={({ pressed }) => ({ width: s(36), height: s(36), borderRadius: s(12), borderWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.accentSoft : C.card, alignItems: 'center', justifyContent: 'center' })}>
          <Feather name="arrow-left" size={s(17)} color={C.ink} />
        </Pressable> : null}
        {lead}
        <Txt size={design.id === 'play' ? 20 : wide ? 26 : 22} weight="display" style={rightNextToTitle ? { flexShrink: 1, minWidth: 0 } : { flex: 1, minWidth: 0 }}>{title}</Txt>
        {right}
      </Row>
      {subtitle ? <Txt size={13} color={C.muted}>{subtitle}</Txt> : null}
    </Stack>
  );
}

export function Card({ children, style, pad }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const { s, design } = useLayout();
  return <View style={[{ backgroundColor: C.card, borderRadius: s(design.radius), borderWidth: design.border, borderColor: design.id === 'play' ? C.ink : C.line, padding: pad ? s(16) : 0 }, shadow, style]}>{children}</View>;
}

export function Block({ title, count, right, children }: { title: string; count?: number; right?: ReactNode; children: ReactNode }) {
  const { s } = useLayout();
  return (
    <Stack gap={10}>
      <Row gap={8} style={{ minHeight: s(28), paddingHorizontal: s(2) }}>
        <Txt size={15} weight="bold" color={C.ink}>{title}</Txt>
        {count !== undefined ? <Txt size={12} color={C.muted}>{count}</Txt> : null}
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
  return <Txt size={13} color={color} style={style}>{children}</Txt>;
}

/* ---------- ボタン ---------- */

type BtnProps = { label: string; onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: keyof typeof Ionicons.glyphMap; accessibilityLabel?: string };

export function MainButton({ label, onPress, disabled, style, icon, accessibilityLabel }: BtnProps) {
  const { s, design } = useLayout();
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => [{ minHeight: s(46), paddingVertical: s(11), paddingHorizontal: s(18), borderRadius: s(design.id === 'night' ? 12 : 14), borderWidth: design.id === 'play' ? 2 : 0, borderColor: C.ink, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.48 : pressed ? 0.78 : 1 }, design.id === 'play' ? shadow : null, style]}>
    <Row gap={8}>{icon ? <Ionicons name={icon} size={s(17)} color={C.onAccent} /> : null}<Txt size={14} weight="bold" color={C.onAccent}>{label}</Txt></Row>
  </Pressable>;
}

export function SubButton({ label, onPress, disabled, danger, style, icon, accessibilityLabel }: BtnProps & { danger?: boolean }) {
  const { s, design } = useLayout();
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => [{ minHeight: s(40), borderWidth: design.id === 'play' ? 1.5 : 1, borderColor: danger ? C.dangerBg : C.line, borderRadius: s(12), paddingVertical: s(8), paddingHorizontal: s(14), backgroundColor: danger ? C.dangerBg : pressed ? C.surface : C.card, opacity: disabled ? 0.55 : 1, alignItems: 'center', justifyContent: 'center' }, style]}>
    <Row gap={7}>{icon ? icon === 'link-outline' ? <Feather name="link" size={s(16)} color={danger ? C.danger : C.ink} /> : <Ionicons name={icon} size={s(17)} color={danger ? C.danger : C.ink} /> : null}<Txt size={13} weight="bold" color={danger ? C.danger : C.ink}>{label}</Txt></Row>
  </Pressable>;
}

export function MiniButton({ label, onPress, done }: BtnProps & { done?: boolean }) {
  const { s } = useLayout();
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ minHeight: s(36), justifyContent: 'center', borderWidth: 1, borderColor: done ? C.okBg : C.line, backgroundColor: done ? C.okBg : pressed ? C.accentSoft : C.card, borderRadius: s(10), paddingVertical: s(5), paddingHorizontal: s(10) })}>
    <Txt size={13} weight="bold" color={done ? C.ok : C.accent}>{label}</Txt>
  </Pressable>;
}

export function PillButton({ label, onPress, disabled, ok }: BtnProps & { ok?: boolean }) {
  const { s, design } = useLayout();
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => ({ minHeight: s(38), borderRadius: s(design.id === 'play' ? 12 : 999), paddingVertical: s(8), paddingHorizontal: s(14), alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? C.restBg : ok ? C.ok : C.accent, opacity: pressed ? 0.75 : 1 })}>
    <Txt size={12} weight="bold" color={disabled ? C.muted : ok && design.dark ? '#14291f' : ok ? '#ffffff' : C.onAccent}>{label}</Txt>
  </Pressable>;
}

export function TextButton({ label, onPress, danger, disabled }: BtnProps & { danger?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} hitSlop={6} style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.65 : 1 })}>
    <Txt size={13} weight="bold" color={danger ? C.danger : C.accent}>{label}</Txt>
  </Pressable>;
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
  const { s, design } = useLayout();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={({ pressed }) => ({ minHeight: s(36), alignItems: 'center', justifyContent: 'center', borderRadius: s(design.id === 'play' ? 10 : 999), paddingVertical: s(6), paddingHorizontal: s(12), borderWidth: 1, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.card, opacity: pressed ? 0.7 : 1 })}>
    <Txt size={13} weight={on ? 'bold' : 'regular'} color={on ? C.accent : C.muted}>{label}</Txt>
  </Pressable>;
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
          {value ? <Feather name="check" size={s(14)} color={C.onAccent} /> : null}
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
      placeholderTextColor={C.muted}
      {...rest}
      style={[{
        minHeight: s(46), borderWidth: 1, borderColor: C.line, borderRadius: s(12), paddingHorizontal: s(12), paddingVertical: s(9),
        backgroundColor: C.surface, fontSize: s(14), fontFamily: mono ? F.bold : F.regular, color: C.ink,
      }, style]}
    />
  );
}

/* ---------- 小さな表示 ---------- */

// デモのパッケージ画像。未登録のゲームは画像なしと分かる表示にする。
export function Art({ tag, size = 52 }: { tag: GameTag; size?: number }) {
  const { s } = useLayout();
  const source = DEMO_COVERS[tag];
  return (
    <View accessibilityLabel={`${GAMES[tag].name}${source ? 'のパッケージ画像' : '：画像未登録'}`}
      style={{ width: s(size), height: s(size * 1.5), borderRadius: s(5), overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
      {source ? <Image source={source} resizeMode="contain" style={{ width: '100%', height: '100%' }} /> : <Feather name="image" size={s(20)} color={C.muted} />}
    </View>
  );
}

export function Avatar({ p, small }: { p: Profile | Person; small?: boolean }) {
  const { s, design } = useLayout();
  const size = s(small ? 32 : 56);
  const pop = design.id === 'play';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: pop ? C.surface : p.color, alignItems: 'center', justifyContent: 'center', borderWidth: pop ? 1.5 : small ? 0 : 3, borderColor: pop ? C.ink : C.card }}>
      <Txt size={small ? 14 : 24} weight="bold" color={pop ? C.ink : '#fff'}>{p.nickname.slice(0, 1)}</Txt>
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
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: s(9), paddingVertical: s(2), alignSelf: 'flex-start' }}>
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
      <Feather name="shield" size={s(13)} color={C.ok} />
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
      {common ? <Feather name="check" size={s(12)} color={C.ok} /> : null}
      {locked ? <Feather name="lock" size={s(12)} color={C.muted} /> : null}
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

// 表示は細いバー、編集時だけつまみを出す。段階ごとのタップ・キーボード選択を保つ。
function StepSlider({ labels, value, color, onChange, label, valueText }: {
  labels: readonly string[]; value: number; color: string; onChange?: (v: number) => void;
  label: string; valueText: string;
}) {
  const { s } = useLayout();
  const count = labels.length;
  const fraction = Math.max(0, Math.min(count - 1, value)) / (count - 1);
  const position = `${fraction * 100}%` as const;
  return (
    <Stack gap={0}>
      <View style={{ height: s(onChange ? 30 : 14), justifyContent: 'center' }}
        accessible={!onChange} accessibilityRole={onChange ? 'radiogroup' : 'text'}
        accessibilityLabel={onChange ? label : `${label}：${valueText}`}>
        <View pointerEvents="none" style={{ position: 'absolute', left: `${50 / count}%`, right: `${50 / count}%`, height: s(4), borderRadius: s(2), backgroundColor: C.line }}>
          <View style={{ width: position, height: '100%', borderRadius: s(2), backgroundColor: color }} />
          {onChange ? <View style={{ position: 'absolute', left: position, top: s(-6), marginLeft: s(-8), width: s(16), height: s(16), borderRadius: s(8), borderWidth: 2, borderColor: color, backgroundColor: C.card }} /> : null}
        </View>
        {onChange ? <View style={{ flexDirection: 'row', height: '100%' }}>
          {Array.from({ length: count }, (_, i) => (
            <Pressable key={i} onPress={() => onChange(i)} accessibilityRole="radio"
              accessibilityLabel={`${label}：${labels[i]}`} accessibilityState={{ checked: i === value }}
              style={({ pressed }) => ({ flex: 1, height: '100%', borderRadius: s(4), backgroundColor: pressed ? C.accentSoft : 'transparent' })} />
          ))}
        </View> : null}
      </View>
      <Row gap={0}>
        {labels.map((text, i) => <Txt key={i} size={11} color={C.muted} style={{ flex: 1, textAlign: 'center' }}>{text}</Txt>)}
      </Row>
    </Stack>
  );
}

// 熱量のスライダーは、ゆるい→ガチの順に並ぶ（profile-5）
export function HeatSlider({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return <StepSlider labels={HEAT} value={value} color={C.heat[value]} onChange={onChange}
    label="熱量" valueText={HEAT[value]} />;
}

// 実力は1〜9。大きいほど上手い（ADR-75）
export function SkillSlider({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return <StepSlider labels={SKILLS.map(String)} value={value - 1} color={C.accent} onChange={onChange ? (i) => onChange(i + 1) : undefined}
    label="実力" valueText={String(value)} />;
}

/* ---------- 権利の表示 ---------- */

// ゲームの名前と画像の出どころと権利（app-11、app-22）
export function RightsNote({ onOpen }: { onOpen: (url: string) => void }) {
  return (
    <Txt size={11} color={C.muted}>
      デモ画像の出典：{' '}
      <Text onPress={() => onOpen('https://store.steampowered.com/')} style={{ textDecorationLine: 'underline' }}>Steam</Text>
      {' / '}
      <Text onPress={() => onOpen('https://www.nintendo.com/jp/switch/av5ja/index.html')} style={{ textDecorationLine: 'underline' }}>任天堂</Text>
      {'。画像の権利は各ゲーム会社にあります。外してほしいときは運営までご連絡ください。'}
    </Txt>
  );
}
