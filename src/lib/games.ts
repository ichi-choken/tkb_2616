import { getSupabase } from './supabase';
import type { GameCandidate } from '../../packages/integrations/src/igdb';
import type { Tables } from '../../supabase/database.types';

export interface GameSearchResult { source: 'igdb'; fetchedAt: string; games: GameCandidate[] }
async function queryGameApi<T>(body: { query: string; limit: number } | { id: number } | { id: number; save: true }): Promise<T> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase の接続設定が必要です。');
  const { data, error } = await client.functions.invoke('igdb-search', { body });
  if (error) throw new Error('ゲーム情報を取得できませんでした。しばらくしてからお試しください。');
  return data;
}
export const searchGames = (query: string, limit: number) => queryGameApi<GameSearchResult>({ query, limit });
export const getGameCandidate = (id: number) => queryGameApi<GameSearchResult>({ id });
// Call when a candidate is chosen (needs a sign-in). The stored row's id is what publish_recruitment accepts.
export const saveGame = async (id: number) => (await queryGameApi<{ game: Tables<'games'> }>({ id, save: true })).game;
