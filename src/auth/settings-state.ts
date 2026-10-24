import { isLoginEnabled, type LoginProvider } from './flow.ts';
import type { LinkStatus } from '../../packages/integrations/src/link-status.ts';

export type BrowserResult = 'completed' | 'cancelled' | 'redirecting';
export interface SettingsPort {
  watchUser(listener: (userId: string | null) => void): () => void;
  signIn(provider: LoginProvider): Promise<BrowserResult>;
  signOut(): Promise<void>;
  links(): Promise<LinkStatus[]>;
  link(provider: LinkStatus['provider']): Promise<BrowserResult>;
  unlink(provider: LinkStatus['provider']): Promise<void>;
}
export interface SettingsState {
  configured: boolean;
  authLoading: boolean;
  userId: string | null;
  links: LinkStatus[] | null;
  linksLoading: boolean;
  linksError: boolean;
  busy: string | null;
  message: string;
}

// Display state only. Authorization remains in Auth / integration-api.
export function createSettingsController(port: SettingsPort | null, configurationMessage = '接続設定が未完了です。ログイン・連携はまだ利用できません。') {
  let state: SettingsState = {
    configured: !!port, authLoading: !!port, userId: null, links: null,
    linksLoading: false, linksError: false, busy: null, message: port ? '' : configurationMessage,
  };
  const listeners = new Set<() => void>();
  let active = false;
  let generation = 0;
  let request = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const patch = (next: Partial<SettingsState>) => {
    state = { ...state, ...next };
    listeners.forEach(listener => listener());
  };
  const setUser = (userId: string | null) => {
    if (!active || (!state.authLoading && state.userId === userId)) return;
    generation++;
    request++;
    clearTimeout(timer);
    patch({ authLoading: false, userId, links: null, linksError: false, linksLoading: !!userId, busy: null, message: '' });
    // Do not call Supabase again inside onAuthStateChange's callback.
    if (userId) timer = setTimeout(() => { void refresh(); }, 0);
  };
  async function refresh() {
    if (!active || !port || !state.userId) return;
    const version = generation;
    const sequence = ++request;
    patch({ linksLoading: true, linksError: false });
    try {
      const links = await port.links();
      if (active && version === generation && sequence === request) patch({ links, linksLoading: false });
    } catch {
      if (active && version === generation && sequence === request) patch({ links: null, linksLoading: false, linksError: true });
    }
  }
  async function run(key: string, task: () => Promise<string>, errorMessage: string) {
    if (!active || !port || state.authLoading || state.busy) return;
    const version = generation;
    patch({ busy: key, message: '' });
    try {
      const message = await task();
      if (active && version === generation) patch({ message });
    } catch {
      if (active && version === generation) patch({ message: errorMessage });
    } finally {
      if (active && version === generation) patch({ busy: null });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      active = true;
      if (port) patch({ authLoading: true });
      const stop = port?.watchUser(setUser);
      return () => { active = false; generation++; request++; clearTimeout(timer); stop?.(); };
    },
    refresh,
    login(provider: LoginProvider) {
      if (state.userId || !isLoginEnabled(provider)) return Promise.resolve();
      return run(`login:${provider}`, async () => {
        const result = await port!.signIn(provider);
        return result === 'cancelled' ? 'ログインをキャンセルしました。' : result === 'redirecting' ? 'ログインページへ移動しています。' : '';
      }, 'ログインできませんでした。接続設定を確認して、もう一度お試しください。');
    },
    logout() {
      if (!state.userId) return Promise.resolve();
      return run('logout', async () => {
        const version = generation;
        await port!.signOut();
        if (active && version === generation) setUser(null);
        return '';
      }, 'ログアウトできませんでした。もう一度お試しください。');
    },
    link(provider: LinkStatus['provider']) {
      if (!state.userId || !state.links || state.linksLoading) return Promise.resolve();
      return run(`link:${provider}`, async () => {
        const version = generation;
        const result = await port!.link(provider);
        if (!active || version !== generation) return '';
        if (result === 'cancelled') return '連携をキャンセルしました。';
        if (result === 'redirecting') return '連携ページへ移動しています。';
        await refresh();
        return '';
      }, '連携できませんでした。もう一度お試しください。');
    },
    unlink(provider: LinkStatus['provider']) {
      if (!state.userId || !state.links?.some(link => link.provider === provider) || state.linksLoading) return Promise.resolve();
      return run(`unlink:${provider}`, async () => {
        const version = generation;
        await port!.unlink(provider);
        if (!active || version !== generation) return '';
        // Successful deletion must not leave the old account visible if reloading fails.
        request++;
        patch({ links: state.links?.filter(link => link.provider !== provider) ?? null });
        await refresh();
        return '連携を解除しました。';
      }, '連携を解除できませんでした。もう一度お試しください。');
    },
  };
}
