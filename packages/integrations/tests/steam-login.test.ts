import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSteamLoginHandler, pkceChallenge, type SteamLoginStore, type SteamLoginAttempt, type SteamLoginCode, type Fetcher } from '../src/index.ts';

const config = { baseUrl: 'https://project.supabase.co/functions/v1/steam-auth', redirectUri: 'https://project.supabase.co/auth/v1/callback', clientId: 'steam-adapter', clientSecret: 's'.repeat(64) };
const verifier = 'v'.repeat(64);
const start = Date.parse('2026-10-24T00:00:00Z');
const id = '76561198000000001';
class MemoryStore implements SteamLoginStore {
  attempts = new Map<string, { value: SteamLoginAttempt; expiresAt: number }>();
  codes = new Map<string, { value: SteamLoginCode; expiresAt: number }>();
  access = new Map<string, { value: string; expiresAt: number }>();
  async putAttempt(hash: string, value: SteamLoginAttempt, expiresAt: number) { this.attempts.set(hash, { value, expiresAt }); }
  async consumeAttempt(hash: string, now: number) {
    const row = this.attempts.get(hash);
    if (!row || row.expiresAt <= now) return null;
    this.attempts.delete(hash); return row.value;
  }
  async putCode(hash: string, value: SteamLoginCode, expiresAt: number) { this.codes.set(hash, { value, expiresAt }); }
  async consumeCode(hash: string, challenge: string, redirectUri: string, now: number) {
    const row = this.codes.get(hash);
    if (!row || row.expiresAt <= now || row.value.challenge !== challenge || row.value.redirectUri !== redirectUri) return null;
    this.codes.delete(hash); return row.value;
  }
  async putAccess(hash: string, value: string, expiresAt: number) { this.access.set(hash, { value, expiresAt }); }
  async readAccess(hash: string, now: number) { const row = this.access.get(hash); return row && row.expiresAt > now ? row.value : null; }
}
const validSteam: Fetcher = async (url, init) => {
  assert.equal(String(url), 'https://steamcommunity.com/openid/login');
  assert.equal(new URLSearchParams(String(init?.body)).get('openid.mode'), 'check_authentication');
  return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
};
async function setup(fetcher = validSteam) {
  const store = new MemoryStore(); let time = start;
  const handle = createSteamLoginHandler(config, store, fetcher, () => time);
  const url = new URL(config.baseUrl + '/authorize');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', state: 'supabase-owned-state', code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256' }).toString();
  const auth = await handle(new Request(url));
  assert.equal(auth.status, 302);
  const steam = new URL(auth.headers.get('location')!);
  assert.equal(steam.origin, 'https://steamcommunity.com');
  const callback = new URL(steam.searchParams.get('openid.return_to')!);
  const fields = {
    ns: 'http://specs.openid.net/auth/2.0', mode: 'id_res', op_endpoint: 'https://steamcommunity.com/openid/login',
    claimed_id: `https://steamcommunity.com/openid/id/${id}`, identity: `https://steamcommunity.com/openid/id/${id}`,
    return_to: callback.href, response_nonce: '2026-10-24T00:00:00Zunique', assoc_handle: 'association', sig: 'signature',
    signed: 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
  };
  for (const [key, value] of Object.entries(fields)) callback.searchParams.set('openid.' + key, value);
  const tokenRequest = (code: string, secret = config.clientSecret, proof = verifier) => new Request(config.baseUrl + '/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + btoa(config.clientId + ':' + secret) },
    body: new URLSearchParams({ grant_type: 'authorization_code', redirect_uri: config.redirectUri, code, code_verifier: proof }),
  });
  return { store, handle, callback, url, tokenRequest, advance: (ms: number) => { time += ms; } };
}
test('Steam login round-trip verifies identity and PKCE, returns only ID, and rejects replay/expired access', async () => {
  const t = await setup();
  const callback = await t.handle(new Request(t.callback));
  assert.equal(callback.status, 302);
  const target = new URL(callback.headers.get('location')!);
  assert.equal(target.origin + target.pathname, config.redirectUri);
  assert.equal(target.searchParams.get('state'), 'supabase-owned-state');
  const code = target.searchParams.get('code')!;
  assert.ok(!t.store.codes.has(code)); // DB key is a digest, not a bearer credential.
  const response = await t.handle(t.tokenRequest(code));
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.equal(tokens.token_type, 'Bearer');
  assert.ok(!t.store.access.has(tokens.access_token));
  const userInfo = () => t.handle(new Request(config.baseUrl + '/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } }));
  assert.deepEqual(await (await userInfo()).json(), { id, sub: id });
  assert.equal((await t.handle(t.tokenRequest(code))).status, 400);
  assert.equal((await t.handle(new Request(t.callback))).status, 401);
  t.advance(60_000);
  assert.equal((await userInfo()).status, 401);
});
test('Wrong client or verifier cannot spend a valid authorization code', async () => {
  const t = await setup();
  const callback = await t.handle(new Request(t.callback));
  const code = new URL(callback.headers.get('location')!).searchParams.get('code')!;
  assert.equal((await t.handle(t.tokenRequest(code, 'wrong'))).status, 401);
  assert.equal((await t.handle(t.tokenRequest(code, config.clientSecret, 'z'.repeat(64)))).status, 400);
  assert.equal((await t.handle(t.tokenRequest(code))).status, 200);
});
test('Untrusted redirect, duplicate state and plain PKCE never start Steam login', async () => {
  const t = await setup();
  for (const edit of [
    (url: URL) => url.searchParams.set('redirect_uri', 'https://attacker.test'),
    (url: URL) => url.searchParams.append('state', 'attacker'),
    (url: URL) => url.searchParams.set('code_challenge_method', 'plain'),
  ]) {
    const url = new URL(t.url); edit(url);
    assert.ok((await t.handle(new Request(url))).status >= 400);
  }
  assert.equal(t.store.attempts.size, 1);
});
test('Cancelled Steam authentication returns only a cancellation to the trusted callback', async () => {
  const t = await setup(); t.callback.searchParams.set('openid.mode', 'cancel');
  const response = await t.handle(new Request(t.callback));
  const target = new URL(response.headers.get('location')!);
  assert.equal(target.searchParams.get('error'), 'access_denied');
  assert.equal(target.searchParams.get('state'), 'supabase-owned-state');
  assert.equal(target.searchParams.has('code'), false);
  assert.equal(t.store.codes.size, 0);
});
test('Invalid signatures and expired login attempts cannot issue login codes', async () => {
  const invalid = await setup(async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'));
  assert.equal((await invalid.handle(new Request(invalid.callback))).status, 401);
  assert.equal(invalid.store.codes.size, 0);
  const expired = await setup(); expired.advance(300_000);
  assert.equal((await expired.handle(new Request(expired.callback))).status, 401);
  assert.equal(expired.store.codes.size, 0);
});
test('Authorization codes expire; simultaneous token exchanges produce one access token', async () => {
  const t = await setup();
  const response = await t.handle(new Request(t.callback));
  const code = new URL(response.headers.get('location')!).searchParams.get('code')!;
  const responses = await Promise.all([t.handle(t.tokenRequest(code)), t.handle(t.tokenRequest(code))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
  const expired = await setup();
  const expiredResponse = await expired.handle(new Request(expired.callback));
  const expiredCode = new URL(expiredResponse.headers.get('location')!).searchParams.get('code')!;
  expired.advance(120_000);
  assert.equal((await expired.handle(expired.tokenRequest(expiredCode))).status, 400);
});
test('Steam login routes the paths the hosted gateway passes on, without /functions/v1', async () => {
  const t = await setup();
  const strip = (u: URL) => { const v = new URL(u); v.pathname = v.pathname.replace('/functions/v1', ''); return v; };
  const auth = await t.handle(new Request(strip(t.url)));
  assert.equal(auth.status, 302);
  assert.equal(new URL(auth.headers.get('location')!).origin, 'https://steamcommunity.com');
  const callback = await t.handle(new Request(strip(t.callback)));
  assert.equal(callback.status, 302);
  assert.equal(new URL(callback.headers.get('location')!).origin + new URL(callback.headers.get('location')!).pathname, config.redirectUri);
});
