import { canAccessAdmin, isHqRole, type UserRole } from './types';

// ログイン直後・不正なURLからの引き戻し先を1箇所に集約する。
// 以前は app/page.tsx・ログイン画面・proxy.ts の3箇所に同じ分岐が散在しており、
// ルーティングを変えるたびに全箇所を直す必要があった。
// proxy.ts（Node.jsランタイム）からも import されるため、副作用のない純粋関数にしておくこと。

export const HQ_HOME = '/admin/stores';
export const HQ_LOGIN = '/admin/login';

export function storeLoginPath(storeSlug: string): string {
  return `/s/${storeSlug}/login`;
}

/**
 * そのロールにとっての「ホーム」を返す。
 * 本部権限は特定店舗に属さないため storeSlug を無視して店舗一覧へ向かう。
 */
export function homePathFor(role: UserRole, storeSlug: string | null): string {
  if (isHqRole(role)) return HQ_HOME;
  if (!storeSlug) return '/';
  return canAccessAdmin(role) ? `/s/${storeSlug}/admin/schedule` : `/s/${storeSlug}/staff/shifts`;
}
