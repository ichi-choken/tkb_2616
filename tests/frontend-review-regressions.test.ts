import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPendingSave } from '../app/src/pending-save.ts';
import { createDemoSettings, freshLink, steamProfileVisible } from '../app/src/demo-settings-state.ts';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('Leaving recruit editing during the save prevents both profile and recruitment commits', async () => {
  const wait = deferred();
  const save = createPendingSave();
  const state = { profileSkill: 5, recruitmentSkill: 5, navigations: 0 };
  const action = save.run(() => wait.promise, () => {
    state.profileSkill = 7; state.recruitmentSkill = 7; state.navigations++;
  });
  assert.equal(save.isPending(), true);
  save.cancel(); // screen cleanup after tab navigation / browser back
  wait.resolve();
  assert.equal(await action, false);
  assert.deepEqual(state, { profileSkill: 5, recruitmentSkill: 5, navigations: 0 });
  assert.equal(save.isPending(), false);
});

test('Duplicate save requests commit once; an abandoned attempt cannot overwrite a new edit', async () => {
  const first = deferred(), second = deferred();
  const save = createPendingSave();
  const commits: string[] = [];
  const old = save.run(() => first.promise, () => { commits.push('old'); });
  assert.equal(await save.run(async () => {}, () => { commits.push('duplicate'); }), false);
  save.cancel();
  const current = save.run(() => second.promise, () => { commits.push('current'); });
  first.resolve(); await old;
  assert.equal(save.isPending(), true);
  second.resolve(); assert.equal(await current, true);
  assert.deepEqual(commits, ['current']);
});

test('Failed saves do not commit and allow retry; failures after leaving the screen are ignored', async () => {
  const save = createPendingSave();
  let commits = 0;
  await assert.rejects(save.run(async () => { throw new Error('offline'); }, () => { commits++; }));
  assert.equal(commits, 0);
  assert.equal(save.isPending(), false);
  assert.equal(await save.run(async () => {}, () => { commits++; }), true);
  const wait = deferred();
  const old = save.run(() => wait.promise, () => { commits++; });
  save.cancel(); wait.reject(new Error('late failure'));
  assert.equal(await old, false);
  assert.equal(commits, 1);
});

test('Steam profile display follows the shared setting, unlink and private status', () => {
  const settings = createDemoSettings();
  const visible: boolean[] = [];
  const stop = settings.subscribe(() => visible.push(steamProfileVisible(settings.getSnapshot())));
  const show = () => steamProfileVisible(settings.getSnapshot());
  assert.equal(show(), false); // no link: do not show cached/sample playtime
  settings.update(s => { s.steam.linked = true; });
  assert.equal(show(), true);
  settings.update(s => { s.steamShow.games = false; });
  assert.equal(show(), false);
  settings.update(s => { s.steam.fetch = 'retry'; });
  assert.equal(show(), false); // refresh/retry cannot undo the user's preference
  settings.update(s => { s.steamShow.games = true; });
  assert.equal(show(), true); // a temporary failure retains the previous value
  settings.update(s => { s.steam.fetch = 'private'; });
  assert.equal(show(), false);
  settings.update(s => { s.steam.fetch = 'auto'; });
  assert.equal(show(), true);
  settings.update(s => { s.steam = freshLink(); });
  assert.equal(show(), false);
  assert.deepEqual(visible, [true, false, false, true, false, true, false]);
  stop();
});

test('Demo settings snapshots are shared immutably and resetting removes Steam visibility', () => {
  const settings = createDemoSettings();
  const initial = settings.getSnapshot();
  assert.equal(settings.getSnapshot(), initial);
  settings.update(s => { s.steam.linked = true; s.steamShow.games = false; });
  assert.equal(initial.steam.linked, false);
  assert.equal(initial.steamShow.games, true);
  settings.reset();
  assert.equal(steamProfileVisible(settings.getSnapshot()), false);
  assert.deepEqual(settings.getSnapshot(), initial);
});

test('Async profile persistence keeps save pending and does not navigate after leaving', async () => {
  const storage = deferred();
  const started = deferred();
  const save = createPendingSave();
  let navigations = 0;
  const action = save.run(async () => {}, async isCurrent => {
    started.resolve();
    await storage.promise;
    if (isCurrent()) navigations++;
  });
  await started.promise;
  assert.equal(save.isPending(), true);
  assert.equal(await save.run(async () => {}, () => { navigations++; }), false);
  save.cancel();
  storage.resolve();
  assert.equal(await action, false);
  assert.equal(navigations, 0);
});

test('An async profile write failure releases the save guard for a retry', async () => {
  const save = createPendingSave();
  await assert.rejects(save.run(async () => {}, async () => { throw new Error('storage full'); }));
  assert.equal(save.isPending(), false);
  let committed = false;
  assert.equal(await save.run(async () => {}, async () => { committed = true; }), true);
  assert.equal(committed, true);
});

test('Restored Steam settings still control profile visibility and reset is persisted', () => {
  let stored: string | null = null;
  const storage = { readItem: () => stored, writeItem: (_key: string, value: string) => { stored = value; return true; } };
  const first = createDemoSettings(storage);
  first.update(s => { s.steam.linked = true; s.steamShow.games = false; s.discord.phase = 'authing'; s.googleStep = true; });
  const restored = createDemoSettings(storage);
  assert.equal(restored.getSnapshot().steam.linked, true);
  assert.equal(steamProfileVisible(restored.getSnapshot()), false);
  assert.equal(restored.getSnapshot().discord.phase, 'idle');
  assert.equal(restored.getSnapshot().googleStep, false);
  restored.update(s => { s.steamShow.games = true; });
  assert.equal(steamProfileVisible(createDemoSettings(storage).getSnapshot()), true);
  restored.reset();
  assert.equal(steamProfileVisible(createDemoSettings(storage).getSnapshot()), false);
});
