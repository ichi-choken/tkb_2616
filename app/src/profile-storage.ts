import { GAMES, ME, addCustomGame, type Profile } from './data.ts';

// デモ専用の端末内データ。ログイン情報や他の画面の下書きは保存しない。
export const PROFILE_STORAGE_KEY = 'shumitomo.demo.profile.v1';
export type ProfileStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const steamTag = (tag: string, value: unknown) => /^steam:[1-9][0-9]*$/.test(tag) && object(value) && Number.isSafeInteger(value.appId) && value.appId === Number(tag.slice(6)) && text(value.name) && value.name.length > 0;
const level = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
function isProfile(value: unknown): value is Profile {
  if (!object(value)) return false;
  return ['nickname', 'appId', 'color', 'region'].every(key => text(value[key]))
    && object(value.times) && text(value.times.start) && text(value.times.end)
    && Array.isArray(value.games) && value.games.every(game => object(game) && text(game.tag)
      && (game.tag.startsWith('steam:') ? steamTag(game.tag, game.steam) : Object.hasOwn(GAMES, game.tag) || (game.tag.startsWith('custom:') && game.tag.length > 7))
      && text(game.platform) && level(game.heat, 0, 4) && level(game.skill, 1, 9)
      && (game.steam === undefined || (object(game.steam) && (game.steam.hours === null || (typeof game.steam.hours === 'number' && Number.isFinite(game.steam.hours) && game.steam.hours >= 0)) && text(game.steam.updated)
        && (game.steam.appId === undefined || (Number.isSafeInteger(game.steam.appId) && Number(game.steam.appId) > 0))
        && (game.steam.name === undefined || text(game.steam.name)))))
    && (value.steamImportedAppIds === undefined || (Array.isArray(value.steamImportedAppIds) && value.steamImportedAppIds.every(id => Number.isSafeInteger(id) && id > 0)))
    && Array.isArray(value.hobbies) && value.hobbies.every(item => object(item) && text(item.name) && level(item.heat, 0, 4))
    && Array.isArray(value.likes) && value.likes.every(item => object(item) && text(item.name) && (item.locked === undefined || typeof item.locked === 'boolean'));
}
export function decodeProfile(raw: string): Profile {
  const data: unknown = JSON.parse(raw);
  if (!object(data) || data.version !== 1 || !isProfile(data.profile)) throw new Error('Invalid saved profile');
  return data.profile;
}

export function createProfileRepository(storage: ProfileStorage) {
  let current = copy(ME);
  let loaded = false;
  let queue: Promise<unknown> = Promise.resolve();
  // 連続した変更やリセットを順番に書き込み、古い保存で新しい値を戻さない。
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const result = queue.then(run);
    queue = result.catch(() => undefined);
    return result;
  }
  return {
    load: () => serial(async () => {
      const raw = await storage.getItem(PROFILE_STORAGE_KEY);
      const profile = raw === null ? copy(ME) : decodeProfile(raw);
      for (const game of profile.games) {
        if (steamTag(game.tag, game.steam)) GAMES[game.tag] = { name: game.steam!.name!, join: 'room', colors: ['#5b6b7a', '#273747'] };
        if (!Object.hasOwn(GAMES, game.tag) && game.tag.startsWith('custom:')) addCustomGame(game.tag.slice(7));
      }
      current = profile;
      loaded = true;
      return copy(current);
    }),
    edit: (change: (profile: Profile) => void) => serial(async () => {
      if (!loaded) throw new Error('Profile has not loaded');
      const next = copy(current);
      change(next);
      await storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, profile: next }));
      current = next;
      return copy(current);
    }),
    reset: () => serial(async () => {
      await storage.removeItem(PROFILE_STORAGE_KEY);
      current = copy(ME);
      loaded = true;
      return copy(current);
    }),
  };
}
