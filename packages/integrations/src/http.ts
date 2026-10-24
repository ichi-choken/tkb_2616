export type Fetcher = typeof fetch;
export type FailureKind = 'network' | 'rate_limited' | 'unauthorized' | 'forbidden' | 'upstream' | 'invalid_payload' | 'relink_required' | 'configuration';

// Never include request URLs, provider bodies, tokens or original error messages.
export class IntegrationError extends Error {
  constructor(public readonly kind: FailureKind, public readonly status: number | null = null,
    public readonly retryAfterMs: number | null = null) {
    super(`External service request failed (${kind})`); this.name = 'IntegrationError';
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new IntegrationError('invalid_payload');
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new IntegrationError('invalid_payload');
  return value;
}
export function nullableText(value: unknown): string | null { return value == null ? null : text(value); }
export function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new IntegrationError('invalid_payload');
  return value;
}
export function retryDelay(headers: Headers, body: unknown, now = Date.now()): number | null {
  const raw = headers.get('retry-after');
  const delays: number[] = [];
  if (raw !== null && raw.trim() !== '') {
    const n = Number(raw);
    const ms = Number.isFinite(n) ? n * 1000 : Date.parse(raw) - now;
    if (Number.isFinite(ms)) delays.push(Math.max(0, ms));
  }
  if (body && typeof body === 'object' && 'retry_after' in body && typeof body.retry_after === 'number' && Number.isFinite(body.retry_after) && body.retry_after >= 0) delays.push(body.retry_after * 1000);
  return delays.length ? Math.ceil(Math.max(...delays)) : null;
}
export async function response(url: URL | string, init: RequestInit, fetcher: Fetcher = fetch): Promise<Response> {
  try { return await fetcher(url, { ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(10_000) }); }
  catch { throw new IntegrationError('network'); }
}
export async function json(url: URL | string, init: RequestInit, fetcher: Fetcher = fetch, oauthTokenEndpoint = false): Promise<unknown> {
  const res = await response(url, init, fetcher);
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    let kind: FailureKind = res.status === 429 ? 'rate_limited' : res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'upstream';
    if (oauthTokenEndpoint && body && typeof body === 'object' && 'error' in body) {
      if (body.error === 'invalid_grant') kind = 'relink_required';
      if (body.error === 'invalid_client') kind = 'configuration';
    }
    throw new IntegrationError(kind, res.status, retryDelay(res.headers, body));
  }
  if (body === null) throw new IntegrationError('invalid_payload', res.status);
  return body;
}
