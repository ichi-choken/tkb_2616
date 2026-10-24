// プロフィール：自分のプロフィール、編集、他の人のプロフィール、IDで探す
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  GAMES, GAME_TAGS, HEAT, HOBBY_SUGGEST, LIKE_SUGGEST, PEOPLE, PLATFORMS, REGIONS,
  hasNgWord, isTime, type MyGame, type Person, type PersonId, type Profile,
} from '../data';
import { fakeSave, useStore } from '../store';
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
  const { s: st, update, go, copy, toast, open } = useStore();
  const p = st.me;

  // 熱量・実力はスライダーでその場で直せる（profile-5）。部品ごとに保存する（ui-1）
  const setGame = (i: number, key: 'heat' | 'skill', value: number) => {
    update((d) => { d.me.games[i][key] = value; });
    toast(key === 'heat' ? `熱量を「${HEAT[value]}」にしました` : `実力を ${value} にしました`);
  };
  const setHobbyHeat = (i: number, value: number) => {
    update((d) => { d.me.hobbies[i].heat = value; });
    toast(`熱量を「${HEAT[value]}」にしました`);
  };

  return (
    <Stack>
      <AppBar title="プロフィール" right={<MiniButton label="IDで探す" onPress={() => go('search-id')} />} />
      <Cols
        left={<>
          <WhoCard p={p} right={<SubButton label="編集" onPress={() => update((d) => { d.draft = JSON.parse(JSON.stringify(d.me)); d.saveError = false; })} />}>
            <Row gap={6} wrap>
              <Note>アプリID</Note>
              <Txt size={14} weight="bold">{p.appId}</Txt>
              <MiniButton label="リンクをコピー" onPress={() => copy(`https://shumitomo.jp/${p.appId}`, 'プロフィールのリンクをコピーしました')} />
            </Row>
          </WhoCard>
          <TimesCard times={p.times} region={p.region} />
        </>}
        right={<>
          <Block title="ゲーム" count={p.games.length}>
            {p.games.length ? p.games.map((g, i) => (
              <GameCard key={g.tag} g={g}
                onRecruit={() => { update((d) => { d.role = 'rec'; }); go('create', { game: g.tag }); }}
                onSkill={(v) => setGame(i, 'skill', v)}
                onHeat={(v) => setGame(i, 'heat', v)} />
            )) : (
              <Card><Empty title="ゲームがまだ入っていません" text="「編集」からゲームを入れると、合う募集が見つかりやすくなります。" /></Card>
            )}
          </Block>

          <Block title="趣味">
            <Card>
              {p.hobbies.length ? p.hobbies.map((h, i) => (
                <View key={h.name}>
                  {i > 0 ? <Divider /> : null}
                  <HobbyRow name={h.name} heat={h.heat} onHeat={(v) => setHobbyHeat(i, v)} />
                </View>
              )) : <Empty title="趣味がまだ入っていません" text="「編集」から入れられます。" />}
            </Card>
          </Block>

          <Block title="好きなもの" right={<Note>鍵をかけたものは自分だけに見える</Note>}>
            <Card pad>
              {p.likes.length ? (
                <Row gap={6} wrap>{p.likes.map((l) => <Chip key={l.name} label={l.name} locked={l.locked} />)}</Row>
              ) : <Empty title="好きなものがまだ入っていません" text="「編集」から入れられます。" />}
            </Card>
          </Block>
          <RightsNote onOpen={open} />
        </>}
      />
    </Stack>
  );
}

function WhoCard({ p, right, children }: { p: Profile | Person; right?: React.ReactNode; children?: React.ReactNode }) {
  const { s } = useLayout();
  return (
    <Card style={{ padding: s(14) }}>
      <Row gap={12}>
        <Avatar p={p} />
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Txt size={22} weight="display">{p.nickname}</Txt>
          {children}
        </Stack>
        {right}
      </Row>
    </Card>
  );
}

function TimesCard({ times, region }: { times: { start: string; end: string }; region: string }) {
  const { s } = useLayout();
  return (
    <Card pad>
      <Stack gap={8}>
        <Row><Note style={{ width: s(120) }}>いつも遊ぶ時間帯</Note><Txt size={14} weight="bold">{times.start}〜{times.end}</Txt></Row>
        <Row><Note style={{ width: s(120) }}>住んでいる地方</Note><Txt size={14} weight="bold">{region}</Txt></Row>
      </Stack>
    </Card>
  );
}

// ゲーム1つ。上段が実力、下段が熱量。自分のゲームなら、どちらもその場で変えられる
function GameCard({ g, onRecruit, onSkill, onHeat }: {
  g: MyGame; onRecruit?: () => void; onSkill?: (v: number) => void; onHeat?: (v: number) => void;
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
            {g.steam ? <Note>プレイ時間 {g.steam.hours}時間 ・ Steamから {g.steam.updated}に取得</Note> : null}
          </Stack>
          {onRecruit ? (
            <Pressable onPress={onRecruit} accessibilityRole="link" hitSlop={6}>
              <Row gap={2}><Txt size={13} weight="bold" color={C.accent}>募集を出す</Txt><Ionicons name="chevron-forward" size={s(16)} color={C.accent} /></Row>
            </Pressable>
          ) : null}
        </Row>
        <View style={{ gap: s(4) }}>
          <Row><Txt size={12} weight="bold" color={C.muted} style={{ width: s(40) }}>実力</Txt>
            <Txt size={14} weight="bold">{g.skill}</Txt><Note>/ 9</Note></Row>
          <SkillSlider value={g.skill} onChange={onSkill} />
        </View>
        <View style={{ gap: s(4) }}>
          <Row><Txt size={12} weight="bold" color={C.muted} style={{ width: s(40) }}>熱量</Txt><HeatTag value={g.heat} /></Row>
          <HeatSlider value={g.heat} onChange={onHeat} />
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
  const { s: st, update, toast } = useStore();
  const { s } = useLayout();
  const p = st.draft!;
  const [freeLike, setFreeLike] = useState('');
  const set = (fn: (d: NonNullable<typeof st.draft>) => void) => update((d) => { if (d.draft) fn(d.draft); });

  const save = async () => {
    if (!p.nickname.trim()) return toast('ニックネームを入れてください');
    if (hasNgWord(p.nickname) || hasNgWord(p.appId)) return toast('名前に入れられない言葉があります');
    if (!/^[A-Za-z0-9_]+$/.test(p.appId)) return toast('アプリIDは英数字と _ で入れてください');
    if (!isTime(p.times.start) || !isTime(p.times.end)) return toast('時間帯は 21:00 のように入れてください');
    update((d) => { d.saving = true; d.saveError = false; });
    await fakeSave();
    // 成功が確認できた内容を表示する（profile-23）
    update((d) => { if (d.draft) d.me = d.draft; d.draft = null; d.saving = false; });
    toast('保存しました');
  };

  const addFree = () => {
    const name = freeLike.trim();
    if (!name) return;
    if (hasNgWord(name)) return toast('この言葉は入れられません');
    set((d) => { d.likes.push({ name }); });
    setFreeLike('');
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
            {formRow('遊ぶ時間帯', <Row>
              <Field mono value={p.times.start} maxLength={5} style={{ flex: 1 }} onChangeText={(v) => set((d) => { d.times.start = v; })} />
              <Txt>〜</Txt>
              <Field mono value={p.times.end} maxLength={5} style={{ flex: 1 }} onChangeText={(v) => set((d) => { d.times.end = v; })} />
            </Row>)}
            <Divider />
            {formRow('地方', <Opts items={REGIONS} value={p.region as (typeof REGIONS)[number]} onChange={(v) => set((d) => { d.region = v; })} />)}
          </Card>
        }
        right={<>
          <Block title="ゲーム">
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
              <Row gap={6} wrap style={{ padding: s(12) }}>
                {GAME_TAGS.filter((t) => !p.games.some((g) => g.tag === t)).map((t) => (
                  <MiniButton key={t} label={`＋ ${GAMES[t].name}`} onPress={() => set((d) => { d.games.push({ tag: t, platform: PLATFORMS[0], heat: 2, skill: 5 }); })} />
                ))}
              </Row>
            </Card>
          </Block>

          <Block title="趣味">
            <Card>
              {p.hobbies.map((h, i) => (
                <View key={h.name}>
                  {i > 0 ? <Divider /> : null}
                  <Row style={{ padding: s(12) }}><Txt size={15} weight="bold" style={{ flex: 1 }}>{h.name}</Txt>
                    <TextButton danger label="削除" onPress={() => set((d) => { d.hobbies.splice(i, 1); })} /></Row>
                </View>
              ))}
              <Row gap={6} wrap style={{ padding: s(12) }}>
                {HOBBY_SUGGEST.filter((n) => !p.hobbies.some((h) => h.name === n)).map((n) => (
                  <MiniButton key={n} label={`＋ ${n}`} onPress={() => set((d) => { d.hobbies.push({ name: n, heat: 2 }); })} />
                ))}
              </Row>
            </Card>
          </Block>

          <Block title="好きなもの" right={<Note>🔒を押すと鍵をかけられる</Note>}>
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
                {/* 好きなものは候補から選ぶ。候補に無いものは自由に入れられる（profile-19） */}
                <Row gap={6} wrap>
                  {LIKE_SUGGEST.filter((n) => !p.likes.some((l) => l.name === n)).map((n) => (
                    <MiniButton key={n} label={`＋ ${n}`} onPress={() => set((d) => { d.likes.push({ name: n }); })} />
                  ))}
                </Row>
                <Row>
                  <Field value={freeLike} onChangeText={setFreeLike} placeholder="候補に無いものを入れる" maxLength={20} style={{ flex: 1 }} onSubmitEditing={addFree} />
                  <SubButton label="追加" onPress={addFree} />
                </Row>
              </Stack>
            </Card>
          </Block>
        </>}
      />

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

/* ---------- 他の人のプロフィール（あなたと同じ・つながりの申請） ---------- */

export function PersonScreen({ id }: { id?: string }) {
  const { s: st, update, go, toast, open } = useStore();
  const p = id && id in PEOPLE ? PEOPLE[id as PersonId] : null;
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
          <WhoCard p={p} right={isFriend ? <Txt size={12} weight="bold" color={C.ok}>つながり</Txt> : (
            // 他の人のプロフィールから、そのままつながりの申請を送れる（profile-15）
            <PillButton label={sent ? '申請しました' : 'つながりの申請'} disabled={sent}
              onPress={() => { update((d) => { d.conn.sentTo.push(pid); }); toast('つながりの申請を送りました'); }} />
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
