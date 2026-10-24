import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IgdbClient, parseGames, parseGameRecord, ExpoPushClient, isExpoPushToken, IntegrationError, type Fetcher } from '../src/index.ts';
const response = (data: unknown, status = 200) => Response.json(data, { status });

test('IGDB: escapes search input, caches tokens and always releases the shared request lease', async () => {
  let tokens = 0; let acquired = 0; let released = 0;
  const fetcher: Fetcher = async (url, init) => {
    if (String(url).includes('id.twitch.tv')) { tokens++; assert.ok(String(init?.body).includes('grant_type=client_credentials')); return response({ access_token: 'secret', expires_in: 3600 }); }
    assert.ok(String(init?.body).startsWith(`search ${JSON.stringify('a"; limit 500;')};`));
    return response([{ id: 1, name: 'Test', cover: { url: '//images.igdb.com/igdb/image/upload/test.png' } }]);
  };
  const client = new IgdbClient({ clientId: 'id', clientSecret: 'secret' }, { async acquire() { acquired++; return { async release() { released++; } }; } }, fetcher);
  await client.search('a"; limit 500;', 10);
  await client.search('a"; limit 500;', 10);
  assert.equal(tokens, 1); assert.equal(acquired, 2); assert.equal(released, 2);
  assert.throws(() => client.search('', 10));
  assert.throws(() => client.get(-1));
  assert.equal(parseGames([{ id: 2, name: 'No image', cover: { url: 'https://attacker.test/image.png' } }])[0]?.coverUrl, null);
});

test('IGDB: refreshes a rejected token once, respects a shared gate rejection, and releases failed calls', async () => {
  let tokens = 0; let requests = 0; let released = 0;
  const client = new IgdbClient({ clientId: 'id', clientSecret: 'secret' }, { async acquire() { return { async release() { released++; } }; } }, async url => {
    if (String(url).includes('id.twitch.tv')) return response({ access_token: `token-${++tokens}`, expires_in: 3600 });
    return ++requests === 1 ? response({}, 401) : response([]);
  });
  await client.get(1);
  assert.equal(tokens, 2); assert.equal(requests, 2); assert.equal(released, 2);
  const limited = new IgdbClient({ clientId: 'id', clientSecret: 'secret' }, { async acquire() { throw new IntegrationError('rate_limited', 429, 250); } }, async () => response({ access_token: 'token', expires_in: 3600 }));
  await assert.rejects(limited.get(1), (error: unknown) => error instanceof IntegrationError && error.retryAfterMs === 250);
});

test('IGDB: a chosen game is read with the columns to store, and Steam is recognised by its store URL or category', async () => {
  let query = '';
  const client = new IgdbClient({ clientId: 'id', clientSecret: 'secret' }, { async acquire() { return { async release() {} }; } }, async (url, init) => {
    if (String(url).includes('id.twitch.tv')) return response({ access_token: 'token', expires_in: 3600 });
    query = String(init?.body);
    return response([{ id: 7, name: 'Splatoon 3', first_release_date: 1662681600,
      alternative_names: [{ name: 'スプラトゥーン3' }, { name: 'Splatoon 3' }], game_localizations: [{ name: 'スプラトゥーン3' }, { name: '斯普拉遁3' }],
      platforms: [{ name: 'Nintendo Switch' }], cover: { image_id: 'co5abc' },
      external_games: [{ uid: '123', url: 'https://www.gog.com/game/x' }, { uid: '1172470', url: 'https://store.steampowered.com/app/1172470' }] }]);
  });
  assert.deepEqual(await client.record(7), { id: 7, name: 'Splatoon 3', alternativeNames: ['スプラトゥーン3', '斯普拉遁3'],
    platforms: ['Nintendo Switch'], coverImageId: 'co5abc', firstReleaseDate: '2022-09-09', steamAppId: 1172470 });
  assert.ok(query.startsWith('where id = 7;'));
  assert.throws(() => client.record(0));
  assert.equal(parseGameRecord([]), null);
  assert.equal(parseGameRecord([{ id: 1, name: 'A', external_games: [{ uid: '570', category: 1 }] }])?.steamAppId, 570);
  // Neither the store URL nor the Steam category: not a Steam app ID.
  assert.equal(parseGameRecord([{ id: 1, name: 'A', external_games: [{ uid: '570', category: 5 }] }])?.steamAppId, null);
  assert.equal(parseGameRecord([{ id: 1, name: 'A', external_games: [{ uid: '99999999999', category: 1 }] }])?.steamAppId, null);
  assert.deepEqual(parseGameRecord([{ id: 1, name: 'A' }]), { id: 1, name: 'A', alternativeNames: [], platforms: [], coverImageId: null, firstReleaseDate: null, steamAppId: null });
});

const event = { id: 'event', recipientId: 'user', kind: 'matched', target: { type: 'recruitment' as const, id: 'recruitment' }, roomNumber: 'PRIVATE', invitationUrl: 'https://private.test', gameId: 'PRIVATE' };
test('Push: carries only a safe target and treats a ticket as accepted, not delivered', async () => {
  const client = new ExpoPushClient('server-secret', async (url, init) => {
    assert.equal(String(url), 'https://exp.host/--/api/v2/push/send');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-secret');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.data, { eventId: 'event', kind: 'matched', target: event.target });
    assert.ok(!String(init?.body).includes('PRIVATE')); assert.ok(!String(init?.body).includes('private.test'));
    return response({ data: { status: 'ok', id: 'ticket' } });
  });
  assert.deepEqual(await client.send('ExponentPushToken[test-token]', event), { status: 'accepted', ticketId: 'ticket' });
  assert.equal(isExpoPushToken('bad'), false);
});

test('Push: stops invalid devices, classifies provider errors and checks receipts separately', async () => {
  for (const [code, status] of [['DeviceNotRegistered', 'disabled'], ['MessageRateExceeded', 'retry'], ['InvalidCredentials', 'blocked']] as const) {
    const client = new ExpoPushClient(undefined, async () => response({ data: { status: 'error', details: { error: code }, message: 'do not log this token' } }));
    assert.deepEqual(await client.send('ExpoPushToken[test-token]', event), { status });
  }
  const client = new ExpoPushClient(undefined, async () => response({ data: { received: { status: 'ok' }, gone: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }));
  const receipts = await client.receipts(['received', 'gone', 'pending']);
  assert.equal(receipts.get('received')?.status, 'provider_received');
  assert.equal(receipts.get('gone')?.status, 'disabled');
  assert.equal(receipts.get('pending')?.status, 'pending');
});
