import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { IntegrationError, verifyPrincipal } from '../../../packages/integrations/src/index.ts';

export function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new IntegrationError('configuration');
  return value;
}
export function adminClient() {
  // Modern Supabase secret keys are injected as a JSON map of key names.
  let keys: Record<string, string>;
  try { keys = JSON.parse(required('SUPABASE_SECRET_KEYS')); } catch { throw new IntegrationError('configuration'); }
  const key = keys[Deno.env.get('INTEGRATION_SECRET_KEY_NAME') ?? 'default'];
  if (!key?.startsWith('sb_secret_')) throw new IntegrationError('configuration');
  return createClient(required('SUPABASE_URL'), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function principalOf(request: Request) {
  return verifyPrincipal(request.headers.get('authorization'), adminClient().auth);
}
export function originHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) throw new IntegrationError('forbidden');
  return { ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
}
export function reply(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
export function failure(error: unknown, headers: Record<string, string> = {}) {
  const kind = error instanceof IntegrationError ? error.kind : 'internal';
  const status = kind === 'unauthorized' ? 401 : kind === 'forbidden' ? 403 : kind === 'invalid_payload' ? 400 : kind === 'configuration' ? 503 : kind === 'rate_limited' ? 429 : 502;
  // Never echo the request, token, provider response or exception stack.
  const retryAfterMs = error instanceof IntegrationError ? error.retryAfterMs : null;
  return reply({ error: kind, ...(retryAfterMs !== null ? { retryAfterMs } : {}) }, status,
    { ...headers, ...(retryAfterMs !== null ? { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } : {}) });
}
export async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  if (request.method !== 'POST') throw new IntegrationError('forbidden');
  // Limit even chunked bodies before parsing; Content-Length alone is insufficient.
  const reader = request.body?.getReader();
  if (!reader) throw new IntegrationError('invalid_payload');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32_768) { await reader.cancel(); throw new IntegrationError('invalid_payload'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new IntegrationError('invalid_payload'); }
}
export async function verifyWorker(request: Request) {
  const supplied = request.headers.get('x-integration-worker-key') ?? '';
  const expected = required('INTEGRATION_WORKER_KEY');
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(supplied), hash(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  if (!supplied || difference !== 0) throw new IntegrationError('unauthorized');
}
