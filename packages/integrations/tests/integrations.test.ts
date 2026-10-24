import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SteamClient, parseOwnedGames, DiscordClient, parseDiscordUser, IntegrationError,
  beginSteamLink, finishSteamLink, beginDiscordLink, finishDiscordLink,
  runSync, deliverNotification, verifyPrincipal, tokenCipher,
  type Fetcher, type Principal, type LinkAttempt, type LinkAttemptStore, type Provider,
  type SyncSnapshot, type SyncStore,
} from '../src/index.ts';

const now = Date.parse('2026-10-24T03:00:00Z');
const timestamp = new Date(now).toISOString();
const principal: Principal = { userId: 'user-a', sessionId: 'session-a', kind: 'registered' };
const callbackUri = 'https://example.test/auth/link';
const errorKind = (kind: string) => (error: unknown) => error instanceof IntegrationError && error.kind === kind;
const jsonResponse = (data: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(data), { status, ...(headers ? { headers } : {}) });

// Test double only. Production must use a shared, atomic, expiring store.
class Attempts implements LinkAttemptStore {
  attempts = new Map<string, LinkAttempt>();
  async put(attempt: LinkAttempt) { this.attempts.set(attempt.state, structuredClone(attempt)); }
  async consume(state: string, provider: Provider, who: Principal, at: number) {
    const attempt = this.attempts.get(state);
    if (!attempt || attempt.provider !== provider || attempt.principal.userId !== who.userId ||
      attempt.principal.sessionId !== who.sessionId || attempt.expiresAt <= at) return null;
    this.attempts.delete(state);
    return attempt;
  }
}
async function steamCallback(store: Attempts) {
  const start = new URL(await beginSteamLink(principal, callbackUri, 300_000, store, now));
  const callback = new URL(start.searchParams.get('openid.return_to')!);
  const fields = {
    ns: 'http://specs.openid.net/auth/2.0', mode: 'id_res',
    op_endpoint: 'https://steamcommunity.com/openid/login',
    claimed_id: 'https://steamcommunity.com/openid/id/76561198000000001',
    identity: 'https://steamcommunity.com/openid/id/76561198000000001',
    return_to: callback.href, response_nonce: '2026-10-24T03:00:00Zunique',
    assoc_handle: 'test-association', sig: 'test-signature',
    signed: 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
  };
  for (const [key, value] of Object.entries(fields)) callback.searchParams.set(`openid.${key}`, value);
  return callback;
}
const verifiedSteam: Fetcher = async (url, init) => {
  assert.equal(String(url), 'https://steamcommunity.com/openid/login');
  assert.equal(init?.method, 'POST');
  assert.equal(init?.redirect, 'error');
  assert.equal(new URLSearchParams(String(init?.body)).get('openid.mode'), 'check_authentication');
  return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
};

test('Steam: missing library, empty library, missing time and explicit zero stay distinct', () => {
  assert.equal(parseOwnedGames({ response: {} }, timestamp).status, 'unavailable');
  assert.deepEqual(parseOwnedGames({ response: { game_count: 0 } }, timestamp), { status: 'available', source: 'steam', fetchedAt: timestamp, games: [] });
  const result = parseOwnedGames({ response: { game_count: 2, games: [{ appid: 10 }, { appid: 20, playtime_forever: 0 }] } }, timestamp);
  assert.equal(result.status, 'available');
  if (result.status === 'available') assert.deepEqual(result.games.map(g => g.playtimeMinutes), [null, 0]);
  assert.throws(() => parseOwnedGames({ response: { game_count: 1, games: [] } }, timestamp), errorKind('invalid_payload'));
});

test('Steam: server-side public API requests include played free games', async () => {
  const client = new SteamClient('test-key', async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.steampowered.com');
    assert.equal(url.searchParams.get('key'), 'test-key');
    assert.equal(JSON.parse(url.searchParams.get('input_json')!).include_played_free_games, true);
    return jsonResponse({ response: {} });
  });
  assert.equal((await client.ownedGames('76561198000000001')).status, 'unavailable');
});

test('External errors hide URLs, keys and upstream response bodies', async () => {
  const client = new SteamClient('test-secret', async () => { throw new Error('https://provider.test/?key=test-secret'); });
  await assert.rejects(client.ownedGames('76561198000000001'), (err: unknown) => {
    assert.ok(err instanceof IntegrationError);
    assert.equal(err.kind, 'network');
    assert.ok(!JSON.stringify(err).includes('test-secret'));
    assert.ok(!String(err).includes('provider.test'));
    return true;
  });
});

test('Steam OpenID: trusted assertion succeeds once; replay fails', async () => {
  const store = new Attempts();
  const callback = await steamCallback(store);
  assert.deepEqual(await finishSteamLink(callback, principal, store, verifiedSteam, now), { status: 'verified', userId: principal.userId, steamId: '76561198000000001' });
  await assert.rejects(finishSteamLink(callback, principal, store, verifiedSteam, now), errorKind('unauthorized'));
});

test('Steam OpenID: a different session cannot consume the original attempt', async () => {
  const store = new Attempts();
  const callback = await steamCallback(store);
  await assert.rejects(finishSteamLink(callback, { ...principal, sessionId: 'another-session' }, store, verifiedSteam, now), errorKind('unauthorized'));
  assert.equal((await finishSteamLink(callback, principal, store, verifiedSteam, now)).status, 'verified');
});

test('Steam OpenID: expires and rejects forged, unsigned or repeated fields before network', async () => {
  const changes = [
    (p: URLSearchParams) => p.set('openid.op_endpoint', 'https://attacker.test'),
    (p: URLSearchParams) => p.set('openid.claimed_id', 'https://attacker.test/openid/id/76561198000000001'),
    (p: URLSearchParams) => p.set('openid.signed', 'op_endpoint,identity,return_to'),
    (p: URLSearchParams) => p.append('openid.identity', 'another-id'),
    (p: URLSearchParams) => p.set('openid.return_to', 'https://attacker.test'),
    (p: URLSearchParams) => p.set('openid.response_nonce', '2020-10-24T03:00:00Zold'),
  ];
  for (const change of changes) {
    const store = new Attempts();
    const callback = await steamCallback(store);
    change(callback.searchParams);
    await assert.rejects(finishSteamLink(callback, principal, store, async () => assert.fail('Unexpected network request'), now), errorKind('unauthorized'));
  }
  const store = new Attempts();
  const callback = await steamCallback(store);
  await assert.rejects(finishSteamLink(callback, principal, store, verifiedSteam, now + 300_001), errorKind('unauthorized'));
});

test('Guest principals cannot start or finish external account linking', async () => {
  const guest = { ...principal, kind: 'guest' } as unknown as Principal;
  const store = new Attempts();
  await assert.rejects(beginSteamLink(guest, callbackUri, 300_000, store, now), errorKind('unauthorized'));
  const callback = await steamCallback(store);
  await assert.rejects(finishSteamLink(callback, guest, store, verifiedSteam, now), errorKind('unauthorized'));
});

test('Steam OpenID: an invalid upstream signature never links an identity', async () => {
  const store = new Attempts();
  const callback = await steamCallback(store);
  await assert.rejects(finishSteamLink(callback, principal, store, async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'), now), errorKind('unauthorized'));
});

test('Discord only keeps the exact ID, even when name, icon, email and trust fields are returned', () => {
  const id = '175928847299117063';
  assert.deepEqual(parseDiscordUser({ id, username: 'tester', global_name: 'name', avatar: 'hash',
    email: 'discard@example.test', verified: true }), { discordId: id });
  assert.deepEqual(parseDiscordUser({ id }), { discordId: id });
  for (const bad of ['0', 'not-an-id', '18446744073709551616']) assert.throws(() => parseDiscordUser({ id: bad }));
});

const discordConfig = { clientId: 'test-client', clientSecret: 'test-secret', redirectUri: callbackUri };
test('Discord: linking verifies state and binds the result to the signed-in user', async () => {
  let requests = 0;
  const client = new DiscordClient(discordConfig, async (input, init) => {
    requests++;
    if (String(input).endsWith('/oauth2/token')) {
      assert.equal(new Headers(init?.headers).get('content-type'), 'application/x-www-form-urlencoded');
      assert.equal(new URLSearchParams(String(init?.body)).get('grant_type'), 'authorization_code');
      return jsonResponse({ access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'Bearer', scope: 'identify', expires_in: 3600 });
    }
    return jsonResponse({ id: '175928847299117063', username: 'tester' });
  });
  const store = new Attempts();
  const url = new URL(await beginDiscordLink(client, principal, callbackUri, 300_000, store, now));
  assert.equal(url.searchParams.get('scope'), 'identify');
  const callback = new URL(callbackUri);
  callback.search = new URLSearchParams({ state: url.searchParams.get('state')!, code: 'test-code' }).toString();
  await assert.rejects(finishDiscordLink(client, callback, { ...principal, userId: 'other-user' }, store, now), errorKind('unauthorized'));
  assert.equal(requests, 0);
  const result = await finishDiscordLink(client, callback, principal, store, now);
  assert.equal(result.status, 'verified');
  if (result.status === 'verified') assert.equal(result.userId, principal.userId);
  assert.equal(requests, 2);
});

test('Discord: refresh returns rotated tokens; invalid grant requires relinking', async () => {
  const client = new DiscordClient(discordConfig, async (_, init) => {
    assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'), 'old-refresh');
    return jsonResponse({ access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'Bearer', scope: 'identify email', expires_in: 3600 });
  });
  assert.equal((await client.refresh('old-refresh')).refreshToken, 'new-refresh');
  const revoked = new DiscordClient(discordConfig, async () => jsonResponse({ error: 'invalid_grant', detail: 'test-secret' }, 400));
  await assert.rejects(revoked.refresh('old-refresh'), errorKind('relink_required'));
});

test('Discord: rate limit respects the longer body/header delay', async () => {
  const client = new DiscordClient(discordConfig, async () => jsonResponse({ retry_after: 2.5 }, 429, { 'retry-after': '1' }));
  await assert.rejects(client.currentUser('test-access'), (err: unknown) => err instanceof IntegrationError && err.kind === 'rate_limited' && err.retryAfterMs === 2500);
});

const policy = { intervalMs: 60_000, retryMs: 1000, staleAfterMs: 10_000 };
const previous: SyncSnapshot<number> = { status: 'available', value: 60, lastSuccessAt: timestamp, attemptedAt: timestamp, nextAttemptAt: timestamp };
const store: SyncStore<number> = { commitIfCurrent: async () => true };
test('Automatic sync: failure retains only recent values without advancing success time', async () => {
  const job = { linkId: 'link-a', revision: '1', previous };
  const failure = async (): Promise<never> => { throw new IntegrationError('rate_limited', 429, 30_000); };
  const recent = await runSync(job, failure, store, policy, now + 5000);
  assert.equal(recent.snapshot.value, 60);
  assert.equal(recent.snapshot.lastSuccessAt, timestamp);
  assert.equal(recent.snapshot.nextAttemptAt, new Date(now + 35_000).toISOString());
  const stale = await runSync(job, failure, store, policy, now + 11_000);
  assert.equal(stale.snapshot.value, null);
});

test('Automatic sync: confirmed private values stay hidden through network errors', async () => {
  const hidden = await runSync({ linkId: 'link-a', revision: '1', previous }, async () => ({ status: 'private' }), store, policy, now);
  assert.equal(hidden.snapshot.value, null);
  const failed = await runSync({ linkId: 'link-a', revision: '2', previous: hidden.snapshot }, async () => { throw new IntegrationError('network'); }, store, policy, now + 1000);
  assert.equal(failed.snapshot.status, 'private');
  assert.equal(failed.snapshot.value, null);
});

test('Automatic sync: unlink during request prevents late writeback', async () => {
  let revision = '1';
  let saved = false;
  const concurrentStore: SyncStore<number> = { commitIfCurrent: async (job) => {
    if (job.revision !== revision) return false;
    saved = true;
    return true;
  } };
  const result = await runSync({ linkId: 'link-a', revision, previous }, async () => {
    revision = 'unlinked-2';
    return { status: 'available', value: 123, fetchedAt: timestamp };
  }, concurrentStore, policy, now);
  assert.equal(result.committed, false);
  assert.equal(saved, false);
});

test('Automatic sync: relink-required jobs do not retry without a new linking flow', async () => {
  const result = await runSync({ linkId: 'link-a', revision: '1', previous: { ...previous, status: 'relink_required', value: null } }, async () => assert.fail('Unexpected refresh'), store, policy, now);
  assert.equal(result.committed, false);
  assert.equal(result.snapshot.status, 'relink_required');
});

test('Notifications: only event identifiers are delivered, never copied join credentials', async () => {
  const event = { id: 'event-a', recipientId: 'user-a', kind: 'join-updated', target: { type: 'recruitment' as const, id: 'recruitment-a', roomNumber: 'secret-room' }, inviteUrl: 'https://private.example.test', gameId: 'secret-id' };
  let delivered: unknown;
  await deliverNotification(event, { send: async payload => { delivered = payload; return { status: 'accepted', providerMessageId: 'delivery-a' }; } });
  assert.deepEqual(delivered, { id: event.id, recipientId: event.recipientId, kind: event.kind, target: { type: 'recruitment', id: 'recruitment-a' } });
});

test('Server authentication verifies claims and user; request-supplied identities cannot override them', async () => {
  const verifier = {
    getClaims: async () => ({ data: { claims: { sub: 'user-a', session_id: 'session-a', role: 'authenticated' } }, error: null }),
    getUser: async () => ({ data: { user: { id: 'user-a', is_anonymous: false } }, error: null }),
  };
  assert.deepEqual(await verifyPrincipal('Bearer test-access-token', verifier), principal);
  await assert.rejects(verifyPrincipal(null, verifier), errorKind('unauthorized'));
  await assert.rejects(verifyPrincipal('Bearer test-access-token', { ...verifier, getUser: async () => ({ data: { user: { id: 'other-user' } }, error: null }) }), errorKind('unauthorized'));
  await assert.rejects(verifyPrincipal('Bearer test-access-token', { ...verifier, getUser: async () => ({ data: { user: { id: 'user-a', is_anonymous: true } }, error: null }) }), errorKind('unauthorized'));
  await assert.rejects(verifyPrincipal('Bearer test-access-token', { ...verifier, getClaims: async () => ({ data: null, error: new Error('bad token') }) }), errorKind('unauthorized'));
});

test('Stored provider tokens are encrypted and bound to the owning user/provider', async () => {
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const cipher = await tokenCipher(key);
  const tokens = { accessToken: 'test-secret-access', refreshToken: 'test-secret-refresh' };
  const encoded = await cipher.seal(tokens, 'user-a:discord');
  assert.ok(!encoded.includes('test-secret'));
  assert.deepEqual(await cipher.open(encoded, 'user-a:discord'), tokens);
  await assert.rejects(cipher.open(encoded, 'user-b:discord'), errorKind('relink_required'));
  await assert.rejects(cipher.open(encoded.slice(0, -4) + 'AAAA', 'user-a:discord'), errorKind('relink_required'));
  await assert.rejects(tokenCipher(btoa('short-key')), errorKind('configuration'));
});
