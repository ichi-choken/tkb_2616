import type { SteamLibrary } from './steam.ts';
import type { SyncSnapshot } from './sync.ts';

// What readSteamData stores. Snapshots written before the level was read have no level.
export interface SteamSnapshotValue { profile: { createdAt: string | null } | null; level?: number | null; library: SteamLibrary }
export interface SteamGameTrust { gameId: number; owned: true | null; playtimeMinutes: number | null }
// The trust indicators of a linked Steam account (server-41), as anyone may see them. The SteamID,
// name, avatar and the rest of the library are never part of it.
export interface SteamTrust {
  status: string;
  lastSuccessAt: string | null;
  accountYears: number | null;
  level: number | null;
  games: SteamGameTrust[];
}
const YEAR_MS = 365.2425 * 24 * 60 * 60_000;

export function steamTrust(snapshot: SyncSnapshot<SteamSnapshotValue> | null, games: readonly { id: number; steamAppId: number | null }[], now = Date.now()): SteamTrust {
  // Confirmed private or unavailable data is not shown, even if an old value were left behind.
  const value = snapshot && snapshot.status !== 'private' && snapshot.status !== 'unavailable' ? snapshot.value : null;
  const library = value?.library.status === 'available' ? value.library.games : null;
  const created = Date.parse(value?.profile?.createdAt ?? '');
  return {
    status: snapshot?.status ?? 'pending',
    lastSuccessAt: snapshot?.lastSuccessAt ?? null,
    accountYears: Number.isFinite(created) && created <= now ? Math.floor((now - created) / YEAR_MS) : null,
    level: value?.level ?? null,
    games: games.map(game => {
      const entry = game.steamAppId === null ? undefined : library?.find(g => g.appId === game.steamAppId);
      // A game missing from the library is not proof that it is not owned (EXT-Steam-2).
      return { gameId: game.id, owned: entry ? true : null, playtimeMinutes: entry?.playtimeMinutes ?? null };
    }),
  };
}
