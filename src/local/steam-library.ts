import type { SteamLibrary } from '../../packages/integrations/src/steam.ts';

type Listener = (library: SteamLibrary) => void;
const listeners = new Set<Listener>();
export function subscribeSteamLibrary(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function publishSteamLibrary(library: SteamLibrary) {
  listeners.forEach(listener => listener(library));
}
export function isSteamLibrary(value: unknown): value is SteamLibrary {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (data.source !== 'steam') return false;
  if (data.status === 'unavailable') return data.reason === 'not_visible_or_missing';
  const minutes = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return data.status === 'available' && typeof data.fetchedAt === 'string' && Number.isFinite(Date.parse(data.fetchedAt))
    && Array.isArray(data.games) && data.games.every(item => item && Number.isSafeInteger(item.appId) && item.appId > 0
      && (item.name === null || typeof item.name === 'string') && minutes(item.playtimeMinutes) && minutes(item.recentPlaytimeMinutes));
}
export async function readSteamLibrary(signal: AbortSignal): Promise<SteamLibrary | null> {
  const auth = await fetch('/__steam/status.json', { cache: 'no-store', signal });
  if (!auth.ok) throw new Error('Steam status unavailable');
  const session = await auth.json();
  if (session.connected !== true) return null;
  const response = await fetch('/__steam/library.json', { cache: 'no-store', signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Steam library unavailable');
  const data: unknown = await response.json();
  if (!isSteamLibrary(data)) throw new Error('Invalid Steam library');
  return data;
}
