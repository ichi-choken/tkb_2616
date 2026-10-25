// プロフィールは端末内に保存。募集などの共有操作は引き続きデモ。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createProfileRepository } from './profile-storage';
import * as Clipboard from 'expo-clipboard';
import { formatWhen, todayISO } from './dates';
import { clearSaved, loadSaved, saveState } from './saved';
import {
  GAMES, HEAT, LISTINGS, ME, SAMPLE_REQUESTS,
  type GameTag, type MyGame, type PersonId, type Profile,
} from './data';

export type RouteName =
  | 'profile' | 'person' | 'search-id'
  | 'create' | 'requests' | 'list' | 'matched'
  | 'connections' | 'settings';
export type Route = { name: RouteName | 'recruit'; params?: Record<string, string> };
export type Tab = 'profile' | 'recruit' | 'connections';
export const ROUTE_TAB: Record<RouteName, Tab> = {
  profile: 'profile', person: 'profile', 'search-id': 'profile',
  create: 'recruit', requests: 'recruit', list: 'recruit', matched: 'recruit',
  connections: 'connections',
  settings: 'profile',
};

export type RecruitForm = {
  game: GameTag;
  when: string;
  time: string;
  need: number;
  platform: string;
  vc: string;
  heat: number;
  skill: number;
  saveToProfile: boolean;
};
export type InviteParts = Record<'when' | 'need' | 'platform' | 'vc' | 'skill' | 'heat', boolean>;
export type RecStatus = 'open' | 'closed' | 'playing' | 'ended' | 'canceled';
export type Request = {
  id: string; person: PersonId; gameId: string; via: string; reasons: string[];
  status: 'pending' | 'matched'; busy?: boolean;
};
export type ParResult = 'waiting' | 'matched' | 'playing' | 'ended' | 'canceled';
export type Notice =
  | { kind: 'recruit'; from: PersonId; game: GameTag; text: string; done: boolean }
  | { kind: 'heat'; from: PersonId; game: GameTag; text: string; done: boolean }
  // 募集の参加履歴。par：相手の募集に自分が参加した、rec：自分の募集に相手が参加した
  | { kind: 'joined'; id: string; side: 'par' | 'rec'; from: PersonId; game: GameTag; when: string; result: ParResult };

// 参加履歴を知らせの先頭に残す。同じ募集なら、結果だけ書き換える
export function logJoin(d: State, e: Omit<Extract<Notice, { kind: 'joined' }>, 'kind'>) {
  const old = d.conn.notices.find((n) => n.kind === 'joined' && n.id === e.id);
  if (old && old.kind === 'joined') Object.assign(old, e);
  else d.conn.notices.unshift({ kind: 'joined', ...e });
}

export type State = {
  role: 'rec' | 'par';
  route: Route;
  me: Profile;
  draft: Profile | null;
  saving: boolean;
  saveError: boolean;
  rec: {
    stage: 'draft' | 'posted';
    form: RecruitForm;
    saved: RecruitForm | null;
    parts: InviteParts;
    status: RecStatus;
    room: string;
    inviteUrl: string;
    roomDraft: string;
    inviteDraft: string;
    editing: boolean;
    busy: boolean;
    requests: Request[];
    keep: Partial<Record<PersonId, boolean>>;
  };
  par: {
    sent: boolean;
    openJoin: string | null;
    listing: string;
    gameId: string;
    idTouched: boolean;
    saveToProfile: boolean;
    result: ParResult;
    keep: boolean | null;
    friendAdded: boolean;
  };
  conn: {
    incoming: { from: PersonId; via: string; reasons: string[] }[];
    notices: Notice[];
    friends: PersonId[];
    sentTo: PersonId[];
  };
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function newRecruitForm(tag: GameTag, games: MyGame[] = ME.games): RecruitForm {
  const g = games.find((x) => x.tag === tag);
  return {
    game: tag, when: todayISO(), time: '21:00', need: 3,
    platform: g ? g.platform : 'Switch', vc: 'あり',
    heat: g ? g.heat : 2, skill: g ? g.skill : 5, saveToProfile: false,
  };
}

function freshState(route: Route = { name: 'profile' }): State {
  return {
    role: 'rec',
    route,
    me: clone(ME),
    draft: null,
    saving: false,
    saveError: false,
    rec: {
      stage: 'draft',
      form: newRecruitForm('apex'),
      saved: null,
      parts: { when: true, need: true, platform: true, vc: true, skill: true, heat: true },
      status: 'open',
      room: '', inviteUrl: '', roomDraft: '', inviteDraft: '',
      editing: false,
      busy: false,
      requests: [],
      keep: {},
    },
    par: {
      sent: false, openJoin: null, listing: 'L1', gameId: '', idTouched: false,
      saveToProfile: false, result: 'waiting', keep: null, friendAdded: false,
    },
    conn: {
      incoming: [{ from: 'sora', via: 'アプリIDから', reasons: ['同じスプラトゥーン3', '同じ地方'] }],
      notices: [
        { kind: 'recruit', from: 'mei', game: 'splatoon3', text: '今夜 21:00〜 あと2人', done: false },
        { kind: 'heat', from: 'ken', game: 'masterduel', text: '熱量が「ゆるめ」→「普通」に変わりました', done: false },
        { kind: 'joined', id: 'par:E1', side: 'par', from: 'ken', game: 'apex', when: '昨日 21:00〜', result: 'ended' },
      ],
      friends: ['mei', 'ken'],
      sentTo: [],
    },
  };
}

// 保存をまねる。サーバーができたら fetch に置き換える
export const fakeSave = () => new Promise<void>((resolve) => setTimeout(resolve, 450));

/* ---------- ウェブでは #/画面?引数 をアドレスに出す（戻るボタンとリンクのため） ---------- */

function routeToHash(route: Route) {
  const q = route.params ? new URLSearchParams(route.params).toString() : '';
  return `#/${route.name}${q ? `?${q}` : ''}`;
}
function hashToRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const names: Route['name'][] = ['profile', 'person', 'search-id', 'create', 'requests', 'list', 'matched', 'connections', 'settings', 'recruit'];
  return names.includes(path as Route['name']) ? { name: path as Route['name'], params } : { name: 'profile' };
}
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

/* ---------- 「募集」のタブで開く画面は、そのときの立場で変わる（アプリ全体の「下のタブ」の表） ---------- */

export function resolveRoute(s: State): { name: RouteName; params: Record<string, string> } {
  const params = s.route.params ?? {};
  if (s.route.name !== 'recruit') return { name: s.route.name, params };
  if (s.role === 'rec') return { name: s.rec.stage === 'posted' ? 'requests' : 'create', params };
  return { name: s.par.sent ? 'matched' : 'list', params };
}

/* ---------- 文脈 ---------- */

type Store = {
  s: State;
  update: (fn: (draft: State) => void) => void;
  go: (name: Route['name'], params?: Record<string, string>) => void;
  toast: (message: string) => void;
  toastText: string | null;
  copy: (text: string, message: string) => Promise<void>;
  open: (url: string) => void;
  confirm: (message: string) => Promise<boolean>;
  reset: () => Promise<boolean>;
  editProfile: (change: (profile: Profile) => void) => Promise<boolean>;
  saveGameToProfile: (f: Pick<RecruitForm, 'game' | 'platform' | 'heat' | 'skill'>) => Promise<boolean>;
  publish: (via: 'x' | 'threads' | 'line' | 'copy' | 'none') => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // この端末に残っていれば、前の続きから始める（saved.ts）。プロフィールは profile-storage から読む
  const [initial] = useState(() => {
    const fresh = freshState(isWeb ? hashToRoute(window.location.hash) : undefined);
    const loaded = loadSaved(fresh);
    return { state: loaded, restored: loaded !== fresh };
  });
  const restored = useRef(initial.restored);
  const [s, setS] = useState<State>(initial.state);
  const [profiles] = useState(() => createProfileRepository(AsyncStorage));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [toastText, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((fn: (draft: State) => void) => {
    setS((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
  }, []);

  const toast = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    let active = true;
    void profiles.load().then(profile => {
      if (!active) return;
      // 前の続きの募集が残っていれば、それを消さない
      update(d => { d.me = profile; if (!restored.current) d.rec.form = newRecruitForm(profile.games[0]?.tag ?? 'apex', profile.games); });
      setReady(true);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [profiles, update, loadAttempt]);

  const editProfile = useCallback(async (change: (profile: Profile) => void) => {
    try {
      const profile = await profiles.edit(change);
      update(d => { d.me = profile; });
      return true;
    } catch {
      toast('この端末に保存できませんでした。もう一度お試しください');
      return false;
    }
  }, [profiles, update, toast]);

  // 変わるたびに、この端末に残す。保存できない端末（プライベートモードなど）なら一度だけ知らせる
  const warned = useRef(false);
  useEffect(() => {
    if (!saveState(s) && !warned.current) {
      warned.current = true;
      toast('この端末には保存できません。閉じると入力が消えます');
    }
  }, [s, toast]);

  const setRoute = useCallback((route: Route) => {
    update((d) => {
      // 編集から保存せずに離れたら、公開内容には反映しない（requests-13）
      if (d.rec.editing && route.name !== 'create' && d.rec.saved) {
        d.rec.form = d.rec.saved;
        d.rec.editing = false;
        d.rec.busy = false;
      }
      d.route = route;
    });
  }, [update]);

  const go = useCallback((name: Route['name'], params?: Record<string, string>) => {
    const route = { name, params };
    if (isWeb) {
      const hash = routeToHash(route);
      if (window.location.hash !== hash) {
        window.location.hash = hash;
        return; // hashchange で setRoute する
      }
    }
    setRoute(route);
  }, [setRoute]);

  useEffect(() => {
    if (!isWeb) return;
    const onHash = () => {
      setRoute(hashToRoute(window.location.hash));
      window.scrollTo?.(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [setRoute]);

  const copy = useCallback(async (text: string, message: string) => {
    try {
      await Clipboard.setStringAsync(text);
      toast(message);
    } catch {
      toast(text);
    }
  }, [toast]);

  const open = useCallback((url: string) => {
    if (isWeb) window.open(url, '_blank', 'noopener');
    else Linking.openURL(url);
  }, []);

  const confirm = useCallback((message: string) => {
    if (isWeb) return Promise.resolve(window.confirm(message));
    return new Promise<boolean>((resolve) => {
      Alert.alert('確認', message, [
        { text: 'やめる', style: 'cancel', onPress: () => resolve(false) },
        { text: 'はい', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  }, []);

  const reset = useCallback(async () => {
    try {
      await profiles.reset();
      clearSaved();
      restored.current = false;
      setS(freshState());
      setReady(true);
      setLoadError(false);
      if (isWeb) window.location.hash = '#/profile';
      toast('保存内容を消して、最初の状態に戻しました');
      return true;
    } catch {
      toast('保存内容を消せませんでした。もう一度お試しください');
      return false;
    }
  }, [profiles, toast]);

  const saveGameToProfile = useCallback((f: Pick<RecruitForm, 'game' | 'platform' | 'heat' | 'skill'>) => {
    return editProfile(profile => {
      const game = profile.games.find(x => x.tag === f.game);
      const values = { demo: false, platform: f.platform, heat: f.heat, skill: f.skill };
      if (game) Object.assign(game, values);
      else profile.games.push({ tag: f.game, ...values });
    });
  }, [editProfile]);

  const publish = useCallback(async (via: 'x' | 'threads' | 'line' | 'copy' | 'none') => {
    const text = inviteText(s.rec.form, s.rec.parts);
    if (via === 'x' && text.length > 140) {
      toast('招待状が長すぎます。載せる項目を減らしてください');
      return;
    }
    await fakeSave();
    if (s.rec.form.saveToProfile && !(await saveGameToProfile(s.rec.form))) return;
    update((d) => {
      d.rec.stage = 'posted';
      d.rec.status = 'open';
      // 見本の参加希望が届いたことにする
      d.rec.requests = SAMPLE_REQUESTS.map((q) => ({ ...q, status: 'pending' as const }));
    });
    const encoded = encodeURIComponent(text);
    if (via === 'x') open(`https://x.com/intent/post?text=${encoded}`);
    if (via === 'threads') open(`https://www.threads.net/intent/post?text=${encoded}`);
    if (via === 'line') open(`https://line.me/R/share?text=${encoded}`);
    if (via === 'copy') await copy(text, '公開して、招待状をコピーしました');
    else toast('募集を公開しました');
    // 公開が済むと、届いた参加希望の画面が開く（recruit-19）
    go('requests');
  }, [s.rec.form, s.rec.parts, toast, update, open, copy, go, saveGameToProfile]);

  const value = useMemo<Store>(() => ({
    s, update, go, toast, toastText, copy, open, confirm, reset, editProfile, saveGameToProfile, publish,
  }), [s, update, go, toast, toastText, copy, open, confirm, reset, editProfile, saveGameToProfile, publish]);

  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: '#fff9e9' }}>
    <Text>{loadError ? '保存したプロフィールを読み込めませんでした。保存内容は上書きしていません。' : '保存したプロフィールを読み込んでいます…'}</Text>
    {loadError ? <Pressable accessibilityRole="button" onPress={() => { setLoadError(false); setLoadAttempt(value => value + 1); }} style={{ padding: 14 }}><Text>もう一度読み込む</Text></Pressable> : null}
    {loadError && toastText ? <Text accessibilityRole="alert">{toastText}</Text> : null}
    {loadError ? <Pressable accessibilityRole="button" onPress={async () => { if (await confirm('この端末のプロフィール保存内容を消して、最初から始めますか？')) await reset(); }} style={{ padding: 14 }}><Text>保存内容を消して最初から始める</Text></Pressable> : null}
  </View>;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider の外で useStore を使っている');
  return store;
}

// 招待状は普通の募集の投稿と同じ見た目で、#ゲーム名募集 が入る（recruit-8, 9）
export function inviteText(f: RecruitForm, parts: InviteParts) {
  const name = GAMES[f.game].name;
  const lines = [`【${name}】一緒に遊べる人募集！`];
  const detail: string[] = [];
  if (parts.when) detail.push(formatWhen(f.when, f.time));
  if (parts.need) detail.push(`あと${f.need}人`);
  if (detail.length) lines.push(detail.join(' ・ '));
  const cond: string[] = [];
  if (parts.platform) cond.push(f.platform);
  if (parts.vc) cond.push(`VC${f.vc}`);
  if (parts.skill) cond.push(`実力${f.skill}`);
  if (parts.heat) cond.push(`熱量：${HEAT[f.heat]}`);
  if (cond.length) lines.push(cond.join(' / '));
  lines.push(`#${name.replace(/\s/g, '')}募集`);
  lines.push('https://shumitomo.jp/r/a8k2');
  return lines.join('\n');
}

export const findListing = (id: string) => LISTINGS.find((l) => l.id === id) ?? LISTINGS[0];
