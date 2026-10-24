import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationError, readSteamData, runSync, steamSyncPolicy, lastUpdatedLabel, publicLinkStatus, type SyncSnapshot } from '../src/index.ts';

const start = Date.parse('2026-10-24T00:00:00Z');
const stamp = new Date(start).toISOString();
const commit = { commitIfCurrent: async () => true };
const fail = async (): Promise<never> => { throw new IntegrationError('network'); };
const initial: SyncSnapshot<number> = { status: 'available', value: 0, attemptedAt: stamp, lastSuccessAt: stamp, nextAttemptAt: stamp };

test('Steam retries at 1m, 5m, 30m, 2h from first failure, then every 5h; a restart preserves the schedule', async () => {
  let previous: SyncSnapshot<number> | null = null;
  let at = start;
  for (const minutes of [1, 5, 30, 120, 420, 720, 1020]) {
    const result: { committed: boolean; snapshot: SyncSnapshot<number> } = await runSync({ linkId: 'a', revision: 'a', previous }, fail, commit, steamSyncPolicy, at);
    assert.equal(result.snapshot.nextAttemptAt, new Date(start + minutes * 60_000).toISOString());
    assert.equal(result.snapshot.failureStartedAt, stamp);
    assert.equal(result.snapshot.lastSuccessAt, null);
    assert.equal(result.snapshot.value, null);
    previous = JSON.parse(JSON.stringify(result.snapshot));
    at = Date.parse(result.snapshot.nextAttemptAt!);
  }
});
test('Steam respects Retry-After and missed slots without a busy loop', async () => {
  const failure = async (): Promise<never> => { throw new IntegrationError('rate_limited', 429, 600_000); };
  const first = await runSync({ linkId: 'a', revision: 'a', previous: initial }, failure, commit, steamSyncPolicy, start);
  assert.equal(first.snapshot.nextAttemptAt, new Date(start + 600_000).toISOString());
  const next = await runSync({ linkId: 'a', revision: 'a', previous: first.snapshot }, fail, commit, steamSyncPolicy, start + 600_000);
  assert.equal(next.snapshot.nextAttemptAt, new Date(start + 1_800_000).toISOString());
  const late = await runSync({ linkId: 'a', revision: 'a', previous: next.snapshot }, fail, commit, steamSyncPolicy, start + 13 * 3_600_000);
  assert.equal(late.snapshot.nextAttemptAt, new Date(start + 17 * 3_600_000).toISOString());
});
test('A successful Steam read clears the failure series and schedules the next read 24h later', async () => {
  const previous = (await runSync({ linkId: 'a', revision: 'a', previous: initial }, fail, commit, steamSyncPolicy, start)).snapshot;
  const at = start + 60_000;
  const success = await runSync({ linkId: 'a', revision: 'a', previous }, async () => ({ status: 'available', value: 42, fetchedAt: new Date(at).toISOString() }), commit, steamSyncPolicy, at);
  assert.equal(success.snapshot.failureStartedAt, null);
  assert.equal(success.snapshot.nextAttemptAt, new Date(at + 86_400_000).toISOString());
  const next = await runSync({ linkId: 'a', revision: 'a', previous: success.snapshot }, fail, commit, steamSyncPolicy, at + 86_400_000);
  assert.equal(next.snapshot.failureStartedAt, new Date(at + 86_400_000).toISOString());
  assert.equal(next.snapshot.nextAttemptAt, new Date(at + 86_460_000).toISOString());
});
test('Old Steam measurements including zero survive failures, but confirmed private/unavailable clears the values', async () => {
  const failed = await runSync({ linkId: 'a', revision: 'a', previous: initial }, fail, commit, steamSyncPolicy, start + 30 * 86_400_000);
  assert.equal(failed.snapshot.value, 0);
  assert.equal(failed.snapshot.lastSuccessAt, stamp);
  for (const status of ['private', 'unavailable'] as const) {
    const hidden = await runSync({ linkId: 'a', revision: 'a', previous: failed.snapshot }, async () => ({ status }), commit, steamSyncPolicy, start);
    assert.equal(hidden.snapshot.value, null);
    const retry = await runSync({ linkId: 'a', revision: 'a', previous: hidden.snapshot }, fail, commit, steamSyncPolicy, start + 1000);
    assert.equal(retry.snapshot.value, null);
  }
});
test('Last update displays the requested seven-day boundary and never invents a success', () => {
  assert.equal(lastUpdatedLabel(stamp, start + 7 * 86_400_000), '7日前');
  assert.equal(lastUpdatedLabel(stamp, start + 7 * 86_400_000 + 1), '7日以上前');
  assert.equal(lastUpdatedLabel(null, start), 'まだ取得できていません');
  const status = publicLinkStatus({ provider: 'discord', external_id: '123', snapshot: { ...initial, value: { token: 'secret', username: 'discard' } } });
  assert.equal(status.externalId, '123');
  assert.ok(!JSON.stringify(status).includes('secret'));
  assert.ok(!JSON.stringify(status).includes('discard'));
});

test('An unavailable library clears prior playtime without depending on the profile API', async () => {
  const reading = () => readSteamData({
    ownedGames: async () => ({ status: 'unavailable', source: 'steam', reason: 'not_visible_or_missing' }),
    profile: async () => assert.fail('Profile API must not override the unavailable library'),
  }, '76561198000000001');
  const result = await runSync({ linkId: 'a', revision: 'a', previous: { ...initial, value: { profile: null, library: { status: 'available', source: 'steam', fetchedAt: stamp, games: [] } } } }, reading, commit, steamSyncPolicy, start);
  assert.equal(result.snapshot.status, 'unavailable');
  assert.equal(result.snapshot.value, null);
});
