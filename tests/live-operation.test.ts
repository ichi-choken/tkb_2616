import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOperation } from '../src/live/operation.ts';

function setup() {
  let id = 0;
  return createOperation(() => `op-${++id}`);
}

test('A lost close response cannot turn a subsequent cancel into the cached close result', async () => {
  const operation = setup();
  const results = new Map<string, string>();
  const executed: string[] = [];
  const send = async (id: string, action: string, loseResponse = false) => {
    if (!results.has(id)) { results.set(id, action); executed.push(action); }
    if (loseResponse) throw new Error('response lost after commit');
    return results.get(id);
  };
  await assert.rejects(operation.run(id => send(id, 'close', true), 'owner:recruitment:close'));
  assert.equal(await operation.run(id => send(id, 'cancel'), 'owner:recruitment:cancel'), 'cancel');
  assert.deepEqual(executed, ['close', 'cancel']);
});

test('Retrying unchanged input after a lost response executes the server operation once', async () => {
  const operation = setup();
  const ids: string[] = [];
  await assert.rejects(operation.run(async id => { ids.push(id); throw new Error('offline'); }, 'same'));
  await operation.run(async id => { ids.push(id); return { ok: true }; }, 'same');
  assert.deepEqual(ids, ['op-1', 'op-1']);
  await operation.run(async id => { ids.push(id); return { ok: true }; }, 'same');
  assert.deepEqual(ids, ['op-1', 'op-1', 'op-2']);
});

test('Changing user, recruitment or meeting input creates a fresh operation', async () => {
  const operation = setup();
  const ids: string[] = [];
  for (const key of ['alice:A:123', 'alice:A:456', 'alice:B:456', 'bob:B:456', 'alice:A:123']) {
    await assert.rejects(operation.run(async id => { ids.push(id); throw new Error('offline'); }, key));
  }
  assert.equal(new Set(ids).size, 5);
});

test('Rapid calls cannot start a second send before React has rendered busy state', async () => {
  const operation = setup();
  let finish!: (value: string) => void;
  const first = operation.run(() => new Promise<string>(resolve => { finish = resolve; }), 'first');
  let secondCalls = 0;
  assert.equal(await operation.run(async () => { secondCalls++; return 'second'; }, 'second'), null);
  assert.equal(secondCalls, 0);
  finish('first');
  assert.equal(await first, 'first');
  assert.equal(await operation.run(async () => 'second', 'second'), 'second');
});
