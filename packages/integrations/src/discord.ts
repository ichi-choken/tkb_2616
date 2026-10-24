import { integer, json, object, text, type Fetcher, IntegrationError } from './http.ts';
export interface DiscordTokens { accessToken: string; refreshToken: string; expiresAt: string; scopes: string[] }
export function parseDiscordUser(value: unknown) {
  const u = object(value); const id = text(u.id);
  if (!/^[0-9]{1,20}$/.test(id) || BigInt(id) > (1n << 64n) - 1n || BigInt(id) === 0n) throw new IntegrationError('invalid_payload');
  // ADR-85: discard all provider profile fields, even if Discord includes them.
  return { discordId: id };
}
export function callbackUrl(raw: string): URL {
  const url = new URL(raw); const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.hash) throw new TypeError('Expected HTTPS callback URL (HTTP allowed only on localhost)');
  return url;
}
export class DiscordClient {
  #clientId: string; #secret: string; #redirect: string; #fetch: Fetcher;
  constructor(config: { clientId: string; clientSecret: string; redirectUri: string }, fetcher: Fetcher = fetch) {
    this.#clientId = text(config.clientId); this.#secret = text(config.clientSecret);
    this.#redirect = callbackUrl(config.redirectUri).href; this.#fetch = fetcher;
  }
  authorizeUrl(state: string): string {
    if (state.length < 32) throw new TypeError('Use an unpredictable state with at least 128 bits of entropy');
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: this.#clientId, response_type: 'code', redirect_uri: this.#redirect,
      scope: 'identify', state }).toString();
    return url.href;
  }
  async #tokens(params: Record<string, string>): Promise<DiscordTokens> {
    const data = object(await json('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.#clientId, client_secret: this.#secret, ...params }),
    }, this.#fetch, true));
    if (text(data.token_type).toLowerCase() !== 'bearer') throw new IntegrationError('invalid_payload');
    const scopes = text(data.scope).split(' ');
    if (!scopes.includes('identify')) throw new IntegrationError('forbidden');
    const seconds = integer(data.expires_in);
    if (seconds === 0) throw new IntegrationError('invalid_payload');
    return { accessToken: text(data.access_token), refreshToken: text(data.refresh_token), expiresAt: new Date(Date.now() + seconds * 1000).toISOString(), scopes };
  }
  // Low-level exchange: app handlers must use finishDiscordLink to check session-bound state first.
  exchangeCode(code: string): Promise<DiscordTokens> {
    return this.#tokens({ grant_type: 'authorization_code', code: text(code), redirect_uri: this.#redirect });
  }
  refresh(refreshToken: string): Promise<DiscordTokens> {
    return this.#tokens({ grant_type: 'refresh_token', refresh_token: text(refreshToken) });
  }
  async currentUser(accessToken: string) {
    return parseDiscordUser(await json('https://discord.com/api/v10/users/@me', { headers: { authorization: `Bearer ${text(accessToken)}` } }, this.#fetch));
  }
}
