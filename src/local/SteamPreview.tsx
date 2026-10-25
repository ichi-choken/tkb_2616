// ローカルの確認用。APIキーもSteamIDもブラウザには渡さない。
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { SteamLibrary } from '../../packages/integrations/src/steam';
import { C, useLayout } from '../../app/src/theme';
import { Badge, Block, Card, Grid, Note, Row, Stack, SubButton, Txt } from '../../app/src/ui';


function playtime(minutes: number | null) {
  return minutes === null ? '取得できていません' : `${(minutes / 60).toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 時間`;
}

export function SteamPreview() {
  const { wide, width, s } = useLayout();
  const [expanded, setExpanded] = useState(false);
  const [attempt, retry] = useState(0);
  const [library, setLibrary] = useState<SteamLibrary | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState({ connected: false, status: 'signed_out' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const auth = await fetch('/__steam/status.json', { cache: 'no-store', signal: controller.signal });
        if (!auth.ok) throw new Error('unavailable');
        const session = await auth.json();
        if (controller.signal.aborted) return;
        setStatus(session);
        if (!session.connected) { setLibrary(null); return; }
        const response = await fetch('/__steam/library.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('unavailable');
        const data: SteamLibrary = await response.json();
        if (data.source !== 'steam' || !['available', 'unavailable'].includes(data.status)) throw new Error('invalid');
        if (!controller.signal.aborted) setLibrary(data);
      } catch {
        if (!controller.signal.aborted) { setLibrary(null); setError(true); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  const games = library?.status === 'available'
    ? [...library.games].sort((a, b) => (b.playtimeMinutes ?? -1) - (a.playtimeMinutes ?? -1)) : [];

  return <Stack gap={14}>
    <Card pad>
      <Stack gap={10}>
        <Row gap={8} wrap>
          <Badge label={loading ? '取得中' : error ? '取得に失敗' : status.connected ? 'Steamログイン済み' : '未ログイン'} tone={library?.status === 'available' && !error ? 'ok' : 'rest'} />
          <View style={{ flex: 1 }} />
          {status.connected ? <SubButton label={loading ? '取得しています…' : '最新の情報を取得'} disabled={loading} onPress={() => { setLoading(true); setError(false); retry(value => value + 1); }} /> : null}
        </Row>
        <Txt size={16} weight="bold">Steamのゲームとプレイ時間</Txt>
        <Note>Steam公式でログインしたアカウントのゲームを表示します。募集DBへのログインとは別です。</Note>
        {!status.connected ? <SubButton label="Steamでログインしてゲームを表示" disabled={loading} onPress={() => window.location.assign('/__steam/start')} /> : <SubButton label="Steamからログアウト" disabled={loading} onPress={async () => {
          setLoading(true);
          try {
            const response = await fetch('/__steam/logout', { method: 'POST' });
            if (!response.ok) throw new Error('logout failed');
            setLibrary(null); setStatus({ connected: false, status: 'signed_out' }); setError(false);
          } catch { setError(true); } finally { setLoading(false); }
        }} />}
        {status.status === 'cancelled' ? <Note>ログインをキャンセルしました。</Note> : null}
        {status.status === 'failed' ? <Note color={C.danger}>Steamの認証を確認できませんでした。もう一度ログインしてください。</Note> : null}
        {error && !status.connected ? <SubButton label="接続を再確認" onPress={() => { setLoading(true); setError(false); retry(value => value + 1); }} /> : null}
        {library?.status === 'available' ? <Note>取得日時：{new Date(library.fetchedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</Note> : null}
        {error ? <Note color={C.danger}>Steamに接続できませんでした。もう一度取得できます。</Note> : null}
        {library?.status === 'unavailable' ? <Note>Steamのゲーム情報を読み取れませんでした。Steamのゲーム詳細の公開設定を確認してください。</Note> : null}
      </Stack>
    </Card>
    {library?.status === 'available' ? <SubButton label={expanded ? 'ゲーム一覧を閉じる' : `Steamのゲーム ${games.length} 件を見る`} onPress={() => setExpanded(value => !value)} /> : null}
    {library?.status === 'available' && expanded ? <Block title="Steamのゲーム" count={games.length}>
      {games.length ? <Grid columns={wide ? (width >= 1100 ? 3 : 2) : 1}>{games.map(game => <Card key={game.appId} pad>
        <Stack gap={10}>
          <Txt size={16} weight="bold">{game.name ?? `App ${game.appId}`}</Txt>
          <Note>PC（Steam）</Note>
          <View style={{ height: 1, backgroundColor: C.line }} />
          <Row gap={8} wrap>
            <Note>総プレイ時間</Note>
            <Txt size={20} weight="bold" style={{ flexShrink: 1 }}>{playtime(game.playtimeMinutes)}</Txt>
          </Row>
          <Row gap={8} wrap>
            <Note>直近2週間</Note>
            <Txt size={13}>{playtime(game.recentPlaytimeMinutes)}</Txt>
          </Row>
        </Stack>
      </Card>)}</Grid> : <Note>取得できたゲームは0件です。</Note>}
    </Block> : loading ? <Note>Steamからゲーム情報を取得しています…</Note> : null}
    <View style={{ height: s(4) }} />
  </Stack>;
}
