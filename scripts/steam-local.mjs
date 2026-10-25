// Loopback-only Steam session. The recruitment database keeps using Supabase Auth.
import { randomBytes } from 'node:crypto';
import { steamAuthorizationUrl, verifySteamAssertion } from '../packages/integrations/dist/src/linking.js';

const cookieName = 'shumitomo_local_steam';
const token = () => randomBytes(32).toString('hex');
const lifetime = 24 * 60 * 60 * 1000;

export function steamLocal({ origin, client, fetcher = fetch, now = Date.now }) {
  const sessions = new Map();
  const send = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
  const redirect = res => res.writeHead(303, { Location: '/?design=play#/settings' }).end();
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/__steam/')) return false;
    for (const [id, s] of sessions) if (s.expiresAt <= now()) sessions.delete(id);
    const matches = (req.headers.cookie ?? '').split(';').map(x => x.trim().split('=')).filter(([k]) => k === cookieName);
    let id = matches.length === 1 ? matches[0][1] : null;
    let session = sessions.get(id);
    if (url.pathname === '/__steam/logout') {
      if (req.method !== 'POST' || req.headers.origin !== origin) { send(res, 403, { error: 'forbidden' }); return true; }
      if (id) sessions.delete(id);
      res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
      send(res, 200, { status: 'signed_out' }); return true;
    }
    if (req.method !== 'GET') { send(res, 405, { error: 'method' }); return true; }
    if (url.pathname === '/__steam/callback') {
      const states = url.searchParams.getAll('state');
      if (!session?.attempt || states.length !== 1 || states[0] !== session.attempt.state || session.attempt.createdAt + 300_000 <= now()) {
        send(res, 400, { error: '認証の有効期限が切れました。アプリからログインをやり直してください。' }); return true;
      }
      const attempt = session.attempt;
      session.attempt = null;
      try {
        const result = await verifySteamAssertion(url, attempt, fetcher, now());
        if (result.status === 'verified') {
          // Rotate the cookie on authentication; only Steam's verified ID selects the library.
          sessions.delete(id); id = token();
          session = { expiresAt: now() + lifetime, steamId: result.steamId, status: 'signed_in', attempt: null };
          sessions.set(id, session);
          res.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
        } else session.status = 'cancelled';
      } catch { session.status = 'failed'; }
      redirect(res); return true;
    }
    if (url.pathname === '/__steam/status.json') {
      send(res, 200, { status: session?.status ?? 'signed_out', connected: !!session?.steamId }); return true;
    }
    if (url.pathname === '/__steam/library.json') {
      if (!session?.steamId) { send(res, 401, { error: 'login_required' }); return true; }
      if (!client) { send(res, 503, { error: 'Steam Web APIキーが未設定です。' }); return true; }
      try { send(res, 200, await client.ownedGames(session.steamId)); }
      catch { send(res, 502, { error: 'Steamのゲーム情報を取得できませんでした。' }); }
      return true;
    }
    if (url.pathname === '/__steam/start') {
      if (url.origin !== origin) { res.writeHead(303, { Location: origin + '/__steam/start' }).end(); return true; }
      if (id) sessions.delete(id);
      id = token();
      const state = token();
      const returnTo = `${origin}/__steam/callback?state=${state}`;
      session = { expiresAt: now() + lifetime, steamId: null, status: 'authorizing', attempt: { state, returnTo, createdAt: now() } };
      sessions.set(id, session);
      res.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
      res.writeHead(302, { Location: steamAuthorizationUrl(returnTo) }).end(); return true;
    }
    send(res, 404, { error: 'not_found' }); return true;
  };
}
