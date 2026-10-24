// A best-effort guard for known embedded browsers. Native uses the OS auth browser.
// Unknown/custom user agents still require a real-device check before release.
export function needsExternalBrowser(userAgent: string): boolean {
  return /;\s*wv\)|\bwv\b|FBAN|FBAV|Instagram|Line\/|Twitter|TikTok/i.test(userAgent);
}
export const externalBrowserMessage = 'Googleでログインするには、このページをSafariやChromeで開いてください。アプリのメニューから「ブラウザで開く」を選べます。';
