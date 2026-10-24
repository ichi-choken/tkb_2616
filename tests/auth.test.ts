import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthFlow, parseAuthCallback, requireRegisteredUser, type AuthPort, type LoginProvider } from '../src/auth/flow.ts';

const redirect = 'https://example.test/auth/callback';
function fakeAuth(): AuthPort {
  return {
    signInWithOAuth: async () => ({ data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null }),
    exchangeCodeForSession: async () => ({ error: null }),
    getUser: async () => ({ data: { user: { id: 'user-a', is_anonymous: false } }, error: null }),
    signOut: async () => ({ error: null }),
  };
}
test('All four logins use Supabase PKCE; Steam uses the verified custom provider', async () => {
  for (const provider of ['discord', 'google', 'steam', 'apple'] as const) {
    const auth = fakeAuth();
    auth.signInWithOAuth = async input => {
      assert.deepEqual(input, { provider: provider === 'steam' ? 'custom:steam' : provider, options: { redirectTo: redirect, skipBrowserRedirect: true } });
      return { data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null };
    };
    const flow = createAuthFlow(auth, redirect, async () => `${redirect}?code=auth-code`);
    assert.deepEqual(await flow.signIn(provider), { status: 'authenticated', user: { id: 'user-a' } });
    await assert.rejects(flow.signIn('unknown' as LoginProvider));
  }
});
test('Callback rejects foreign hosts, duplicate codes, URL fragments and provider errors', () => {
  for (const url of ['https://attacker.test/auth/callback?code=a', `${redirect}?code=a&code=b`, `${redirect}?code=a#access_token=secret`, `${redirect}?error=access_denied`, `${redirect}?code=a&sb_flow_id=`]) {
    assert.throws(() => parseAuthCallback(url, redirect));
  }
  assert.deepEqual(parseAuthCallback('shumitomo://auth/callback?code=a', 'shumitomo://auth/callback'), { code: 'a' });
});
test('Concurrent callback delivery exchanges once and forwards Supabase flow ID', async () => {
  const auth = fakeAuth();
  let exchanges = 0;
  auth.exchangeCodeForSession = async (code, options) => {
    exchanges++;
    assert.equal(code, 'auth-code');
    assert.deepEqual(options, { flowId: 'flow-a' });
    return { error: null };
  };
  const flow = createAuthFlow(auth, redirect, async () => null);
  await Promise.all([flow.complete(`${redirect}?code=auth-code&sb_flow_id=flow-a`), flow.complete(`${redirect}?code=auth-code&sb_flow_id=flow-a`)]);
  assert.equal(exchanges, 1);
});
test('Anonymous or rejected sessions cannot become a registered principal', async () => {
  const auth = fakeAuth();
  auth.getUser = async () => ({ data: { user: { id: 'guest', is_anonymous: true } }, error: null });
  await assert.rejects(requireRegisteredUser(auth));
  auth.getUser = async () => ({ data: { user: { id: 'forged' } }, error: new Error('invalid token') });
  await assert.rejects(requireRegisteredUser(auth));
});
test('Provider failures are sanitized and never expose the returned token or body', async () => {
  const auth = fakeAuth();
  auth.exchangeCodeForSession = async () => ({ error: new Error('token=secret') });
  const flow = createAuthFlow(auth, redirect, async () => null);
  await assert.rejects(flow.complete(`${redirect}?code=a`), error => !String(error).includes('secret'));
});
