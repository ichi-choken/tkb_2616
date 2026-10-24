import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getSupabase } from '../lib/supabase';
import { notificationTarget, type NotificationTarget } from './payload';

async function invoke(body: Record<string, unknown>) {
  const client = getSupabase();
  if (!client) throw new Error('通知の接続設定が必要です。');
  const { data, error } = await client.functions.invoke('notification-delivery', { body });
  if (error || data?.error) throw new Error('通知の設定を保存できませんでした。');
  return data;
}
// Call only from an explicit enable-notifications button after Q-30 is decided.
export async function registerPush(): Promise<'registered' | 'disabled' | 'denied' | 'unsupported'> {
  if (Platform.OS === 'web') return 'unsupported';
  if (process.env.EXPO_PUBLIC_ENABLE_PUSH !== 'true') return 'disabled';
  if ((await invoke({ action: 'capabilities' })).status !== 'enabled') return 'disabled';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('通知の接続設定が必要です。');
  const notifications = await import('expo-notifications');
  if (Platform.OS === 'android') await notifications.setNotificationChannelAsync('default', { name: 'Shumitomo', importance: notifications.AndroidImportance.DEFAULT });
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await notifications.requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  const result = await invoke({ action: 'register', token });
  return result.status === 'registered' ? 'registered' : 'disabled';
}
export async function unregisterPush() {
  if (Platform.OS !== 'web' && process.env.EXPO_PUBLIC_ENABLE_PUSH === 'true') await invoke({ action: 'unregister' });
}
// The caller must fetch fresh application data and check membership before showing join details.
export async function listenForNotificationOpen(open: (target: NotificationTarget) => void): Promise<() => void> {
  if (Platform.OS === 'web' || process.env.EXPO_PUBLIC_ENABLE_PUSH !== 'true') return () => {};
  const notifications = await import('expo-notifications');
  const seen = new Set<string>();
  const handle = (response: Awaited<ReturnType<typeof notifications.getLastNotificationResponseAsync>>) => {
    if (!response) return;
    const target = notificationTarget(response.notification.request.content.data);
    if (!target || seen.has(target.eventId)) return;
    seen.add(target.eventId);
    if (seen.size > 100) seen.delete(seen.values().next().value!);
    open(target);
  };
  const subscription = notifications.addNotificationResponseReceivedListener(handle);
  handle(await notifications.getLastNotificationResponseAsync());
  return () => subscription.remove();
}
