import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecruitmentDraftStore, exactSavedGame, gameRouteInput, type RecruitmentDraft } from '../src/live/create-draft.ts';
import { GAMES } from '../app/src/data.ts';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const draft: RecruitmentDraft = {
  sourceGame: 'apex',
  game: { id: 100, name: 'Apex Legends', cover_image_id: null, hide_cover: false, platforms: ['PC'], modes: null, needs_participant_id_default: true },
  pendingGameId: null, query: '', when: '2026-10-26', time: '22:15', need: 2,
  platform: 'PC（Steam）', vc: 'あり', heat: 3, skill: 7, needsId: true, mode: null,
  room: 'ROOM123', url: 'https://example.test/invite',
  parts: { when: false, need: true, platform: true, vc: false, skill: true, heat: true },
};

test('An anonymous recruitment draft survives the OAuth page reload and is consumed by the next login', () => {
  const persisted = storage();
  assert.equal(createRecruitmentDraftStore(persisted).save(draft, null), true);
  const afterOAuth = createRecruitmentDraftStore(persisted);
  assert.deepEqual(afterOAuth.take('signed-in-user', 'apex'), draft);
  assert.equal(afterOAuth.take('signed-in-user', 'apex'), null);
});

test('A session-expired draft restores only for the original account, including private room fields', () => {
  const persisted = storage();
  const store = createRecruitmentDraftStore(persisted);
  store.save(draft, 'original-user');
  assert.deepEqual(store.take('original-user', 'apex'), draft);
  store.save(draft, 'original-user');
  assert.equal(store.take('different-user', 'apex'), null);
  assert.equal(store.take('original-user', 'apex'), null);
});

test('Drafts from a different create route or a successful publication are not restored', () => {
  const store = createRecruitmentDraftStore(storage());
  store.save(draft, null);
  assert.equal(store.take('signed-in-user', 'splatoon3'), null);
  store.save(draft, null);
  store.clear();
  assert.equal(store.take('signed-in-user', 'apex'), null);
});

test('Choosing an IGDB candidate before login preserves the chosen real ID and the rest of the form', () => {
  const store = createRecruitmentDraftStore(storage());
  const pending = { ...draft, game: null, pendingGameId: 456 };
  store.save(pending, null);
  assert.deepEqual(store.take('signed-in-user', 'apex'), pending);
});

test('Unreadable storage does not permit leaving a form whose input could not be saved', () => {
  const store = createRecruitmentDraftStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() {} });
  assert.equal(store.save(draft, null), false);
  assert.equal(store.take('user', 'apex'), null);
});

test('Profile tags use their existing game names; numeric database IDs, including local seeds, stay numeric', () => {
  assert.deepEqual(gameRouteInput('apex', GAMES), { query: 'Apex Legends' });
  assert.deepEqual(gameRouteInput('splatoon3', GAMES), { query: 'スプラトゥーン3' });
  assert.deepEqual(gameRouteInput('-1', GAMES), { id: -1 });
  assert.deepEqual(gameRouteInput('123', GAMES), { id: 123 });
  assert.equal(gameRouteInput('toString', GAMES), null);
  assert.equal(gameRouteInput('unknown', GAMES), null);
  assert.equal(gameRouteInput(undefined, GAMES), null);
});

test('Only one exact saved game can be auto-selected; similar or ambiguous names require confirmation', () => {
  const rows = [{ id: 1, name: 'Apex Legends Mobile' }, { id: 2, name: 'Apex Legends' }];
  assert.deepEqual(exactSavedGame(rows, ' Ａｐｅｘ Legends '), rows[1]);
  assert.equal(exactSavedGame(rows, 'Apex'), null);
  assert.equal(exactSavedGame([...rows, { id: 3, name: 'APEX LEGENDS' }], 'Apex Legends'), null);
});
