import { callbackUrl } from './discord.ts';
import { IntegrationError, type Fetcher } from './http.ts';
import { steamAuthorizationUrl, verifySteamAssertion } from './linking.ts';

export interface SteamLoginAttempt {
  returnTo: string; createdAt: number; redirectUri: string; state: string; challenge: string;
}
export interface SteamLoginCode { steamId: string; challenge: string; redirectUri: string }
// Only the server implements this port. Credentials are hashed before persistence.
export interface SteamLoginStore {
  putAttempt(hash: string, value: SteamLoginAttempt, expiresAt: number): Promise<void>;
  consumeAttempt(hash: string, now: number): Promise<SteamLoginAttempt | null>;
  putCode(hash: string, value: SteamLoginCode, expiresAt: number): Promise<void>;
  consumeCode(hash: string, challenge: string, redirectUri: string, now: number): Promise<SteamLoginCode | null>;
  putAccess(hash: string, steamId: string, expiresAt: number): Promise<void>;
  readAccess(hash: string, now: number): Promise<string | null>;
}
export interface SteamLoginConfig { baseUrl: string; redirectUri: string; clientId: string; clientSecret: string }
export async function credentialHash(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export async function pkceChallenge(verifier: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
function one(params: URLSearchParams, name: string): string {
  const values = params.getAll(name);
  if (values.length !== 1 || !values[0] || values[0].length > 4096) throw new IntegrationError('invalid_payload');
  return values[0];
}
function redirect(target: URL) { return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } }); }
async function constantEqual(a: string, b: string) {
  const [x, y] = await Promise.all([credentialHash(a), credentialHash(b)]);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
async function readForm(request: Request): Promise<URLSearchParams> {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new IntegrationError('invalid_payload');
  const reader = request.body?.getReader();
  if (!reader) throw new IntegrationError('invalid_payload');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 16_384) { await reader.cancel(); throw new IntegrationError('invalid_payload'); }
    chunks.push(value);
  }
  const joined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return new URLSearchParams(new TextDecoder().decode(joined));
}
async function authenticateClient(request: Request, form: URLSearchParams, config: SteamLoginConfig) {
  const header = request.headers.get('authorization');
  let id: string; let secret: string;
  if (header !== null) {
    if (!header.startsWith('Basic ') || form.has('client_id') || form.has('client_secret')) throw new IntegrationError('unauthorized');
    let decoded: string;
    try { decoded = atob(header.slice(6)); } catch { throw new IntegrationError('unauthorized'); }
    const colon = decoded.indexOf(':');
    if (colon < 1) throw new IntegrationError('unauthorized');
    try { id = decodeURIComponent(decoded.slice(0, colon)); secret = decodeURIComponent(decoded.slice(colon + 1)); }
    catch { throw new IntegrationError('unauthorized'); }
  } else { id = one(form, 'client_id'); secret = one(form, 'client_secret'); }
  if (id !== config.clientId || !await constantEqual(secret, config.clientSecret)) throw new IntegrationError('unauthorized');
}

// Steam OpenID 2.0 -> Supabase custom OAuth2. Supabase issues/refreshes the app session.
// This adapter never signs its own app JWT, invents an email, or links Steam library data.
export function createSteamLoginHandler(config: SteamLoginConfig, store: SteamLoginStore, fetcher: Fetcher = fetch, clock: () => number = Date.now) {
  const base = callbackUrl(config.baseUrl);
  const redirectUri = callbackUrl(config.redirectUri).href;
  if (base.search || base.pathname.endsWith('/') || !config.clientId || config.clientSecret.length < 32) throw new IntegrationError('configuration');
  const callbackBase = new URL(base.href + '/callback');
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url); const now = clock();
      if (url.pathname === base.pathname + '/authorize' && request.method === 'GET') {
        const p = url.searchParams;
        if (one(p, 'client_id') !== config.clientId || one(p, 'redirect_uri') !== redirectUri || one(p, 'response_type') !== 'code') throw new IntegrationError('unauthorized');
        const challenge = one(p, 'code_challenge');
        if (one(p, 'code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new IntegrationError('invalid_payload');
        const state = one(p, 'state');
        const nonce = randomToken(); const returnTo = new URL(callbackBase);
        returnTo.searchParams.set('state', nonce);
        await store.putAttempt(await credentialHash(nonce), { returnTo: returnTo.href, createdAt: now, redirectUri, state, challenge }, now + 300_000);
        return redirect(new URL(steamAuthorizationUrl(returnTo.href)));
      }
      if (url.pathname === callbackBase.pathname && request.method === 'GET') {
        const attempt = await store.consumeAttempt(await credentialHash(one(url.searchParams, 'state')), now);
        if (!attempt) throw new IntegrationError('unauthorized');
        // Use the configured public callback base when Edge is behind a gateway.
        const callback = new URL(callbackBase); callback.search = url.search;
        const result = await verifySteamAssertion(callback, attempt, fetcher, now);
        const target = new URL(attempt.redirectUri); target.searchParams.set('state', attempt.state);
        if (result.status === 'cancelled') target.searchParams.set('error', 'access_denied');
        else {
          const code = randomToken();
          await store.putCode(await credentialHash(code), { steamId: result.steamId, challenge: attempt.challenge, redirectUri: attempt.redirectUri }, now + 120_000);
          target.searchParams.set('code', code);
        }
        return redirect(target);
      }
      if (url.pathname === base.pathname + '/token' && request.method === 'POST') {
        const form = await readForm(request);
        await authenticateClient(request, form, config);
        if (one(form, 'grant_type') !== 'authorization_code' || one(form, 'redirect_uri') !== redirectUri) throw new IntegrationError('unauthorized');
        const verifier = one(form, 'code_verifier');
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new IntegrationError('unauthorized');
        const code = await store.consumeCode(await credentialHash(one(form, 'code')), await pkceChallenge(verifier), redirectUri, now);
        if (!code) return json({ error: 'invalid_grant' }, 400);
        const access = randomToken(); await store.putAccess(await credentialHash(access), code.steamId, now + 60_000);
        return json({ access_token: access, token_type: 'Bearer', expires_in: 60 });
      }
      if (url.pathname === base.pathname + '/userinfo' && request.method === 'GET') {
        const bearer = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('authorization') ?? '');
        if (!bearer) throw new IntegrationError('unauthorized');
        const id = await store.readAccess(await credentialHash(bearer[1]!), now);
        if (!id) throw new IntegrationError('unauthorized');
        return json({ sub: id, id });
      }
      return json({ error: 'invalid_request' }, 404);
    } catch (error) {
      const kind = error instanceof IntegrationError ? error.kind : 'internal';
      const status = kind === 'unauthorized' ? 401 : kind === 'invalid_payload' ? 400 : 503;
      // No codes, state, upstream body, URLs, tokens or exception stacks in errors.
      return json({ error: status === 401 ? 'invalid_client' : status === 400 ? 'invalid_request' : 'temporarily_unavailable' }, status);
    }
  };
}
