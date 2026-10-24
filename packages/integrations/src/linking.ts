import { callbackUrl, DiscordClient } from './discord.ts';
import { IntegrationError, response, retryDelay, type Fetcher } from './http.ts';
import { steamId } from './steam.ts';

// ADR-77/79: only verified Supabase Auth users can link accounts.
// Obtain this from trusted session middleware, never from request JSON / query parameters.
export interface Principal { userId: string; sessionId: string; kind: 'registered' }
function requirePrincipal(principal: Principal) {
  if (principal.kind !== 'registered' || !principal.userId || !principal.sessionId) throw new IntegrationError('unauthorized');
}
export type Provider = 'steam' | 'discord';
export interface LinkAttempt {
  state: string; provider: Provider; principal: Principal; returnTo: string; createdAt: number; expiresAt: number;
}
export interface LinkAttemptStore {
  put(attempt: LinkAttempt): Promise<void>;
  // Atomically return AND spend one unexpired attempt bound to provider + user + session.
  // Must be shared/durable in production. A mismatch must not consume another user's attempt.
  consume(state: string, provider: Provider, principal: Principal, now: number): Promise<LinkAttempt | null>;
}
const OP = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
const SELECT = `${NS}/identifier_select`;
function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
}
function single(params: URLSearchParams, name: string): string {
  const values = params.getAll(name);
  if (values.length !== 1 || !values[0]) throw new IntegrationError('unauthorized');
  return values[0];
}
async function begin(provider: Provider, principal: Principal, redirectUri: string, ttlMs: number, store: LinkAttemptStore, now: number) {
  requirePrincipal(principal);
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new TypeError('Valid session and positive authentication TTL required');
  const redirect = callbackUrl(redirectUri);
  if (redirect.searchParams.has('state') || [...redirect.searchParams.keys()].some(k => k.startsWith('openid.'))) throw new TypeError('Reserved callback query parameter');
  const attempt = { state: randomState(), provider, principal: { ...principal }, returnTo: redirect.href, createdAt: now, expiresAt: now + ttlMs };
  if (provider === 'steam') { redirect.searchParams.set('state', attempt.state); attempt.returnTo = redirect.href; }
  await store.put(attempt);
  return attempt;
}
function validateReturn(actual: URL, expected: string) {
  const url = new URL(expected);
  if (actual.origin !== url.origin || actual.pathname !== url.pathname || actual.hash || actual.username || actual.password) throw new IntegrationError('unauthorized');
  for (const [key, value] of url.searchParams) if (single(actual.searchParams, key) !== value) throw new IntegrationError('unauthorized');
}
async function consume(callback: URL, provider: Provider, principal: Principal, store: LinkAttemptStore, now: number) {
  requirePrincipal(principal);
  const state = single(callback.searchParams, 'state');
  const a = await store.consume(state, provider, principal, now);
  if (!a || a.principal.kind !== 'registered' || a.state !== state || a.provider !== provider || a.principal.userId !== principal.userId || a.principal.sessionId !== principal.sessionId || a.expiresAt <= now) throw new IntegrationError('unauthorized');
  validateReturn(callback, a.returnTo);
  return a;
}

export async function beginSteamLink(principal: Principal, redirectUri: string, ttlMs: number, store: LinkAttemptStore, now = Date.now()): Promise<string> {
  const a = await begin('steam', principal, redirectUri, ttlMs, store, now);
  return steamAuthorizationUrl(a.returnTo);
}

export function steamAuthorizationUrl(returnTo: string): string {
  callbackUrl(returnTo);
  const url = new URL(OP);
  url.search = new URLSearchParams({ 'openid.ns': NS, 'openid.mode': 'checkid_setup', 'openid.return_to': returnTo,
    'openid.realm': new URL(returnTo).origin + '/', 'openid.identity': SELECT, 'openid.claimed_id': SELECT }).toString();
  return url.href;
}

export async function finishSteamLink(callback: URL, principal: Principal, store: LinkAttemptStore, fetcher: Fetcher = fetch, now = Date.now()) {
  const a = await consume(callback, 'steam', principal, store, now);
  const result = await verifySteamAssertion(callback, a, fetcher, now);
  return result.status === 'cancelled' ? result : { ...result, userId: principal.userId };
}

export async function verifySteamAssertion(callback: URL, a: { returnTo: string; createdAt: number }, fetcher: Fetcher = fetch, now = Date.now()) {
  validateReturn(callback, a.returnTo);
  const p = callback.searchParams;
  if (single(p, 'openid.mode') === 'cancel') return { status: 'cancelled' as const };
  if (single(p, 'openid.ns') !== NS || single(p, 'openid.mode') !== 'id_res' || single(p, 'openid.op_endpoint') !== OP || single(p, 'openid.return_to') !== a.returnTo) throw new IntegrationError('unauthorized');
  // Only Steam's fixed identifier namespace is accepted. No user-supplied provider or discovery URL.
  const claimed = single(p, 'openid.claimed_id');
  const match = /^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]{17})$/.exec(claimed);
  if (!match?.[1] || single(p, 'openid.identity') !== claimed) throw new IntegrationError('unauthorized');
  const signed = single(p, 'openid.signed').split(',');
  for (const field of ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle']) {
    if (!signed.includes(field)) throw new IntegrationError('unauthorized');
    single(p, `openid.${field}`);
  }
  single(p, 'openid.sig');
  const nonce = single(p, 'openid.response_nonce');
  if (nonce.length > 255 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z[!-~]*$/.test(nonce)) throw new IntegrationError('unauthorized');
  const nonceAt = Date.parse(nonce.slice(0, 20));
  if (!Number.isFinite(nonceAt) || nonceAt < a.createdAt - 60_000 || nonceAt > now + 60_000) throw new IntegrationError('unauthorized');
  const body = new URLSearchParams();
  for (const [name] of p) if (name.startsWith('openid.')) body.set(name, single(p, name));
  body.set('openid.mode', 'check_authentication');
  const res = await response(OP, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }, fetcher);
  if (!res.ok) throw new IntegrationError(res.status === 429 ? 'rate_limited' : 'upstream', res.status, retryDelay(res.headers, null));
  let answer: string;
  try { answer = await res.text(); } catch { throw new IntegrationError('network'); }
  const pairs = new Map<string, string>();
  for (const line of answer.split('\n').filter(Boolean)) {
    const colon = line.indexOf(':');
    if (colon < 1 || pairs.has(line.slice(0, colon))) throw new IntegrationError('invalid_payload');
    pairs.set(line.slice(0, colon), line.slice(colon + 1));
  }
  if (pairs.get('ns') !== NS || pairs.get('is_valid') !== 'true') throw new IntegrationError('unauthorized');
  return { status: 'verified' as const, steamId: steamId(match[1]) };
}

// Optional data linking for an existing user; app sign-in uses Supabase Auth.
export async function beginDiscordLink(client: DiscordClient, principal: Principal, redirectUri: string, ttlMs: number, store: LinkAttemptStore, now = Date.now()) {
  const a = await begin('discord', principal, redirectUri, ttlMs, store, now);
  const authorization = client.authorizeUrl(a.state);
  if (new URL(authorization).searchParams.get('redirect_uri') !== a.returnTo) throw new TypeError('Discord callback configuration mismatch');
  return authorization;
}
export async function finishDiscordLink(client: DiscordClient, callback: URL, principal: Principal, store: LinkAttemptStore, now = Date.now()) {
  await consume(callback, 'discord', principal, store, now);
  if (callback.searchParams.has('iss') && single(callback.searchParams, 'iss') !== 'https://discord.com') throw new IntegrationError('unauthorized');
  if (callback.searchParams.has('error')) {
    if (single(callback.searchParams, 'error') === 'access_denied') return { status: 'cancelled' as const };
    throw new IntegrationError('unauthorized');
  }
  const tokens = await client.exchangeCode(single(callback.searchParams, 'code'));
  const user = await client.currentUser(tokens.accessToken);
  // Caller stores tokens server-side, and sends only safe connection status to the UI.
  return { status: 'verified' as const, userId: principal.userId, identity: user, tokens };
}
