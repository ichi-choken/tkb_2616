import { IntegrationError, integer, json, nullableText, object, text, type Fetcher } from './http.ts';

export interface ApiGate { acquire(): Promise<{ release(): Promise<void> }> }
export interface GameCandidate { id: number; name: string; slug: string | null; releaseYear: number | null; coverUrl: string | null; platforms: { id: number; name: string }[] }
export function parseGames(value: unknown): GameCandidate[] {
  if (!Array.isArray(value)) throw new IntegrationError('invalid_payload');
  return value.map(raw => {
    const game = object(raw);
    let coverUrl: string | null = null;
    if (game.cover != null) {
      const rawUrl = nullableText(object(game.cover).url);
      if (rawUrl) {
        try { const url = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl); if (url.protocol === 'https:' && url.hostname === 'images.igdb.com') coverUrl = url.href; } catch { /* Unusable image remains absent. */ }
      }
    }
    const releaseYear = game.first_release_date == null ? null : new Date(integer(game.first_release_date) * 1000).getUTCFullYear();
    if (releaseYear !== null && !Number.isFinite(releaseYear)) throw new IntegrationError('invalid_payload');
    if (game.platforms != null && !Array.isArray(game.platforms)) throw new IntegrationError('invalid_payload');
    return { id: integer(game.id), name: text(game.name), slug: nullableText(game.slug), releaseYear, coverUrl,
      platforms: (game.platforms as unknown[] | undefined ?? []).map(rawPlatform => { const p = object(rawPlatform); return { id: integer(p.id), name: text(p.name) }; }) };
  });
}
// The IGDB-derived columns of public.games (the data model's "タグの取り込み"). Curated columns
// (modes, needs_participant_id_default, hide_cover) are not IGDB's to fill.
export interface GameRecord { id: number; name: string; alternativeNames: string[]; platforms: string[]; coverImageId: string | null; firstReleaseDate: string | null; steamAppId: number | null }
const STEAM_CATEGORY = 1; // external_games.category "steam" (deprecated by IGDB, still documented)
function steamAppIdOf(entry: Record<string, unknown>): number | null {
  if (typeof entry.uid !== 'string' || !/^[1-9][0-9]{0,9}$/.test(entry.uid)) return null;
  const uid = Number(entry.uid);
  if (uid > 2_147_483_647) return null; // games.steam_app_id is an integer column
  let host: string | null = null;
  try { host = typeof entry.url === 'string' ? new URL(entry.url).hostname : null; } catch { /* Not a usable URL. */ }
  // The id of external_game_source for Steam is not documented, so recognise Steam by its store URL or the category.
  return host === 'store.steampowered.com' || entry.category === STEAM_CATEGORY ? uid : null;
}
export function parseGameRecord(value: unknown): GameRecord | null {
  if (!Array.isArray(value)) throw new IntegrationError('invalid_payload');
  if (value.length === 0) return null;
  const game = object(value[0]);
  const list = (raw: unknown) => {
    if (raw == null) return [];
    if (!Array.isArray(raw)) throw new IntegrationError('invalid_payload');
    return raw.map(object);
  };
  const name = text(game.name);
  // Alternative names and per-region titles both make the same tag findable (server-8). IGDB is
  // still moving executable names (game.exe) out of alternative names, so they are left out.
  const alternativeNames = [...new Set([...list(game.alternative_names), ...list(game.game_localizations)]
    .map(x => nullableText(x.name)).filter((x): x is string => x !== null && x !== name && !/\.exe$/i.test(x)))];
  const steam = list(game.external_games).map(steamAppIdOf).find(x => x !== null) ?? null;
  return { id: integer(game.id), name, alternativeNames,
    platforms: [...new Set(list(game.platforms).map(p => text(p.name)))],
    coverImageId: game.cover == null ? null : nullableText(object(game.cover).image_id),
    firstReleaseDate: game.first_release_date == null ? null : new Date(integer(game.first_release_date) * 1000).toISOString().slice(0, 10),
    steamAppId: steam };
}
function parseGameIds(value: unknown): number[] {
  if (!Array.isArray(value)) throw new IntegrationError('invalid_payload');
  return value.map(raw => integer(object(raw).game));
}
export class IgdbClient {
  #clientId: string; #secret: string; #gate: ApiGate; #fetch: Fetcher;
  #token: { value: string; expiresAt: number } | null = null;
  #pending: Promise<string> | null = null;
  constructor(config: { clientId: string; clientSecret: string }, gate: ApiGate, fetcher: Fetcher = fetch) {
    this.#clientId = text(config.clientId); this.#secret = text(config.clientSecret); this.#gate = gate; this.#fetch = fetcher;
  }
  async #accessToken(): Promise<string> {
    if (this.#token && this.#token.expiresAt > Date.now() + 60_000) return this.#token.value;
    if (this.#pending) return this.#pending;
    this.#pending = (async () => {
      const result = object(await json('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.#clientId, client_secret: this.#secret, grant_type: 'client_credentials' }) }, this.#fetch));
      const seconds = integer(result.expires_in);
      if (!seconds) throw new IntegrationError('invalid_payload');
      this.#token = { value: text(result.access_token), expiresAt: Date.now() + seconds * 1000 };
      return this.#token.value;
    })();
    try { return await this.#pending; } finally { this.#pending = null; }
  }
  async #games<T>(query: string, parse: (value: unknown) => T, endpoint = 'games'): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.#accessToken();
      const lease = await this.#gate.acquire();
      try {
        return parse(await json(`https://api.igdb.com/v4/${endpoint}`, { method: 'POST', headers: { 'Client-ID': this.#clientId, authorization: `Bearer ${token}`, 'content-type': 'text/plain' }, body: query }, this.#fetch));
      } catch (error) {
        if (attempt === 0 && error instanceof IntegrationError && error.kind === 'unauthorized') { this.#token = null; continue; }
        throw error;
      } finally { await lease.release(); }
    }
    throw new IntegrationError('unauthorized');
  }
  search(query: string, limit: number): Promise<GameCandidate[]> {
    if (!query.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new IntegrationError('invalid_payload');
    return this.#search(JSON.stringify(query.trim()), limit);
  }
  // IGDB's search covers names and whole alternative names, but not regional titles such as
  // 「スプラトゥーン3」 (game localizations) or part of an alternative name such as 「エーペックス」.
  // Look both up by "contains" too, so other names lead to the same game (server-8).
  // One search costs up to four IGDB requests; the shared gate keeps the rate limit (EXT-IGDB-5).
  async #search(quoted: string, limit: number): Promise<GameCandidate[]> {
    const fields = 'fields name,slug,first_release_date,cover.url,platforms.name;';
    const contains = `fields game; where name ~ *${quoted}*; limit ${limit};`;
    const [found, regional, alternative] = await Promise.all([
      this.#games(`search ${quoted}; ${fields} limit ${limit};`, parseGames),
      this.#games(contains, parseGameIds, 'game_localizations'),
      this.#games(contains, parseGameIds, 'alternative_names'),
    ]);
    const known = new Set(found.map(g => g.id));
    const missing = [...new Set([...regional, ...alternative])].filter(id => !known.has(id)).slice(0, limit - found.length);
    if (!missing.length) return found;
    return [...found, ...await this.#games(`where id = (${missing.join(',')}); ${fields} limit ${missing.length};`, parseGames)];
  }
  get(id: number): Promise<GameCandidate[]> {
    if (!Number.isSafeInteger(id) || id < 1) throw new IntegrationError('invalid_payload');
    return this.#games(`where id = ${id}; fields name,slug,first_release_date,cover.url,platforms.name; limit 1;`, parseGames);
  }
  // The game to save when someone chooses it (ADR-70). null when IGDB has no such game.
  record(id: number): Promise<GameRecord | null> {
    if (!Number.isSafeInteger(id) || id < 1) throw new IntegrationError('invalid_payload');
    return this.#games(`where id = ${id}; fields name,alternative_names.name,game_localizations.name,platforms.name,cover.image_id,first_release_date,external_games.uid,external_games.url,external_games.category; limit 1;`, parseGameRecord);
  }
}
