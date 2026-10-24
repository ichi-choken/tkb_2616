import { IntegrationError } from './http.ts';

export type Reading<T> = { status: 'available'; value: T; fetchedAt: string } | { status: 'unavailable' | 'private' };
export interface SyncSnapshot<T> {
  status: 'available' | 'unavailable' | 'private' | 'retry_wait' | 'relink_required' | 'configuration_error';
  value: T | null;
  lastSuccessAt: string | null;
  attemptedAt: string;
  nextAttemptAt: string | null;
}
export interface SyncJob<T> {
  linkId: string;
  // Increment on unlink/relink/change of external account AND every successful state update.
  revision: string;
  previous: SyncSnapshot<T> | null;
}
export interface SyncStore<T> {
  // Update only if link is still active AND revision matches. One atomic compare-and-set.
  commitIfCurrent(job: SyncJob<T>, snapshot: SyncSnapshot<T>): Promise<boolean>;
}
// Product cadence is deliberately supplied by the caller (Q-24); no global timer is started.
export interface SyncPolicy { intervalMs: number; retryMs: number; staleAfterMs: number }
export async function runSync<T>(job: SyncJob<T>, read: () => Promise<Reading<T>>, store: SyncStore<T>, policy: SyncPolicy, now = Date.now()) {
  for (const n of Object.values(policy)) if (!Number.isSafeInteger(n) || n < 0) throw new TypeError('Sync policy durations must be nonnegative integer milliseconds');
  if (!policy.intervalMs || !policy.retryMs) throw new TypeError('Sync and retry intervals must be positive');
  // Resume after explicit relinking / configuration repair by supplying a fresh job.
  if (job.previous?.status === 'relink_required' || job.previous?.status === 'configuration_error') {
    return { committed: false, snapshot: job.previous };
  }
  const lastSuccessAt = job.previous?.lastSuccessAt ?? null;
  const attemptedAt = new Date(now).toISOString();
  let snapshot: SyncSnapshot<T>;
  try {
    const result = await read();
    if (result.status === 'available') {
      if (!Number.isFinite(Date.parse(result.fetchedAt))) throw new IntegrationError('invalid_payload');
      snapshot = { status: 'available', value: result.value, lastSuccessAt: result.fetchedAt, attemptedAt, nextAttemptAt: new Date(now + policy.intervalMs).toISOString() };
    } else {
      snapshot = { status: result.status, value: null, lastSuccessAt, attemptedAt, nextAttemptAt: new Date(now + policy.intervalMs).toISOString() };
    }
  } catch (err) {
    // Programming errors are not silently turned into transient provider errors.
    if (!(err instanceof IntegrationError)) throw err;
    const blocked = err.kind === 'relink_required' || err.kind === 'configuration';
    const status = err.kind === 'relink_required' ? 'relink_required' : err.kind === 'configuration' ? 'configuration_error' : job.previous?.status === 'private' ? 'private' : 'retry_wait';
    const age = lastSuccessAt === null ? Infinity : now - Date.parse(lastSuccessAt);
    const value = !blocked && age >= 0 && age <= policy.staleAfterMs ? job.previous?.value ?? null : null;
    snapshot = { status, value, lastSuccessAt, attemptedAt,
      nextAttemptAt: blocked ? null : new Date(now + Math.max(policy.retryMs, err.retryAfterMs ?? 0)).toISOString() };
  }
  return { committed: await store.commitIfCurrent(job, snapshot), snapshot };
}
