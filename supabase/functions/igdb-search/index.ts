import { IgdbClient, IntegrationError } from '../../../packages/integrations/src/index.ts';
import { adminClient, bodyOf, failure, originHeaders, reply, required } from '../_shared/runtime.ts';

let client: IgdbClient | null = null;
function igdb() {
  if (client) return client;
  const db = adminClient();
  client = new IgdbClient({ clientId: required('TWITCH_CLIENT_ID'), clientSecret: required('TWITCH_CLIENT_SECRET') }, {
    async acquire() {
      const { data, error } = await db.rpc('integration_claim_igdb');
      if (error || !data) throw new IntegrationError('configuration');
      if (!data.lease_id) throw new IntegrationError('rate_limited', 429, data.retry_after_ms ?? 1000);
      return { async release() {
        const { error } = await db.from('integration_api_leases').delete().eq('id', data.lease_id);
        if (error) throw new IntegrationError('configuration');
      } };
    },
  });
  return client;
}
Deno.serve(async request => {
  let headers: Record<string, string> = {};
  try {
    headers = originHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const body = await bodyOf(request);
    // Read-only search does not create an anonymous identity or write a game catalog.
    const games = typeof body.id === 'number' ? await igdb().get(body.id)
      : typeof body.query === 'string' && typeof body.limit === 'number' ? await igdb().search(body.query, body.limit)
      : null;
    if (!games) throw new IntegrationError('invalid_payload');
    return reply({ source: 'igdb', fetchedAt: new Date().toISOString(), games }, 200, headers);
  } catch (error) { return failure(error, headers); }
});
