import { DiscordClient, SteamClient, IntegrationError, runSync, tokenCipher, type DiscordTokens, type Reading, type SyncPolicy } from '../../../packages/integrations/src/index.ts';
import { adminClient, failure, reply, required, verifyWorker } from '../_shared/runtime.ts';
import { claimDueLinks, commitSnapshot, type LinkRow } from '../_shared/store.ts';

function policyFor(provider: string): SyncPolicy {
  const prefix = provider.toUpperCase();
  const read = (name: string) => {
    const number = Number(required(name));
    if (!Number.isSafeInteger(number) || number < 0) throw new IntegrationError('configuration');
    return number;
  };
  const policy = { intervalMs: read(`${prefix}_SYNC_INTERVAL_MS`), retryMs: read(`${prefix}_SYNC_RETRY_MS`), staleAfterMs: read(`${prefix}_SYNC_STALE_MS`) };
  if (!policy.intervalMs || !policy.retryMs) throw new IntegrationError('configuration');
  return policy;
}
async function syncOne(row: LinkRow, db: ReturnType<typeof adminClient>) {
  let ciphertext = row.token_ciphertext;
  const read = async (): Promise<Reading<unknown>> => {
    if (row.provider === 'steam') {
      const steam = new SteamClient(required('STEAM_WEB_API_KEY'));
      const [profile, library] = await Promise.all([steam.profile(row.external_id), steam.ownedGames(row.external_id)]);
      if (library.status === 'unavailable') return { status: 'unavailable' };
      return { status: 'available', value: { profile, library }, fetchedAt: library.fetchedAt };
    }
    if (!ciphertext) throw new IntegrationError('relink_required');
    const cipher = await tokenCipher(required('INTEGRATION_TOKEN_KEY'));
    let tokens = await cipher.open<DiscordTokens>(ciphertext, `${row.user_id}:discord`);
    const discord = new DiscordClient({ clientId: required('DISCORD_LINK_CLIENT_ID'), clientSecret: required('DISCORD_LINK_CLIENT_SECRET'), redirectUri: required('INTEGRATION_CALLBACK_URL') });
    if (!Number.isFinite(Date.parse(tokens.expiresAt))) throw new IntegrationError('relink_required');
    if (Date.parse(tokens.expiresAt) <= Date.now() + 60_000) {
      tokens = await discord.refresh(tokens.refreshToken);
      // Commit rotated refresh credentials even if the next data request fails.
      ciphertext = await cipher.seal(tokens, `${row.user_id}:discord`);
    }
    let user;
    try { user = await discord.currentUser(tokens.accessToken); }
    catch (error) { if (error instanceof IntegrationError && error.kind === 'unauthorized') throw new IntegrationError('relink_required'); throw error; }
    if (user.discordId !== row.external_id) throw new IntegrationError('relink_required');
    return { status: 'available', value: { createdAt: user.createdAt, emailVerified: user.emailVerified }, fetchedAt: new Date().toISOString() };
  };
  return runSync({ linkId: row.id, revision: row.revision, previous: row.snapshot }, read,
    { commitIfCurrent: (_, snapshot) => commitSnapshot(db, row, snapshot, ciphertext) }, policyFor(row.provider));
}

Deno.serve(async request => {
  try {
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    await verifyWorker(request);
    // Missing Q-24 settings is a configuration error, never an invented interval.
    policyFor('steam'); policyFor('discord');
    const db = adminClient();
    const rows = await claimDueLinks(db, Date.now());
    let updated = 0; let failed = 0;
    // Process up to four leases concurrently; each provider request has a timeout.
    for (let offset = 0; offset < rows.length; offset += 4) {
      const results = await Promise.allSettled(rows.slice(offset, offset + 4).map(row => syncOne(row, db)));
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.committed) updated++;
        else failed++;
      }
    }
    const { error } = await db.from('integration_attempts').delete().lte('expires_at', new Date().toISOString());
    if (error) failed++;
    return reply({ checked: rows.length, updated, failed });
  } catch (error) { return failure(error); }
});
