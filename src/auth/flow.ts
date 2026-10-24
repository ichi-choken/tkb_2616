export type LoginProvider = 'discord' | 'google' | 'steam' | 'apple';
export type OAuthProvider = 'discord' | 'google' | 'custom:steam' | 'apple';
export const loginProviders: readonly LoginProvider[] = ['discord', 'google', 'steam', 'apple'];
export function oauthProvider(provider: LoginProvider): OAuthProvider {
  if (!loginProviders.includes(provider)) throw new AuthFlowError('provider');
  return provider === 'steam' ? 'custom:steam' : provider;
}
export interface AuthUser { id: string; is_anonymous?: boolean }
export interface AuthPort {
  signInWithOAuth(input: { provider: OAuthProvider; options: { redirectTo: string; skipBrowserRedirect: true } }): Promise<{ data: { url: string | null }; error: unknown }>;
  exchangeCodeForSession(code: string, options?: { flowId: string }): Promise<{ error: unknown }>;
  getUser(): Promise<{ data: { user: AuthUser | null }; error: unknown }>;
  signOut(): Promise<{ error: unknown }>;
}
export class AuthFlowError extends Error {
  code: 'provider' | 'callback' | 'unauthenticated';
  constructor(code: AuthFlowError['code']) { super(`Authentication failed (${code})`); this.name = 'AuthFlowError'; this.code = code; }
}

export function parseAuthCallback(raw: string, redirectTo: string): { code: string; flowId?: string } {
  const actual = new URL(raw);
  const expected = new URL(redirectTo);
  if (actual.protocol !== expected.protocol || actual.host !== expected.host || actual.pathname !== expected.pathname || actual.username || actual.password || actual.hash) throw new AuthFlowError('callback');
  if (actual.searchParams.has('error')) throw new AuthFlowError('provider');
  const codes = actual.searchParams.getAll('code');
  const flows = actual.searchParams.getAll('sb_flow_id');
  if (codes.length !== 1 || !codes[0] || flows.length > 1 || (flows.length === 1 && !flows[0])) throw new AuthFlowError('callback');
  return { code: codes[0], ...(flows[0] ? { flowId: flows[0] } : {}) };
}

export async function requireRegisteredUser(auth: Pick<AuthPort, 'getUser'>): Promise<{ id: string }> {
  const { data, error } = await auth.getUser();
  if (error || !data.user?.id || data.user.is_anonymous) throw new AuthFlowError('unauthenticated');
  return { id: data.user.id };
}

// Supabase manages OAuth state and the PKCE verifier. No guest account is created.
export function createAuthFlow(auth: AuthPort, redirectTo: string, openUrl: (url: string, returnTo: string) => Promise<string | null>, unregisterNotifications: () => Promise<void> = async () => {}) {
  const exchanges = new Map<string, Promise<{ id: string }>>();
  const complete = (callbackUrl: string) => {
    const { code, flowId } = parseAuthCallback(callbackUrl, redirectTo);
    const key = `${flowId ?? ''}:${code}`;
    const existing = exchanges.get(key);
    if (existing) return existing;
    const promise = (async () => {
      const { error } = await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (error) throw new AuthFlowError('callback');
      return requireRegisteredUser(auth);
    })();
    exchanges.set(key, promise);
    if (exchanges.size > 10) exchanges.delete(exchanges.keys().next().value!);
    return promise;
  };
  return {
    complete,
    async signIn(provider: LoginProvider) {
      const { data, error } = await auth.signInWithOAuth({ provider: oauthProvider(provider), options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) throw new AuthFlowError('provider');
      const callback = await openUrl(data.url, redirectTo);
      return callback ? { status: 'authenticated' as const, user: await complete(callback) } : { status: 'closed_or_redirecting' as const };
    },
    async signOut() {
      // Try while the session still authorizes device cleanup. A cleanup failure
      // must not prevent sign-out, and is not evidence that the device was removed.
      try { await unregisterNotifications(); } catch { /* Best-effort notification cleanup. */ }
      const { error } = await auth.signOut();
      if (error) throw new AuthFlowError('provider');
      exchanges.clear();
    },
  };
}
