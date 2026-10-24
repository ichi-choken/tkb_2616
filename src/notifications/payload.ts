export interface NotificationTarget { eventId: string; kind: string; target: { type: 'recruitment' | 'connection'; id: string } }
export function notificationTarget(raw: unknown): NotificationTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const target = data.target as Record<string, unknown> | undefined;
  const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (!uuid(data.eventId) || typeof data.kind !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(data.kind) || !target || !uuid(target.id) || !['recruitment', 'connection'].includes(String(target.type))) return null;
  return { eventId: data.eventId, kind: data.kind, target: { type: target.type as 'recruitment' | 'connection', id: target.id } };
}
