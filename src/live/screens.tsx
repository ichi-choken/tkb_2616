// The recruiting and joining screens on the real database. Used instead of the demo screens when
// Supabase is configured; they reuse the demo's parts so both look the same.
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Image, Platform, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useStore, type InviteParts } from '../../app/src/store';
import { C, useLayout } from '../../app/src/theme';
import { HEAT, PLATFORMS, VC, checkGameId, isTime } from '../../app/src/data';
import { UNDECIDED, formatWhen, toISO, todayISO } from '../../app/src/dates';
import { DateTimeField } from '../../app/src/DateTimeField';
import {
  AppBar, Badge, Block, Card, Cols, Divider, Empty, Field, Grid, HeatSlider, HeatTag, MainButton, MiniButton,
  Note, Opt, PillButton, Row, SkillSlider, Stack, SubButton, TextButton, Trust, Txt,
} from '../../app/src/ui';
import { InfoRow, JoinInfo } from '../../app/src/screens/Recruit';
import { saveGame, searchGames } from '../lib/games';
import { steamTrustOf, type UserSteamTrust } from '../lib/trust';
import { rememberReturn } from './return-to';
import {
  applicationsFor, applyToRecruitment, approveApplication, changeRecruitment, failureText, gameAccountIdOf, getGame,
  getRecruitment, isAccepting, isFinished, meetingFor, myApplicationFor, myApplications, myApplicationsIn, myRecruitments,
  newOpId, publishRecruitment, recruitmentsForGame, reopenWithMoreCapacity, searchSavedGames, updateMeeting, useLive, useUserId,
  type Application, type ApplicationState, type GameRow, type Meeting, type Recruitment, type RecruitmentAction,
} from './api';

type Params = { params: Record<string, string> };
type Go = ReturnType<typeof useStore>['go'];

/* ---------- Shared pieces ---------- */

const pad = (n: number) => String(n).padStart(2, '0');
// enthusiasm is 1 (ゆるい) … 5 (ガチ) in the database, HEAT is indexed 0 … 4
const heatIndex = (enthusiasm: number | null) => (enthusiasm == null ? null : enthusiasm - 1);
const coverUrl = (g: GameRow | null) => (g?.cover_image_id && !g.hide_cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover_image_id}.jpg` : null);
function whenOf(startsAt: string | null) {
  if (!startsAt) return { date: UNDECIDED, time: '' };
  const d = new Date(startsAt);
  return { date: toISO(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const whenText = (startsAt: string | null) => { const w = whenOf(startsAt); return formatWhen(w.date, w.time); };
const seatsText = (r: Recruitment) => (r.capacity == null ? '人数は決めていない' : `あと${Math.max(0, r.capacity - r.matched_count)}人`);
function statusBadge(r: Recruitment): [string, 'ok' | 'warn' | 'rest' | 'danger'] {
  if (r.status === '開催中止') return ['開催中止', 'danger'];
  if (r.status === '遊び終了') return ['遊びは終了しました', 'rest'];
  if (r.play_started_at) return ['遊んでいる最中', 'warn'];
  return [r.status === '出ている' ? '受付中' : r.status, isAccepting(r.status) ? 'ok' : 'rest'];
}
// The link anyone can open without signing in (list-1). On the web it is this page's address.
function shareUrl(recruitmentId: string) {
  const base = Platform.OS === 'web' ? `${window.location.origin}${window.location.pathname}` : process.env.EXPO_PUBLIC_APP_URL;
  return base ? `${base.replace(/\/$/, '')}/#/list?r=${recruitmentId}` : null;
}
type InviteFields = { when: string; time: string; need: number | null; platform: string | null; vc: string | null; skill: number; heat: number };
const ALL_PARTS: InviteParts = { when: true, need: true, platform: true, vc: true, skill: true, heat: true };
// Looks like an ordinary recruiting post with #ゲーム名募集 (recruit-8, recruit-9). No IDs, places or region (recruit-11).
function inviteText(game: GameRow, f: InviteFields, parts: InviteParts, link: string | null) {
  const lines = [`【${game.name}】一緒に遊べる人募集！`];
  const detail: string[] = [];
  if (parts.when) detail.push(formatWhen(f.when, f.time));
  if (parts.need && f.need != null) detail.push(`あと${f.need}人`);
  if (detail.length) lines.push(detail.join(' ・ '));
  const cond: string[] = [];
  if (parts.platform && f.platform) cond.push(f.platform);
  if (parts.vc && f.vc) cond.push(`VC${f.vc}`);
  if (parts.skill) cond.push(`実力${f.skill}`);
  if (parts.heat) cond.push(`熱量：${HEAT[f.heat]}`);
  if (cond.length) lines.push(cond.join(' / '));
  lines.push(`#${game.name.replace(/\s/g, '')}募集`);
  lines.push(link ?? '（公開するとリンクが入ります）');
  return lines.join('\n');
}
// X counts every link as 23 characters
const xLength = (text: string, link: string | null) => text.length - (link ?? '（公開するとリンクが入ります）').length + 23;
function inviteOf(r: Recruitment) {
  const w = whenOf(r.starts_at);
  const fields = { when: w.date, time: w.time, need: r.capacity == null ? null : Math.max(0, r.capacity - r.matched_count), platform: r.platform, vc: r.voice_chat, skill: r.skill ?? 5, heat: heatIndex(r.enthusiasm) ?? 2 };
  return r.games ? inviteText(r.games, fields, { ...ALL_PARTS, skill: r.skill != null, heat: r.enthusiasm != null }, shareUrl(r.id)) : null;
}

function askLogin(go: Go, toast: (m: string) => void) {
  rememberReturn();
  toast('ログインすると、続けられます');
  go('settings');
}

function GameArt({ game, size = 44 }: { game: GameRow | null; size?: number }) {
  const { s } = useLayout();
  const url = coverUrl(game);
  // The cover tells which game it is; nothing is drawn over it (app-12)
  return (
    <View style={{ width: s(size), height: s(size * 4 / 3), borderRadius: s(5), overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
      {url ? <Image source={{ uri: url }} accessibilityLabel={`${game?.name ?? ''}のカバー画像`} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        : <Feather name="image" size={s(18)} color={C.muted} />}
    </View>
  );
}
function NameDot({ name }: { name: string }) {
  const { s } = useLayout();
  return (
    <View style={{ width: s(32), height: s(32), borderRadius: s(16), backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={14} weight="bold" color={C.accent}>{name.slice(0, 1)}</Txt>
    </View>
  );
}
// Game data comes from IGDB, which asks to be credited (EXT-IGDB-2)
function IgdbNote() {
  const { open } = useStore();
  return <TextButton label="ゲームの名前と画像：IGDB.com" onPress={() => open('https://www.igdb.com/')} />;
}
function Loading({ error, what, onRetry }: { error: boolean; what: string; onRetry: () => void }) {
  return error
    ? <Card><Empty title={`${what}を読み込めませんでした`} text="" button={{ label: 'もう一度読み込む', onPress: onRetry }} /></Card>
    : <Card pad><Note>読み込んでいます…</Note></Card>;
}
function LoginCard({ text }: { text: string }) {
  const { go, toast } = useStore();
  return <Card><Empty title="ログインが要ります" text={text} button={{ label: 'ログインする', onPress: () => askLogin(go, toast) }} /></Card>;
}

function trustLabel(u: UserSteamTrust) {
  if (u.status === 'private' || u.status === 'unavailable') return 'Steam連携（非公開）';
  const parts = ['Steam連携'];
  if (u.accountYears != null) parts.push(`${u.accountYears}年`);
  if (u.level != null) parts.push(`Lv${u.level}`);
  const g = u.games[0];
  if (g?.owned) parts.push(g.playtimeMinutes != null ? `${Math.floor(g.playtimeMinutes / 60)}時間` : '持っている');
  return parts.join('・');
}
// Trust indicators of the people shown (list-9, requests-1). Without a Steam link nothing is returned.
function useTrust(userIds: string[], gameId: number | null) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const key = `${[...new Set(userIds)].sort().join(',')}:${gameId ?? ''}`;
  useEffect(() => {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    let active = true;
    steamTrustOf(ids, gameId == null ? [] : [gameId])
      .then(users => { if (active) setLabels(Object.fromEntries(users.map(u => [u.userId, trustLabel(u)]))); })
      .catch(() => { /* Trust stays unknown; the rest of the screen still works. */ });
    return () => { active = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return labels;
}

// One operation id per action until the server answers, so a resend never publishes twice (recruit-18)
function useOperation() {
  const op = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(send: (opId: string) => Promise<T>): Promise<T | null> => {
    if (op.current && busy) return null;
    op.current ??= newOpId();
    setBusy(true);
    try {
      const result = await send(op.current);
      op.current = null;
      return result;
    } finally { setBusy(false); }
  }, [busy]);
  const reset = useCallback(() => { op.current = null; }, []);
  return { run, busy, reset };
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  const { s } = useLayout();
  return (
    <Row gap={8} style={{ alignItems: 'flex-start', padding: s(12) }}>
      <Txt size={12} weight="bold" color={C.muted} style={{ width: s(64), paddingTop: s(4) }}>{label}</Txt>
      <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>{children}</Stack>
    </Row>
  );
}
function Choice<T extends string>({ items, value, onChange, none }: { items: readonly T[]; value: T | null; onChange: (v: T | null) => void; none: string }) {
  return (
    <Row gap={6} wrap>
      <Opt label={none} on={value === null} onPress={() => onChange(null)} />
      {items.map(x => <Opt key={x} label={x} on={value === x} onPress={() => onChange(x)} />)}
    </Row>
  );
}
function RecruitmentRow({ r, right }: { r: Recruitment; right?: React.ReactNode }) {
  const { s } = useLayout();
  const [label, tone] = statusBadge(r);
  return (
    <Row gap={10} style={{ padding: s(12) }}>
      <GameArt game={r.games} />
      <Stack gap={2} style={{ flex: 1 }}>
        <Txt size={16} weight="bold">{r.games?.name ?? 'ゲーム'}</Txt>
        <Note>{whenText(r.starts_at)} ・ {seatsText(r)} ・ 成立 {r.matched_count}人</Note>
      </Stack>
      <Stack gap={6} style={{ alignItems: 'flex-end' }}><Badge label={label} tone={tone} />{right}</Stack>
    </Row>
  );
}

/* ---------- 募集 tab: my recruitments and the ones I asked to join ---------- */

const STATE_LABEL: Record<ApplicationState, [string, 'ok' | 'warn' | 'rest' | 'danger']> = {
  待っている: ['承認待ち', 'warn'], 成立: ['成立済み', 'ok'], 終了: ['終了', 'rest'], 辞退: ['辞退済み', 'rest'],
  開催中止: ['開催中止', 'danger'], 遊び終了: ['遊び終了', 'rest'],
};

function RecruitHome() {
  const { go } = useStore();
  const uid = useUserId();
  const [data, setData] = useState<{ mine: Recruitment[]; joined: Application[] } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const [mine, joined] = await Promise.all([myRecruitments(uid), myApplications(uid)]);
      setData({ mine, joined }); setError(false);
    } catch { setError(true); }
  }, [uid]);
  useLive([{ table: 'recruitments', filter: `owner_id=eq.${uid}` }, { table: 'applications', filter: `applicant_id=eq.${uid}` }], load, uid ?? '');

  const head = <AppBar title="募集" right={<MainButton label="募集を出す" onPress={() => go('create')} />} />;
  if (uid === undefined) return <Stack>{head}<Loading error={false} what="募集" onRetry={load} /></Stack>;
  if (!uid) return <Stack>{head}<LoginCard text="自分の募集と、参加した募集が出ます。募集の一覧は、ログインしなくても見られます。" /></Stack>;
  if (!data) return <Stack>{head}<Loading error={error} what="募集" onRetry={load} /></Stack>;
  return (
    <Stack>
      {head}
      <Cols
        left={<Block title="自分の募集" count={data.mine.length}>
          {data.mine.length ? <Card>{data.mine.map((r, i) => <View key={r.id}>{i > 0 ? <Divider /> : null}
            <RecruitmentRow r={r} right={<MiniButton label="管理する" onPress={() => go('requests', { r: r.id })} />} /></View>)}</Card>
            : <Card><Empty title="まだ募集を出していません" text="ゲームを選んで、募集を出せます。" button={{ label: '募集を出す', onPress: () => go('create') }} /></Card>}
        </Block>}
        right={<Block title="参加した募集" count={data.joined.length}>
          {data.joined.length ? <Card>{data.joined.map((a, i) => a.recruitments ? <View key={a.id}>{i > 0 ? <Divider /> : null}
            <RecruitmentRow r={a.recruitments} right={<Row gap={6}><Badge label={STATE_LABEL[a.state][0]} tone={STATE_LABEL[a.state][1]} /><MiniButton label="結果" onPress={() => go('matched', { r: a.recruitment_id })} /></Row>} /></View> : null)}</Card>
            : <Card><Empty title="まだ参加希望を送っていません" text="SNSに貼られた募集のリンクから、参加希望を送れます。" /></Card>}
        </Block>}
      />
    </Stack>
  );
}

/* ---------- 募集を出す ---------- */

type Candidate = { saved: GameRow } | { igdb: { id: number; name: string; releaseYear: number | null; platforms: { name: string }[] } };
const PART_LABELS: [keyof InviteParts, string][] = [['when', 'いつ'], ['need', '人数'], ['platform', '機種'], ['vc', 'VC'], ['skill', '実力'], ['heat', '熱量']];

function CreateScreen({ params }: Params) {
  const { go, toast, copy, open } = useStore();
  const { s } = useLayout();
  const uid = useUserId();
  const [game, setGame] = useState<GameRow | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');
  const [choosing, setChoosing] = useState<number | null>(null);
  const [when, setWhen] = useState(todayISO());
  const [time, setTime] = useState('21:00');
  const [need, setNeed] = useState<number | null>(3);
  const [platform, setPlatform] = useState<string | null>(null);
  const [vc, setVc] = useState<string | null>(null);
  const [heat, setHeat] = useState(2);
  const [skill, setSkill] = useState(5);
  const [needsId, setNeedsId] = useState<boolean | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  const [url, setUrl] = useState('');
  const [parts, setParts] = useState<InviteParts>(ALL_PARTS);
  const publishing = useOperation();

  const pick = (g: GameRow) => {
    setGame(g); setFound(null); setQuery(''); setMode(null);
    // Curated games come with whether a participant ID is needed (ADR-28); others are chosen by hand
    setNeedsId(g.needs_participant_id_default);
  };
  // Opened from a game: start with it selected (profile-4)
  useEffect(() => {
    const id = Number(params.game);
    if (!params.game || !Number.isSafeInteger(id)) return;
    getGame(id).then(g => { if (g) pick(g); }).catch(() => undefined);
  }, [params.game]); // eslint-disable-line react-hooks/exhaustive-deps
  // A changed form is a new operation
  useEffect(() => publishing.reset(), [game, when, time, need, platform, vc, heat, skill, needsId, mode, room, url]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true); setSearchNote('');
    const [saved, igdb] = await Promise.allSettled([searchSavedGames(q), searchGames(q, 8)]);
    const list: Candidate[] = saved.status === 'fulfilled' ? saved.value.map(g => ({ saved: g })) : [];
    const known = new Set(list.map(c => ('saved' in c ? c.saved.id : c.igdb.id)));
    if (igdb.status === 'fulfilled') for (const g of igdb.value.games) if (!known.has(g.id)) list.push({ igdb: g });
    if (saved.status === 'rejected' && igdb.status === 'rejected') setSearchNote('ゲームを検索できませんでした。もう一度検索してください');
    else if (igdb.status === 'rejected') setSearchNote('IGDBに問い合わせできませんでした。保存済みのゲームだけを出しています');
    else if (!list.length) setSearchNote('ゲームが見つかりません。別の名前でも検索できます');
    setFound(list); setSearching(false);
  };
  const choose = async (c: Candidate) => {
    if ('saved' in c) return pick(c.saved);
    if (!uid) return askLogin(go, toast);
    setChoosing(c.igdb.id);
    try { pick(await saveGame(c.igdb.id) as GameRow); }
    catch { toast('ゲームを選べませんでした。もう一度お試しください'); }
    finally { setChoosing(null); }
  };

  const fields: InviteFields = { when, time, need, platform, vc, skill, heat };
  const preview = game ? inviteText(game, fields, parts, null) : '';
  const publish = async (via: 'x' | 'threads' | 'line' | 'copy' | 'none') => {
    if (!uid) return askLogin(go, toast);
    if (!game) return toast('ゲームを選んでください');
    if (needsId === null) return toast('参加する人のIDが要るかを選んでください');
    let startsAt: Date | null = null;
    if (when !== UNDECIDED) {
      if (!isTime(time)) return toast('時刻を選んでください');
      startsAt = new Date(`${when}T${time.padStart(5, '0')}:00`);
      if (Number.isNaN(startsAt.getTime())) return toast('時刻を選んでください');
      if (startsAt.getTime() <= Date.now()) return toast('過ぎた日時は選べません');
    }
    if (/\s/.test(room.trim())) return toast('部屋番号などに空白は入れられません');
    if (url.trim() && !/^https:\/\/\S+$/.test(url.trim())) return toast('招待URLは https:// から入れてください');
    if (via === 'x' && xLength(preview, null) > 140) return toast('招待状が長すぎます。載せる項目を減らしてください');
    try {
      const result = await publishing.run(opId => publishRecruitment(opId, {
        gameId: game.id, needsParticipantId: needsId, startsAt: startsAt?.toISOString() ?? null, capacity: need,
        voiceChat: vc, skill, enthusiasm: heat + 1, mode, platform, roomCode: room.trim() || null, inviteUrl: url.trim() || null,
      }));
      if (!result) return;
      if (!result.ok) return result.reason === 'login_required' ? askLogin(go, toast) : toast(failureText(result));
      // Only a link whose publish is confirmed is shared (recruit-18)
      const link = shareUrl(result.recruitment_id);
      const text = inviteText(game, fields, parts, link);
      const encoded = encodeURIComponent(text);
      if (via === 'x') open(`https://x.com/intent/post?text=${encoded}`);
      if (via === 'threads') open(`https://www.threads.net/intent/post?text=${encoded}`);
      if (via === 'line') open(`https://line.me/R/share?text=${encoded}`);
      if (via === 'copy') await copy(text, '公開して、招待状をコピーしました');
      else toast('募集を公開しました');
      // After publishing, the requests for it open (recruit-19)
      go('requests', { r: result.recruitment_id });
    } catch { toast('募集を公開できませんでした。もう一度お試しください'); }
  };

  const gamePicker = (
    <FormRow label="ゲーム">
      {game ? <Row><GameArt game={game} size={30} /><Txt size={16} weight="bold" style={{ flex: 1 }}>{game.name}</Txt><TextButton label="変える" onPress={() => setGame(null)} /></Row> : null}
      {!game ? <>
        <Row gap={6}>
          <View style={{ flex: 1 }}><Field value={query} placeholder="ゲームの名前で探す" onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" /></View>
          <SubButton label={searching ? '探しています…' : '探す'} disabled={searching} onPress={search} />
        </Row>
        {searchNote ? <Note>{searchNote}</Note> : null}
        {found?.map(c => {
          const id = 'saved' in c ? c.saved.id : c.igdb.id;
          const name = 'saved' in c ? c.saved.name : c.igdb.name;
          const sub = 'saved' in c ? c.saved.platforms.slice(0, 3).join(' / ') : [c.igdb.releaseYear, ...c.igdb.platforms.slice(0, 3).map(p => p.name)].filter(Boolean).join(' / ');
          return <Row key={id} gap={8}>
            <Stack gap={0} style={{ flex: 1 }}><Txt size={14} weight="bold">{name}</Txt>{sub ? <Note>{sub}</Note> : null}</Stack>
            <MiniButton label={choosing === id ? '選んでいます…' : '選ぶ'} onPress={() => { if (choosing === null) void choose(c); }} />
          </Row>;
        })}
        <IgdbNote />
      </> : null}
    </FormRow>
  );

  const form = (
    <Card>
      {gamePicker}
      <Divider />
      <FormRow label="いつ">
        <Row gap={6} wrap>
          <Opt label="今日" on={when === todayISO()} onPress={() => setWhen(todayISO())} />
          <Opt label="明日" on={when === todayISO(1)} onPress={() => setWhen(todayISO(1))} />
          <Opt label="決めない" on={when === UNDECIDED} onPress={() => setWhen(UNDECIDED)} />
        </Row>
        {when !== UNDECIDED ? <Row gap={8} wrap>
          <DateTimeField mode="date" label="日付" value={when} min={todayISO()} onChange={setWhen} />
          <DateTimeField mode="time" label="時刻" value={time} onChange={setTime} />
        </Row> : <Note>締め切りはなく、募集を終えるまで残ります</Note>}
      </FormRow>
      <Divider />
      <FormRow label="人数">
        {need !== null ? <Row gap={10}>
          <SubButton label="−" onPress={() => setNeed(Math.max(1, need - 1))} />
          <Txt size={18} weight="bold">{need}</Txt><Txt>人（自分を除く）</Txt>
          <SubButton label="＋" onPress={() => setNeed(need + 1)} />
        </Row> : null}
        <Row gap={6}><Opt label="人数を決める" on={need !== null} onPress={() => setNeed(need ?? 3)} /><Opt label="決めない" on={need === null} onPress={() => setNeed(null)} /></Row>
      </FormRow>
      <Divider />
      <FormRow label="機種"><Choice items={PLATFORMS} value={platform as (typeof PLATFORMS)[number] | null} onChange={setPlatform} none="指定しない" /></FormRow>
      <Divider />
      <FormRow label="VC"><Choice items={VC} value={vc as (typeof VC)[number] | null} onChange={setVc} none="指定しない" /></FormRow>
      {game?.modes?.length ? <><Divider /><FormRow label="モード"><Choice items={game.modes} value={mode} onChange={setMode} none="指定しない" /></FormRow></> : null}
      <Divider />
      <FormRow label="熱量"><HeatTag value={heat} /><HeatSlider value={heat} onChange={setHeat} /></FormRow>
      <Divider />
      <FormRow label="実力">
        <Row gap={4}><Txt size={14} weight="bold">{skill}</Txt><Note>/ 9 ・ 大きいほど上手い</Note></Row>
        <SkillSlider value={skill} onChange={setSkill} />
      </FormRow>
      <Divider />
      <FormRow label="ID">
        <Txt size={13}>参加する人のゲーム内IDが要りますか？</Txt>
        <Row gap={6}><Opt label="要る（こちらから招待する）" on={needsId === true} onPress={() => setNeedsId(true)} /><Opt label="要らない" on={needsId === false} onPress={() => setNeedsId(false)} /></Row>
      </FormRow>
      <Divider />
      <FormRow label="入る場所">
        <Field mono value={room} placeholder="部屋番号など（後からでも入れられます）" autoCapitalize="none" onChangeText={setRoom} />
        <Field value={url} placeholder="招待URL https://…" autoCapitalize="none" onChangeText={setUrl} />
        <Note>成立した人にだけ見えます。招待状には載りません。</Note>
      </FormRow>
    </Card>
  );

  const side = (
    <>
      {uid === null ? <LoginCard text="募集を出すにはログインします。入力した内容は、この画面に残ります。" /> : null}
      <Block title="招待状" right={game ? <Note color={xLength(preview, null) > 140 ? C.danger : C.muted}>{xLength(preview, null)} / 140字</Note> : undefined}>
        <Card>
          <Row gap={6} wrap style={{ padding: s(12), paddingBottom: s(8) }}>
            <Txt size={12} weight="bold" color={C.muted}>載せる項目</Txt>
            {PART_LABELS.map(([k, label]) => <Opt key={k} label={label} on={parts[k]} onPress={() => setParts({ ...parts, [k]: !parts[k] })} />)}
          </Row>
          <View style={{ margin: s(12), marginTop: 0, padding: s(12), borderRadius: s(10), backgroundColor: C.bg }}>
            <Txt size={13}>{game ? preview : 'ゲームを選ぶと、招待状の下書きが出ます'}</Txt>
          </View>
        </Card>
      </Block>
      <Block title="公開して共有">
        <Row gap={6} wrap>
          {(['x', 'threads', 'line', 'copy'] as const).map(via => (
            <MainButton key={via} disabled={publishing.busy || !game} label={publishing.busy ? '公開しています…' : { x: '公開してXで共有', threads: '公開してThreadsで共有', line: '公開してLINEで共有', copy: '公開してコピー' }[via]}
              onPress={() => publish(via)} style={{ flexGrow: 1, flexBasis: '45%' }} />
          ))}
        </Row>
        <View style={{ alignItems: 'center', marginTop: s(6) }}><TextButton label="貼らずに出す" disabled={publishing.busy || !game} onPress={() => publish('none')} /></View>
      </Block>
    </>
  );

  return (
    <Stack>
      <AppBar title="募集を出す" onBack={() => go('recruit')} />
      <Cols even left={form} right={side} />
    </Stack>
  );
}

/* ---------- 届いた参加希望（募集する人） ---------- */

function RequestsScreen({ params }: Params) {
  const { go, toast, confirm, copy } = useStore();
  const { s } = useLayout();
  const uid = useUserId();
  const id = params.r ?? '';
  const [data, setData] = useState<{ r: Recruitment | null; apps: Application[]; meeting: Meeting | null } | null>(null);
  const [error, setError] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const approveOps = useRef<Record<string, string>>({});
  const changing = useOperation();
  const meetingOp = useOperation();
  const reopening = useOperation();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [r, apps, meeting] = await Promise.all([getRecruitment(id), applicationsFor(id), meetingFor(id)]);
      setData({ r, apps, meeting }); setError(false);
    } catch { setError(true); }
  }, [id]);
  useLive([
    { table: 'applications', filter: `recruitment_id=eq.${id}` },
    { table: 'recruitments', filter: `id=eq.${id}` },
    { table: 'recruitment_meetings', filter: `recruitment_id=eq.${id}` },
  ], load, `${id}:${uid ?? ''}`);
  const trust = useTrust(data?.apps.map(a => a.applicant_id) ?? [], data?.r?.game_id ?? null);

  const head = <AppBar title="届いた参加希望" onBack={() => go('recruit')} />;
  if (!id) return <Stack>{head}<Card><Empty title="募集を選んでください" text="" button={{ label: '自分の募集を見る', onPress: () => go('recruit') }} /></Card></Stack>;
  if (uid === null) return <Stack>{head}<LoginCard text="届いた参加希望は、募集した人だけが見られます。" /></Stack>;
  if (!data) return <Stack>{head}<Loading error={error} what="参加希望" onRetry={load} /></Stack>;
  const r = data.r;
  if (!r) return <Stack>{head}<Card><Empty title="募集が見つかりません" text="" /></Card></Stack>;
  if (r.owner_id !== uid) return <Stack>{head}<Card><Empty title="募集した人だけが管理できます" text="" button={{ label: '募集を見る', onPress: () => go('list', { r: r.id }) }} /></Card></Stack>;

  const live = !isFinished(r.status);
  const act = async (action: RecruitmentAction) => {
    if (action === 'cancel' && !(await confirm('開催を中止しますか？成立した人の画面にも、中止と出ます。'))) return;
    try {
      const res = await changing.run(opId => changeRecruitment(opId, r.id, action));
      if (res && !res.ok) toast(failureText(res));
      else if (res) toast({ close: '募集の受付を終えました', cancel: '開催を中止しました', start_play: '遊び始めました', end_play: '遊びを終えました' }[action]);
      await load();
    } catch { toast('募集の変更を確定できませんでした。もう一度お試しください'); }
  };
  const approve = async (a: Application) => {
    if (approving) return;
    setApproving(a.id);
    approveOps.current[a.id] ??= newOpId();
    try {
      const res = await approveApplication(approveOps.current[a.id]!, a.id);
      delete approveOps.current[a.id];
      // Matched is shown only once the server confirms it (requests-4)
      if (!res.ok) toast(failureText(res));
      else toast(`${nameOf(a)}さんと成立しました`);
      await load();
    } catch { toast('承認できませんでした。もう一度お試しください'); }
    finally { setApproving(null); }
  };
  const saveMeeting = async () => {
    const nextRoom = (room ?? data.meeting?.room_code ?? '').trim();
    const nextUrl = (url ?? data.meeting?.invite_url ?? '').trim();
    if (/\s/.test(nextRoom)) return toast('部屋番号などに空白は入れられません');
    if (nextUrl && !/^https:\/\/\S+$/.test(nextUrl)) return toast('招待URLは https:// から入れてください');
    try {
      // '' clears a value
      const res = await meetingOp.run(opId => updateMeeting(opId, r.id, nextRoom, nextUrl));
      if (res && !res.ok) return toast(failureText(res));
      setRoom(null); setUrl(null);
      toast('入る場所を保存しました');
      await load();
    } catch { toast('入る場所を保存できませんでした。もう一度お試しください'); }
  };
  const reopen = async () => {
    const next = capacity ?? (r.capacity ?? 0) + 1;
    try {
      const res = await reopening.run(opId => reopenWithMoreCapacity(opId, r.id, next));
      if (res && !res.ok) return toast(failureText(res));
      setCapacity(null);
      toast(`${next}人に増やして、受付を再開しました`);
      await load();
    } catch { toast('増員して受付を再開できませんでした。もう一度お試しください'); }
  };
  const invite = inviteOf(r);
  const canReopen = live && !isAccepting(r.status) && r.capacity != null;

  const manage = (
    <Stack gap={12}>
      <Card>
        <RecruitmentRow r={r} />
        {invite ? <Row gap={6} wrap style={{ paddingHorizontal: s(12), paddingBottom: s(10) }}>
          <MiniButton label="招待状をコピー" onPress={() => copy(invite, '招待状をコピーしました')} />
          <MiniButton label="一覧を見る" onPress={() => go('list', { r: r.id })} />
        </Row> : null}
        {live ? (
          // Closing, cancelling and ending play are separate operations (requests-12)
          <Row gap={6} wrap style={{ padding: s(12), paddingTop: 0 }}>
            {isAccepting(r.status) ? <SubButton label="募集の受付を終える" disabled={changing.busy} onPress={() => act('close')} /> : null}
            {!r.play_started_at ? <SubButton label="遊び始める" disabled={changing.busy} onPress={() => act('start_play')} /> : null}
            <SubButton label="遊び終える" disabled={changing.busy} onPress={() => act('end_play')} />
            <SubButton danger label="開催を中止する" disabled={changing.busy} onPress={() => act('cancel')} />
          </Row>
        ) : <Note style={{ padding: s(12), paddingTop: 0 }}>{r.status === '開催中止' ? '開催を中止しました。' : '遊びは終了しました。'}部屋番号・招待URLと参加者のゲーム内IDは表示しません。</Note>}
        {canReopen ? (
          <Row gap={8} wrap style={{ padding: s(12), paddingTop: 0 }}>
            <SubButton label="−" onPress={() => setCapacity(Math.max((r.capacity ?? 0) + 1, (capacity ?? (r.capacity ?? 0) + 1) - 1))} />
            <Txt size={15} weight="bold">{capacity ?? (r.capacity ?? 0) + 1}人</Txt>
            <SubButton label="＋" onPress={() => setCapacity((capacity ?? (r.capacity ?? 0) + 1) + 1)} />
            <PillButton label={reopening.busy ? '再開しています…' : '増員して受付を再開'} disabled={reopening.busy} onPress={reopen} />
          </Row>
        ) : null}
      </Card>
      {live ? <Card>
        {/* Room and invite URL can be added or changed until play ends or is cancelled (requests-25) */}
        <FormRow label="部屋番号">
          <Field mono value={room ?? data.meeting?.room_code ?? ''} placeholder="例：4821" autoCapitalize="none" onChangeText={setRoom} />
        </FormRow>
        <Divider />
        <FormRow label="招待URL">
          <Field value={url ?? data.meeting?.invite_url ?? ''} placeholder="https://…" autoCapitalize="none" onChangeText={setUrl} />
        </FormRow>
        <Row style={{ padding: s(12), paddingTop: 0, justifyContent: 'flex-end' }}>
          <PillButton label={meetingOp.busy ? '保存しています…' : '入る場所を保存'} disabled={meetingOp.busy || (room === null && url === null)} onPress={saveMeeting} />
        </Row>
      </Card> : null}
    </Stack>
  );

  const list = (
    <Block title="参加希望" count={data.apps.length}>
      {data.apps.length ? data.apps.map(a => {
        const [label, tone] = STATE_LABEL[a.state];
        const gameId = gameAccountIdOf(a);
        return (
          <Card pad key={a.id}>
            <Stack gap={8}>
              <Row gap={10}><NameDot name={nameOf(a)} /><Txt size={16} weight="bold" style={{ flex: 1 }}>{nameOf(a)}</Txt><Badge label={label} tone={tone} /></Row>
              <Row gap={10} wrap>
                {a.platform ? <Note>{a.platform}</Note> : null}{a.voice_chat ? <Note>VC{a.voice_chat}</Note> : null}
                {a.skill != null ? <Note>実力 {a.skill}</Note> : null}{a.enthusiasm != null ? <HeatTag value={heatIndex(a.enthusiasm)!} /> : null}
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Trust value={trust[a.applicant_id]} />
                {/* There is no button to turn someone down (requests-5) */}
                {a.state === '待っている' ? <PillButton ok label={approving === a.id ? '承認しています…' : '承認'} disabled={!isAccepting(r.status) || approving !== null} onPress={() => approve(a)} /> : null}
              </Row>
              {a.state === '成立' && r.needs_participant_id && gameId ? (
                <InfoRow label="ゲーム内ID" value={gameId} action={<MiniButton label="コピー" onPress={() => copy(gameId, 'コピーしました')} />} />
              ) : null}
            </Stack>
          </Card>
        );
      }) : <Card><Empty title="参加希望はまだ届いていません" text="招待状をSNSに貼ると、届きやすくなります。" /></Card>}
    </Block>
  );

  return <Stack>{head}<Cols left={manage} right={list} /></Stack>;
}
// The nickname if set, otherwise the in-game ID (requests-3)
const nameOf = (a: Application) => a.profiles?.nickname || gameAccountIdOf(a) || '名前なし';

/* ---------- 募集一覧（参加する人） ---------- */

function ListScreen({ params }: Params) {
  const { go, open } = useStore();
  const uid = useUserId();
  const first = params.r ?? null;
  const [data, setData] = useState<{ gameId: number | null; items: Recruitment[]; mine: Record<string, Application> } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      let gameId = params.game && Number.isSafeInteger(Number(params.game)) ? Number(params.game) : null;
      if (first) gameId = (await getRecruitment(first))?.game_id ?? gameId;
      const items = gameId == null ? [] : await recruitmentsForGame(gameId, first);
      const mine = uid ? await myApplicationsIn(uid, items.map(r => r.id)) : [];
      setData({ gameId, items, mine: Object.fromEntries(mine.map(a => [a.recruitment_id, a])) }); setError(false);
    } catch { setError(true); }
  }, [first, params.game, uid]);
  useLive([{ table: 'recruitments', filter: data?.gameId != null ? `game_id=eq.${data.gameId}` : undefined }], load, `${first ?? ''}:${params.game ?? ''}:${uid ?? ''}:${data?.gameId ?? ''}`);
  const trust = useTrust(data?.items.map(r => r.owner_id) ?? [], data?.gameId ?? null);

  if (!data) return <Stack><AppBar title="募集一覧" /><Loading error={error} what="募集" onRetry={load} /></Stack>;
  const game = data.items[0]?.games ?? null;
  if (!data.items.length) return <Stack><AppBar title="募集一覧" /><Card><Empty title="このゲームの募集はまだありません" text="自分で募集を出すこともできます。" button={{ label: '募集を出す', onPress: () => go('create', data.gameId != null ? { game: String(data.gameId) } : undefined) }} /></Card></Stack>;
  const pinned = first ? data.items.find(r => r.id === first) ?? null : null;
  const rest = data.items.filter(r => r !== pinned);
  const openOnes = rest.filter(r => isAccepting(r.status));
  // Finished recruitments are listed separately below (list-11)
  const ended = rest.filter(r => !isAccepting(r.status));
  const card = (r: Recruitment, pin = false) => <ListingCard key={r.id} r={r} pinned={pin} uid={uid} mine={data.mine[r.id]} trust={trust[r.owner_id]} />;

  return (
    <Stack>
      <AppBar title={`${game?.name ?? 'ゲーム'}の募集`} lead={<GameArt game={game} size={26} />} right={<Badge label={`${openOnes.length + (pinned && isAccepting(pinned.status) ? 1 : 0)}件`} tone="ok" />} />
      <Note>登録しなくても見られます。「参加したい」を押すときはログインします。</Note>
      {/* The pressed link's recruitment comes first (list-4) */}
      {pinned ? <Block title="押した募集"><Grid>{[card(pinned, true)]}</Grid></Block> : null}
      <Block title={pinned ? '同じゲームのほかの募集' : '今出ている募集'}>
        {openOnes.length ? <Grid>{openOnes.map(r => card(r))}</Grid> : <Card><Empty title="このゲームの募集はまだありません" text="自分で募集を出すこともできます。" /></Card>}
      </Block>
      <Block title="終わった募集">
        {ended.length ? <Grid>{ended.map(r => card(r))}</Grid> : <Card><Empty title="終わった募集はありません" text="" /></Card>}
      </Block>
      <Card pad>
        <Stack gap={8} style={{ alignItems: 'center' }}>
          <Note>合う募集がない？</Note>
          <SubButton label="自分も募集を出す" onPress={() => go('create', data.gameId != null ? { game: String(data.gameId) } : undefined)} />
        </Stack>
      </Card>
      <TextButton label="ゲームの名前と画像：IGDB.com" onPress={() => open('https://www.igdb.com/')} />
    </Stack>
  );
}

function ListingCard({ r, pinned, uid, mine, trust }: { r: Recruitment; pinned: boolean; uid: string | null | undefined; mine: Application | undefined; trust: string | undefined }) {
  const { go, toast } = useStore();
  const [opened, setOpened] = useState(false);
  const [gameId, setGameId] = useState('');
  const [touched, setTouched] = useState(false);
  const applying = useOperation();
  const err = touched && r.needs_participant_id ? checkGameId(gameId) : '';
  const heat = heatIndex(r.enthusiasm);
  const owner = r.profiles?.nickname || '名前なし';

  const send = async () => {
    if (!uid) return askLogin(go, toast);
    if (r.needs_participant_id) { setTouched(true); if (checkGameId(gameId)) return; }
    try {
      const res = await applying.run(opId => applyToRecruitment(opId, r.id, r.needs_participant_id ? gameId : null));
      if (!res) return;
      if (!res.ok) return res.reason === 'login_required' ? askLogin(go, toast) : toast(failureText(res));
      toast('参加希望を送りました');
      go('matched', { r: r.id });
    } catch { toast('参加希望を送れませんでした。もう一度お試しください'); }
  };

  let action: React.ReactNode;
  if (uid && r.owner_id === uid) action = <SubButton label="自分の募集を管理" onPress={() => go('requests', { r: r.id })} />;
  else if (mine) action = <Row gap={6}><Badge label={STATE_LABEL[mine.state][0]} tone={STATE_LABEL[mine.state][1]} /><MiniButton label="結果を見る" onPress={() => go('matched', { r: r.id })} /></Row>;
  else if (!isAccepting(r.status)) action = <Badge label={statusBadge(r)[0]} tone="rest" />;
  else if (!opened) action = <PillButton label="参加したい" onPress={() => (uid ? setOpened(true) : askLogin(go, toast))} />;

  return (
    <Card pad style={pinned ? { borderWidth: 2, borderColor: C.accent } : !isAccepting(r.status) ? { opacity: 0.8 } : undefined}>
      <Stack gap={8}>
        <Row gap={10}><NameDot name={owner} /><Txt size={15} weight="bold" style={{ flex: 1 }}>{owner}</Txt></Row>
        <Txt size={17} weight="bold">{whenText(r.starts_at)} ・ {seatsText(r)}</Txt>
        {/* Each recruitment shows its conditions and trust indicators (list-9) */}
        <Row gap={10} wrap>
          {r.platform ? <Note>{r.platform}</Note> : null}{r.voice_chat ? <Note>VC{r.voice_chat}</Note> : null}
          {r.mode ? <Note>{r.mode}</Note> : null}{r.skill != null ? <Note>実力 {r.skill}</Note> : null}{heat != null ? <HeatTag value={heat} /> : null}
        </Row>
        <Row style={{ justifyContent: 'space-between' }}><Trust value={trust} />{action}</Row>
        {opened && !mine ? (
          <Stack gap={8}>
            <Divider />
            {r.needs_participant_id ? <>
              {/* A participant ID is entered when the recruitment needs one (list-14) */}
              <Txt size={12} weight="bold" color={C.muted}>ゲーム内ID（フレンドコードなど）</Txt>
              <Field mono value={gameId} placeholder="英数字だけ" autoCapitalize="none" autoCorrect={false} onChangeText={v => setGameId(v.trim())} onSubmitEditing={send} />
              <Note color={C.warn}>SNSと同じ名前を使っていませんか？</Note>
              {err ? <Txt size={13} weight="bold" color={C.danger}>{err}</Txt> : null}
              <Note>ゲーム内IDは、承認されたときだけ相手に見えます。</Note>
            </> : <Note>この募集は、募集した人が入れる部屋番号などで入ります。ゲーム内IDは要りません。</Note>}
            <Row>
              <MainButton label={applying.busy ? '送っています…' : '参加希望を送る'} disabled={applying.busy} onPress={send} style={{ flex: 1 }} />
              <TextButton label="やめる" disabled={applying.busy} onPress={() => setOpened(false)} />
            </Row>
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}

/* ---------- 参加の結果（参加する人） ---------- */

function MatchedScreen({ params }: Params) {
  const { go } = useStore();
  const { s } = useLayout();
  const uid = useUserId();
  const id = params.r ?? '';
  const [data, setData] = useState<{ r: Recruitment | null; app: Application | null; meeting: Meeting | null } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    if (!id || !uid) return;
    try {
      const [r, app, meeting] = await Promise.all([getRecruitment(id), myApplicationFor(id, uid), meetingFor(id)]);
      setData({ r, app, meeting }); setError(false);
    } catch { setError(true); }
  }, [id, uid]);
  // Approval switches this screen in place (matched-8); reopening shows the latest result (matched-9)
  useLive([
    { table: 'applications', filter: `recruitment_id=eq.${id}` },
    { table: 'recruitments', filter: `id=eq.${id}` },
    { table: 'recruitment_meetings', filter: `recruitment_id=eq.${id}` },
  ], load, `${id}:${uid ?? ''}`);

  const head = <AppBar title="参加の結果" onBack={() => go('recruit')} />;
  const frame = (children: React.ReactNode) => <Stack style={{ maxWidth: s(720), width: '100%', alignSelf: 'center' }}>{head}{children}</Stack>;
  if (!id) return frame(<Card><Empty title="募集を選んでください" text="" button={{ label: '参加した募集を見る', onPress: () => go('recruit') }} /></Card>);
  if (uid === null) return frame(<LoginCard text="参加の結果は、参加希望を送った人だけが見られます。" />);
  if (!data) return frame(<Loading error={error} what="参加の結果" onRetry={load} />);
  const { r, app, meeting } = data;
  if (!r) return frame(<Card><Empty title="募集が見つかりません" text="" /></Card>);
  if (!app) return frame(<Card><Empty title="この募集には、まだ参加希望を送っていません" text="" button={{ label: '募集を見る', onPress: () => go('list', { r: r.id }) }} /></Card>);

  const status = (icon: keyof typeof Feather.glyphMap, title: string, tone: 'ok' | 'rest' | 'warn') => (
    <Row gap={10}>
      <Feather name={icon} size={s(24)} color={{ ok: C.ok, rest: C.rest, warn: C.warn }[tone]} />
      <Txt size={17} weight="bold" color={tone === 'ok' ? C.ok : C.ink}>{title}</Txt>
    </Row>
  );
  const others = <View style={{ alignItems: 'center' }}><SubButton label="同じゲームの募集を見る" onPress={() => go('list', { r: r.id })} /></View>;
  const own = gameAccountIdOf(app);
  let body: React.ReactNode;
  if (app.state === '待っている') {
    body = <><Card pad><Stack gap={8}>
      {status('clock', '承認を待っています', 'warn')}
      <Note>承認されると、この画面がその場で切り替わります。閉じても、同じリンクを開き直せば結果が出ます。</Note>
    </Stack></Card>{others}</>;
  } else if (app.state === '開催中止') {
    // No room or IDs after a cancel (matched-14)
    body = <><Card pad><Stack gap={8}>
      {status('x-circle', 'この募集の開催は中止されました', 'rest')}
      <Note>部屋番号・招待リンクは表示しません。同じゲームの今出ている募集から探せます。</Note>
    </Stack></Card>{others}</>;
  } else if (app.state === '遊び終了') {
    // Nor after play has ended (matched-21)
    body = <Card pad><Stack gap={8}>
      {status('check-circle', '遊びは終了しました', 'rest')}
      <Note>部屋番号・招待URL・ゲーム内IDは、もう表示しません。</Note>
    </Stack></Card>;
  } else if (app.state === '成立') {
    const room = meeting?.room_code ?? '';
    const url = meeting?.invite_url ?? '';
    body = <Card pad style={{ borderWidth: 2, borderColor: C.ok }}><Stack gap={10}>
      {status('check', r.play_started_at ? '遊んでいる最中' : '成立しました', 'ok')}
      {/* What shows depends on the recruitment: the place, the participant's ID, or both (matched-1, matched-3) */}
      {room || url ? <JoinInfo room={room} url={url} /> : null}
      {r.needs_participant_id ? <>
        <Note>募集した人が、あなたのゲーム内IDに招待を送ります。</Note>
        {own ? <InfoRow label="あなたのID" value={own} /> : null}
      </> : !room && !url ? <Note>入る場所を待っています。募集した人が入れると、その場で切り替わります。</Note> : null}
    </Stack></Card>;
  } else {
    body = <><Card pad><Stack gap={8}>
      {status('x-circle', app.state === '辞退' ? '辞退しました' : 'この募集は受付を終えました', 'rest')}
      <Note>同じゲームの今出ている募集から探せます。</Note>
    </Stack></Card>{others}</>;
  }

  return frame(<>
    <Card pad><Row gap={10}><GameArt game={r.games} /><Stack gap={2}><Txt size={16} weight="bold">{r.games?.name ?? 'ゲーム'}</Txt><Note>{r.profiles?.nickname || '名前なし'}の募集 ・ {whenText(r.starts_at)}</Note></Stack></Row></Card>
    {body}
  </>);
}

export type LiveScreens = Partial<Record<'recruit' | 'create' | 'requests' | 'list' | 'matched', ComponentType<Params>>>;
export const liveScreens: LiveScreens = {
  recruit: RecruitHome, create: CreateScreen, requests: RequestsScreen, list: ListScreen, matched: MatchedScreen,
};
