import { createHash } from 'node:crypto';
import { createAdminClient } from './supabaseAdmin';
import type { SessionUser } from './types';

// ============================================================================
// エラーの記録 — 点検項目 F-4
//
// 「画面が真っ白になった」と言われても調べる材料が無い状態を解消する。
// 外部の監視サービスではなく、承認済みの保管先（このアプリのDB）に閉じている。
// 経緯と限界（即時通知はできない）は docs/SECURITY.md 参照。
//
// ★記録に失敗しても何も起こさない★
// エラーを記録しようとしてエラーになる、が最悪の形。
// テーブルが未作成の環境でも、通常の処理を妨げない。
// ============================================================================

export interface ErrorReport {
  source: 'client' | 'server';
  message: string;
  stack?: string | null;
  path?: string | null;
  appVersion?: string | null;
  userAgent?: string | null;
}

const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;

/**
 * 同じエラーをまとめるための鍵。
 * メッセージに混ざる可変値（UUID・数値・日付）を落としてから作らないと、
 * 「同じ不具合なのに毎回違うエラー」として並んでしまう。
 */
export function fingerprintOf(source: string, message: string, path: string | null | undefined): string {
  const normalized = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d{4}-\d{2}-\d{2}/g, '<date>')
    .replace(/\d+/g, '<n>')
    .slice(0, 300);
  const scope = (path ?? '').replace(/\/s\/[^/]+/, '/s/<store>');
  return createHash('sha256').update(`${source}|${normalized}|${scope}`).digest('hex').slice(0, 16);
}

/**
 * エラーを記録する。同じ内容が未対応で残っていれば件数を増やすだけにする。
 * **呼び出し側は await しなくてよい**（失敗しても何も起きない）。
 */
export async function recordError(report: ErrorReport, actor?: SessionUser | null, storeId?: string | null): Promise<void> {
  try {
    const message = (report.message || '(メッセージなし)').slice(0, MAX_MESSAGE);
    const path = report.path?.slice(0, 500) ?? null;
    const fingerprint = fingerprintOf(report.source, message, path);
    const supabase = createAdminClient();

    // 未対応で同じものがあれば、行を増やさず件数と最終発生時刻だけ更新する
    const { data: existing } = await supabase
      .from('error_logs')
      .select('id, count')
      .eq('fingerprint', fingerprint)
      .eq('status', 'new')
      .limit(1)
      .maybeSingle<{ id: string; count: number }>();

    if (existing) {
      await supabase
        .from('error_logs')
        .update({ count: existing.count + 1, last_seen_at: new Date().toISOString() })
        .eq('id', existing.id);
      return;
    }

    const { error } = await supabase.from('error_logs').insert({
      source: report.source,
      message,
      stack: report.stack?.slice(0, MAX_STACK) ?? null,
      path,
      fingerprint,
      actor_id: actor && actor.id !== '__dev__' ? actor.id : null,
      actor_name: actor?.name ?? null,
      store_id: storeId ?? actor?.storeId ?? null,
      app_version: report.appVersion ?? null,
      user_agent: report.userAgent?.slice(0, 500) ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    // ここで投げると「エラーを記録しようとしてエラーになる」ことになる
    console.error('[error-log] 記録に失敗しました', e instanceof Error ? e.message : e);
  }
}
