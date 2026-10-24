import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { watchAuthRefresh } from '../src/lib/supabase';

export default function RootLayout() {
  useEffect(() => watchAuthRefresh(), []);
  return <Stack screenOptions={{ headerTitle: 'Shumitomo' }} />;
}
