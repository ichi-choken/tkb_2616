import { IntegrationError } from './http.ts';

export type Reading<T> = { status: 'available'; value: T; fetchedAt: string } | { status: 'unavailable' | 'private' };
export interface SyncSnapshot<T> {
  status: 'available' | 'unavailable' | 'private' | 'retry_wait' | 'relink_required' | 'configuration_error';
  value: T | null;
  lastSuccessAt: string | null;
  attemptedAt: string;
  nextAttemptAt: string | null;
  failureStartedAt?: string | null;
}
export interface SyncJob<T> { linkId: string; revision: string; previous: SyncSnapshot<T> | null }
export interface SyncStore<T> {
  // Compare-and-set against both the active link and revision; unlink/relink wins.
  commitIfCurrent(job: SyncJob<T>, snapshot: SyncSnapshot<T>): Promise<boolean>;
}
export interface SyncPolicy {
  intervalMs: number;
  retryMs: number;
  // null retains the last measurement regardless of age. Confirmed private data is still removed.
  staleAfterMs: number | null;
  retryOffsetsMs?: readonly number[];
}
// Human decisions 2026-10-24: server-101/102/103 (spec PR #17).
export const steamSyncPolicy: SyncPolicy = {
  intervalMs: 24 * 60 * 60 * 1000,
  retryMs: 5 * 60 * 60 * 1000,
  staleAfterMs: null,
  retryOffsetsMs: [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000],
};
function validatePolicy(policy: SyncPolicy) {
  const durations = [policy.intervalMs, policy.retryMs, ...(policy.staleAfterMs === null ? [] : [policy.staleAfterMs]), ...(policy.retryOffsetsMs ?? [])];
  if (durations.some(n => !Number.isSafeInteger(n) || n < 0) || !policy.intervalMs || !policy.retryMs) throw new TypeError('Invalid sync policy');
  if (policy.retryOffsetsMs?.some((n, i, all) => n <= (all[i - 1] ?? 0))) throw new TypeError('Retry offsets must increase');
}
function retryAt(policy: SyncPolicy, firstFailure: number, now: number, providerDelay: number) {
  const offsets = policy.retryOffsetsMs ?? [];
  const upcoming = offsets.find(offset => firstFailure + offset > now);
  const last = firstFailure + (offsets.at(-1) ?? 0);
  const scheduled = upcoming !== undefined ? firstFailure + upcoming
    : last + (Math.floor(Math.max(0, now - last) / policy.retryMs) + 1) * policy.retryMs;
  return Math.max(scheduled, now + providerDelay);
}
export async function runSync<T>(job: SyncJob<T>, read: () => Promise<Reading<T>>, store: SyncStore<T>, policy: SyncPolicy, now = Date.now()) {
  validatePolicy(policy);
  if (job.previous?.status === 'relink_required' || job.previous?.status === 'configuration_error') return { committed: false, snapshot: job.previous };
  const lastSuccessAt = job.previous?.lastSuccessAt ?? null;
  const attemptedAt = new Date(now).toISOString();
  let snapshot: SyncSnapshot<T>;
  try {
    const result = await read();
    if (result.status === 'available') {
      if (!Number.isFinite(Date.parse(result.fetchedAt))) throw new IntegrationError('invalid_payload');
      snapshot = { status: 'available', value: result.value, lastSuccessAt: result.fetchedAt, attemptedAt,
        nextAttemptAt: new Date(Date.parse(result.fetchedAt) + policy.intervalMs).toISOString(), failureStartedAt: null };
    } else {
      snapshot = { status: result.status, value: null, lastSuccessAt, attemptedAt,
        nextAttemptAt: new Date(now + policy.intervalMs).toISOString(), failureStartedAt: null };
    }
  } catch (err) {
    if (!(err instanceof IntegrationError)) throw err;
    const blocked = err.kind === 'relink_required' || err.kind === 'configuration';
    const status = err.kind === 'relink_required' ? 'relink_required' : err.kind === 'configuration' ? 'configuration_error' : job.previous?.status === 'private' ? 'private' : 'retry_wait';
    const age = lastSuccessAt === null ? Infinity : now - Date.parse(lastSuccessAt);
    const keep = lastSuccessAt !== null && Number.isFinite(age) && age >= 0 && (policy.staleAfterMs === null || age <= policy.staleAfterMs);
    const value = err.kind !== 'relink_required' && keep ? job.previous?.value ?? null : null;
    const priorFailure = Date.parse(job.previous?.failureStartedAt ?? '');
    const firstFailure = Number.isFinite(priorFailure) && priorFailure <= now ? priorFailure : now;
    snapshot = { status, value, lastSuccessAt, attemptedAt, failureStartedAt: new Date(firstFailure).toISOString(),
      nextAttemptAt: blocked ? null : new Date(retryAt(policy, firstFailure, now, err.retryAfterMs ?? 0)).toISOString() };
  }
  return { committed: await store.commitIfCurrent(job, snapshot), snapshot };
}
