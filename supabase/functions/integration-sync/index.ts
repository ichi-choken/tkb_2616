import { adminClient, failure, reply, verifyWorker } from '../_shared/runtime.ts';
import { claimDueLinks } from '../_shared/store.ts';
import { policyFor, syncOne } from '../_shared/sync.ts';

Deno.serve(async request => {
  try {
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    await verifyWorker(request);
    // Discord cadence remains undecided. It must not block the agreed Steam schedule.
    const providers: Array<'steam' | 'discord'> = ['steam'];
    if (Deno.env.get('DISCORD_SYNC_INTERVAL_MS')) { policyFor('discord'); providers.push('discord'); }
    const db = adminClient();
    const rows = await claimDueLinks(db, Date.now(), providers);
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
    // Short-lived OAuth artifacts have no reason to survive their expiry.
    for (const table of ['integration_login_attempts', 'integration_login_codes', 'integration_login_tokens']) {
      const result = await db.from(table).delete().lte('expires_at', new Date().toISOString());
      if (result.error) failed++;
    }
    return reply({ checked: rows.length, updated, failed });
  } catch (error) { return failure(error); }
});
