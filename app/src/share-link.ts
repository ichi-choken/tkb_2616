// 招待状のリンク。サーバーが無いデモでも開けるよう、募集の中身をアドレスに入れる。
// 開いた人の端末で募集を組み立て直し、同じゲームの合う募集と一緒に一覧に出す（list-4）
import { ENDED_LISTINGS, GAMES, LISTINGS, isGameTag, type Listing, type Person, type Profile } from './data';
import { formatWhen } from './dates';

// 公開しているデモのアドレス。招待状のリンクはここを指す
export const SHARE_BASE = 'https://ichi-choken.github.io/tkb_2616/';
export const SHARED_ID = 'R1';
// X はリンクを23文字（全角なら約12文字）として数える
const URL_WEIGHT = 12;

type Form = { game: string; when: string; time: string; need: number; platform: string; vc: string; heat: number; skill: number };

export function shareUrl(f: Form, host: Pick<Profile, 'nickname' | 'color'>) {
  const q = new URLSearchParams({
    r: '1', g: f.game, d: f.when, t: f.time, n: String(f.need), p: f.platform, v: f.vc,
    h: String(f.heat), s: String(f.skill), by: host.nickname, c: host.color.replace('#', ''),
  });
  return `${SHARE_BASE}#/list?${q.toString()}`;
}

// 招待状の長さ。リンクは中身の長さにかかわらず、決まった長さで数える
export function inviteLength(text: string) {
  return text.replace(/https?:\/\/\S+/g, '').length + URL_WEIGHT;
}

const int = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

// アドレスの引数から、リンクを貼った人の募集を作る。形が違えば null
export function parseShared(params: Record<string, string>): Listing | null {
  if (params.r !== '1' || !isGameTag(params.g)) return null;
  const need = int(params.n, 1, 99), heat = int(params.h, 0, 4), skill = int(params.s, 1, 9);
  if (need === null || heat === null || skill === null) return null;
  const nickname = (params.by ?? '').trim().slice(0, 16) || '募集した人';
  const color = /^[0-9a-fA-F]{6}$/.test(params.c ?? '') ? `#${params.c}` : '#6c5cf0';
  return {
    id: SHARED_ID, by: 'mei', game: params.g, when: formatWhen(params.d ?? '', params.t ?? ''), need,
    platform: (params.p ?? '').slice(0, 20) || 'その他', vc: (params.v ?? '').slice(0, 10) || 'あり', heat, skill,
    reasons: [], via: 'リンクから開いた募集',
    host: { nickname, appId: '', color, games: [], hobbies: [], likes: [], times: { start: '', end: '' }, region: '', trust: null },
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// 同じゲームのほかの募集。見本に無いゲームなら、リンクの募集に近いものを作る
export function othersFor(shared: Listing): Listing[] {
  const same = LISTINGS.filter((l) => l.game === shared.game);
  if (same.length) return same;
  const base = { game: shared.game, platform: shared.platform, reasons: [] };
  return [
    { ...base, id: 'S2', by: 'mei', when: '今夜 22:00〜', need: 2, vc: shared.vc, heat: shared.heat, skill: clamp(shared.skill + 1, 1, 9), via: 'Xに貼られた募集' },
    { ...base, id: 'S3', by: 'ken', when: '明日 20:00〜', need: 1, vc: '聞き専OK', heat: clamp(shared.heat + 2, 0, 4), skill: clamp(shared.skill - 2, 1, 9), via: 'Discordに貼られた募集' },
    { ...base, id: 'S4', by: 'sora', when: '週末 14:00〜', need: 3, vc: 'なし', heat: shared.heat, skill: shared.skill, via: 'アプリ内' },
  ];
}

export const endedFor = (game: string) => ENDED_LISTINGS.filter((l) => l.game === game);

// 自分のプロフィールと比べた「合う理由」と、合う順に並べるための点数
export function matchOf(l: Listing, me: Profile) {
  if (l.reasons.length) return { reasons: l.reasons, score: l.reasons.length };
  const mine = me.games.find((g) => g.tag === l.game);
  const reasons: string[] = [];
  if (mine) {
    if (Math.abs(mine.heat - l.heat) <= 1) reasons.push('熱量が近い');
    if (Math.abs(mine.skill - l.skill) <= 1) reasons.push('実力が近い');
    if (mine.platform === l.platform) reasons.push('同じ機種');
  }
  if (!reasons.length) reasons.push(`同じ${GAMES[l.game].name}`);
  const gap = mine ? Math.abs(mine.skill - l.skill) + Math.abs(mine.heat - l.heat) : 0;
  return { reasons, score: reasons.length * 10 - gap };
}

export const hostOf = (l: Listing, people: Record<string, Person>): Person => l.host ?? people[l.by];
