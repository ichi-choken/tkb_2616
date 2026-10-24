import { IgdbClient, IntegrationError } from '../../../packages/integrations/src/index.ts';
import { adminClient, bodyOf, failure, originHeaders, principalOf, reply, required } from '../_shared/runtime.ts';

let client: IgdbClient | null = null;
function igdb() {
  if (client) return client;
  const db = adminClient();
  client = new IgdbClient({ clientId: required('TWITCH_CLIENT_ID'), clientSecret: required('TWITCH_CLIENT_SECRET') }, {
    async acquire() {
      // One search makes several requests, and the shared gate spaces them out (4 per second,
      // EXT-IGDB-5). Wait out short gaps instead of failing the search.
      let data, waited = 0;
      while (true) {
        const claimed = await db.rpc('integration_claim_igdb');
        if (claimed.error || !claimed.data) throw new IntegrationError('configuration');
        data = claimed.data;
        if (data.lease_id) break;
        const wait = data.retry_after_ms ?? 1000;
        if (waited + wait > 3000) throw new IntegrationError('rate_limited', 429, wait);
        await new Promise(resolve => setTimeout(resolve, wait));
        waited += wait;
      }
      return { async release() {
        const { error } = await db.from('integration_api_leases').delete().eq('id', data.lease_id);
        if (error) throw new IntegrationError('configuration');
      } };
    },
  });
  return client;
}
async function savedGame(db: ReturnType<typeof adminClient>, id: number) {
  const { data, error } = await db.from('games').select('*').eq('id', id).maybeSingle();
  if (error) throw new IntegrationError('configuration');
  return data;
}
// Only the game someone chose is fetched and stored (ADR-70). Choosing happens when publishing
// or joining, both of which need a sign-in (ADR-77, ADR-84).
async function saveGame(request: Request, id: unknown) {
  await principalOf(request);
  if (typeof id !== 'number') throw new IntegrationError('invalid_payload');
  const db = adminClient();
  let record;
  try { record = await igdb().record(id); }
  catch (error) {
    // A game saved before stays selectable while IGDB is unreachable or rate limited.
    const saved = await savedGame(db, id);
    if (saved) return saved;
    throw error;
  }
  if (!record || record.id !== id) throw new IntegrationError('invalid_payload');
  // Refetching replaces cover IDs that IGDB has swapped (EXT-IGDB-7). Columns left out keep their values.
  const row = { id: record.id, name: record.name, alternative_names: record.alternativeNames, platforms: record.platforms,
    cover_image_id: record.coverImageId, first_release_date: record.firstReleaseDate, fetched_at: new Date().toISOString() };
  let { error } = await db.from('games').upsert({ ...row, steam_app_id: record.steamAppId });
  // Another saved game may already hold the Steam app ID (unique); keep this one without the mapping.
  if (error?.code === '23505') ({ error } = await db.from('games').upsert(row));
  if (error) throw new IntegrationError('configuration');
  return savedGame(db, id);
}
Deno.serve(async request => {
  let headers: Record<string, string> = {};
  try {
    headers = originHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const body = await bodyOf(request);
    if (body.save === true) return reply({ game: await saveGame(request, body.id) }, 200, headers);
    // Searching does not create an anonymous identity or write a game catalog.
    const games = typeof body.id === 'number' ? await igdb().get(body.id)
      : typeof body.query === 'string' && typeof body.limit === 'number' ? await igdb().search(body.query, body.limit)
      : null;
    if (!games) throw new IntegrationError('invalid_payload');
    return reply({ source: 'igdb', fetchedAt: new Date().toISOString(), games }, 200, headers);
  } catch (error) { return failure(error, headers); }
});
