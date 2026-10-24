import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationTarget } from '../src/notifications/payload.ts';
test('Notification taps reject arbitrary links and project only typed IDs for a fresh authorized lookup', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(notificationTarget({ url: 'https://attacker.test' }), null);
  assert.equal(notificationTarget({ eventId: id, kind: 'matched', target: { type: 'url', id } }), null);
  assert.deepEqual(notificationTarget({ eventId: id, kind: 'matched', target: { type: 'recruitment', id }, invitationUrl: 'secret' }),
    { eventId: id, kind: 'matched', target: { type: 'recruitment', id } });
});
