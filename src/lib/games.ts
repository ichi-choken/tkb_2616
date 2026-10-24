import { getSupabase } from './supabase';
import type { GameCandidate } from '../../packages/integrations/src/igdb';

export interface GameSearchResult { source: 'igdb'; fetchedAt: string; games: GameCandidate[] }
async function queryGameApi(body: { query: string; limit: number } | { id: number }): Promise<GameSearchResult> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase の接続設定が必要です。');
  const { data, error } = await client.functions.invoke('igdb-search', { body });
  if (error) throw new Error('ゲーム情報を取得できませんでした。しばらくしてからお試しください。');
  return data;
}
export const searchGames = (query: string, limit: number) => queryGameApi({ query, limit });
export const getGameCandidate = (id: number) => queryGameApi({ id });
