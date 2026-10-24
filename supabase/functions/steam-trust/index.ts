import { IntegrationError, steamTrust, type SteamSnapshotValue, type SyncSnapshot } from '../../../packages/integrations/src/index.ts';
import { adminClient, bodyOf, failure, originHeaders, reply } from '../_shared/runtime.ts';

const isUuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const isGameId = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
function listOf<T>(value: unknown, valid: (x: unknown) => x is T, max: number): T[] {
  if (!Array.isArray(value) || value.length > max || !value.every(valid)) throw new IntegrationError('invalid_payload');
  return [...new Set(value)];
}

// Trust indicators show wherever a recruitment or a request does (list-9, requests-1), including
// to people who have not signed in, so no sign-in is required. Users without a Steam link are left out.
Deno.serve(async request => {
  let headers: Record<string, string> = {};
  try {
    headers = originHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const body = await bodyOf(request);
    const userIds = listOf(body.userIds, isUuid, 50);
    const gameIds = listOf(body.gameIds ?? [], isGameId, 20);
    const db = adminClient();
    const [links, games] = await Promise.all([
      userIds.length ? db.from('integration_links').select('user_id,snapshot').eq('provider', 'steam').in('user_id', userIds) : { data: [], error: null },
      gameIds.length ? db.from('games').select('id,steam_app_id').in('id', gameIds) : { data: [], error: null },
    ]);
    if (links.error || games.error) throw new IntegrationError('configuration');
    const steamAppIds = new Map((games.data ?? []).map(g => [g.id as number, g.steam_app_id as number | null]));
    const requested = gameIds.map(id => ({ id, steamAppId: steamAppIds.get(id) ?? null }));
    const users = (links.data ?? []).map(row => ({ userId: row.user_id as string,
      ...steamTrust(row.snapshot as SyncSnapshot<SteamSnapshotValue> | null, requested) }));
    return reply({ users }, 200, headers);
  } catch (error) { return failure(error, headers); }
});
