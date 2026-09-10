import { canAccessAdmin, isHqRole, type UserRole } from './types';

// ログイン直後・不正なURLからの引き戻し先を1箇所に集約する。
// 以前は app/page.tsx・ログイン画面・proxy.ts の3箇所に同じ分岐が散在しており、
// ルーティングを変えるたびに全箇所を直す必要があった。
// proxy.ts（Node.jsランタイム）からも import されるため、副作用のない純粋関数にしておくこと。

export const HQ_HOME = '/admin/stores';
export const HQ_LOGIN = '/admin/login';
export const HQ_FEEDBACK = '/admin/feedback';
export const HQ_ERRORS = '/admin/errors';
export const HQ_ADMINS = '/admin/admins';

// アプリ外にある「使い方の完全版」。役割ごとの手順を画面の図つきで載せた読み物で、
// アプリ内ヘルプ（HelpModal）に入りきらない粒度をこちらが受け持つ。
// アプリ内ヘルプ = 操作中に開く早見表、こちら = 最初に通して読む説明、という分担。
// 詳しい使い方はアプリ内に置く。外部サイトに置くと、読む人（スタッフ）が
// そのサービスのアカウントを必要としたり、アプリを引き継ぐ人が別サービスの
// 管理まで引き継ぐことになるため。
export const FULL_GUIDE_PATH = '/guide';

// ログイン中の役割が分かっているときは、その役割のページへ直接飛ばす。
// 役割を知っているのに読者に選ばせ直さないため。developer は本部と同じ画面を使う。
export function fullGuidePath(role?: string | null): string {
  if (role === 'staff') return '/guide/staff';
  if (role === 'admin') return '/guide/admin';
  if (role === 'hq_admin' || role === 'developer') return '/guide/hq';
  return FULL_GUIDE_PATH;
}

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
