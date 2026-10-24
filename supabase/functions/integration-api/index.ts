import { beginSteamLink, finishSteamLink, beginDiscordLink, finishDiscordLink, DiscordClient, IntegrationError, tokenCipher, type Provider } from '../../../packages/integrations/src/index.ts';
import { adminClient, bodyOf, failure, originHeaders, principalOf, reply, required } from '../_shared/runtime.ts';
import { attemptStore, claimInitialSteam, linkStatus, removeLink, saveLink } from '../_shared/store.ts';

import { syncOne } from '../_shared/sync.ts';

function providerOf(value: unknown): Provider {
  if (value !== 'steam' && value !== 'discord') throw new IntegrationError('invalid_payload');
  return value;
}
function callbackFor(native: boolean) {
  const url = new URL(required('INTEGRATION_CALLBACK_URL'));
  if (native) url.searchParams.set('native', '1');
  return url.href;
}
function discord(native: boolean) { return new DiscordClient({ clientId: required('DISCORD_LINK_CLIENT_ID'), clientSecret: required('DISCORD_LINK_CLIENT_SECRET'), redirectUri: callbackFor(native) }); }

Deno.serve(async request => {
  let headers: Record<string, string> = {};
  try {
    headers = originHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const principal = await principalOf(request);
    const body = await bodyOf(request);
    const db = adminClient();
    if (body.action === 'status') return reply({ links: await linkStatus(db, principal.userId) }, 200, headers);
    const provider = providerOf(body.provider);
    const store = attemptStore(db);
    if (body.action === 'start') {
      const callback = callbackFor(body.client === 'native');
      const url = provider === 'steam'
        ? await beginSteamLink(principal, callback, 300_000, store)
        : await beginDiscordLink(discord(body.client === 'native'), principal, callback, 300_000, store);
      return reply({ authorizationUrl: url }, 200, headers);
    }
    if (body.action === 'complete') {
      if (typeof body.callbackUrl !== 'string') throw new IntegrationError('invalid_payload');
      let callback: URL;
      try { callback = new URL(body.callbackUrl); } catch { throw new IntegrationError('invalid_payload'); }
      const result = provider === 'steam'
        ? await finishSteamLink(callback, principal, store)
        : await finishDiscordLink(discord(callback.searchParams.get('native') === '1'), callback, principal, store);
      if (result.status === 'cancelled') return reply({ status: 'cancelled' }, 200, headers);
      const state = callback.searchParams.get('state')!; // Verified as exactly one value by finish*Link.
      if ('steamId' in result) {
        await saveLink(db, principal, 'steam', state, result.steamId, null);
        const row = await claimInitialSteam(db, principal.userId);
        if (row) await syncOne(row, db);
      }
      else {
        const cipher = await tokenCipher(required('INTEGRATION_TOKEN_KEY'));
        await saveLink(db, principal, 'discord', state, result.identity.discordId, await cipher.seal(result.tokens, `${principal.userId}:discord`));
      }
      return reply({ status: 'linked', provider }, 200, headers);
    }
    if (body.action === 'unlink') {
      await removeLink(db, principal.userId, provider);
      return reply({ status: 'unlinked', provider }, 200, headers);
    }
    throw new IntegrationError('invalid_payload');
  } catch (error) { return failure(error, headers); }
});
