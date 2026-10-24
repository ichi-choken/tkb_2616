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
  async #games(query: string): Promise<GameCandidate[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.#accessToken();
      const lease = await this.#gate.acquire();
      try {
        return parseGames(await json('https://api.igdb.com/v4/games', { method: 'POST', headers: { 'Client-ID': this.#clientId, authorization: `Bearer ${token}`, 'content-type': 'text/plain' }, body: query }, this.#fetch));
      } catch (error) {
        if (attempt === 0 && error instanceof IntegrationError && error.kind === 'unauthorized') { this.#token = null; continue; }
        throw error;
      } finally { await lease.release(); }
    }
    throw new IntegrationError('unauthorized');
  }
  search(query: string, limit: number): Promise<GameCandidate[]> {
    if (!query.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new IntegrationError('invalid_payload');
    return this.#games(`search ${JSON.stringify(query.trim())}; fields name,slug,first_release_date,cover.url,platforms.name; limit ${limit};`);
  }
  get(id: number): Promise<GameCandidate[]> {
    if (!Number.isSafeInteger(id) || id < 1) throw new IntegrationError('invalid_payload');
    return this.#games(`where id = ${id}; fields name,slug,first_release_date,cover.url,platforms.name; limit 1;`);
  }
}
