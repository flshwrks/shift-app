import { NextResponse } from 'next/server';
import { getSession } from './session';
import { createAdminClient } from './supabaseAdmin';
import { canAccessAdmin, isHqRole, type SessionUser, type UserRole } from './types';

// ============================================================================
// セッションCookieの署名検証（lib/session.ts）に加えて、
// 「その利用者がまだDBに存在するか」「権限が変わっていないか」をDBに問い合わせる層。
//
// 2026-08-31 の点検(F-2)まで、APIルートはCookieの署名だけを見ていた。
// Cookieはサーバーに状態を持たない方式で有効期限が30日あるため、
//   - 退職者をスタッフ一覧から削除しても、その端末は最大30日データを見られる
//   - 権限を管理者からスタッフに落としても、その端末では管理操作ができ続ける
// という状態だった。ここでDBと突き合わせることで、
// **削除は次のトークン更新（最長1時間）で、管理操作は次のAPI呼び出しで即座に効く**。
//
// なぜ lib/session.ts と分けるか:
//   lib/session.ts は proxy.ts（全リクエストを通る）からも import されている。
//   あちらに supabase-js を持ち込むと、認可の実体ではない層に重い依存が乗る。
//   DBに触るのはこちらだけに閉じ込め、proxy.ts はCookieの形式検証だけを続ける。
// ============================================================================

/** DBに問い合わせられなかった（＝判定不能）ことを表す。呼び出し側は503に倒す */
export class SessionCheckUnavailable extends Error {}

export interface UserRow {
  id: string;
  role: UserRole;
  store_id: string | null;
}

export type Reconciliation =
  | { kind: 'invalid' }                                          // DBに居ない（退職・削除）
  | { kind: 'unchanged' }                                        // Cookieの内容とDBが一致
  | { kind: 'changed'; role: UserRole; storeId: string | null }; // 権限か所属が変わった

/**
 * Cookieのセッションと、DBから引いた行を突き合わせる（I/Oを含まない判定部分）。
 * ここを純粋関数にしているのは、退職者の締め出しと権限降格という
 * 「壊れると気づけない」判定を、DBなしでテストできるようにするため。
 */
export function reconcileSession(session: SessionUser, row: UserRow | null): Reconciliation {
  if (!row) return { kind: 'invalid' };
  const storeId = row.store_id ?? null;
  if (row.role === session.role && storeId === session.storeId) return { kind: 'unchanged' };
  return { kind: 'changed', role: row.role, storeId };
}

/**
 * 変更後の値でセッションを組み立て直す。
 * 店舗ロールなのに所属店舗が分からない場合は、正しくスコープできないので無効にする
 * （通すと /s/null/... への無限リダイレクトや、店舗なしのデータ書込みが起きる）。
 */
export function finalizeSession(
  base: SessionUser,
  role: UserRole,
  storeId: string | null,
  storeSlug: string | null,
): SessionUser | null {
  if (isHqRole(role)) {
    // 本部権限は特定店舗に属さない。昇格時に古い店舗情報を持ち越さない
    return { id: base.id, name: base.name, role, storeId: null, storeSlug: null };
  }
  if (!storeId || !storeSlug) return null;
  return { id: base.id, name: base.name, role, storeId, storeSlug };
}

/**
 * Cookieの検証 → DBとの突き合わせまで行い、**DB側を正**としたセッションを返す。
 *
 * - 利用者がDBに存在しない（退職・削除）→ null
 * - 権限や所属店舗が変わっていた → DBの最新値を反映した SessionUser を返す
 * - DBに問い合わせられない → SessionCheckUnavailable を投げる
 *   （ここで null を返すと、DB障害のたびに全員が強制ログアウトになる。
 *     「セッションが無効」と「サーバーの不調」は呼び出し側で区別する必要がある）
 */
export async function getVerifiedSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  // developer はDBに保存されない合成ロール。照合対象が無いのでそのまま通す
  // （この入口の強度は DEV_LOGIN_PASSWORD 側で担保している。docs/SECURITY.md）
  if (session.role === 'developer') return session;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, role, store_id')
    .eq('id', session.id)
    .maybeSingle<UserRow>();

  if (error) throw new SessionCheckUnavailable(error.message);

  const result = reconcileSession(session, data ?? null);
  if (result.kind === 'invalid') return null;
  if (result.kind === 'unchanged') return session;

  // 所属店舗が変わっていれば slug を引き直す（店舗の異動は通常運用では起きないが、
  // 起きたときに古い slug のまま通すと他店のURLで動いてしまう）
  let storeSlug = session.storeSlug;
  if (result.storeId !== session.storeId) {
    storeSlug = null;
    if (result.storeId) {
      const { data: store, error: storeError } = await supabase
        .from('stores').select('slug').eq('id', result.storeId).maybeSingle<{ slug: string }>();
      if (storeError) throw new SessionCheckUnavailable(storeError.message);
      storeSlug = store?.slug ?? null;
    }
  }

  return finalizeSession(session, result.role, result.storeId, storeSlug);
}

/**
 * セッションが持つ店舗の**文字列ID（slug）**を、DBの現在値に合わせ直す。
 *
 * ★店舗IDの改名（F-6の残作業）で必要になる★
 * `reconcileSession` は role と storeId しか見ない。店舗IDを改名しても
 * **storeId は変わらない**ので「変更なし」と判定され、Cookieの中の古い slug が残る。
 * するとこうなる:
 *   1. 新しいURLを開く → `proxy.ts` が「Cookieの slug と URL が違う」と見て
 *      **古いURLへ引き戻す** → その店舗はもう無い → 「店舗が見つかりません」
 *   2. ログイン画面は `user.storeSlug === storeSlug` で自店判定しているため、
 *      **自分のアカウントなのに「別のアカウントでログイン中です」**と出る
 *
 * 改名は数年に一度の操作なので、**毎リクエストで引き直さない**。
 * 45分ごとのトークン更新（/api/session/token）でだけ合わせ直せば十分で、
 * 利用者から見れば「新しいQRを読んだら、そのまま入れた」になる。
 */
export async function refreshStoreSlug(session: SessionUser): Promise<SessionUser> {
  if (!session.storeId) return session;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stores')
    .select('slug')
    .eq('id', session.storeId)
    .maybeSingle<{ slug: string }>();

  if (error) throw new SessionCheckUnavailable(error.message);
  // 店舗が消えていた場合はここでは判断しない（呼び出し元の責務を増やさない）
  if (!data || data.slug === session.storeSlug) return session;

  return { ...session, storeSlug: data.slug };
}

/**
 * 検証後のセッションで Cookie を貼り直す必要があるか。
 *
 * 貼り直しを忘れると、次のリクエストでまた古い内容のCookieが送られてくる。
 * **比較する項目が1つ漏れるだけで「直したのに直らない」状態になる**ため、
 * 判定をここに出してテストで固定する。
 * （実際 storeSlug の比較が漏れており、店舗IDを改名すると
 *   ログイン中の全員が行き止まりに入る状態だった。2026-09-11）
 */
export function sessionCookieNeedsRefresh(raw: SessionUser, verified: SessionUser): boolean {
  return (
    raw.role !== verified.role ||
    raw.storeId !== verified.storeId ||
    raw.storeSlug !== verified.storeSlug
  );
}

const UNAVAILABLE = () =>
  NextResponse.json({ error: '一時的に確認できませんでした。時間をおいて再試行してください' }, { status: 503 });
const FORBIDDEN = () => NextResponse.json({ error: '権限がありません' }, { status: 403 });

async function requireRole(allow: (role: SessionUser['role']) => boolean): Promise<SessionUser | NextResponse> {
  let session: SessionUser | null;
  try {
    session = await getVerifiedSession();
  } catch (e) {
    if (e instanceof SessionCheckUnavailable) return UNAVAILABLE();
    throw e;
  }
  if (!session || !allow(session.role)) return FORBIDDEN();
  return session;
}

/**
 * 管理画面アクセス権限（admin/hq_admin/developer）が必要なAPIルートの入口で使う。
 * 権限が無ければ403、DBに問い合わせられなければ503を返すので、
 * 呼び出し側は `if (session instanceof NextResponse) return session;` だけでガードできる。
 */
export function requireAdmin(): Promise<SessionUser | NextResponse> {
  return requireRole(canAccessAdmin);
}

/** 本部権限（hq_admin/developer）のみを許可するAPIルートの入口で使う。 */
export function requireHqAdmin(): Promise<SessionUser | NextResponse> {
  return requireRole(isHqRole);
}

/** ログインしていれば誰でもよいAPIルート用。DB照合は同じく行う。 */
export function requireSession(): Promise<SessionUser | NextResponse> {
  return requireRole(() => true);
}
