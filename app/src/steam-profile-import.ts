import { GAMES, ME, type MyGame, type Profile } from './data.ts';
import type { SteamLibrary } from '../../packages/integrations/src/steam.ts';

const platform = 'PC（Steam）';
const normalize = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase();

// Older saved profiles predate the demo marker. Only unchanged seed cards are
// migrated; real Steam IDs and manually edited cards must retain their settings.
const legacyDemo = (game: MyGame) => game.demo === undefined && !game.steam?.appId
  && ME.games.some(seed => game.tag === seed.tag && game.platform === seed.platform
    && game.heat === seed.heat && game.skill === seed.skill
    && JSON.stringify(game.steam) === JSON.stringify(seed.steam));

// Steam app IDs keep imports stable even when a title changes. Skill and enthusiasm
// are personal choices; Steam's playtime never overwrites them.
export function importSteamGames(profile: Profile, library: SteamLibrary): void {
  if (library.status !== 'available') return;
  profile.games = profile.games.filter(game => game.steam?.appId
    || !(game.demo || (!profile.steamDemoGamesCleared && legacyDemo(game))));
  profile.steamDemoGamesCleared = true;
  const seen = new Set(profile.steamImportedAppIds ?? []);
  for (const item of library.games) {
    const name = item.name?.trim() || `Steam App ${item.appId}`;
    let game = profile.games.find(game => game.steam?.appId === item.appId);
    if (!game && !seen.has(item.appId)) {
      // Keep other platforms separate. Adopt an existing PC entry only on an exact title match.
      game = profile.games.find(game => game.platform === platform && !game.steam?.appId
        && normalize(GAMES[game.tag]?.name ?? '') === normalize(name));
      if (!game) {
        const known = Object.values(GAMES).find(game => normalize(game.name) === normalize(name));
        const tag = `steam:${item.appId}`;
        GAMES[tag] = { name, join: known?.join ?? 'room', colors: known?.colors ?? ['#5b6b7a', '#273747'] };
        game = { tag, platform, heat: 2, skill: 5 };
        profile.games.push(game);
      }
    }
    if (game) {
      delete game.demo;
      game.steam = { appId: item.appId, name, hours: item.playtimeMinutes === null ? null : item.playtimeMinutes / 60, updated: library.fetchedAt };
      if (game.tag === `steam:${item.appId}`) GAMES[game.tag] = { ...GAMES[game.tag]!, name };
    }
    // A removed imported game stays removed on subsequent refreshes and reloads.
    seen.add(item.appId);
  }
  profile.steamImportedAppIds = [...seen];
}
