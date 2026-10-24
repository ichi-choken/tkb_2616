import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { watchAuthRefresh } from '../lib/supabase';

export default function RootLayout() {
  useEffect(() => watchAuthRefresh(), []);
  return <Stack screenOptions={{ headerTitle: 'Shumitomo' }}><Stack.Screen name="index" options={{ headerShown: false }} /></Stack>;
}
