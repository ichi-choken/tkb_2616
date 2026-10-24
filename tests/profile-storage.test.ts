import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileRepository, decodeProfile, PROFILE_STORAGE_KEY, type ProfileStorage } from '../app/src/profile-storage.ts';
import { GAMES, ME, addCustomGame } from '../app/src/data.ts';

function memory() {
  const values = new Map<string, string>();
  const storage: ProfileStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  return { values, storage };
}

test('saved profile, levels and custom game survive a new repository; drafts do not', async () => {
  const { values, storage } = memory();
  const first = createProfileRepository(storage);
  const draft = await first.load();
  draft.nickname = '未保存';
  assert.equal(values.size, 0);
  const tag = addCustomGame('保存確認用のゲーム');
  await first.edit(profile => {
    profile.nickname = '保存した名前';
    profile.games[0]!.heat = 1;
    profile.games[0]!.skill = 8;
    profile.games.push({ tag, platform: 'Switch', heat: 2, skill: 3 });
    profile.likes.push({ name: '保存した好きなもの', locked: true });
  });
  delete GAMES[tag]; // 再起動後はカタログも初期状態になる。
  const restored = await createProfileRepository(storage).load();
  assert.equal(restored.nickname, '保存した名前');
  assert.equal(restored.games[0]!.heat, 1);
  assert.equal(restored.games[0]!.skill, 8);
  assert.equal(GAMES[tag]!.name, '保存確認用のゲーム');
  assert.equal(restored.likes.at(-1)?.locked, true);
});

test('concurrent edits are serialized without dropping earlier changes', async () => {
  const { values, storage } = memory();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  const repository = createProfileRepository({ ...storage, setItem: async (key, value) => {
    if (++writes === 1) await gate;
    await storage.setItem(key, value);
  } });
  await repository.load();
  const first = repository.edit(profile => { profile.nickname = '名前'; });
  const second = repository.edit(profile => { profile.games[0]!.skill = 7; });
  release();
  await Promise.all([first, second]);
  const stored = decodeProfile(values.get(PROFILE_STORAGE_KEY)!);
  assert.equal(stored.nickname, '名前');
  assert.equal(stored.games[0]!.skill, 7);
});

test('failed writes preserve the last saved profile and allow retry', async () => {
  const { storage } = memory();
  let fail = true;
  const repository = createProfileRepository({ ...storage, setItem: async (key, value) => {
    if (fail) throw new Error('Storage full');
    await storage.setItem(key, value);
  } });
  await repository.load();
  await assert.rejects(repository.edit(profile => { profile.nickname = '失敗した名前'; }));
  fail = false;
  const profile = await repository.edit(value => { value.games[0]!.skill = 9; });
  assert.equal(profile.nickname, ME.nickname);
  assert.equal((await createProfileRepository(storage).load()).games[0]!.skill, 9);
});

test('reset follows pending writes and clears only this demo profile', async () => {
  const { values, storage } = memory();
  values.set('unrelated', 'keep');
  const repository = createProfileRepository(storage);
  await repository.load();
  const save = repository.edit(profile => { profile.nickname = '変更'; });
  const reset = repository.reset();
  await Promise.all([save, reset]);
  assert.equal(values.has(PROFILE_STORAGE_KEY), false);
  assert.equal(values.get('unrelated'), 'keep');
  assert.deepEqual(await createProfileRepository(storage).load(), ME);
});

test('corrupt or incompatible data is reported without overwriting it', async () => {
  const { values, storage } = memory();
  for (const raw of ['broken', JSON.stringify({ version: 2, profile: ME }), JSON.stringify({ version: 1, profile: { ...ME, games: [{ tag: 'unknown' }] } })]) {
    values.set(PROFILE_STORAGE_KEY, raw);
    await assert.rejects(createProfileRepository(storage).load());
    assert.equal(values.get(PROFILE_STORAGE_KEY), raw);
  }
});
