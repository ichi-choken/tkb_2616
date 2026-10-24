// Shared standalone demo display state, separate from real Auth/API data.
export type Service = 'steam' | 'discord';
export type Phase = 'idle' | 'authing' | 'failed';
export type Fetch = 'auto' | 'retry' | 'relink' | 'private';
export type SteamItem = 'age' | 'level' | 'games';
export type Link = { linked: boolean; phase: Phase; fetch: Fetch; lastOk: string | null };
export type Settings = {
  login: 'discord' | 'google' | 'steam' | 'apple' | null;
  googleStep: boolean;
  inApp: boolean;
  steam: Link;
  discord: Link;
  steamShow: Record<SteamItem, boolean>;
};
export const freshLink = (): Link => ({ linked: false, phase: 'idle', fetch: 'auto', lastOk: null });
const fresh = (): Settings => ({
  login: null, googleStep: false, inApp: false,
  steam: freshLink(), discord: freshLink(),
  steamShow: { age: true, level: true, games: true },
});

export function steamProfileVisible(state: Settings): boolean {
  return state.steam.linked && state.steamShow.games && state.steam.fetch !== 'private';
}

export function createDemoSettings() {
  let state = fresh();
  const listeners = new Set<() => void>();
  const publish = (next: Settings) => {
    state = next;
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(change: (next: Settings) => void) {
      const next: Settings = JSON.parse(JSON.stringify(state));
      change(next);
      publish(next);
    },
    reset() { publish(fresh()); },
  };
}

export const demoSettings = createDemoSettings();
