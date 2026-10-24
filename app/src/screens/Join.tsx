// 参加する人：募集一覧、成立
import { View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ENDED_LISTINGS, GAMES, LISTINGS, PEOPLE, checkGameId, type Listing } from '../data';
import { fakeSave, findListing, logJoin, newRecruitForm, useStore } from '../store';
import { C, useLayout } from '../theme';
import {
  AppBar, Art, Avatar, Badge, Block, Card, Check, DemoButton, Divider, Empty, Field, Grid, HeatTag, MainButton,
  MiniButton, Note, PillButton, Reasons, RightsNote, Row, Stack, SubButton, TextButton, Trust, Txt,
} from '../ui';
import { InfoRow, JoinInfo, KeepRow } from './Recruit';

/* ---------- 募集一覧 ---------- */

export function ListScreen() {
  const { s: st, update, go, open } = useStore();
  const { s } = useLayout();
  const pinned = findListing(st.par.listing);
  const others = LISTINGS.filter((l) => l.id !== pinned.id);

  return (
    <Stack>
      <AppBar title={`${GAMES[pinned.game].name}の募集`} lead={<Art tag={pinned.game} size={30} />} right={<Badge label={`${LISTINGS.length}件`} tone="ok" />} />
      <Note>登録しなくても見られます。「参加したい」を押すときはログインします。</Note>

      {/* 押したリンクの募集が一番上に出る（list-4） */}
      <Block title="押した募集"><Grid>{[<ListingCard key={pinned.id} l={pinned} pinned />]}</Grid></Block>

      <Block title="同じゲームのほかの募集" right={<Note>合う順</Note>}>
        {others.length ? <Grid>{others.map((l) => <ListingCard key={l.id} l={l} />)}</Grid>
          : <Card><Empty title="このゲームの募集はまだありません" text="自分で募集を出すこともできます。" /></Card>}
      </Block>

      {/* 終わった募集は、一覧の下に別に並ぶ（list-11） */}
      <Block title="終わった募集">
        {ENDED_LISTINGS.length ? <Grid>{ENDED_LISTINGS.map((l) => <EndedCard key={l.id} l={l} />)}</Grid>
          : <Card><Empty title="終わった募集はありません" text="" /></Card>}
      </Block>

      {/* 一覧の一番下に「合う募集がない？自分も募集を出す」（list-2） */}
      <Card pad>
        <Stack gap={8} style={{ alignItems: 'center', paddingVertical: s(6) }}>
          <Note>合う募集がない？</Note>
          <SubButton label="自分も募集を出す" onPress={() => {
            update((d) => { d.role = 'rec'; d.rec.stage = 'draft'; d.rec.form = newRecruitForm(pinned.game, d.me.games); });
            go('create');
          }} />
        </Stack>
      </Card>
      <RightsNote onOpen={open} />
    </Stack>
  );
}

function ListingCard({ l, pinned }: { l: Listing; pinned?: boolean }) {
  const { s: st, update, go, toast, saveGameToProfile } = useStore();
  const p = PEOPLE[l.by];
  const par = st.par;
  const isOpen = par.openJoin === l.id;
  const needsId = GAMES[l.game].join === 'id';
  const err = isOpen && par.idTouched ? checkGameId(par.gameId) : '';

  const send = async () => {
    if (needsId) {
      update((d) => { d.par.idTouched = true; });
      if (checkGameId(par.gameId)) return;
    }
    await fakeSave();
    if (par.saveToProfile && !(await saveGameToProfile({ game: l.game, platform: l.platform, heat: l.heat, skill: l.skill }))) return;
    update((d) => {
      d.par.sent = true; d.par.listing = l.id; d.par.openJoin = null; d.par.result = 'waiting';
      logJoin(d, { id: `par:${l.id}`, side: 'par', from: l.by, game: l.game, when: l.when, result: 'waiting' });
    });
    toast('参加希望を送りました');
    go('matched');
  };

  return (
    <Card pad style={pinned ? { borderWidth: 2, borderColor: C.accent } : undefined}>
      <Stack gap={8}>
        <Row gap={10}>
          <Avatar p={p} small />
          <TextButton label={p.nickname} onPress={() => go('person', { id: l.by })} />
          <View style={{ flex: 1 }} />
          <Note>{l.via}</Note>
        </Row>
        <Txt size={17} weight="bold">{l.when} ・ あと{l.need}人</Txt>
        {/* 各募集に、募集の内容と信頼の目安が出る（list-9） */}
        <Row gap={10} wrap><Note>{l.platform}</Note><Note>VC{l.vc}</Note><Note>実力 {l.skill}</Note><HeatTag value={l.heat} /></Row>
        <Reasons items={l.reasons} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Trust value={p.trust} />
          {isOpen ? null : <PillButton label={par.sent ? '参加リクエスト済み' : '参加したい'} disabled={par.sent}
            onPress={() => update((d) => { d.par.openJoin = l.id; d.par.idTouched = false; })} />}
        </Row>
        {isOpen ? (
          <Stack gap={8}>
            <Divider />
            {needsId ? <>
              {/* 参加する人のIDが要る募集では、ゲーム内IDを入れる（list-14） */}
              <Txt size={12} weight="bold" color={C.muted}>ゲーム内ID（フレンドコードなど）</Txt>
              <Field mono value={par.gameId} placeholder="英数字だけ" autoCapitalize="none" autoCorrect={false}
                onChangeText={(v) => update((d) => { d.par.gameId = v.trim(); })} onSubmitEditing={send} />
              <Note color={C.warn}>SNSと同じ名前を使っていませんか？</Note>
              {err ? <Txt size={13} weight="bold" color={C.danger}>{err}</Txt> : null}
              <Note>ゲーム内IDは、承認されたときだけ相手に見えます。</Note>
            </> : <Note>この募集は部屋番号で入ります。ゲーム内IDは要りません。</Note>}
            <Check label="プロフィールにも保存" value={par.saveToProfile} onChange={(v) => update((d) => { d.par.saveToProfile = v; })} />
            <Row>
              <MainButton label="参加希望を送る" onPress={send} style={{ flex: 1 }} />
              <TextButton label="やめる" onPress={() => update((d) => { d.par.openJoin = null; })} />
            </Row>
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}

// 終わった募集には参加できないが、募集した人にフレンド申請を送れる（list-12）
function EndedCard({ l }: { l: Listing }) {
  const { s: st, update, toast } = useStore();
  const p = PEOPLE[l.by];
  const sent = st.conn.sentTo.includes(l.by) || st.conn.friends.includes(l.by);
  return (
    <Card pad style={{ opacity: 0.8 }}>
      <Stack gap={8}>
        <Row gap={10}><Avatar p={p} small /><Txt size={15} weight="bold" style={{ flex: 1 }}>{p.nickname}</Txt><Badge label="終了" tone="rest" /></Row>
        <Row gap={10} wrap><Note>{l.when}</Note><Note>{l.platform}</Note><HeatTag value={l.heat} /></Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Trust value={p.trust} />
          <PillButton label={sent ? '申請済み' : 'フレンド申請'} disabled={sent}
            onPress={() => { update((d) => { d.conn.sentTo.push(l.by); }); toast('フレンド申請を送りました'); }} />
        </Row>
      </Stack>
    </Card>
  );
}

/* ---------- 成立 ---------- */

export function MatchedScreen() {
  const { s: st, update, go, toast } = useStore();
  const { s } = useLayout();
  const par = st.par;
  const l = findListing(par.listing);
  const p = PEOPLE[l.by];
  const game = GAMES[l.game];
  // 結果が変わるたびに、フレンドの知らせの参加履歴も書き換える
  const setResult = (to: typeof par.result) => update((d) => {
    d.par.result = to;
    logJoin(d, { id: `par:${l.id}`, side: 'par', from: l.by, game: l.game, when: l.when, result: to });
  });

  const head = (
    <Card pad>
      <Row gap={10}><Art tag={l.game} />
        <Stack gap={2}><Txt size={16} weight="bold">{game.name}</Txt><Note>{p.nickname}の募集 ・ {l.when}</Note></Stack></Row>
    </Card>
  );

  const status = (icon: keyof typeof Feather.glyphMap, title: string, tone: 'ok' | 'rest' | 'warn') => {
    const fg = { ok: C.ok, rest: C.rest, warn: C.warn }[tone];
    return (
      <Row gap={10}>
        <Feather name={icon} size={s(24)} color={fg} />
        <Txt size={17} weight="bold" color={tone === 'ok' ? C.ok : C.ink}>{title}</Txt>
      </Row>
    );
  };

  let body: React.ReactNode;
  if (par.result === 'waiting') {
    body = <>
      <Card pad>
        <Stack gap={8}>
          {status('clock', '承認を待っています', 'warn')}
          {/* 承認されるとその場で切り替わる（matched-8）。開き直しても結果が出る（matched-9） */}
          <Note>承認されると、この画面がその場で切り替わります。閉じても、同じリンクを開き直せば結果が出ます。</Note>
          <DemoButton label="（デモ）承認された" onPress={() => setResult('matched')} />
        </Stack>
      </Card>
      <View style={{ alignItems: 'center' }}><SubButton label="ほかの募集も見る" onPress={() => go('list')} /></View>
    </>;
  } else if (par.result === 'canceled') {
    // 開催中止では、入る場所・IDを表示しない（matched-14）
    body = (
      <Card pad>
        <Stack gap={8}>
          {status('x-circle', 'この募集の開催は中止されました', 'rest')}
          <Note>部屋番号・招待リンクは表示しません。同じゲームの今出ている募集から探せます。</Note>
          <SubButton label="同じゲームの募集を見る" style={{ alignSelf: 'flex-start' }}
            onPress={() => { update((d) => { d.par.sent = false; d.par.result = 'waiting'; }); go('list'); }} />
        </Stack>
      </Card>
    );
  } else if (par.result === 'ended') {
    // 遊び終了では、入る場所・IDを表示せず、フレンドとして残すか聞く（matched-21、matched-5）
    body = <>
      <Card pad>
        <Stack gap={8}>
          {status('check-circle', '遊びは終了しました', 'rest')}
          <Note>部屋番号・招待URL・ゲーム内IDは、もう表示しません。</Note>
        </Stack>
      </Card>
      <Block title="フレンドとして残しますか？">
        <Card><KeepRow person={l.by} kept={par.keep} onKeep={(v) => {
          update((d) => { d.par.keep = v; });
          if (v) toast('相手も「残す」を選ぶと、フレンドになります');
        }} /></Card>
        <Note>お互いに「残す」を選ぶとフレンドになります。後から外したりブロックしたりできます。</Note>
      </Block>
    </>;
  } else {
    body = (
      <Card pad style={{ borderWidth: 2, borderColor: C.ok }}>
        <Stack gap={10}>
          {status('check', par.result === 'playing' ? '遊んでいる最中' : '成立しました', 'ok')}
          {/* 募集の設定に合わせて、入る場所かゲーム内IDが出る（matched-1） */}
          {game.join === 'room' ? <JoinInfo room="4821" url="" /> : <>
            <Note>募集した人が、あなたのゲーム内IDに招待を送ります。</Note>
            <InfoRow label="あなたのID" value={par.gameId} />
          </>}
          {l.platform.includes('Steam') ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <MiniButton done={par.friendAdded} label={par.friendAdded ? 'Steamでフレンド申請を送りました' : 'Steamでフレンドに追加'}
                onPress={() => update((d) => { d.par.friendAdded = true; })} />
            </View>
          ) : null}
          <Note>Steamのフレンドは、後から削除・ブロックできます。</Note>
          <Row gap={6} wrap>
            {par.result !== 'playing' ? <DemoButton label="（デモ）遊び始めた" onPress={() => setResult('playing')} /> : null}
            <DemoButton label="（デモ）遊び終わった" onPress={() => setResult('ended')} />
            <DemoButton label="（デモ）開催中止" onPress={() => setResult('canceled')} />
          </Row>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack style={{ maxWidth: s(720), width: '100%', alignSelf: 'center' }}>
      <AppBar title="参加の結果" />
      {head}
      {body}
    </Stack>
  );
}
