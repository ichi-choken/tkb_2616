import { ExpoPushClient, IntegrationError, isExpoPushToken, object, text, tokenCipher, type NotificationEvent } from '../../../packages/integrations/src/index.ts';
import { adminClient, bodyOf, failure, originHeaders, principalOf, reply, required, verifyWorker } from '../_shared/runtime.ts';

const uuid = (value: unknown): string => {
  const id = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new IntegrationError('invalid_payload');
  return id;
};
function eventOf(raw: unknown): NotificationEvent {
  const event = object(raw); const target = object(event.target);
  if (target.type !== 'recruitment' && target.type !== 'connection') throw new IntegrationError('invalid_payload');
  const kind = text(event.kind);
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(kind)) throw new IntegrationError('invalid_payload');
  return { id: uuid(event.id), recipientId: uuid(event.recipientId), kind, target: { type: target.type, id: uuid(target.id) } };
}
function check(error: unknown) { if (error) throw new IntegrationError('configuration'); }
const backoff = (attempt: number) => Math.min(3_600_000, 30_000 * 2 ** Math.min(attempt, 7));
async function tokenHash(token: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async request => {
  let headers: Record<string, string> = {};
  try {
    headers = originHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const body = await bodyOf(request);
    if (Deno.env.get('NOTIFICATION_TRANSPORT') !== 'expo') return reply({ status: 'disabled' }, 200, headers);
    const db = adminClient();
    if (body.action === 'capabilities') { await principalOf(request); return reply({ status: 'enabled' }, 200, headers); }
    if (body.action === 'register' || body.action === 'unregister') {
      const principal = await principalOf(request);
      if (body.action === 'unregister') {
        const { error } = await db.from('integration_push_devices').delete().eq('user_id', principal.userId).eq('session_id', principal.sessionId);
        check(error); return reply({ status: 'unregistered' }, 200, headers);
      }
      if (!isExpoPushToken(body.token)) throw new IntegrationError('invalid_payload');
      const cipher = await tokenCipher(required('INTEGRATION_TOKEN_KEY'));
      const { error } = await db.from('integration_push_devices').upsert({
        user_id: principal.userId, session_id: principal.sessionId, token_hash: await tokenHash(body.token),
        token_ciphertext: await cipher.seal(body.token, `${principal.userId}:push`), updated_at: new Date().toISOString(),
      }, { onConflict: 'token_hash' });
      check(error); return reply({ status: 'registered' }, 200, headers);
    }
    await verifyWorker(request);
    const push = new ExpoPushClient(Deno.env.get('EXPO_ACCESS_TOKEN'));
    if (body.action === 'send') {
      const event = eventOf(body.event);
      const cursor = body.deviceCursor === undefined || body.deviceCursor === null ? null : uuid(body.deviceCursor);
      // Bound worst-case network time. The caller continues while nextDeviceCursor is present.
      let query = db.from('integration_push_devices').select('*').eq('user_id', event.recipientId).order('id').limit(10);
      if (cursor) query = query.gt('id', cursor);
      const devices = await query;
      check(devices.error);
      const results: { status: string; retryAfterMs?: number }[] = [];
      const cipher = await tokenCipher(required('INTEGRATION_TOKEN_KEY'));
      for (const device of devices.data ?? []) {
        const inserted = await db.from('integration_push_deliveries').upsert({ event_id: event.id, device_id: device.id, event }, { onConflict: 'event_id,device_id', ignoreDuplicates: true });
        check(inserted.error);
        const existing = await db.from('integration_push_deliveries').select('*').eq('event_id', event.id).eq('device_id', device.id).single();
        check(existing.error); const row = existing.data;
        // A retried event cannot change its recipient, target or type.
        if (JSON.stringify(eventOf(row.event)) !== JSON.stringify(event)) throw new IntegrationError('invalid_payload');
        if (row.status !== 'pending') { results.push({ status: row.status }); continue; }
        const now = Date.now();
        const notBefore = Math.max(Date.parse(row.next_attempt_at), row.lease_until ? Date.parse(row.lease_until) : 0);
        if (notBefore > now) { results.push({ status: 'retry', retryAfterMs: notBefore - now }); continue; }
        const revision = crypto.randomUUID();
        const claimed = await db.from('integration_push_deliveries').update({ revision, lease_until: new Date(now + 30_000).toISOString(), attempts: row.attempts + 1 })
          .eq('event_id', event.id).eq('device_id', device.id).eq('revision', row.revision).select('revision').maybeSingle();
        check(claimed.error);
        if (!claimed.data) { results.push({ status: 'retry', retryAfterMs: 30_000 }); continue; }
        // Recheck ownership after claiming; logging out / switching accounts removes this recipient.
        const current = await db.from('integration_push_devices').select('token_ciphertext').eq('id', device.id).eq('user_id', event.recipientId).maybeSingle();
        check(current.error);
        let status = 'disabled'; let ticketId: string | null = null; let retryMs = backoff(row.attempts);
        if (current.data) {
          try {
            const token = await cipher.open<string>(current.data.token_ciphertext, `${event.recipientId}:push`);
            const result = await push.send(token, event);
            status = result.status === 'retry' ? 'pending' : result.status;
            if (result.status === 'accepted') ticketId = result.ticketId;
          } catch (error) {
            if (!(error instanceof IntegrationError)) throw error;
            status = ['network', 'rate_limited', 'upstream'].includes(error.kind) ? 'pending' : 'blocked';
            retryMs = Math.max(retryMs, error.retryAfterMs ?? 0);
          }
        }
        const updated = await db.from('integration_push_deliveries').update({ status, ticket_id: ticketId, lease_until: null,
          accepted_at: ticketId ? new Date().toISOString() : null,
          next_attempt_at: new Date(Date.now() + (ticketId ? 15 * 60_000 : retryMs)).toISOString(), revision: crypto.randomUUID() })
          .eq('event_id', event.id).eq('device_id', device.id).eq('revision', revision);
        check(updated.error);
        if (status === 'disabled') {
          const removed = await db.from('integration_push_devices').delete().eq('id', device.id).eq('user_id', event.recipientId);
          check(removed.error);
        }
        results.push({ status: status === 'pending' ? 'retry' : status, ...(status === 'pending' ? { retryAfterMs: retryMs } : {}) });
      }
      return reply({ results, noDevices: !devices.data?.length, nextDeviceCursor: devices.data?.length === 10 ? devices.data.at(-1)!.id : null }, 200, headers);
    }
    if (body.action === 'receipts') {
      const due = await db.from('integration_push_deliveries').select('*').eq('status', 'accepted').lte('next_attempt_at', new Date().toISOString()).limit(100);
      check(due.error);
      if (!due.data?.length) return reply({ checked: 0 }, 200, headers);
      const receipts = await push.receipts(due.data.map(row => row.ticket_id));
      const retryEvents: NotificationEvent[] = [];
      for (const row of due.data) {
        const result = receipts.get(row.ticket_id)!;
        const expired = Date.now() - Date.parse(row.accepted_at) >= 23 * 60 * 60_000;
        const status = result.status === 'pending' ? (expired ? 'unknown' : 'accepted') : result.status === 'retry' ? 'pending' : result.status;
        const updated = await db.from('integration_push_deliveries').update({ status, next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(), revision: crypto.randomUUID() })
          .eq('event_id', row.event_id).eq('device_id', row.device_id).eq('revision', row.revision);
        check(updated.error);
        if (status === 'pending') retryEvents.push(eventOf(row.event));
        if (status === 'disabled') {
          const removed = await db.from('integration_push_devices').delete().eq('id', row.device_id).eq('user_id', eventOf(row.event).recipientId);
          check(removed.error);
        }
      }
      return reply({ checked: due.data.length, retryEvents }, 200, headers);
    }
    throw new IntegrationError('invalid_payload');
  } catch (error) { return failure(error, headers); }
});
