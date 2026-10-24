import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsExternalBrowser } from '../src/auth/browser-environment.ts';
test('Google OAuth identifies known embedded webviews without blocking ordinary browsers', () => {
  assert.equal(needsExternalBrowser('Mozilla/5.0 (Linux; Android 14; Device; wv) Chrome/140 Mobile Safari/537.36'), true);
  assert.equal(needsExternalBrowser('Mozilla/5.0 iPhone Instagram 400.0'), true);
  assert.equal(needsExternalBrowser('Mozilla/5.0 iPhone Line/15.0'), true);
  assert.equal(needsExternalBrowser('Mozilla/5.0 iPhone Version/18.0 Mobile Safari/604.1'), false);
  assert.equal(needsExternalBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile Safari/537.36'), false);
});
