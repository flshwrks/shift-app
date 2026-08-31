import { createAdminClient } from './supabaseAdmin';
import type { SessionUser } from './types';

// ============================================================================
// 操作の記録（監査ログ） — 点検項目 F-3
//
// 記録は2系統ある。
//   ・ブラウザから直接DBを更新する操作（シフトの確定など）→ DBのトリガー
//     （supabase/migrations/2026-08-31_audit_log.sql）
//   ・サーバー側のAPIを通る操作（スタッフの追加・削除・権限変更など）→ このファイル
//
// ★記録に失敗しても業務は止めない★
// 監査ログが書けないことより、スタッフを追加できないことのほうが現場の実害が大きい。
// また `audit_logs` テーブルがまだ作られていない環境（マイグレーション適用前）でも
// アプリが動くようにしておく必要がある。失敗はサーバーログに出して検知可能にする。
// ============================================================================

export type AuditAction =
  | 'user.create'
  | 'user.delete'
  | 'user.role_change'
  | 'user.rename'
  | 'user.pin_reset'
  | 'store.create'
  | 'store.delete';

interface AuditEntry {
  storeId: string | null;
  action: AuditAction;
  targetType?: 'user' | 'store';
  targetId?: string | null;
  targetName?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * 操作を記録する。**呼び出し側は await しなくてよい**（失敗しても何も起きない）。
 * 記録のために業務処理を遅らせたくない場合は `void recordAudit(...)` で投げっぱなしにする。
 */
export async function recordAudit(actor: SessionUser, entry: AuditEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('audit_logs').insert({
      store_id: entry.storeId,
      actor_id: actor.id === '__dev__' ? null : actor.id, // developer はDBに存在しない
      actor_name: actor.name,
      actor_role: actor.role,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      target_name: entry.targetName ?? null,
      detail: entry.detail ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    // ここで throw すると業務処理まで巻き込んで失敗する
    console.error('[audit] 記録に失敗しました', entry.action, e instanceof Error ? e.message : e);
  }
}
