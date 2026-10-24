import { createSteamLoginHandler, IntegrationError, type SteamLoginStore } from '../../../packages/integrations/src/index.ts';
import { adminClient, required } from '../_shared/runtime.ts';

// The adapter only accesses integration_login_*; it never creates/merges Auth users.
function store(db: ReturnType<typeof adminClient>): SteamLoginStore {
  const check = (error: unknown) => { if (error) throw new IntegrationError('configuration'); };
  const iso = (at: number) => new Date(at).toISOString();
  return {
    async putAttempt(hash, value, expiresAt) {
      const { error } = await db.from('integration_login_attempts').insert({ state_hash: hash, payload: value, expires_at: iso(expiresAt) }); check(error);
    },
    async consumeAttempt(hash, now) {
      const { data, error } = await db.rpc('integration_login_consume_attempt', { p_hash: hash, p_now: iso(now) }); check(error);
      return data ?? null;
    },
    async putCode(hash, value, expiresAt) {
      const { error } = await db.from('integration_login_codes').insert({ code_hash: hash, steam_id: value.steamId,
        challenge: value.challenge, redirect_uri: value.redirectUri, expires_at: iso(expiresAt) }); check(error);
    },
    async consumeCode(hash, challenge, redirectUri, now) {
      const { data, error } = await db.rpc('integration_login_consume_code', {
        p_hash: hash, p_challenge: challenge, p_redirect: redirectUri, p_now: iso(now),
      }); check(error); return data ?? null;
    },
    async putAccess(hash, steamId, expiresAt) {
      const { error } = await db.from('integration_login_tokens').insert({ token_hash: hash, steam_id: steamId, expires_at: iso(expiresAt) }); check(error);
    },
    async readAccess(hash, now) {
      const { data, error } = await db.from('integration_login_tokens').select('steam_id').eq('token_hash', hash).gt('expires_at', iso(now)).maybeSingle(); check(error);
      return data?.steam_id ?? null;
    },
  };
}
Deno.serve(async request => {
  try {
    const project = new URL(required('SUPABASE_URL'));
    const handler = createSteamLoginHandler({
      baseUrl: new URL('/functions/v1/steam-auth', project).href,
      redirectUri: new URL('/auth/v1/callback', project).href,
      clientId: required('STEAM_LOGIN_CLIENT_ID'), clientSecret: required('STEAM_LOGIN_CLIENT_SECRET'),
    }, store(adminClient()));
    return await handler(request);
  } catch {
    return Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
});
