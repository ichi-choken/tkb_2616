import type { GameRow } from './api';

export type RecruitmentDraft = {
  sourceGame: string | null;
  game: GameRow | null;
  pendingGameId: number | null;
  query: string;
  when: string;
  time: string;
  need: number | null;
  platform: string | null;
  vc: string | null;
  heat: number;
  skill: number;
  needsId: boolean | null;
  mode: string | null;
  room: string;
  url: string;
  parts: Record<'when' | 'need' | 'platform' | 'vc' | 'skill' | 'heat', boolean>;
};
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'shumitomo:recruitment-login-draft';
const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const nullableString = (x: unknown) => x === null || typeof x === 'string';
const strings = (x: unknown) => Array.isArray(x) && x.every(value => typeof value === 'string');
function isGame(x: unknown) {
  return isRecord(x) && Number.isSafeInteger(x.id) && typeof x.name === 'string'
    && nullableString(x.cover_image_id) && typeof x.hide_cover === 'boolean' && strings(x.platforms)
    && (x.modes === null || strings(x.modes)) && (x.needs_participant_id_default === null || typeof x.needs_participant_id_default === 'boolean');
}
function isDraft(x: unknown): x is RecruitmentDraft {
  if (!isRecord(x)) return false;
  return nullableString(x.sourceGame) && (x.game === null || isGame(x.game))
    && (x.pendingGameId === null || Number.isSafeInteger(x.pendingGameId))
    && ['query', 'when', 'time', 'room', 'url'].every(k => typeof x[k] === 'string')
    && (x.need === null || (Number.isSafeInteger(x.need) && (x.need as number) > 0))
    && ['platform', 'vc', 'mode'].every(k => nullableString(x[k]))
    && Number.isInteger(x.heat) && (x.heat as number) >= 0 && (x.heat as number) <= 4
    && Number.isInteger(x.skill) && (x.skill as number) >= 1 && (x.skill as number) <= 9
    && (x.needsId === null || typeof x.needsId === 'boolean')
    && isRecord(x.parts) && ['when', 'need', 'platform', 'vc', 'skill', 'heat'].every(k => typeof (x.parts as Record<string, unknown>)[k] === 'boolean');
}

// Saved only when the person explicitly leaves to sign in. A signed-in person's room and URL
// can be restored only for that same account; an anonymous draft belongs to the next sign-in.
export function createRecruitmentDraftStore(storage: DraftStorage) {
  return {
    save(draft: RecruitmentDraft, ownerId: string | null): boolean {
      try { storage.setItem(KEY, JSON.stringify({ version: 1, ownerId, draft })); return true; }
      catch { return false; }
    },
    take(ownerId: string | null, sourceGame: string | null): RecruitmentDraft | null {
      try {
        const raw = storage.getItem(KEY);
        storage.removeItem(KEY);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        if (!isRecord(value) || value.version !== 1 || !nullableString(value.ownerId) || !isDraft(value.draft)) return null;
        if (value.ownerId !== null && value.ownerId !== ownerId) return null;
        return value.draft.sourceGame === sourceGame ? value.draft : null;
      } catch { return null; }
    },
    clear() { try { storage.removeItem(KEY); } catch { /* Nothing is restored if storage is unavailable. */ } },
  };
}

// Profile games currently use demo tags. Resolve their existing names through the real search,
// rather than guessing an IGDB id (local seed ids are deliberately negative and unrelated).
export function gameRouteInput(value: string | undefined, names: Record<string, { name: string }>): { id: number } | { query: string } | null {
  if (!value) return null;
  if (/^-?\d+$/.test(value) && Number.isSafeInteger(Number(value))) return { id: Number(value) };
  return Object.hasOwn(names, value) ? { query: names[value]!.name } : null;
}
export function exactSavedGame<T extends { name: string }>(games: T[], query: string): T | null {
  const normalize = (name: string) => name.normalize('NFKC').trim().toLowerCase();
  const matching = games.filter(g => normalize(g.name) === normalize(query));
  return matching.length === 1 ? matching[0] ?? null : null;
}
