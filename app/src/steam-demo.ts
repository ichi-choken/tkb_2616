// （デモ）Steam連携で取れる値の見本と、それをプロフィールに取り込む処理。
// 本番では Steam Web API の所持ゲーム・プレイ時間から作る（packages/integrations/src/steam.ts）。
import type { GameTag, MyGame, Profile } from './data';

// hours・recent は時間。null は「Steamが教えてくれない」で、0時間とは区別する（server-62）
export type SteamDemoGame = { tag: GameTag; name: string; hours: number | null; recent: number | null };
export const STEAM_ACCOUNT = { years: 5, level: 23 };
export const STEAM_LIBRARY: SteamDemoGame[] = [
  { tag: 'apex', name: 'Apex Legends', hours: 312, recent: 14 },
  { tag: 'palworld', name: 'Palworld', hours: 95, recent: 0 },
  { tag: 'lethalcompany', name: 'Lethal Company', hours: 48, recent: 6 },
  { tag: 'rocketleague', name: 'Rocket League', hours: 22, recent: 1 },
  { tag: 'amongus', name: 'Among Us', hours: 0, recent: 0 },
  { tag: 'fallguys', name: 'Fall Guys', hours: null, recent: null },
];
export type SteamImport = { added: GameTag[]; updated: GameTag[] };

// 直近2週間のプレイ時間から熱量（0〜4）を推定する。本人があとから直せる
export function estimateHeat(hours: number, recent: number): number {
  if (recent >= 10) return 4;
  if (recent >= 4) return 3;
  if (recent > 0) return 2;
  return hours >= 50 ? 1 : 0;
}

// 遊んだことのあるゲームだけを取り込む。すでにあるゲームはプレイ時間だけ入れ、熱量や実力は変えない
export function importSteam(profile: Profile, at: string): SteamImport {
  const result: SteamImport = { added: [], updated: [] };
  for (const g of STEAM_LIBRARY) {
    if (!g.hours) continue;
    const recent = g.recent ?? 0;
    const steam = { hours: g.hours, recent, updated: at };
    const mine = profile.games.find((m) => m.tag === g.tag);
    if (mine) {
      mine.steam = steam;
      result.updated.push(g.tag);
    } else {
      const game: MyGame = { tag: g.tag, platform: 'PC（Steam）', heat: estimateHeat(g.hours, recent), skill: 5, steam: { ...steam, estimated: true } };
      profile.games.push(game);
      result.added.push(g.tag);
    }
  }
  return result;
}

// 自動更新の見本。最近遊んでいるゲームのプレイ時間が少し増える
export function refreshSteam(profile: Profile, at: string) {
  for (const m of profile.games) {
    if (!m.steam) continue;
    if (m.steam.recent) {
      m.steam.hours += 1;
      m.steam.recent += 1;
    }
    m.steam.updated = at;
  }
}

// 連携の解除で、Steamから入れた表示を外す（server-64）。足したゲームそのものは残す
export function clearSteam(profile: Profile) {
  for (const m of profile.games) delete m.steam;
}
