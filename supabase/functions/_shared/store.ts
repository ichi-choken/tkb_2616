import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { IntegrationError, publicLinkStatus, type LinkAttemptStore, type Principal, type Provider, type SyncSnapshot } from '../../../packages/integrations/src/index.ts';

export interface LinkRow {
  id: string; user_id: string; provider: Provider; external_id: string;
  token_ciphertext: string | null; revision: string; snapshot: SyncSnapshot<unknown> | null;
  next_attempt_at: string | null; lease_until: string | null;
}
async function stateHash(state: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function check(error: unknown) { if (error) throw new IntegrationError('configuration'); }
export function attemptStore(db: SupabaseClient): LinkAttemptStore {
  return {
    async put(a) {
      const { error } = await db.rpc('integration_begin_link', { p_state: await stateHash(a.state), p_provider: a.provider,
        p_user: a.principal.userId, p_session: a.principal.sessionId, p_return: a.returnTo,
        p_created: new Date(a.createdAt).toISOString(), p_expires: new Date(a.expiresAt).toISOString() });
      check(error);
    },
    async consume(state, provider, principal, now) {
      // Atomic spend; final persistence also checks this attempt and unlink generation.
      const { data, error } = await db.from('integration_attempts').update({ consumed_at: new Date(now).toISOString() })
        .eq('state_hash', await stateHash(state)).eq('provider', provider)
        .eq('user_id', principal.userId).eq('session_id', principal.sessionId)
        .is('consumed_at', null).gt('expires_at', new Date(now).toISOString()).select().maybeSingle();
      check(error);
      if (!data) return null;
      return { state, provider, principal, returnTo: data.return_to, createdAt: Date.parse(data.created_at), expiresAt: Date.parse(data.expires_at) };
    },
  };
}
export async function saveLink(db: SupabaseClient, principal: Principal, provider: Provider, state: string, externalId: string, ciphertext: string | null) {
  const { data, error } = await db.rpc('integration_finish_link', { p_user: principal.userId, p_session: principal.sessionId,
    p_provider: provider, p_state: await stateHash(state), p_external: externalId, p_ciphertext: ciphertext });
  check(error);
  if (data !== true) throw new IntegrationError('unauthorized');
}
export async function removeLink(db: SupabaseClient, userId: string, provider: Provider) {
  const { error } = await db.rpc('integration_unlink', { p_user: userId, p_provider: provider });
  check(error);
  // Invalidate pending authentication and every in-flight sync in the same transaction.
}
export async function linkStatus(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from('integration_links').select('provider,external_id,snapshot').eq('user_id', userId);
  check(error);
  return (data ?? []).map(row => publicLinkStatus(row as LinkRow));
}
export async function claimDueLinks(db: SupabaseClient, at: number, providers: Provider[] = ['steam']): Promise<LinkRow[]> {
  const now = new Date(at).toISOString();
  const { data, error } = await db.from('integration_links').select('*').in('provider', providers).lte('next_attempt_at', now)
    .or(`lease_until.is.null,lease_until.lt.${now}`).order('next_attempt_at').limit(4);
  check(error);
  const claimed: LinkRow[] = [];
  for (const row of data ?? []) {
    const result = await db.from('integration_links').update({ revision: crypto.randomUUID(), lease_until: new Date(at + 120_000).toISOString() })
      .eq('id', row.id).eq('revision', row.revision).select().maybeSingle();
    check(result.error);
    if (result.data) claimed.push(result.data as LinkRow);
  }
  return claimed;
}
export async function commitSnapshot(db: SupabaseClient, row: LinkRow, snapshot: SyncSnapshot<unknown>, ciphertext: string | null) {
  const { data, error } = await db.from('integration_links').update({ snapshot, token_ciphertext: ciphertext,
    revision: crypto.randomUUID(), next_attempt_at: snapshot.nextAttemptAt, lease_until: null })
    .eq('id', row.id).eq('revision', row.revision).select('id').maybeSingle();
  check(error);
  return !!data;
}

// Initial acquisition uses the same lease as the background worker, so only one can write.
export async function claimInitialSteam(db: SupabaseClient, userId: string): Promise<LinkRow | null> {
  const now = Date.now();
  const { data: row, error } = await db.from('integration_links').select('*').eq('user_id', userId).eq('provider', 'steam')
    .lte('next_attempt_at', new Date(now).toISOString()).or(`lease_until.is.null,lease_until.lt.${new Date(now).toISOString()}`).maybeSingle();
  check(error);
  if (!row) return null;
  const result = await db.from('integration_links').update({ revision: crypto.randomUUID(), lease_until: new Date(now + 120_000).toISOString() })
    .eq('id', row.id).eq('revision', row.revision).select().maybeSingle();
  check(result.error);
  return result.data as LinkRow | null;
}
