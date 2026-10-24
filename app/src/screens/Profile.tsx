// プロフィール：自分のプロフィール、編集、他の人のプロフィール、IDで探す
import { useState, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import {
  GAMES, HEAT, PEOPLE, PLATFORMS, REGION_OPTIONS,
  hasNgWord, isPersonId, isTime, type MyGame, type Person, type PersonId, type Profile,
} from '../data';
import { useStore } from '../store';
import { demoSettings } from '../demo-settings';
import { steamProfileVisible } from '../demo-settings-state';
import { AddModal, type AddKind } from '../AddModal';
import { C, useLayout } from '../theme';
import {
  AppBar, Art, Avatar, Block, Card, Chip, Cols, Divider, Empty, Field, HeatSlider, HeatTag, MainButton,
  MiniButton, Note, Opts, PillButton, RightsNote, Row, SkillSlider, Stack, SubButton, TextButton, Trust, Txt,
} from '../ui';

/* ---------- 自分のプロフィール ---------- */

export function ProfileScreen() {
  const { s: st } = useStore();
  return st.draft ? <ProfileEdit /> : <ProfileView />;
}

function ProfileView() {
  const { s: st, update, editProfile, go, copy, toast, open } = useStore();
  const settings = useSyncExternalStore(demoSettings.subscribe, demoSettings.getSnapshot, demoSettings.getSnapshot);
  const [adding, setAdding] = useState<AddKind | null>(null);
  const { wide } = useLayout();
  const p = st.me;

  // 熱量・実力はスライダーでその場で直せる（profile-5）。部品ごとに保存する（ui-1）
  const setGame = async (i: number, key: 'heat' | 'skill', value: number) => {
    if (!(await editProfile(profile => { profile.games[i][key] = value; }))) return;
    toast(key === 'heat' ? `熱量を「${HEAT[value]}」にしました` : `実力を ${value} にしました`);
  };
  const setHobbyHeat = async (i: number, value: number) => {
    if (!(await editProfile(profile => { profile.hobbies[i].heat = value; }))) return;
    toast(`熱量を「${HEAT[value]}」にしました`);
  };

  // 広い画面では、趣味と好きなものを左の列（名前の下の空き）に置く
  const hobbiesAndLikes = (
    <>
      <Block title="趣味" right={<MiniButton label="＋ 追加" onPress={() => setAdding('hobbies')} />}>
        <Card>
          {p.hobbies.length ? p.hobbies.map((h, i) => (
            <View key={h.name}>
              {i > 0 ? <Divider /> : null}
              <HobbyRow name={h.name} heat={h.heat} onHeat={(v) => setHobbyHeat(i, v)} />
            </View>
          )) : <Empty title="趣味がまだ入っていません" text="「＋ 追加」から入れられます。" />}
        </Card>
      </Block>

      <Block title="好きなもの" right={<MiniButton label="＋ 追加" onPress={() => setAdding('likes')} />}>
        <Card pad>
          {p.likes.length ? (
            <Row gap={6} wrap>{p.likes.map((l) => <Chip key={l.name} label={l.name} locked={l.locked} />)}</Row>
          ) : <Empty title="好きなものがまだ入っていません" text="「＋ 追加」から入れられます。" />}
        </Card>
        <Note>鍵をかけたものは自分だけに見えます。鍵は「編集」でかけられます。</Note>
      </Block>
    </>
  );

  return (
    <Stack>
      <AppBar title="プロフィール" subtitle="あなたの「好き」を、仲間へのきっかけに。" right={<MiniButton label="IDで探す" onPress={() => go('search-id')} />} />
      <Cols
        left={<>
          <WhoCard p={p} right={<SubButton label="編集" onPress={() => update((d) => { d.draft = JSON.parse(JSON.stringify(d.me)); d.saveError = false; })} />}>
            <Row gap={6} wrap>
              <Note>アプリID</Note>
              <Txt size={14} weight="bold">{p.appId}</Txt>
              <MiniButton label="リンクをコピー" onPress={() => copy(`https://shumitomo.jp/${p.appId}`, 'プロフィールのリンクをコピーしました')} />
            </Row>
          </WhoCard>
          <Note>プロフィールはこの端末に保存されます。同じブラウザで再読み込みしても残ります。</Note>
          <TimesCard times={p.times} region={p.region} />
          {wide ? hobbiesAndLikes : null}
        </>}
        right={<>
          <Block title="ゲーム" count={p.games.length} right={<MiniButton label="＋ 追加" onPress={() => setAdding('games')} />}>
            {p.games.length ? p.games.map((g, i) => (
              <GameCard key={g.tag} g={g} showSteam={steamProfileVisible(settings)}
                onRecruit={() => { update((d) => { d.role = 'rec'; }); go('create', { game: g.tag }); }}
                onSkill={(v) => setGame(i, 'skill', v)}
                onHeat={(v) => setGame(i, 'heat', v)} />
            )) : (
              <Card><Empty title="ゲームがまだ入っていません" text="ゲームを入れると、合う募集が見つかりやすくなります。" button={{ label: '＋ ゲームを追加', onPress: () => setAdding('games') }} /></Card>
            )}
          </Block>
          {/* スマホでは、ゲームの下に続ける（画面の並び：ゲーム → 趣味 → 好きなもの） */}
          {wide ? null : hobbiesAndLikes}
          <RightsNote onOpen={open} />
        </>}
      />
      <AddModal kind={adding} onClose={() => setAdding(null)} />
    </Stack>
  );
}

function WhoCard({ p, right, children }: { p: Profile | Person; right?: React.ReactNode; children?: React.ReactNode }) {
  const { design } = useLayout();
  return <Card pad>
    <Stack gap={16}>
      <Row gap={14}>
        <Avatar p={p} />
        <Txt size={design.id === 'play' ? 22 : 24} weight="display" style={{ flex: 1 }}>{p.nickname}</Txt>
        {right}
      </Row>
      <View style={{ height: 1, backgroundColor: C.line }} />
      <Stack gap={6}>{children}</Stack>
    </Stack>
  </Card>;
}

function TimesCard({ times, region }: { times: { start: string; end: string }; region: string }) {
  const { s } = useLayout();
  return <Card pad><Row gap={16}>
    <Stack gap={5} style={{ flex: 1 }}>
      <Row gap={5}><Feather name="clock" size={s(13)} color={C.accent} /><Txt size={11} color={C.muted}>遊ぶ時間帯</Txt></Row>
      <Txt size={13} weight="bold">{times.start}〜{times.end}</Txt>
    </Stack>
    <View style={{ height: s(36), width: 1, backgroundColor: C.line }} />
    <Stack gap={5} style={{ flex: 1 }}>
      <Row gap={5}><Feather name="map-pin" size={s(13)} color={C.muted} /><Txt size={11} color={C.muted}>住んでいる地方</Txt></Row>
      <Txt size={13} weight="bold">{region}</Txt>
    </Stack>
  </Row></Card>;
}

// ゲーム1つ。上段が熱量、下段が実力。自分のゲームなら、どちらもその場で変えられる
function GameCard({ g, onRecruit, onSkill, onHeat, showSteam = true }: {
  g: MyGame; onRecruit?: () => void; onSkill?: (v: number) => void; onHeat?: (v: number) => void; showSteam?: boolean;
}) {
  const { s } = useLayout();
  return (
    <Card pad>
      <Stack gap={10}>
        <Row gap={10}>
          <Art tag={g.tag} />
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Txt size={16} weight="bold">{GAMES[g.tag].name}</Txt>
            <Note>{g.platform}</Note>
          </Stack>
          {onRecruit ? (
            <Pressable onPress={onRecruit} accessibilityRole="link" accessibilityLabel={`${GAMES[g.tag].name}の募集を出す`} hitSlop={6}>
              <Row gap={3} style={{ paddingHorizontal: s(8), minHeight: s(34) }}><Feather name="plus" size={s(15)} color={C.accent} /><Txt size={12} weight="bold" color={C.accent}>募集</Txt></Row>
            </Pressable>
          ) : null}
        </Row>
        {showSteam && g.steam ? <Note>Steam · {g.steam.hours}時間プレイ / {g.steam.updated}に取得</Note> : null}
        <View style={{ gap: s(8), paddingTop: s(8) }}>
          <Row><Txt size={12} weight="bold" color={C.muted} style={{ width: s(40) }}>熱量</Txt><HeatTag value={g.heat} /></Row>
          <HeatSlider value={g.heat} onChange={onHeat} />
        </View>
        <View style={{ gap: s(8), paddingTop: s(8) }}>
          <Row><Txt size={12} weight="bold" color={C.muted} style={{ width: s(40) }}>実力</Txt>
            <Txt size={14} weight="bold">{g.skill}</Txt><Note>/ 9</Note></Row>
          <SkillSlider value={g.skill} onChange={onSkill} />
        </View>
      </Stack>
    </Card>
  );
}

function HobbyRow({ name, heat, onHeat }: { name: string; heat: number; onHeat?: (v: number) => void }) {
  const { s } = useLayout();
  return (
    <Stack gap={6} style={{ padding: s(12) }}>
      <Row><Txt size={15} weight="bold" style={{ flex: 1 }}>{name}</Txt><HeatTag value={heat} /></Row>
      {onHeat ? <HeatSlider value={heat} onChange={onHeat} /> : null}
    </Stack>
  );
}

/* ---------- 編集 ---------- */

function ProfileEdit() {
  const { s: st, update, editProfile, toast } = useStore();
  const { s } = useLayout();
  const p = st.draft!;
  const [adding, setAdding] = useState<AddKind | null>(null);
  const set = (fn: (d: NonNullable<typeof st.draft>) => void) => update((d) => { if (d.draft) fn(d.draft); });

  const save = async () => {
    if (!p.nickname.trim()) return toast('ニックネームを入れてください');
    if (hasNgWord(p.nickname) || hasNgWord(p.appId)) return toast('名前に入れられない言葉があります');
    if (!/^[A-Za-z0-9_]+$/.test(p.appId)) return toast('アプリIDは英数字と _ で入れてください');
    if (!isTime(p.times.start) || !isTime(p.times.end)) return toast('時間帯は 21:00 のように入れてください');
    update((d) => { d.saving = true; d.saveError = false; });
    const saved = await editProfile(profile => { Object.assign(profile, JSON.parse(JSON.stringify(p))); });
    update(d => { d.saving = false; d.saveError = !saved; if (saved) d.draft = null; });
    if (saved) toast('この端末に保存しました');
  };

  const formRow = (label: string, body: React.ReactNode) => (
    <Row gap={8} style={{ alignItems: 'flex-start', padding: s(12) }}>
      <Txt size={12} weight="bold" color={C.muted} style={{ width: s(80), paddingTop: s(8) }}>{label}</Txt>
      <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>{body}</Stack>
    </Row>
  );

  return (
    <Stack>
      <AppBar title="プロフィールを編集" />
      <Cols
        left={
          <Card>
            {formRow('ニックネーム', <Field value={p.nickname} maxLength={16} onChangeText={(v) => set((d) => { d.nickname = v; })} />)}
            <Divider />
            {formRow('アプリID', <>
              <Field value={p.appId} maxLength={16} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => set((d) => { d.appId = v; })} />
              <Note>プロフィールの短いURLになります（shumitomo.jp/{p.appId || 'id'}）</Note>
              <Note color={C.warn}>ゲーム内IDやSNSの名前とは別にしておくと安心です</Note>
            </>)}
            <Divider />
            {/* 「24:00」が収まる幅にそろえ、横にはみ出さないようにする */}
            {formRow('遊ぶ時間帯', <Row>
              <Field mono value={p.times.start} maxLength={5} style={{ width: s(76), textAlign: 'center' }} onChangeText={(v) => set((d) => { d.times.start = v; })} />
              <Txt>〜</Txt>
              <Field mono value={p.times.end} maxLength={5} style={{ width: s(76), textAlign: 'center' }} onChangeText={(v) => set((d) => { d.times.end = v; })} />
            </Row>)}
            <Divider />
            {formRow('地方', <Opts items={REGION_OPTIONS} value={p.region as (typeof REGION_OPTIONS)[number]} onChange={(v) => set((d) => { d.region = v; })} />)}
          </Card>
        }
        right={<>
          <Block title="ゲーム" right={<MiniButton label="＋ 追加" onPress={() => setAdding('games')} />}>
            <Card>
              {p.games.map((g, i) => (
                <View key={g.tag}>
                  {i > 0 ? <Divider /> : null}
                  <Stack gap={8} style={{ padding: s(12) }}>
                    <Row><Art tag={g.tag} size={36} /><Txt size={15} weight="bold" style={{ flex: 1 }}>{GAMES[g.tag].name}</Txt>
                      <TextButton danger label="削除" onPress={() => set((d) => { d.games.splice(i, 1); })} /></Row>
                    <Opts items={PLATFORMS} value={g.platform as (typeof PLATFORMS)[number]} onChange={(v) => set((d) => { d.games[i].platform = v; })} />
                    <Note>実力と熱量は、プロフィールの画面でいつでも変えられます</Note>
                  </Stack>
                </View>
              ))}
            </Card>
          </Block>

          <Block title="趣味" right={<MiniButton label="＋ 追加" onPress={() => setAdding('hobbies')} />}>
            <Card>
              {p.hobbies.map((h, i) => (
                <View key={h.name}>
                  {i > 0 ? <Divider /> : null}
                  <Row style={{ padding: s(12) }}><Txt size={15} weight="bold" style={{ flex: 1 }}>{h.name}</Txt>
                    <TextButton danger label="削除" onPress={() => set((d) => { d.hobbies.splice(i, 1); })} /></Row>
                </View>
              ))}
            </Card>
          </Block>

          <Block title="好きなもの" right={<MiniButton label="＋ 追加" onPress={() => setAdding('likes')} />}>
            <Card pad>
              <Stack gap={10}>
                <Row gap={6} wrap>
                  {p.likes.map((l, i) => (
                    <Chip key={l.name} label={l.name} locked={l.locked}>
                      <Pressable onPress={() => set((d) => { d.likes[i].locked = !d.likes[i].locked; })} accessibilityLabel="鍵" hitSlop={6}>
                        <Txt size={12}>{l.locked ? '🔓' : '🔒'}</Txt>
                      </Pressable>
                      <Pressable onPress={() => set((d) => { d.likes.splice(i, 1); })} accessibilityLabel="削除" hitSlop={6}>
                        <Txt size={13} weight="bold" color={C.danger}>×</Txt>
                      </Pressable>
                    </Chip>
                  ))}
                </Row>
                <Note>🔒を押すと鍵をかけられます</Note>
              </Stack>
            </Card>
          </Block>
        </>}
      />

      {/* 好きなものは候補から選ぶ。候補に無いものは自由に入れられる（profile-19） */}
      <AddModal kind={adding} onClose={() => setAdding(null)} />
      {st.saveError ? <Txt size={13} weight="bold" color={C.danger}>プロフィールを保存できませんでした</Txt> : null}
      <Card pad>
        <Row style={{ justifyContent: 'flex-end' }}>
          {/* 編集での追加・変更・削除を取り消して、保存済みの表示に戻す（profile-22） */}
          <SubButton label="キャンセル" onPress={() => update((d) => { d.draft = null; d.saveError = false; })} />
          <MainButton label={st.saving ? '保存中…' : '保存'} disabled={st.saving} onPress={save} style={{ minWidth: s(140) }} />
        </Row>
      </Card>
    </Stack>
  );
}

/* ---------- 他の人のプロフィール（あなたと同じ・フレンド申請） ---------- */

export function PersonScreen({ id }: { id?: string }) {
  const { s: st, update, go, toast, open } = useStore();
  const p = isPersonId(id) ? PEOPLE[id] : null;
  if (!p) {
    return (
      <Stack>
        <AppBar title="プロフィール" onBack={() => go('profile')} />
        <Card><Empty title="ページが見つかりません" text="アプリIDをもう一度確かめてください。" button={{ label: 'IDで探す', onPress: () => go('search-id') }} /></Card>
      </Stack>
    );
  }
  const pid = id as PersonId;
  const me = st.me;
  // あなたと同じ（profile-14）：同じゲームと相手の熱量、同じ趣味、鍵のない同じ好きなもの
  const sameGames = p.games.filter((g) => me.games.some((m) => m.tag === g.tag));
  const sameHobbies = p.hobbies.filter((h) => me.hobbies.some((m) => m.name === h.name));
  const sameLikes = p.likes.filter((l) => !l.locked && me.likes.some((m) => m.name === l.name));
  const isFriend = st.conn.friends.includes(pid);
  const sent = st.conn.sentTo.includes(pid);

  return (
    <Stack>
      <AppBar title={p.nickname} onBack={() => go('connections')} />
      <Cols
        left={<>
          <WhoCard p={p} right={isFriend ? <Txt size={12} weight="bold" color={C.ok}>フレンド</Txt> : (
            // 他の人のプロフィールから、そのままフレンド申請を送れる（profile-15）
            <PillButton label={sent ? '申請しました' : 'フレンド申請'} disabled={sent}
              onPress={() => { update((d) => { d.conn.sentTo.push(pid); }); toast('フレンド申請を送りました'); }} />
          )}>
            <Row gap={6}><Note>アプリID</Note><Txt size={14} weight="bold">{p.appId}</Txt></Row>
            <Trust value={p.trust} />
          </WhoCard>
          {sameGames.length + sameHobbies.length + sameLikes.length ? (
            <Card pad style={{ backgroundColor: C.okBg }}>
              <Stack gap={6}>
                <Txt size={12} weight="bold" color={C.ok}>あなたと同じ</Txt>
                <Row gap={6} wrap>
                  {sameGames.map((g) => <Chip key={g.tag} common label={GAMES[g.tag].name}><HeatTag value={g.heat} /></Chip>)}
                  {sameHobbies.map((h) => <Chip key={h.name} common label={h.name} />)}
                  {sameLikes.map((l) => <Chip key={l.name} common label={l.name} />)}
                </Row>
              </Stack>
            </Card>
          ) : null}
          <TimesCard times={p.times} region={p.region} />
        </>}
        right={<>
          <Block title="ゲーム">{p.games.map((g) => <GameCard key={g.tag} g={g} />)}</Block>
          <Block title="趣味">
            <Card>{p.hobbies.map((h, i) => <View key={h.name}>{i > 0 ? <Divider /> : null}<HobbyRow name={h.name} heat={h.heat} /></View>)}</Card>
          </Block>
          <Block title="好きなもの">
            <Card pad><Row gap={6} wrap>{p.likes.filter((l) => !l.locked).map((l) =>
              <Chip key={l.name} label={l.name} common={me.likes.some((m) => m.name === l.name)} />)}</Row></Card>
          </Block>
          <RightsNote onOpen={open} />
        </>}
      />
    </Stack>
  );
}

/* ---------- IDで探す ---------- */

// アプリIDを打つと、そのプロフィールが開く（profile-13）
export function SearchIdScreen() {
  const { go } = useStore();
  const [id, setId] = useState('');
  const submit = () => {
    const hit = (Object.keys(PEOPLE) as PersonId[]).find((k) => PEOPLE[k].appId === id.trim());
    go('person', { id: hit ?? id.trim() });
  };
  return (
    <Stack>
      <AppBar title="IDで探す" onBack={() => go('profile')} />
      <Card pad>
        <Stack gap={8}>
          <Note>LINEのステータスメッセージなどに書かれたアプリIDを入れると、その人のプロフィールが開きます。</Note>
          <Row>
            <Field value={id} onChangeText={setId} placeholder="例：mei" autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }} onSubmitEditing={submit} />
            <SubButton label="開く" onPress={submit} />
          </Row>
          <Note>見本：mei ・ ken_r ・ sora3</Note>
        </Stack>
      </Card>
    </Stack>
  );
}
