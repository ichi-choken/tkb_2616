// アプリの状態を、この端末に自動で残す（家計簿アプリのように、閉じて開き直しても前の続きから使える）。
// サーバーができるまでのデモ用。プロフィールは profile-storage.ts が別に残す。残すのは保存が済んだものだけで、編集中の下書きや、押している途中の状態は残さない
import { GAMES, LISTINGS, type Game, type GameTag } from './data';
import { readItem, removeItem, writeItem } from './deviceStorage';
import type { State } from './store';

const KEY = 'shumitomo:state:v1';

type Saved = {
  v: 1;
  savedAt: string;
  state: Pick<State, 'role' | 'rec' | 'par' | 'conn'>;
  // 自分で足したゲーム（custom: から始まる目印）。これが無いと、開き直したときにゲームの名前が分からなくなる
  customGames: Record<GameTag, Game>;
};

let lastSavedAt: string | null = null;
let canSave = true;
// 最後に保存した時刻と、この端末に保存できているか（設定の画面に出す）
export const savedInfo = () => ({ lastSavedAt, canSave });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// 残っていれば、それを最初の状態に重ねる。壊れていたり形が違ったりすれば、見本の状態のまま始める
export function loadSaved(fresh: State): State {
  const raw = readItem(KEY);
  if (!raw) return fresh;
  let saved: Saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return fresh;
  }
  if (!isObj(saved) || saved.v !== 1 || !isObj(saved.state)) return fresh;

  if (isObj(saved.customGames)) {
    for (const [tag, g] of Object.entries(saved.customGames)) {
      if (tag.startsWith('custom:') && isObj(g) && typeof g.name === 'string') GAMES[tag] = g as Game;
    }
  }

  const st = saved.state;
  // 後から足した欄は、見本の値で埋まるように重ねる
  const next: State = {
    ...fresh,
    role: st.role === 'par' ? 'par' : 'rec',
    rec: isObj(st.rec) ? { ...fresh.rec, ...st.rec } : fresh.rec,
    par: isObj(st.par) ? { ...fresh.par, ...st.par } : fresh.par,
    conn: isObj(st.conn) ? { ...fresh.conn, ...st.conn } : fresh.conn,
  };

  // 名前の分からなくなったゲームは外す
  if (!(next.rec.form.game in GAMES)) next.rec = fresh.rec;
  if (!LISTINGS.some((l) => l.id === next.par.listing)) next.par.listing = fresh.par.listing;

  // 押している途中・編集の途中の状態は持ち越さない
  next.rec.busy = false;
  next.rec.requests = next.rec.requests.map((q) => ({ ...q, busy: false }));
  if (next.rec.editing) {
    next.rec.form = next.rec.saved ?? next.rec.form;
    next.rec.editing = false;
    next.rec.saved = null;
  }
  next.par.openJoin = null;
  next.par.idTouched = false;

  lastSavedAt = typeof saved.savedAt === 'string' ? saved.savedAt : null;
  return next;
}

export function saveState(s: State) {
  const customGames: Record<GameTag, Game> = {};
  for (const [tag, g] of Object.entries(GAMES)) if (tag.startsWith('custom:')) customGames[tag] = g;
  const savedAt = new Date().toISOString();
  const data: Saved = {
    v: 1,
    savedAt,
    // 編集の途中なら、公開済みの内容（rec.saved）のほうを残す
    state: { role: s.role, rec: s.rec.editing && s.rec.saved ? { ...s.rec, form: s.rec.saved, editing: false, saved: null } : s.rec, par: s.par, conn: s.conn },
    customGames,
  };
  canSave = writeItem(KEY, JSON.stringify(data));
  if (canSave) lastSavedAt = savedAt;
  return canSave;
}

// 「最初から」：この端末に残したものも消す
export function clearSaved() {
  removeItem(KEY);
  for (const tag of Object.keys(GAMES)) if (tag.startsWith('custom:')) delete GAMES[tag];
  lastSavedAt = null;
}
