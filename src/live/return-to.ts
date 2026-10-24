import { Platform } from 'react-native';

// Signing in leaves the page for the provider. Remember the screen so the callback can return to it.
const KEY = 'shumitomo:return-to';
export function rememberReturn() {
  if (Platform.OS !== 'web') return;
  try { window.sessionStorage.setItem(KEY, window.location.hash); } catch { /* Storage may be blocked; fall back to the start. */ }
}
export function takeReturn(): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    const hash = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return hash && hash.startsWith('#/') ? hash : null;
  } catch { return null; }
}
