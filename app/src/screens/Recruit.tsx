// 募集する人：募集を出す、届いた参加希望
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GAMES, PEOPLE, PLATFORMS, SKILLS, VC, WHEN, isTime, type PersonId } from '../data';
import { fakeSave, inviteText, newRecruitForm, useStore, type InviteParts, type RecStatus, type Request, type State } from '../store';
import { createPendingSave } from '../pending-save';
import { C, useLayout } from '../theme';
import {
  AppBar, Art, Avatar, Badge, Block, Card, Check, Cols, Divider, Empty, Field, HeatSlider, MainButton,
  MiniButton, Note, Opt, Opts, PillButton, Reasons, Row, Stack, SubButton, TextButton, Trust, Txt,
} from '../ui';

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  const { s } = useLayout();
  return (
    <Row gap={8} style={{ alignItems: 'flex-start', padding: s(12) }}>
      <Txt size={12} weight="bold" color={C.muted} style={{ width: s(64), paddingTop: s(4) }}>{label}</Txt>
      <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>{children}</Stack>
    </Row>
  );
}

/* ---------- 募集を出す ---------- */

const PARTS: [keyof InviteParts, string][] = [['when', 'いつ'], ['need', '人数'], ['platform', '機種'], ['vc', 'VC'], ['skill', '実力'], ['heat', '熱量']];

// 新しい募集の下書きにする。前の募集の内容・参加希望・入る場所は持ち越さない
function startDraft(d: State, game: State['rec']['form']['game']) {
  d.rec.stage = 'draft';
  d.rec.form = newRecruitForm(game, d.me.games);
  d.rec.status = 'open';
  d.rec.requests = [];
  d.rec.keep = {};
  d.rec.room = ''; d.rec.inviteUrl = ''; d.rec.roomDraft = ''; d.rec.inviteDraft = '';
}

export function CreateScreen({ game }: { game?: string }) {
  const { s: st, update, go, toast, publish, saveGameToProfile, confirm } = useStore();
  const { s } = useLayout();
  const r = st.rec;
  const f = r.form;
  const editing = r.editing;
  const [pendingSave] = useState(createPendingSave);
  useEffect(() => () => pendingSave.cancel(), [pendingSave]);

  // プロフィールのゲームを押して来たら、そのゲームを選んだ状態で開く（profile-4）
  useEffect(() => {
    if (game && game in GAMES && !r.editing && r.stage === 'draft' && r.form.game !== game) {
      update((d) => { d.rec.form = newRecruitForm(game, d.me.games); });
    }
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  const setForm = (fn: (form: typeof f) => void) => update((d) => fn(d.rec.form));
  const invite = inviteText(f, r.parts);

  const saveEdit = async () => {
    if (pendingSave.isPending()) return;
    if (r.inviteDraft && !/^https:\/\//.test(r.inviteDraft)) return toast('招待URLは https:// から入れてください');
    if (f.when !== '未定' && !isTime(f.time)) return toast('時刻は 21:00 のように入れてください');
    try {
      await pendingSave.run(async () => {
        update((d) => { d.rec.busy = true; });
        await fakeSave();
      }, () => {
        // 画面を離れた後の待機結果からは、プロフィールも募集も更新しない。
        if (f.saveToProfile) saveGameToProfile(f);
        update((d) => {
          d.rec.room = d.rec.roomDraft.trim();
          d.rec.inviteUrl = d.rec.inviteDraft.trim();
          d.rec.editing = false;
          d.rec.saved = null;
          d.rec.busy = false;
        });
        toast(f.saveToProfile ? '募集の変更を保存し、プロフィールにも保存しました' : '募集の変更を保存しました');
        go('requests');
      });
    } catch {
      update((d) => { d.rec.busy = false; });
      toast('変更を保存できませんでした。もう一度お試しください');
    }
  };
  const cancelEdit = () => {
    if (pendingSave.isPending()) return;
    go('requests');
  };

  // 募集を出したあとに、プロフィールのゲームなどから来たとき。前の募集の内容のまま公開し直さないよう、どうするか選ぶ
  if (r.stage === 'posted' && !editing) {
    const next = (game && game in GAMES ? game : f.game) as typeof f.game;
    return (
      <Stack>
        <AppBar title="募集を出す" />
        <Card pad>
          <Stack gap={10}>
            <Txt size={16} weight="bold">出している募集があります</Txt>
            <Note>{GAMES[f.game].name}の募集を出しています。新しい募集は、前の募集の内容や参加希望を引き継がずに作ります。</Note>
            <Row gap={8} wrap>
              <SubButton label="出している募集を見る" onPress={() => go('requests')} />
              <PillButton label={`${GAMES[next].name}で新しい募集を作る`} onPress={async () => {
                if (!(await confirm(`${GAMES[f.game].name}の募集を閉じて、新しい募集を作りますか？（デモでは、出せる募集は1つです）`))) return;
                update((d) => startDraft(d, next));
              }} />
            </Row>
          </Stack>
        </Card>
      </Stack>
    );
  }

  const form = (
    <Card>
      <FormRow label="ゲーム">
        <Row><Art tag={f.game} size={36} /><Txt size={16} weight="bold">{GAMES[f.game].name}</Txt></Row>
        {editing ? null : <>
          <Row gap={6} wrap>{st.me.games.map((g) => (
            <Opt key={g.tag} label={GAMES[g.tag].name} on={g.tag === f.game} onPress={() => update((d) => { d.rec.form = newRecruitForm(g.tag, d.me.games); })} />
          ))}</Row>
          <Note>プロフィールのゲームが上に出ます</Note>
        </>}
      </FormRow>
      <Divider />
      <FormRow label="いつ">
        <Opts items={WHEN} value={f.when as (typeof WHEN)[number]} onChange={(v) => setForm((x) => { x.when = v; })} />
        {f.when !== '未定' ? <Field mono value={f.time} maxLength={5} onChangeText={(v) => setForm((x) => { x.time = v; })} /> : null}
      </FormRow>
      <Divider />
      <FormRow label="人数">
        <Row gap={10}>
          <SubButton label="−" onPress={() => setForm((x) => { x.need = Math.max(1, x.need - 1); })} />
          <Txt size={18} weight="bold">{f.need}</Txt><Txt>人（自分を除く）</Txt>
          <SubButton label="＋" onPress={() => setForm((x) => { x.need = Math.min(20, x.need + 1); })} />
        </Row>
      </FormRow>
      <Divider />
      <FormRow label="機種"><Opts items={PLATFORMS} value={f.platform as (typeof PLATFORMS)[number]} onChange={(v) => setForm((x) => { x.platform = v; })} /></FormRow>
      <Divider />
      <FormRow label="VC"><Opts items={VC} value={f.vc as (typeof VC)[number]} onChange={(v) => setForm((x) => { x.vc = v; })} /></FormRow>
      <Divider />
      <FormRow label="実力">
        <Opts items={SKILLS} value={f.skill as (typeof SKILLS)[number]} onChange={(v) => setForm((x) => { x.skill = v; })} />
        <Note>1〜9。大きいほど上手い</Note>
      </FormRow>
      <Divider />
      <FormRow label="熱量"><HeatSlider value={f.heat} onChange={(v) => setForm((x) => { x.heat = v; })} /></FormRow>
      <Divider />
      <FormRow label="保存">
        <Check label="プロフィールにも保存" value={f.saveToProfile} onChange={(v) => setForm((x) => { x.saveToProfile = v; })} />
        <Note>機種・実力・熱量を、プロフィールの{GAMES[f.game].name}にも入れます</Note>
      </FormRow>
    </Card>
  );

  const side = editing ? (
    <>
      <Card>
        <FormRow label="部屋番号">
          <Field mono value={r.roomDraft} placeholder="例：4821" keyboardType="number-pad" onChangeText={(v) => update((d) => { d.rec.roomDraft = v; })} />
        </FormRow>
        <Divider />
        <FormRow label="招待URL">
          <Field value={r.inviteDraft} placeholder="https://…" autoCapitalize="none" onChangeText={(v) => update((d) => { d.rec.inviteDraft = v; })} />
        </FormRow>
      </Card>
      <MainButton label={r.busy ? '保存中…' : '変更を保存'} disabled={r.busy} onPress={saveEdit} />
      <View style={{ alignItems: 'center' }}><TextButton label="保存せずに戻る" disabled={r.busy} onPress={cancelEdit} /></View>
    </>
  ) : (
    <>
      <Block title="招待状" right={<Note color={invite.length > 140 ? C.danger : C.muted}>{invite.length} / 140字</Note>}>
        <Card>
          <Row gap={6} wrap style={{ padding: s(12), paddingBottom: s(8) }}>
            <Txt size={12} weight="bold" color={C.muted}>載せる項目</Txt>
            {/* 載せる項目のオン・オフで、招待状のその項目が出る・消える（recruit-3） */}
            {PARTS.map(([k, label]) => <Opt key={k} label={label} on={r.parts[k]} onPress={() => update((d) => { d.rec.parts[k] = !d.rec.parts[k]; })} />)}
          </Row>
          <View style={{ margin: s(12), marginTop: 0, padding: s(12), borderRadius: s(10), backgroundColor: C.bg }}>
            <Txt size={13}>{invite}</Txt>
          </View>
        </Card>
      </Block>
      <Block title="公開して共有">
        <Row gap={6} wrap>
          <MainButton label="公開してXで共有" onPress={() => publish('x')} style={{ flexGrow: 1, flexBasis: '45%' }} />
          <MainButton label="公開してThreadsで共有" onPress={() => publish('threads')} style={{ flexGrow: 1, flexBasis: '45%' }} />
          <MainButton label="公開してLINEで共有" onPress={() => publish('line')} style={{ flexGrow: 1, flexBasis: '45%' }} />
          <MainButton label="公開してコピー" onPress={() => publish('copy')} style={{ flexGrow: 1, flexBasis: '45%' }} />
        </Row>
        <View style={{ alignItems: 'center', marginTop: s(6) }}><TextButton label="貼らずに出す" onPress={() => publish('none')} /></View>
      </Block>
    </>
  );

  return (
    <Stack>
      <AppBar title={editing ? '募集を編集' : '募集を出す'} onBack={editing && !r.busy ? cancelEdit : undefined} />
      <Cols even left={form} right={side} />
    </Stack>
  );
}

/* ---------- 届いた参加希望 ---------- */

const REC_STATUS: Record<RecStatus, [string, 'ok' | 'rest' | 'warn' | 'danger']> = {
  open: ['受付中', 'ok'],
  closed: ['受付終了', 'rest'],
  playing: ['遊んでいる最中', 'warn'],
  ended: ['遊びは終了しました', 'rest'],
  canceled: ['開催中止', 'danger'],
};

export function RequestsScreen() {
  const { s: st, update, go, toast, confirm } = useStore();
  const { s } = useLayout();
  const r = st.rec;

  if (r.stage !== 'posted') {
    return (
      <Stack>
        <AppBar title="届いた参加希望" />
        <Card><Empty title="まだ募集を出していません" text="プロフィールのゲームを押すと、募集を出せます。" button={{ label: '募集を出す', onPress: () => go('create') }} /></Card>
      </Stack>
    );
  }

  const f = r.form;
  const [label, tone] = REC_STATUS[r.status];
  const live = r.status !== 'ended' && r.status !== 'canceled';
  const matched = r.requests.filter((q) => q.status === 'matched');

  const setStatus = async (to: RecStatus) => {
    if (to === 'canceled' && !(await confirm('開催を中止しますか？参加する人に知らせが届きます。'))) return;
    await fakeSave();
    update((d) => { d.rec.status = to; });
    toast(REC_STATUS[to][0]);
  };
  const startEdit = () => {
    update((d) => {
      d.rec.editing = true;
      d.rec.saved = JSON.parse(JSON.stringify(d.rec.form));
      d.rec.roomDraft = d.rec.room;
      d.rec.inviteDraft = d.rec.inviteUrl;
    });
    go('create');
  };
  const approve = async (id: string) => {
    update((d) => { const q = d.rec.requests.find((x) => x.id === id); if (q) q.busy = true; });
    await fakeSave();
    // 成立はサーバーで確定してから表示する（requests-4）
    update((d) => { const q = d.rec.requests.find((x) => x.id === id); if (q) { q.busy = false; q.status = 'matched'; } });
    const q = r.requests.find((x) => x.id === id);
    if (q) toast(`${PEOPLE[q.person].nickname}さんと成立しました`);
  };

  const manage = (
    <Card>
      <Row gap={10} style={{ padding: s(12) }}>
        <Art tag={f.game} />
        <Stack gap={2} style={{ flex: 1 }}>
          <Txt size={16} weight="bold">{GAMES[f.game].name}</Txt>
          <Note>{f.when === '未定' ? '日時は相談' : `${f.when} ${f.time}〜`} ・ あと{f.need}人 ・ 成立 {matched.length}人</Note>
        </Stack>
        <Badge label={label} tone={tone} />
      </Row>
      {live && (r.room || r.inviteUrl) ? <View style={{ paddingHorizontal: s(12), paddingBottom: s(10) }}><JoinInfo room={r.room} url={r.inviteUrl} /></View> : null}
      {live ? (
        // 受付終了・開催中止・遊び終了を別の操作として示す（requests-12）
        <Row gap={6} wrap style={{ padding: s(12), paddingTop: 0 }}>
          <SubButton label="編集" onPress={startEdit} />
          {r.status === 'open' ? <SubButton label="募集の受付を終える" onPress={() => setStatus('closed')} /> : null}
          {r.status !== 'playing' ? <SubButton label="遊び始める" onPress={() => setStatus('playing')} /> : null}
          <SubButton label="遊び終える" onPress={() => setStatus('ended')} />
          <SubButton danger label="開催を中止する" onPress={() => setStatus('canceled')} />
        </Row>
      ) : null}
      {r.status === 'canceled' ? <Note style={{ padding: s(12), paddingTop: 0 }}>開催を中止しました。部屋番号・招待リンクと参加者のゲーム内IDは表示しません。</Note> : null}
    </Card>
  );

  const list = r.status === 'ended' ? (
    <Block title="一緒に遊んだ人">
      <Card>
        {matched.length ? matched.map((q, i) => (
          <View key={q.id}>{i > 0 ? <Divider /> : null}
            <KeepRow person={q.person} kept={r.keep[q.person]} onKeep={(v) => {
              update((d) => { d.rec.keep[q.person] = v; });
              if (v) toast('相手も「残す」を選ぶと、フレンドになります');
            }} />
          </View>
        )) : <Empty title="成立した人はいませんでした" text="次の募集を出してみましょう。" />}
      </Card>
      <Note>フレンドには、お互いに「残す」を選んだときだけなれます。後から外したりブロックしたりもできます。</Note>
    </Block>
  ) : (
    <Block title="参加希望" count={r.requests.length} right={<Note>合う順</Note>}>
      {r.requests.length ? r.requests.map((q) => (
        <RequestRow key={q.id} q={q} canApprove={live && r.status !== 'closed'} showId={r.status !== 'canceled' && GAMES[f.game].join === 'id'} onApprove={() => approve(q.id)} />
      )) : <Card><Empty title="参加希望はまだ届いていません" text="招待状をSNSに貼ると、届きやすくなります。" /></Card>}
    </Block>
  );

  return (
    <Stack>
      <AppBar title="届いた参加希望" />
      <Cols left={manage} right={list} />
    </Stack>
  );
}

// 参加希望に出るのは、名前・合う理由・信頼の目安だけ（requests-2）。断るボタンは無い（requests-5）
function RequestRow({ q, canApprove, showId, onApprove }: { q: Request; canApprove: boolean; showId: boolean; onApprove: () => void }) {
  const { copy } = useStore();
  const p = PEOPLE[q.person];
  return (
    <Card pad>
      <Stack gap={8}>
        <Row gap={10}><Avatar p={p} small /><Txt size={16} weight="bold" style={{ flex: 1 }}>{p.nickname}</Txt><Note>{q.via}から</Note></Row>
        <Reasons items={q.reasons} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Trust value={p.trust} />
          {q.status === 'matched' ? <Badge label="✓ 成立" tone="ok" />
            : <PillButton ok label={q.busy ? '承認中…' : '承認'} disabled={!canApprove || q.busy} onPress={onApprove} />}
        </Row>
        {q.status === 'matched' && showId ? (
          <InfoRow label="ゲーム内ID" value={q.gameId} action={<MiniButton label="コピー" onPress={() => copy(q.gameId, 'コピーしました')} />} />
        ) : null}
      </Stack>
    </Card>
  );
}

export function KeepRow({ person, kept, onKeep }: { person: PersonId; kept: boolean | null | undefined; onKeep: (v: boolean) => void }) {
  const { s } = useLayout();
  const p = PEOPLE[person];
  return (
    <Row gap={10} style={{ padding: s(12) }}>
      <Avatar p={p} small /><Txt size={15} weight="bold" style={{ flex: 1 }}>{p.nickname}</Txt>
      {kept === undefined || kept === null ? <>
        <PillButton label="残す" onPress={() => onKeep(true)} />
        <TextButton label="残さない" onPress={() => onKeep(false)} />
      </> : <Badge label={kept ? '残す' : '残さない'} tone={kept ? 'ok' : 'rest'} />}
    </Row>
  );
}

export function InfoRow({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  const { s } = useLayout();
  return (
    <Row gap={8} style={{ padding: s(10), borderRadius: s(10), backgroundColor: C.bg }}>
      <Txt size={12} weight="bold" color={C.muted}>{label}</Txt>
      <Txt size={17} weight="bold" style={{ flex: 1 }} numberOfLines={1}>{value}</Txt>
      {action}
    </Row>
  );
}

// 入る場所が先に出る（matched-3）。番号のコピー（matched-18）と招待リンクを開く（matched-19）
export function JoinInfo({ room, url }: { room: string; url: string }) {
  const { copy, open } = useStore();
  return (
    <Stack gap={6}>
      {room ? <InfoRow label="部屋番号" value={room} action={<MiniButton label="番号をコピー" onPress={() => copy(room, 'コピーしました')} />} /> : null}
      {url ? <InfoRow label="招待URL" value={url} action={<MiniButton label="招待リンクを開く" onPress={() => open(url)} />} /> : null}
    </Stack>
  );
}
