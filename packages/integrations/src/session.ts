import { IntegrationError } from './http.ts';
import type { Principal } from './linking.ts';

export interface SessionVerifier {
  getClaims(token: string): Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }>;
  getUser(token: string): Promise<{ data: { user: { id: string; is_anonymous?: boolean } | null }; error: unknown }>;
}
export async function verifyPrincipal(authorization: string | null, auth: SessionVerifier): Promise<Principal> {
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new IntegrationError('unauthorized');
  const claims = await auth.getClaims(token);
  if (claims.error || !claims.data || claims.data.claims.role !== 'authenticated' || claims.data.claims.is_anonymous === true) throw new IntegrationError('unauthorized');
  const user = await auth.getUser(token);
  const sessionId = claims.data.claims.session_id;
  if (user.error || !user.data.user?.id || user.data.user.is_anonymous || user.data.user.id !== claims.data.claims.sub || typeof sessionId !== 'string' || !sessionId) throw new IntegrationError('unauthorized');
  return { userId: user.data.user.id, sessionId, kind: 'registered' };
}
