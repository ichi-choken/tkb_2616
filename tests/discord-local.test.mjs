import test from 'node:test';
import assert from 'node:assert/strict';
import { discordLocal } from '../scripts/discord-local.mjs';

function fixture() {
  let time = Date.parse('2026-10-24T16:00:00Z');
  let exchanges = 0;
  const client = {
    authorizeUrl(state) { return `https://discord.com/oauth2/authorize?scope=identify&state=${state}`; },
    async exchangeCode() { exchanges++; return { accessToken: 'private-access', refreshToken: 'private-refresh' }; },
    async currentUser() { return { discordId: '123456789012345678', username: 'must-not-be-returned' }; },
  };
  const handler = discordLocal({ client, redirectUri: 'http://127.0.0.1:4183/__discord/callback', now: () => time });
  async function request(path, cookie = '') {
    const result = { status: 0, headers: {}, body: '' };
    const response = {
      setHeader(name, value) { result.headers[name] = value; return this; },
      writeHead(status, headers = {}) { result.status = status; Object.assign(result.headers, headers); return this; },
      end(body = '') { result.body = body; return this; },
    };
    await handler({ method: 'GET', headers: { host: '127.0.0.1:4183', cookie } }, response, new URL(path, 'http://127.0.0.1:4183'));
    return result;
  }
  async function begin() {
    const start = await request('/__discord/start');
    return { cookie: start.headers['Set-Cookie'].split(';')[0], state: new URL(start.headers.Location).searchParams.get('state') };
  }
  const callback = state => `/__discord/callback?state=${state}&code=one-time-code&iss=https%3A%2F%2Fdiscord.com`;
  return { request, begin, callback, exchangeCount: () => exchanges, advance: ms => { time += ms; } };
}

test('Discord demo verifies one browser-bound callback once and returns only the ID and time', async () => {
  const f = fixture();
  const { cookie, state } = await f.begin();
  assert.equal((await f.request(f.callback(state), cookie)).status, 303);
  const result = await f.request('/__discord/status.json', cookie);
  assert.deepEqual(JSON.parse(result.body), { status: 'verified', discordId: '123456789012345678', verifiedAt: '2026-10-24T16:00:00.000Z' });
  assert.equal((await f.request(f.callback(state), cookie)).status, 400);
  assert.equal(f.exchangeCount(), 1);
});

test('Discord demo rejects a callback from a different browser without spending the valid attempt', async () => {
  const f = fixture();
  const { cookie, state } = await f.begin();
  assert.equal((await f.request(f.callback(state))).status, 400);
  assert.equal(f.exchangeCount(), 0);
  assert.equal((await f.request(f.callback(state), cookie)).status, 303);
  assert.equal(f.exchangeCount(), 1);
});

test('Discord demo cancellation never exchanges a code or reports a verified account', async () => {
  const f = fixture();
  const { cookie, state } = await f.begin();
  assert.equal((await f.request(`/__discord/callback?state=${state}&error=access_denied`, cookie)).status, 303);
  assert.deepEqual(JSON.parse((await f.request('/__discord/status.json', cookie)).body), { status: 'cancelled' });
  assert.equal(f.exchangeCount(), 0);
});

test('Discord demo rejects foreign issuers, duplicate codes and expired attempts before sending credentials', async () => {
  const f = fixture();
  let attempt = await f.begin();
  const foreign = f.callback(attempt.state).replace('https%3A%2F%2Fdiscord.com', 'https%3A%2F%2Fevil.example');
  assert.equal((await f.request(foreign, attempt.cookie)).status, 400);
  await f.request(`${f.callback(attempt.state)}&code=duplicate`, attempt.cookie);
  assert.equal(f.exchangeCount(), 0);
  assert.deepEqual(JSON.parse((await f.request('/__discord/status.json', attempt.cookie)).body), { status: 'failed' });
  attempt = await f.begin();
  f.advance(10 * 60 * 1000 + 1);
  assert.equal((await f.request(f.callback(attempt.state), attempt.cookie)).status, 400);
  assert.equal(f.exchangeCount(), 0);
});
