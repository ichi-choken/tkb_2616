import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSteamTrustBatches, type UserSteamTrust } from '../src/lib/trust-batches.ts';

const people = (count: number) => Array.from({ length: count }, (_, i) => `user-${i}`);
const trust = (userId: string): UserSteamTrust => ({ userId, status: 'available', lastSuccessAt: '2026-10-25T00:00:00Z', accountYears: 3, level: 10, games: [] });

test('Steam trust reads up to 50 people in one request and skips an empty list', async () => {
  for (const count of [0, 1, 50]) {
    const calls: string[][] = [];
    const result = await readSteamTrustBatches(people(count), [123], async (ids, gameIds) => {
      calls.push(ids);
      assert.deepEqual(gameIds, [123]);
      assert.ok(ids.length <= 50);
      return ids.map(trust);
    });
    assert.equal(calls.length, count ? 1 : 0);
    assert.deepEqual(result.map(user => user.userId), people(count));
  }
});

test('Steam trust reads all 51 applicants while respecting the server limit', async () => {
  const calls: number[] = [];
  const result = await readSteamTrustBatches(people(51), [123], async ids => {
    calls.push(ids.length);
    if (ids.length > 50) throw new Error('400: too many userIds');
    return ids.map(trust);
  });
  assert.deepEqual(calls, [50, 1]);
  assert.deepEqual(result.map(user => user.userId), people(51));
});

test('Steam trust deduplicates people before batching and merges users who have linked Steam', async () => {
  const calls: string[][] = [];
  const ids = [...people(51), ...people(51)];
  const result = await readSteamTrustBatches(ids, [123, 123], async (batch, games) => {
    calls.push(batch);
    assert.deepEqual(games, [123]);
    // The endpoint omits people who have not linked Steam.
    return batch.filter(id => id !== 'user-0').map(trust);
  });
  assert.deepEqual(calls.map(batch => batch.length), [50, 1]);
  assert.deepEqual(calls.flat(), people(51));
  assert.deepEqual(result.map(user => user.userId), people(51).slice(1));
});

test('A failed Steam trust batch rejects the read and a retry can fetch the complete result', async () => {
  const ids = people(101);
  let calls = 0;
  await assert.rejects(readSteamTrustBatches(ids, [], async batch => {
    calls++;
    if (calls === 2) throw new Error('temporary failure');
    return batch.map(trust);
  }), /temporary failure/);
  assert.equal(calls, 2);
  const result = await readSteamTrustBatches(ids, [], async batch => batch.map(trust));
  assert.deepEqual(result.map(user => user.userId), ids);
});
