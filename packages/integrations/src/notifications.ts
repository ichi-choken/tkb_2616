// Backend (担当②) decides recipient, permission, event kind and target; this boundary only delivers.
export interface NotificationEvent {
  id: string;
  recipientId: string;
  kind: string;
  target: { type: 'recruitment' | 'connection'; id: string };
}
export type DeliveryResult =
  | { status: 'accepted'; providerMessageId: string }
  | { status: 'retry'; retryAfterMs: number }
  | { status: 'disabled' };
export interface NotificationTransport {
  // Implementer must deduplicate retries using event.id + recipientId; accepted is not proof of viewing.
  send(event: NotificationEvent): Promise<DeliveryResult>;
}
export async function deliverNotification(event: NotificationEvent, transport: NotificationTransport): Promise<DeliveryResult> {
  if (![event.id, event.recipientId, event.kind, event.target.id].every(s => typeof s === 'string' && s.length > 0)) throw new TypeError('Notification identifiers required');
  if (!['recruitment', 'connection'].includes(event.target.type)) throw new TypeError('Unknown notification target');
  // Explicit projection prevents a caller's room number, URL, game ID or token leaking into the payload.
  return transport.send({ id: event.id, recipientId: event.recipientId, kind: event.kind, target: { type: event.target.type, id: event.target.id } });
}
