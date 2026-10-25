// 本人のブラウザで行うローカルOAuth疎通確認。アプリのログインやDB連携とは別。
import { randomBytes } from 'node:crypto';

const cookieName = 'shumitomo_discord_demo';
const returnTo = '/?design=play#/settings';
const ttl = 10 * 60 * 1000;
const nonce = () => randomBytes(32).toString('hex');

export function discordLocal({ client, redirectUri, now = Date.now, onResult = () => {} }) {
  const sessions = new Map();
  const callback = new URL(redirectUri);
  const send = (response, status, body) => response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
  const redirect = response => response.writeHead(303, { Location: returnTo }).end();

  return async (request, response, url) => {
    if (!url.pathname.startsWith('/__discord/')) return false;
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.method !== 'GET') { send(response, 405, { error: 'method' }); return true; }
    for (const [id, session] of sessions) if (session.expiresAt <= now()) sessions.delete(id);
    const cookies = (request.headers.cookie ?? '').split(';').map(part => part.trim().split('='));
    const matches = cookies.filter(([name]) => name === cookieName);
    let id = matches.length === 1 ? matches[0][1] : null;
    let session = sessions.get(id);

    if (url.pathname === '/__discord/callback') {
      const single = name => url.searchParams.getAll(name).length === 1 ? url.searchParams.get(name) : null;
      const state = single('state');
      const issuer = single('iss');
      if (!client || !session?.pending || session.pending.expiresAt <= now() || !state || state !== session.pending.state
        || url.origin !== callback.origin || url.pathname !== callback.pathname
        || (url.searchParams.has('iss') && issuer !== 'https://discord.com')) {
        send(response, 400, { error: '認可の確認に失敗しました。デモから接続をやり直してください。' }); return true;
      }
      // 同じ認可結果は一度だけ処理する。別のブラウザの失敗では正しい試行を消さない。
      session.pending = null;
      const error = single('error');
      if (error === 'access_denied') { session.result = { status: 'cancelled' }; redirect(response); return true; }
      const code = single('code');
      if (url.searchParams.has('error') || !code) {
        session.result = { status: 'failed' }; redirect(response); return true;
      }
      let stage = 'token_exchange';
      try {
        const tokens = await client.exchangeCode(code);
        stage = 'identity';
        const identity = await client.currentUser(tokens.accessToken);
        if (!/^[1-9][0-9]{0,19}$/.test(identity.discordId)) throw new Error('invalid identity');
        // OAuthトークンやDiscordの名前・画像・メールは表示も保存もしない。
        session.result = { status: 'verified', discordId: identity.discordId, verifiedAt: new Date(now()).toISOString() };
        onResult({ status: 'verified', verifiedAt: session.result.verifiedAt });
      } catch (error) {
        session.result = { status: 'failed' };
        const allowedKinds = ['network', 'rate_limited', 'unauthorized', 'forbidden', 'upstream', 'invalid_payload', 'relink_required', 'configuration'];
        onResult({ status: 'failed', stage, kind: allowedKinds.includes(error?.kind) ? error.kind : 'unexpected', httpStatus: Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : null });
      }
      redirect(response); return true;
    }

    if (!['/__discord/status.json', '/__discord/start'].includes(url.pathname)) { send(response, 404, { error: 'not_found' }); return true; }
    if (url.pathname === '/__discord/start' && request.headers.host !== callback.host) {
      response.writeHead(303, { Location: new URL('/__discord/start', callback.origin).href }).end(); return true;
    }
    if (!session) {
      id = nonce();
      session = { expiresAt: now() + 60 * 60 * 1000, pending: null, result: { status: 'not_connected' } };
      sessions.set(id, session);
      response.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`);
    }
    if (url.pathname === '/__discord/status.json') {
      send(response, 200, client ? session.result : { status: 'unconfigured' }); return true;
    }
    if (!client) { send(response, 503, { error: 'Discordのローカル設定が必要です。' }); return true; }
    const state = nonce();
    session.pending = { state, expiresAt: now() + ttl };
    session.result = { status: 'authorizing' };
    response.writeHead(302, { Location: client.authorizeUrl(state) }).end(); return true;
  };
}
