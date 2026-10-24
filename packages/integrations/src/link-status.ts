import type { Provider } from './linking.ts';
import type { SyncSnapshot } from './sync.ts';

export interface LinkStatus {
  provider: Provider;
  externalId: string;
  status: string;
  lastSuccessAt: string | null;
  nextAttemptAt: string | null;
}
export function publicLinkStatus(row: { provider: Provider; external_id: string; snapshot: SyncSnapshot<unknown> | null }): LinkStatus {
  return { provider: row.provider, externalId: row.external_id,
    status: row.snapshot?.status ?? 'pending', lastSuccessAt: row.snapshot?.lastSuccessAt ?? null,
    nextAttemptAt: row.snapshot?.nextAttemptAt ?? null };
}
export function lastUpdatedLabel(lastSuccessAt: string | null, now = Date.now()): string {
  if (lastSuccessAt === null || !Number.isFinite(Date.parse(lastSuccessAt))) return 'まだ取得できていません';
  const elapsed = Math.max(0, now - Date.parse(lastSuccessAt));
  if (elapsed > 7 * 24 * 60 * 60_000) return '7日以上前';
  if (elapsed >= 24 * 60 * 60_000) return `${Math.floor(elapsed / (24 * 60 * 60_000))}日前`;
  if (elapsed >= 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))}時間前`;
  if (elapsed >= 60_000) return `${Math.floor(elapsed / 60_000)}分前`;
  return 'たった今';
}
export const linkStatusLabels: Record<string, string> = {
  pending: '取得待ち', available: '連携済み', unavailable: '取得できません（非公開など）',
  private: '非公開', retry_wait: '更新に失敗・自動再試行待ち',
  relink_required: '再連携が必要です', configuration_error: '接続設定の確認が必要です',
};
