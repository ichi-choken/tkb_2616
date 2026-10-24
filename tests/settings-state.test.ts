import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsController, type SettingsPort } from '../src/auth/settings-state.ts';
import type { LinkStatus } from '../packages/integrations/src/link-status.ts';

const steam: LinkStatus = { provider: 'steam', externalId: 'steam-user-a', status: 'retry_wait', lastSuccessAt: '2026-10-01T00:00:00Z', nextAttemptAt: '2026-10-24T12:00:00Z' };
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(overrides: Partial<SettingsPort> = {}) {
  let listener!: (id: string | null) => void;
  const controller = createSettingsController({
    watchUser(fn) { listener = fn; fn(null); return () => {}; },
    signIn: async () => 'cancelled', signOut: async () => {},
    links: async () => [steam], link: async () => 'cancelled', unlink: async () => {},
    ...overrides,
  });
  const stop = controller.start();
  return { controller, user: (id: string | null) => listener(id), stop };
}

test('unconfigured and cancelled login cannot become authenticated', async () => {
  const unconfigured = createSettingsController(null);
  unconfigured.start();
  await unconfigured.login('steam');
  assert.equal(unconfigured.getSnapshot().configured, false);
  assert.equal(unconfigured.getSnapshot().userId, null);
  const { controller, stop } = setup();
  for (const provider of ['discord', 'google', 'steam'] as const) {
    await controller.login(provider);
    assert.equal(controller.getSnapshot().userId, null);
    assert.match(controller.getSnapshot().message, /キャンセル/);
  }
  stop();
});

test('Apple login does nothing: no browser, no message (ADR-84)', async () => {
  let started = 0;
  const { controller, stop } = setup({ signIn: async () => { started++; return 'completed'; } });
  await controller.login('apple');
  assert.equal(started, 0);
  assert.equal(controller.getSnapshot().userId, null);
  assert.equal(controller.getSnapshot().busy, null);
  assert.equal(controller.getSnapshot().message, '');
  stop();
});

test('failed status fetch is unknown, not unlinked; retry recovers', async () => {
  let fail = true;
  const { controller, user, stop } = setup({ links: async () => { if (fail) throw new Error('offline'); return [steam]; } });
  user('a'); await settle();
  assert.equal(controller.getSnapshot().links, null);
  assert.equal(controller.getSnapshot().linksError, true);
  fail = false; await controller.refresh();
  assert.deepEqual(controller.getSnapshot().links, [steam]);
  assert.equal(controller.getSnapshot().linksError, false);
  stop();
});

test('late response cannot restore previous user links after logout or account switch', async () => {
  const old = deferred<LinkStatus[]>();
  let calls = 0;
  const { controller, user, stop } = setup({ links: () => ++calls === 1 ? old.promise : Promise.resolve([]) });
  user('a'); await settle();
  user(null);
  assert.equal(controller.getSnapshot().links, null);
  user('b'); await settle();
  old.resolve([steam]); await settle();
  assert.equal(controller.getSnapshot().userId, 'b');
  assert.deepEqual(controller.getSnapshot().links, []);
  stop();
});

test('re-checking on window focus keeps a known status usable: the first click still starts linking', async () => {
  const later = deferred<LinkStatus[]>();
  let calls = 0;
  let started = 0;
  const { controller, user, stop } = setup({
    links: () => ++calls === 1 ? Promise.resolve([steam]) : later.promise,
    link: async () => { started++; return 'redirecting'; },
  });
  user('a'); await settle();
  // 窓に戻ったときの再確認（focus）。確認中でも、分かっている状態は使えるままにする
  const refreshing = controller.refresh();
  assert.equal(controller.getSnapshot().linksLoading, false);
  assert.deepEqual(controller.getSnapshot().links, [steam]);
  await controller.link('discord');
  assert.equal(started, 1);
  later.resolve([steam]); await refreshing;
  assert.deepEqual(controller.getSnapshot().links, [steam]);
  stop();
});

test('first load and reload after a failure still show loading', async () => {
  let fail = true;
  const pending = deferred<LinkStatus[]>();
  const { controller, user, stop } = setup({ links: () => fail ? Promise.reject(new Error('offline')) : pending.promise });
  user('a');
  assert.equal(controller.getSnapshot().linksLoading, true);
  await settle();
  assert.equal(controller.getSnapshot().linksError, true);
  fail = false;
  const retry = controller.refresh();
  assert.equal(controller.getSnapshot().linksLoading, true);
  pending.resolve([steam]); await retry;
  assert.equal(controller.getSnapshot().linksLoading, false);
  stop();
});

test('cancelled relink and failed unlink preserve current link', async () => {
  const { controller, user, stop } = setup({ unlink: async () => { throw new Error('offline'); } });
  user('a'); await settle();
  await controller.link('steam');
  assert.match(controller.getSnapshot().message, /キャンセル/);
  assert.deepEqual(controller.getSnapshot().links, [steam]);
  await controller.unlink('steam');
  assert.match(controller.getSnapshot().message, /解除できません/);
  assert.deepEqual(controller.getSnapshot().links, [steam]);
  stop();
});

test('successful unlink removes old link even when reload fails', async () => {
  let removed = false;
  const { controller, user, stop } = setup({
    links: async () => { if (removed) throw new Error('offline'); return [steam]; },
    unlink: async () => { removed = true; },
  });
  user('a'); await settle();
  await controller.unlink('steam');
  assert.equal(removed, true);
  assert.equal(controller.getSnapshot().links, null);
  assert.equal(controller.getSnapshot().linksError, true);
  stop();
});

test('double taps make one request and failed logout keeps authenticated state', async () => {
  const pending = deferred<void>();
  let calls = 0;
  const { controller, user, stop } = setup({ signOut: () => { calls++; return pending.promise; } });
  user('a'); await settle();
  const first = controller.logout();
  await controller.logout();
  assert.equal(calls, 1);
  pending.reject(new Error('offline')); await first;
  assert.equal(controller.getSnapshot().userId, 'a');
  assert.deepEqual(controller.getSnapshot().links, [steam]);
  assert.match(controller.getSnapshot().message, /ログアウトできません/);
  stop();
});

test('late logout completion cannot clear another account or update an unmounted screen', async () => {
  const pending = deferred<void>();
  const { controller, user, stop } = setup({ signOut: () => pending.promise });
  user('a'); await settle();
  const action = controller.logout();
  user(null); user('b'); await settle();
  pending.resolve(); await action;
  assert.equal(controller.getSnapshot().userId, 'b');
  const old = deferred<LinkStatus[]>();
  const other = setup({ links: () => old.promise });
  other.user('c'); await settle();
  other.stop();
  const before = other.controller.getSnapshot();
  old.resolve([steam]); await settle();
  assert.equal(other.controller.getSnapshot(), before);
  stop();
});
