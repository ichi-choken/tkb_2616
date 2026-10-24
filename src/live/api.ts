// Reads and changes recruitments in the real database. Contracts: supabase/README.md.
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';

export type RecruitmentStatus = '出ている' | '追加受付中' | '満員で終了' | '手動で終了' | '締め切りで終了' | '開催中止' | '遊び終了';
export type ApplicationState = '待っている' | '成立' | '終了' | '辞退' | '開催中止' | '遊び終了';
export const isAccepting = (status: RecruitmentStatus) => status === '出ている' || status === '追加受付中';
export const isFinished = (status: RecruitmentStatus) => status === '開催中止' || status === '遊び終了';

export type GameRow = {
  id: number; name: string; cover_image_id: string | null; hide_cover: boolean; platforms: string[];
  modes: string[] | null; needs_participant_id_default: boolean | null;
};
export type Recruitment = {
  id: string; owner_id: string; game_id: number; starts_at: string | null; capacity: number | null;
  voice_chat: string | null; skill: number | null; enthusiasm: number | null; mode: string | null;
  platform: string | null; platform_other: string | null; needs_participant_id: boolean;
  play_started_at: string | null; created_at: string;
  status: RecruitmentStatus; matched_count: number;
  games: GameRow | null; profiles: { nickname: string | null } | null;
};
export type Application = {
  id: string; recruitment_id: string; applicant_id: string; state: ApplicationState; created_at: string;
  voice_chat: string | null; skill: number | null; enthusiasm: number | null; platform: string | null;
  profiles?: { nickname: string | null } | null;
  application_game_ids?: { game_account_id: string } | { game_account_id: string }[] | null;
  recruitments?: Recruitment | null;
};
export type Meeting = { room_code: string | null; invite_url: string | null };
export type Failure = { ok: false; reason: string; status?: RecruitmentStatus };
export type Result<T extends object = object> = ({ ok: true } & T) | Failure;

const GAME = 'id, name, cover_image_id, hide_cover, platforms, modes, needs_participant_id_default';
const RECRUITMENT = `*, status, matched_count, games(${GAME}), profiles(nickname)`;

function db(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error('Supabase の接続設定が必要です。');
  return client;
}
function rows<T>({ data, error }: { data: unknown; error: unknown }): T {
  if (error) throw new Error('読み込めませんでした');
  return data as T;
}
export const gameAccountIdOf = (a: Application) => {
  const v = a.application_game_ids;
  return (Array.isArray(v) ? v[0]?.game_account_id : v?.game_account_id) ?? null;
};

/* ---------- Reading ---------- */

export const searchSavedGames = async (query: string) =>
  rows<GameRow[]>(await db().from('games').select(GAME).ilike('name', `%${query}%`).order('name').limit(5));
export const getGame = async (id: number) =>
  rows<GameRow | null>(await db().from('games').select(GAME).eq('id', id).maybeSingle());
export const getRecruitment = async (id: string) =>
  rows<Recruitment | null>(await db().from('recruitments').select(RECRUITMENT).eq('id', id).maybeSingle());
// The pressed recruitment first, then the others of the same game (list-4)
export const recruitmentsForGame = async (gameId: number, first: string | null) =>
  rows<Recruitment[]>(await db().rpc('recruitments_for_game', { p_game_id: gameId, p_first: first }).select(RECRUITMENT));
export const myRecruitments = async (userId: string) =>
  rows<Recruitment[]>(await db().from('recruitments').select(RECRUITMENT).eq('owner_id', userId).order('created_at', { ascending: false }).limit(20));
export const myApplications = async (userId: string) =>
  rows<Application[]>(await db().from('applications').select(`*, state, recruitments(${RECRUITMENT})`).eq('applicant_id', userId).order('created_at', { ascending: false }).limit(20));
export const myApplicationsIn = async (userId: string, recruitmentIds: string[]) => recruitmentIds.length
  ? rows<Application[]>(await db().from('applications').select('*, state').eq('applicant_id', userId).in('recruitment_id', recruitmentIds))
  : [];
export const applicationsFor = async (recruitmentId: string) =>
  rows<Application[]>(await db().from('applications').select('*, state, profiles(nickname), application_game_ids(game_account_id)').eq('recruitment_id', recruitmentId).order('created_at'));
export const myApplicationFor = async (recruitmentId: string, userId: string) =>
  rows<Application | null>(await db().from('applications').select('*, state, application_game_ids(game_account_id)').eq('recruitment_id', recruitmentId).eq('applicant_id', userId).maybeSingle());
// Rows are visible only to the owner and matched people, and to nobody after a cancel or the end of play
export const meetingFor = async (recruitmentId: string) =>
  rows<Meeting | null>(await db().from('recruitment_meetings').select('room_code, invite_url').eq('recruitment_id', recruitmentId).maybeSingle());

/* ---------- Changing: only through functions. Resending the same operation reuses its opId ---------- */

export const newOpId = () => Crypto.randomUUID();
async function call<T extends object>(name: string, opId: string, args: Record<string, unknown>): Promise<Result<T>> {
  const { data, error, status } = await db().rpc(name, { p_op_id: opId, ...args });
  if (error) {
    if (status === 401 || status === 403 || error.code === '42501') return { ok: false, reason: 'login_required' };
    throw new Error('送れませんでした');
  }
  return data as Result<T>;
}
export type RecruitmentInput = {
  gameId: number; needsParticipantId: boolean; startsAt: string | null; capacity: number | null;
  voiceChat: string | null; skill: number | null; enthusiasm: number | null; mode: string | null; platform: string | null;
  roomCode: string | null; inviteUrl: string | null;
};
export const publishRecruitment = (opId: string, x: RecruitmentInput) => call<{ recruitment_id: string }>('publish_recruitment', opId, {
  p_game_id: x.gameId, p_needs_participant_id: x.needsParticipantId, p_starts_at: x.startsAt, p_capacity: x.capacity,
  p_voice_chat: x.voiceChat, p_skill: x.skill, p_enthusiasm: x.enthusiasm, p_mode: x.mode, p_platform: x.platform,
  p_room_code: x.roomCode, p_invite_url: x.inviteUrl,
});
export const applyToRecruitment = (opId: string, recruitmentId: string, gameAccountId: string | null) =>
  call<{ application_id: string; state: ApplicationState }>('apply_to_recruitment', opId, { p_recruitment_id: recruitmentId, p_game_account_id: gameAccountId });
export const approveApplication = (opId: string, applicationId: string) =>
  call<{ state: ApplicationState }>('approve_application', opId, { p_application_id: applicationId });
// null keeps a value, '' clears it
export const updateMeeting = (opId: string, recruitmentId: string, roomCode: string | null, inviteUrl: string | null) =>
  call<Meeting>('update_meeting', opId, { p_recruitment_id: recruitmentId, p_room_code: roomCode, p_invite_url: inviteUrl });
export type RecruitmentAction = 'close' | 'cancel' | 'start_play' | 'end_play';
export const changeRecruitment = (opId: string, recruitmentId: string, action: RecruitmentAction) =>
  call<{ status: RecruitmentStatus }>('change_recruitment', opId, { p_recruitment_id: recruitmentId, p_action: action });
export const reopenWithMoreCapacity = (opId: string, recruitmentId: string, capacity: number) =>
  call<{ status: RecruitmentStatus }>('reopen_with_more_capacity', opId, { p_recruitment_id: recruitmentId, p_new_capacity: capacity });

const REASONS: Record<string, string> = {
  login_required: 'ログインしてください',
  not_found: '募集が見つかりません',
  not_owner: '募集した人だけができる操作です',
  own_recruitment: '自分の募集には参加できません',
  not_accepting: 'この募集は今は受け付けていません',
  unknown_game: 'このゲームはまだ用意されていません',
  game_account_id_required: 'ゲーム内IDを入れてください',
  game_account_id_invalid: 'ゲーム内IDは英数字だけで入れてください',
  unknown_mode: 'このゲームでは選べないモードです',
  not_reopenable: '今の人数や状態では、受付を再開できません',
};
// The reason and the latest state of the recruitment (requests-4, list-21)
export const failureText = (f: Failure) => `${REASONS[f.reason] ?? 'できませんでした'}${f.status ? `（今の状態：${f.status}）` : ''}`;

/* ---------- Sign-in and live updates ---------- */

// undefined while the session is being read
export function useUserId(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const client = getSupabase();
    if (!client) { setId(null); return; }
    let active = true;
    void client.auth.getSession().then(({ data }) => { if (active) setId(data.session?.user.id ?? null); });
    const { data } = client.auth.onAuthStateChange((_event, session) => setId(session?.user.id ?? null));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return id;
}

// Changes arrive through Realtime; on (re)connecting and on returning to the screen, read again (ADR-66)
export function useLive(changes: { table: string; filter?: string }[], reload: () => void, key: string) {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    const run = () => latest.current();
    // Read now; Realtime may be slow to connect or unavailable
    run();
    const client = getSupabase();
    if (!client) return;
    const channel = client.channel(`live-${newOpId()}`);
    for (const c of changes) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: c.table, ...(c.filter ? { filter: c.filter } : {}) }, run);
    }
    channel.subscribe(status => { if (status === 'SUBSCRIBED') run(); });
    const app = AppState.addEventListener('change', value => { if (value === 'active') run(); });
    if (Platform.OS === 'web') window.addEventListener('focus', run);
    return () => {
      void client.removeChannel(channel);
      app.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', run);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
