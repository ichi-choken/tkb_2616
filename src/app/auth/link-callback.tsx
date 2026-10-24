import { useEffect, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import { completeAccountLink } from '../../auth/links';

export default function LinkCallback() {
  const params = useLocalSearchParams<{ callback?: string }>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web' && new URL(window.location.href).searchParams.get('native') === '1') {
      // HTTPS provider callback -> native app. No session or token is exchanged in this page.
      window.location.replace(`shumitomo://auth/link-callback?callback=${encodeURIComponent(window.location.href)}`);
      return;
    }
    const callback = Platform.OS === 'web' ? window.location.href : params.callback;
    if (!callback) { setError(true); return; }
    let active = true;
    completeAccountLink(callback).then(() => { if (active) router.replace('/'); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [params.callback]);
  return <View style={{ padding: 24, gap: 16 }}><Text>{error ? '連携を完了できませんでした。もう一度お試しください。' : '連携を確認しています…'}</Text>{error && <Link href="/">戻る</Link>}</View>;
}
