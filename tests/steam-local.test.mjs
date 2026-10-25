import test from 'node:test';
import assert from 'node:assert/strict';
import { steamLocal } from '../scripts/steam-local.mjs';

function fixture() {
  let time = Date.parse('2026-10-25T05:00:00Z');
  let checks = 0;
  const requestedIds = [];
  const origin = 'http://127.0.0.1:4183';
  const handler = steamLocal({ origin, now: () => time,
    client: { ownedGames: async id => { requestedIds.push(id); return { status: 'available', source: 'steam', games: [] }; } },
    fetcher: async (url, init) => {
      checks++;
      assert.equal(String(url), 'https://steamcommunity.com/openid/login');
      assert.equal(new URLSearchParams(init.body).get('openid.mode'), 'check_authentication');
      return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
    },
  });
  async function request(path, cookie = '', method = 'GET', requestOrigin) {
    const result = { status: 0, headers: {}, body: '' };
    const res = { setHeader(k, v) { result.headers[k] = v; return this; }, writeHead(code, headers = {}) { result.status = code; Object.assign(result.headers, headers); return this; }, end(body = '') { result.body = body; return this; } };
    await handler({ method, headers: { host: '127.0.0.1:4183', cookie, origin: requestOrigin } }, res, new URL(path, origin));
    return result;
  }
  async function begin() {
    const result = await request('/__steam/start');
    const url = new URL(result.headers.Location);
    assert.equal(url.origin, 'https://steamcommunity.com');
    const callback = new URL(url.searchParams.get('openid.return_to'));
    const fields = { ns: 'http://specs.openid.net/auth/2.0', mode: 'id_res', op_endpoint: 'https://steamcommunity.com/openid/login', claimed_id: 'https://steamcommunity.com/openid/id/76561198000000001', identity: 'https://steamcommunity.com/openid/id/76561198000000001', return_to: callback.href, response_nonce: '2026-10-25T05:00:00Znonce', assoc_handle: 'test', sig: 'test', signed: 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle' };
    for (const [k,v] of Object.entries(fields)) callback.searchParams.set('openid.' + k, v);
    return { callback, cookie: result.headers['Set-Cookie'].split(';')[0] };
  }
  return { request, begin, requestedIds, checks: () => checks, advance: n => { time += n; } };
}

test('Steam library requires a verified session and uses only the Steam-verified ID', async () => {
  const f = fixture();
  assert.equal((await f.request('/__steam/library.json?steamId=76561198000000002')).status, 401);
  const a = await f.begin();
  assert.equal((await f.request('/__steam/library.json', a.cookie)).status, 401);
  const result = await f.request(a.callback.href, a.cookie);
  assert.equal(result.status, 303);
  const cookie = result.headers['Set-Cookie'].split(';')[0];
  assert.notEqual(cookie, a.cookie);
  assert.equal((await f.request('/__steam/library.json?steamId=76561198000000002', cookie)).status, 200);
  assert.deepEqual(f.requestedIds, ['76561198000000001']);
  assert.equal((await f.request(a.callback.href, a.cookie)).status, 400);
  assert.equal(f.checks(), 1);
  assert.equal((await f.request('/__steam/logout', cookie, 'POST', 'https://foreign.example')).status, 403);
  assert.equal((await f.request('/__steam/logout', cookie, 'POST', 'http://127.0.0.1:4183')).status, 200);
  assert.equal((await f.request('/__steam/library.json', cookie)).status, 401);
});

test('Steam callbacks are browser-bound, expiring, and cannot establish a session with forged claims', async () => {
  const f = fixture();
  let a = await f.begin();
  assert.equal((await f.request(a.callback.href)).status, 400);
  a.callback.searchParams.set('openid.claimed_id', 'https://foreign.example/id/76561198000000001');
  await f.request(a.callback.href, a.cookie);
  assert.equal((await f.request('/__steam/library.json', a.cookie)).status, 401);
  assert.equal(f.checks(), 0);
  a = await f.begin(); f.advance(300_001);
  assert.equal((await f.request(a.callback.href, a.cookie)).status, 400);
  assert.equal(f.checks(), 0);
});

test('Steam cancellation never fetches a library or signs in', async () => {
  const f = fixture(); const a = await f.begin();
  a.callback.searchParams.set('openid.mode', 'cancel');
  assert.equal((await f.request(a.callback.href, a.cookie)).status, 303);
  assert.deepEqual(JSON.parse((await f.request('/__steam/status.json', a.cookie)).body), { status: 'cancelled', connected: false });
  assert.equal((await f.request('/__steam/library.json', a.cookie)).status, 401);
  assert.equal(f.checks(), 0);
});
