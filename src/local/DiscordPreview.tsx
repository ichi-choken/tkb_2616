// ローカルのOAuth確認結果。Secretや認可コードをブラウザへ配らない。
import { useEffect, useState } from 'react';
import { C } from '../../app/src/theme';
import { Badge, Card, Note, Row, Stack, SubButton, Txt } from '../../app/src/ui';

type Status = { status: 'unconfigured' | 'not_connected' | 'authorizing' | 'cancelled' | 'failed' }
  | { status: 'verified'; discordId: string; verifiedAt: string };

export function DiscordPreview() {
  const [result, setResult] = useState<Status | null>(null);
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/__discord/status.json', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('unavailable');
        const data: Status = await response.json();
        if (!controller.signal.aborted) { setResult(data); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
    })();
    return () => controller.abort();
  }, [attempt]);

  return <Card pad><Stack gap={12}>
    <Row gap={8} wrap>
      <Txt size={16} weight="bold" style={{ flex: 1 }}>Discord</Txt>
      <Badge label={error ? '確認できません' : result?.status === 'verified' ? '接続確認済み' : result?.status === 'unconfigured' ? '未設定' : result ? '未接続' : '確認中'} tone={result?.status === 'verified' ? 'ok' : 'rest'} />
    </Row>
    <Note>Discordで認証したアカウントを確認します。募集DB用のアプリログインとは別です。</Note>
    {result?.status === 'verified' ? <>
      <Txt size={13} weight="bold">Discord ID：{result.discordId}</Txt>
      <Note>確認日時：{new Date(result.verifiedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</Note>
    </> : null}
    {result?.status === 'cancelled' ? <Note>認可をキャンセルしました。もう一度接続できます。</Note> : null}
    {result?.status === 'failed' ? <Note color={C.danger}>接続を確認できませんでした。設定を確かめて、もう一度接続できます。</Note> : null}
    {error ? <SubButton label="もう一度確認" onPress={() => retry(value => value + 1)} />
      : <SubButton label={result?.status === 'verified' ? 'Discordで再確認' : 'Discordに接続して確認'} disabled={!result || result.status === 'unconfigured'} onPress={() => window.location.assign('/__discord/start')} />}
  </Stack></Card>;
}
