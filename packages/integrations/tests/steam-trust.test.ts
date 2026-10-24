import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSteamData, steamTrust, type SteamSnapshotValue, type SyncSnapshot } from '../src/index.ts';

const now = Date.parse('2026-10-24T00:00:00Z');
const stamp = new Date(now).toISOString();
const value: SteamSnapshotValue = {
  profile: { createdAt: '2019-10-23T00:00:00Z' }, level: 12,
  library: { status: 'available', source: 'steam', fetchedAt: stamp, games: [
    { appId: 570, name: 'Dota 2', playtimeMinutes: 0, recentPlaytimeMinutes: null },
    { appId: 1172470, name: 'Apex Legends', playtimeMinutes: null, recentPlaytimeMinutes: null },
  ] },
};
const snapshot = (status: SyncSnapshot<SteamSnapshotValue>['status'], v: SteamSnapshotValue | null = value): SyncSnapshot<SteamSnapshotValue> =>
  ({ status, value: v, lastSuccessAt: stamp, attemptedAt: stamp, nextAttemptAt: null });
const games = [{ id: 1, steamAppId: 570 }, { id: 2, steamAppId: 1172470 }, { id: 3, steamAppId: 730 }, { id: 4, steamAppId: null }];

test('Steam trust: account years, level, ownership and playtime; zero and missing playtime stay distinct', () => {
  assert.deepEqual(steamTrust(snapshot('available'), games, now), {
    status: 'available', lastSuccessAt: stamp, accountYears: 7, level: 12,
    games: [
      { gameId: 1, owned: true, playtimeMinutes: 0 },
      { gameId: 2, owned: true, playtimeMinutes: null },
      // Missing from the returned library, or not on Steam: unknown, never "not owned".
      { gameId: 3, owned: null, playtimeMinutes: null },
      { gameId: 4, owned: null, playtimeMinutes: null },
    ],
  });
  // Nothing beyond the indicators leaves the snapshot.
  assert.ok(!JSON.stringify(steamTrust(snapshot('available'), games, now)).includes('Dota'));
});

test('Steam trust: a failed refresh keeps the last values; confirmed private or unavailable shows none', () => {
  assert.equal(steamTrust(snapshot('retry_wait'), games, now).level, 12);
  for (const status of ['private', 'unavailable'] as const) {
    const hidden = steamTrust(snapshot(status), games, now);
    assert.equal(hidden.level, null);
    assert.equal(hidden.accountYears, null);
    assert.ok(hidden.games.every(g => g.owned === null && g.playtimeMinutes === null));
  }
  const pending = steamTrust(null, [], now);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.lastSuccessAt, null);
  // Snapshots stored before the level was read have no level and no creation time.
  const old = steamTrust(snapshot('available', { profile: null, library: value.library }), [], now);
  assert.equal(old.level, null);
  assert.equal(old.accountYears, null);
});

test('readSteamData stores the Steam level with the library and profile', async () => {
  const reading = await readSteamData({
    ownedGames: async () => value.library,
    profile: async () => null,
    level: async () => 3,
  }, '76561198000000001');
  assert.equal(reading.status, 'available');
  assert.equal(reading.status === 'available' ? reading.value.level : undefined, 3);
});
