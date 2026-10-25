// Shared standalone demo display state, separate from real Auth/API data.
export type Service = 'steam' | 'discord';
export type Phase = 'idle' | 'authing' | 'importing' | 'failed';
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
  // 前回Steamから取り込んだゲーム（プロフィールに足したもの・時間を入れたもの）
  steamImport: { added: string[]; updated: string[] } | null;
};
export const freshLink = (): Link => ({ linked: false, phase: 'idle', fetch: 'auto', lastOk: null });
const fresh = (): Settings => ({
  login: null, googleStep: false, inApp: false,
  steam: freshLink(), discord: freshLink(),
  steamShow: { age: true, level: true, games: true },
  steamImport: null,
});

export function steamProfileVisible(state: Settings): boolean {
  return state.steam.linked && state.steamShow.games && state.steam.fetch !== 'private';
}

export const SETTINGS_STORAGE_KEY = 'shumitomo:settings:v1';
type SettingsStorage = { readItem: (key: string) => string | null; writeItem: (key: string, value: string) => boolean };

export function createDemoSettings(storage?: SettingsStorage) {
  let state = fresh();
  try {
    const raw = storage?.readItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Settings>;
      state = {
        ...state, ...v, googleStep: false,
        steam: { ...freshLink(), ...v.steam, phase: 'idle' },
        discord: { ...freshLink(), ...v.discord, phase: 'idle' },
        steamShow: { ...state.steamShow, ...v.steamShow },
      };
    }
  } catch { /* 読み取れない保存データは初期状態で開く。 */ }
  const listeners = new Set<() => void>();
  const publish = (next: Settings) => {
    state = next;
    storage?.writeItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
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
