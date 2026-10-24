import { IntegrationError, json, object, text, type Fetcher } from './http.ts';
import type { NotificationEvent } from './notifications.ts';

export type PushResult = { status: 'accepted'; ticketId: string } | { status: 'disabled' | 'retry' | 'blocked' };
export type PushReceipt = { status: 'provider_received' | 'disabled' | 'retry' | 'blocked' | 'pending' };
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(value) && value.length <= 256;
}
function providerError(value: Record<string, unknown>): 'disabled' | 'retry' | 'blocked' {
  const detail = value.details == null ? {} : object(value.details);
  if (detail.error === 'DeviceNotRegistered') return 'disabled';
  if (detail.error === 'MessageRateExceeded') return 'retry';
  return 'blocked';
}
// Optional Q-30 transport. No application event or recipient is decided here.
export class ExpoPushClient {
  #fetch: Fetcher;
  #accessToken: string | undefined;
  constructor(accessToken?: string, fetcher: Fetcher = fetch) { this.#accessToken = accessToken; this.#fetch = fetcher; }
  async #post(path: string, body: unknown): Promise<Record<string, unknown>> {
    return object(await json(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.#accessToken ? { Authorization: `Bearer ${this.#accessToken}` } : {}) },
      body: JSON.stringify(body),
    }, this.#fetch));
  }
  async send(token: string, event: NotificationEvent): Promise<PushResult> {
    if (!isExpoPushToken(token)) throw new IntegrationError('invalid_payload');
    const result = await this.#post('send', {
      to: token, title: 'Shumitomo', body: '新しいお知らせがあります。アプリで確認してください。', channelId: 'default',
      // Never include room numbers, invitation URLs, game IDs or arbitrary caller text.
      data: { eventId: event.id, kind: event.kind, target: { type: event.target.type, id: event.target.id } },
    });
    const ticket = object(Array.isArray(result.data) ? result.data[0] : result.data);
    if (ticket.status === 'ok') return { status: 'accepted', ticketId: text(ticket.id) };
    if (ticket.status !== 'error') throw new IntegrationError('invalid_payload');
    return { status: providerError(ticket) };
  }
  async receipts(ticketIds: string[]): Promise<Map<string, PushReceipt>> {
    if (ticketIds.length < 1 || ticketIds.length > 1000 || ticketIds.some(id => !id)) throw new IntegrationError('invalid_payload');
    const result = object((await this.#post('getReceipts', { ids: ticketIds })).data);
    return new Map<string, PushReceipt>(ticketIds.map((id): [string, PushReceipt] => {
      if (!Object.hasOwn(result, id)) return [id, { status: 'pending' }];
      const receipt = object(result[id]);
      if (receipt.status === 'ok') return [id, { status: 'provider_received' }];
      if (receipt.status !== 'error') throw new IntegrationError('invalid_payload');
      return [id, { status: providerError(receipt) }];
    }));
  }
}
