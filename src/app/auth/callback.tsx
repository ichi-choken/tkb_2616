import { useEffect, useState } from 'react';
import { Link, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Platform, Text, View } from 'react-native';
import { getAuthFlow, authErrorMessage } from '../../auth';
import { takeReturn } from '../../live/return-to';

export default function AuthCallback() {
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const callback = Platform.OS === 'web' ? window.location.href : url;
    if (!callback) return;
    let active = true;
    Promise.resolve().then(() => getAuthFlow().complete(callback)).then(() => {
      if (!active) return;
      // Back to the screen that asked for the sign-in (a recruitment link, for example)
      const back = takeReturn();
      if (back) window.location.replace(`/${back}`);
      else router.replace('/');
    }).catch(err => { if (active) setError(authErrorMessage(err)); });
    return () => { active = false; };
  }, [url]);
  return <View style={{ padding: 24, gap: 16 }}><Text>{error ?? 'ログインを確認しています…'}</Text>{error && <Link href="/">戻る</Link>}</View>;
}
