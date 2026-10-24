import { integer, json, nullableText, object, text, type Fetcher, IntegrationError } from './http.ts';

export interface SteamGame {
  appId: number;
  name: string | null;
  // API observations; missing values must never be synthesized as zero.
  playtimeMinutes: number | null;
  recentPlaytimeMinutes: number | null;
}
export type SteamLibrary =
  | { status: 'available'; source: 'steam'; fetchedAt: string; games: SteamGame[] }
  | { status: 'unavailable'; source: 'steam'; reason: 'not_visible_or_missing' };
export function steamId(value: string): string {
  if (!/^[0-9]{17}$/.test(value)) throw new TypeError('Expected a SteamID64 string');
  return value;
}
export function parseOwnedGames(value: unknown, fetchedAt: string): SteamLibrary {
  const body = object(object(value).response);
  if (body.game_count === undefined && body.games === undefined) return { status: 'unavailable', source: 'steam', reason: 'not_visible_or_missing' };
  const count = integer(body.game_count);
  if (body.games === undefined && count === 0) return { status: 'available', source: 'steam', fetchedAt, games: [] };
  if (!Array.isArray(body.games) || body.games.length !== count) throw new IntegrationError('invalid_payload');
  const games = body.games.map(raw => {
    const g = object(raw);
    return { appId: integer(g.appid), name: nullableText(g.name),
      playtimeMinutes: g.playtime_forever == null ? null : integer(g.playtime_forever),
      recentPlaytimeMinutes: g.playtime_2weeks == null ? null : integer(g.playtime_2weeks) };
  });
  return { status: 'available', source: 'steam', fetchedAt, games };
}
export class SteamClient {
  #key: string; #fetch: Fetcher;
  constructor(key: string, fetcher: Fetcher = fetch) { this.#key = text(key); this.#fetch = fetcher; }
  async #get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, 'https://api.steampowered.com');
    url.search = new URLSearchParams({ key: this.#key, ...params }).toString();
    return json(url, {}, this.#fetch);
  }
  async ownedGames(id: string): Promise<SteamLibrary> {
    const data = await this.#get('/IPlayerService/GetOwnedGames/v1/', {
      input_json: JSON.stringify({ steamid: steamId(id), include_appinfo: true, include_played_free_games: true }),
    });
    return parseOwnedGames(data, new Date().toISOString());
  }
  async profile(id: string) {
    const requested = steamId(id);
    const body = object(object(await this.#get('/ISteamUser/GetPlayerSummaries/v2/', { steamids: requested })).response);
    if (!Array.isArray(body.players)) throw new IntegrationError('invalid_payload');
    if (body.players.length === 0) return null;
    const p = body.players.map(object).find(p => p.steamid === requested);
    if (!p) throw new IntegrationError('invalid_payload');
    return { steamId: requested, displayName: text(p.personaname), avatarUrl: nullableText(p.avatarfull),
      profileUrl: `https://steamcommunity.com/profiles/${requested}/`,
      createdAt: p.timecreated == null ? null : new Date(integer(p.timecreated) * 1000).toISOString(),
      personaState: p.personastate == null ? null : integer(p.personastate), currentGameId: nullableText(p.gameid) };
  }
  async level(id: string): Promise<number | null> {
    const body = object(object(await this.#get('/IPlayerService/GetSteamLevel/v1/', { input_json: JSON.stringify({ steamid: steamId(id) }) })).response);
    return body.player_level == null ? null : integer(body.player_level);
  }
}

// Decide library visibility before reading optional profile data. A profile API failure
// must not keep old playtime visible when the library is no longer available.
export async function readSteamData(client: Pick<SteamClient, 'ownedGames' | 'profile'>, id: string) {
  const library = await client.ownedGames(id);
  if (library.status === 'unavailable') return { status: 'unavailable' as const };
  const profile = await client.profile(id);
  return { status: 'available' as const, value: { profile, library }, fetchedAt: library.fetchedAt };
}
