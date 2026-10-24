// ゲーム・趣味・好きなものを足すモーダル。
// 欄に打つと候補が絞り込まれて下に出る（家計簿の「店舗を選択」と同じ形）。
// 候補を押すとそれを足し、右の「新規追加」を押すと、候補が出ていても打った名前をそのまま足す。
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, type TextInputInstance } from 'react-native';
import { GAMES, HOBBY_SUGGEST, LIKE_SUGGEST, addCustomGame, hasNgWord } from './data';
import { FitModal, useFitHeight } from './FitModal';
import { useStore } from './store';
import { C, F, shadow, useLayout } from './theme';
import { Note, Row, Stack, SubButton, Txt } from './ui';

export type AddKind = 'games' | 'hobbies' | 'likes';

const TITLE: Record<AddKind, string> = { games: 'ゲームを追加', hobbies: '趣味を追加', likes: '好きなものを追加' };
const PLACEHOLDER: Record<AddKind, string> = { games: 'ゲームを選択', hobbies: '趣味を選択', likes: '好きなものを選択' };

// 大文字・小文字、ひらがな・カタカナの違いを無視して比べる
const fold = (s: string) => s.toLowerCase().replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/\s/g, '');

type Item = { key: string; label: string };

/* ---------- 予測変換つきの入力欄 ---------- */

export function Combobox({ items, placeholder, onPick, onCreate }: {
  items: Item[];
  placeholder: string;
  onPick: (item: Item) => void;
  onCreate: (name: string) => void;
}) {
  const { s } = useLayout();
  const fitHeight = useFitHeight();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);
  const input = useRef<TextInputInstance>(null);

  const matches = useMemo(() => {
    const q = fold(text);
    const list = q ? items.filter((it) => fold(it.label).includes(q)) : items;
    // 打った文字で始まるものを先に
    return [...list].sort((a, b) => Number(!fold(a.label).startsWith(q)) - Number(!fold(b.label).startsWith(q)) || a.label.localeCompare(b.label, 'ja'));
  }, [items, text]);

  const create = () => {
    const name = text.trim();
    if (!name) return;
    onCreate(name);
    setText('');
  };
  // Enter：打った名前と同じ候補があればそれを、無ければ新しく足す
  const submit = () => {
    const exact = items.find((it) => fold(it.label) === fold(text.trim()));
    if (exact) {
      onPick(exact);
      setText('');
    } else create();
  };

  return (
    <View>
      <Row gap={0} style={{ borderWidth: 1, borderColor: C.line, borderRadius: s(8), backgroundColor: C.bg, paddingRight: s(6) }}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={(v) => { setText(v); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onSubmitEditing={submit}
          placeholder={placeholder}
          placeholderTextColor="#9aa0b5"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={40}
          accessibilityRole="combobox"
          style={{ flex: 1, minWidth: 0, paddingVertical: s(10), paddingHorizontal: s(12), fontSize: s(16), fontFamily: F.regular, color: C.ink }}
        />
        <Pressable onPress={() => setOpen((v) => !v)} accessibilityLabel={open ? '候補を閉じる' : '候補を開く'} hitSlop={6}
          style={{ paddingHorizontal: s(10), paddingVertical: s(10) }}>
          <Txt size={12} color={C.muted}>{open ? '▲' : '▼'}</Txt>
        </Pressable>
        <Pressable onPress={create} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel="入力した名前で新規追加"
          style={{ borderWidth: 1, borderColor: C.accent, borderRadius: s(8), paddingVertical: s(6), paddingHorizontal: s(12), opacity: text.trim() ? 1 : 0.4 }}>
          <Txt size={13} weight="bold" color={C.accent}>新規追加</Txt>
        </Pressable>
      </Row>

      {open ? (
        <View style={[{ marginTop: s(4), borderWidth: 1, borderColor: C.line, borderRadius: s(8), backgroundColor: C.card, overflow: 'hidden' }, shadow]}>
          {/* 低い画面では、候補の一覧も縮めて、欄と見出しが画面に残るようにする */}
          <ScrollView style={{ maxHeight: Math.min(s(240), Math.round(fitHeight * 0.4)) }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {matches.length ? matches.map((it, i) => (
              <Pressable key={it.key} onPress={() => { onPick(it); setText(''); input.current?.focus(); }} accessibilityRole="button"
                style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                  paddingVertical: s(12), paddingHorizontal: s(14),
                  borderTopWidth: i ? 1 : 0, borderColor: C.line,
                  backgroundColor: pressed || hovered ? C.bg : C.card,
                })}>
                <Txt size={15}>{it.label}</Txt>
              </Pressable>
            )) : (
              <View style={{ padding: s(14) }}>
                <Note>{text.trim() ? `候補にありません。右の「新規追加」で「${text.trim()}」を足せます` : '候補はすべて追加済みです'}</Note>
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- モーダル ---------- */

export function AddModal({ kind, onClose }: { kind: AddKind | null; onClose: () => void }) {
  const { s: st, update, editProfile, toast } = useStore();
  const { s } = useLayout();
  if (!kind) return null;

  // 自分のプロフィールの編集中なら下書きに、そうでなければプロフィールにそのまま足す
  const target = st.draft ?? st.me;
  const edit = async (fn: (p: typeof st.me) => void) => {
    if (st.draft) { update(d => { if (d.draft) fn(d.draft); }); return true; }
    return editProfile(fn);
  };

  const items: Item[] =
    kind === 'games'
      ? Object.keys(GAMES).filter((t) => !target.games.some((g) => g.tag === t)).map((t) => ({ key: t, label: GAMES[t].name }))
      : (kind === 'hobbies' ? HOBBY_SUGGEST : LIKE_SUGGEST)
        .filter((n) => !(kind === 'hobbies' ? target.hobbies : target.likes).some((x) => x.name === n))
        .map((n) => ({ key: n, label: n }));

  const add = async (name: string, tag?: string) => {
    if (hasNgWord(name)) return toast('この言葉は入れられません');
    if (kind === 'games') {
      const t = tag ?? addCustomGame(name);
      if (target.games.some((g) => g.tag === t)) return toast(`${GAMES[t].name}はもう入っています`);
      if (!(await edit((p) => { if (!p.games.some(g => g.tag === t)) p.games.push({ tag: t, platform: 'Switch', heat: 2, skill: 5 }); }))) return;
      toast(`${GAMES[t].name}を追加しました`);
    } else {
      const list = kind === 'hobbies' ? target.hobbies : target.likes;
      if (list.some((x) => x.name === name)) return toast(`${name}はもう入っています`);
      if (!(await edit((p) => { if (kind === 'hobbies') { if (!p.hobbies.some(h => h.name === name)) p.hobbies.push({ name, heat: 2 }); } else if (!p.likes.some(l => l.name === name)) p.likes.push({ name }); }))) return;
      toast(`${name}を追加しました`);
    }
  };

  const added = kind === 'games' ? target.games.map((g) => GAMES[g.tag]?.name ?? g.tag)
    : (kind === 'hobbies' ? target.hobbies : target.likes).map((x) => x.name);

  return (
    // 画面の高さに合わせて縮み、見出しと閉じるボタンは常に見える（FitModal）
    <FitModal title={TITLE[kind]} onClose={onClose} footer={<SubButton label="閉じる" onPress={onClose} style={{ alignSelf: 'flex-end' }} />}>
          <Stack gap={12}>
            <Note>候補から選ぶか、名前を打って「新規追加」を押してください。</Note>
            <Combobox
              items={items}
              placeholder={PLACEHOLDER[kind]}
              onPick={(it) => add(it.label, kind === 'games' ? it.key : undefined)}
              onCreate={(name) => add(name)}
            />
            {added.length ? (
              <Stack gap={6}>
                <Txt size={12} weight="bold" color={C.muted}>追加済み</Txt>
                <Row gap={6} wrap>{added.map((n) => (
                  <View key={n} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: s(10), paddingVertical: s(2) }}>
                    <Txt size={12}>{n}</Txt>
                  </View>
                ))}</Row>
              </Stack>
            ) : null}
            {kind === 'games' ? <Note>機種は「編集」から変えられます。熱量と実力は、プロフィールのスライダーで変えられます。</Note> : null}
          </Stack>
    </FitModal>
  );
}
