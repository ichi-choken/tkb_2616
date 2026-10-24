// 決まった値と見本のデータ。サーバーができたら、見本は API から取る。
// 仕様は spec/frontend-approved.md の承認済みの条件にそろえる。

// 熱量は「ゆるい〜ガチ」の5段階（ADR-33）。値は 0〜4
export const HEAT = ['ゆるい', 'ゆるめ', '普通', 'ガチめ', 'ガチ'] as const;
// 実力は全部のゲームで同じ1〜9（ADR-75）
export const SKILLS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const PLATFORMS = ['Switch', 'Switch 2', 'PlayStation', 'PC（Steam）', 'スマホ', 'その他'] as const;
// 住んでいる地方は区分だけ（ADR-30）
export const REGIONS = ['北海道・東北', '関東', '甲信越', '北陸', '東海', '近畿', '中国', '四国', '九州・沖縄'] as const;
export const VC = ['あり', '聞き専OK', 'なし'] as const;
export const WHEN = ['今夜', '明日', '週末', '未定'] as const;
// 名前・ゲーム内IDに入れられない言葉（app-24）
export const NG_WORDS = ['line', '@', 'http', 'discord.gg', 'insta'];

export type GameTag = 'splatoon3' | 'apex' | 'amongus' | 'fallguys' | 'masterduel';
export type PersonId = 'mei' | 'ken' | 'sora';

// join：room＝入る場所（部屋番号など）、id＝参加する人のゲーム内IDが要る（ADR-28）
export type Game = { name: string; join: 'room' | 'id'; colors: [string, string] };
export const GAMES: Record<GameTag, Game> = {
  splatoon3: { name: 'スプラトゥーン3', join: 'room', colors: ['#d7f205', '#5b2bd9'] },
  apex: { name: 'Apex Legends', join: 'id', colors: ['#b3261e', '#3a0d0b'] },
  amongus: { name: 'Among Us', join: 'room', colors: ['#c51111', '#132ed1'] },
  fallguys: { name: 'Fall Guys', join: 'id', colors: ['#ff6ec7', '#5ad1ff'] },
  masterduel: { name: '遊戯王 マスターデュエル', join: 'id', colors: ['#1e3a8a', '#0b1026'] },
};
export const GAME_TAGS = Object.keys(GAMES) as GameTag[];

export const LIKE_SUGGEST = ['ボカロ', '邦ロック', '少年漫画', 'SFアニメ', 'VTuber', 'ジブリ', 'K-POP', 'ポケモン'];
export const HOBBY_SUGGEST = ['カフェ巡り', 'ボードゲーム', 'TRPG', '写真', '料理', 'イラスト', '筋トレ'];

export type MyGame = {
  tag: GameTag;
  platform: string;
  heat: number;
  skill: number;
  steam?: { hours: number; updated: string };
};
export type Hobby = { name: string; heat: number };
export type Like = { name: string; locked?: boolean };
export type Profile = {
  nickname: string;
  appId: string;
  color: string;
  games: MyGame[];
  hobbies: Hobby[];
  likes: Like[];
  times: { start: string; end: string };
  region: string;
};
export type Person = Profile & { trust: string | null };

export const ME: Profile = {
  nickname: 'ゆう',
  appId: 'yu7',
  color: '#6c5cf0',
  games: [
    { tag: 'apex', platform: 'PC（Steam）', heat: 4, skill: 5, steam: { hours: 312, updated: '今日 9:12' } },
    { tag: 'splatoon3', platform: 'Switch', heat: 2, skill: 6 },
    { tag: 'fallguys', platform: 'PlayStation', heat: 1, skill: 3 },
  ],
  hobbies: [
    { name: 'カフェ巡り', heat: 4 },
    { name: 'ボードゲーム', heat: 2 },
  ],
  likes: [
    { name: 'VTuber' },
    { name: 'アイドル', locked: true },
    { name: 'ボカロ' },
    { name: '少年漫画' },
  ],
  times: { start: '21:00', end: '24:00' },
  region: '東海',
};

export const PEOPLE: Record<PersonId, Person> = {
  mei: {
    nickname: 'めい', appId: 'mei', color: '#d6336c', trust: 'Steam連携・5年',
    games: [{ tag: 'splatoon3', platform: 'Switch', heat: 4, skill: 7 }, { tag: 'apex', platform: 'PC（Steam）', heat: 0, skill: 2 }],
    hobbies: [{ name: 'カフェ巡り', heat: 4 }, { name: 'TRPG', heat: 2 }],
    likes: [{ name: 'ボカロ' }, { name: '少年漫画' }, { name: 'アイドル', locked: true }],
    times: { start: '20:00', end: '23:00' }, region: '関東',
  },
  ken: {
    nickname: 'けん', appId: 'ken_r', color: '#12855f', trust: 'Discord連携',
    games: [{ tag: 'apex', platform: 'PC（Steam）', heat: 3, skill: 6 }, { tag: 'masterduel', platform: 'PC（Steam）', heat: 2, skill: 4 }],
    hobbies: [{ name: '筋トレ', heat: 3 }],
    likes: [{ name: 'SFアニメ' }, { name: 'VTuber' }],
    times: { start: '22:00', end: '25:00' }, region: '近畿',
  },
  sora: {
    nickname: 'そら', appId: 'sora3', color: '#1c7ed6', trust: null,
    games: [{ tag: 'splatoon3', platform: 'Switch 2', heat: 3, skill: 5 }],
    hobbies: [{ name: 'イラスト', heat: 3 }],
    likes: [{ name: 'ジブリ' }, { name: 'ボカロ' }],
    times: { start: '19:00', end: '22:00' }, region: '東海',
  },
};

export type Listing = {
  id: string;
  by: PersonId;
  game: GameTag;
  when: string;
  need: number;
  platform: string;
  vc: string;
  heat: number;
  skill: number;
  reasons: string[];
  via: string;
};

// 参加する人が見る、同じゲームの募集（list-4：押したリンクの募集が一番上）
export const LISTINGS: Listing[] = [
  { id: 'L1', by: 'mei', game: 'apex', when: '今夜 21:00〜', need: 2, platform: 'PC（Steam）', vc: 'あり', heat: 3, skill: 5, reasons: ['同じ時間帯', '同じボカロ好き'], via: 'Xに貼られた募集' },
  { id: 'L2', by: 'ken', game: 'apex', when: '今夜 22:30〜', need: 1, platform: 'PC（Steam）', vc: '聞き専OK', heat: 4, skill: 6, reasons: ['熱量が近い', '実力が近い'], via: 'Discordに貼られた募集' },
  { id: 'L3', by: 'sora', game: 'apex', when: '明日 20:00〜', need: 3, platform: 'PlayStation', vc: 'なし', heat: 1, skill: 3, reasons: ['同じ地方'], via: 'アプリ内' },
];
export const ENDED_LISTINGS: Listing[] = [
  { id: 'E1', by: 'ken', game: 'apex', when: '昨日 21:00〜', need: 0, platform: 'PC（Steam）', vc: 'あり', heat: 3, skill: 5, reasons: ['熱量が近い'], via: 'LINEに貼られた募集' },
];

export const SAMPLE_REQUESTS = [
  { id: 'Q1', person: 'mei' as PersonId, gameId: 'MeiSplash22', via: 'X', reasons: ['同じ時間帯', '同じボカロ好き', '熱量が近い'] },
  { id: 'Q2', person: 'ken' as PersonId, gameId: 'kenR0811', via: 'ほかの人の招待状', reasons: ['実力が近い'] },
  { id: 'Q3', person: 'sora' as PersonId, gameId: 'sora3gm', via: 'アプリ内の検索', reasons: ['同じ地方'] },
];

// ゲーム内IDは英数字だけ（app-23）、NGワードは入れられない（app-24）
export function hasNgWord(value: string) {
  const v = value.toLowerCase();
  return NG_WORDS.some((w) => v.includes(w));
}
export function checkGameId(value: string) {
  if (!value) return 'ゲーム内IDを入れてください';
  if (!/^[A-Za-z0-9]+$/.test(value)) return '英数字だけで入れてください';
  if (hasNgWord(value)) return 'この言葉は入れられません';
  return '';
}
// いつも遊ぶ時間帯は24時間表記（ADR-35）
export const isTime = (v: string) => /^([01]?\d|2[0-9]):[0-5]\d$/.test(v);
