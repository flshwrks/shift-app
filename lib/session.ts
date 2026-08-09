import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import type { SessionUser } from './types';
import { canAccessAdmin, isHqRole } from './types';

const COOKIE_NAME = 'shift_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30日

interface Payload extends SessionUser {
  exp: number;
}

// 長さの違う入力でも早期リターンせず一定時間で比較する（タイミング攻撃対策）
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function sign(encoded: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return createHmac('sha256', secret).update(encoded).digest('hex');
}

export function buildSessionCookieValue(user: SessionUser): string {
  const payload: Payload = { ...user, exp: Date.now() + MAX_AGE_SECONDS * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export const SESSION_COOKIE = { name: COOKIE_NAME, maxAge: MAX_AGE_SECONDS };

// セッションCookieの署名・有効期限を検証してSessionUserを返す。proxy.tsからも呼ばれる。
//
// 多店舗対応前に発行されたCookieには storeId/storeSlug が無い。これらを null のまま
// 通すと、店舗ユーザーが「所属店舗が不明なままログイン状態」で各所を通過してしまう:
//   - proxy.ts が `/s/null/...` へリダイレクトし続けて無限ループになる
//   - /api/admin/users が store_id=null のスタッフを作ってしまう
// 店舗コンテキストの無い店舗ユーザーは正しくスコープしようがないため、
// 旧Cookieは無効なセッションとして扱い、一度だけ再ログインしてもらう。
// hq_admin/developer は本来 store_id を持たないロールなので、この判定から除外する。
export function verifySessionCookie(raw: string): SessionUser | null {
  const [encoded, sig] = raw.split('.');
  if (!encoded || !sig) return null;

  if (!constantTimeEqual(sig, sign(encoded))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<Payload>;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (!payload.id || !payload.name || !payload.role) return null;
    if (!isHqRole(payload.role) && (!payload.storeId || !payload.storeSlug)) return null;
    return {
      id: payload.id,
      name: payload.name,
      role: payload.role,
      storeId: payload.storeId ?? null,
      storeSlug: payload.storeSlug ?? null,
    };
  } catch {
    return null;
  }
}

// 現在のリクエストのセッションCookieを検証して返す（Route Handler内で使用）
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySessionCookie(raw);
}

async function requireRoleSession(allow: (role: SessionUser['role']) => boolean): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  if (!allow(session.role)) return null;
  return session;
}

// 管理画面アクセス権限（admin/hq_admin/developer）が必要なAPIルートの入口で使う。
// 権限がなければ403レスポンスを返すので、呼び出し側は
// `if (session instanceof NextResponse) return session;` だけでガードできる。
export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const session = await requireRoleSession(canAccessAdmin);
  if (!session) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  return session;
}

// 本部権限（hq_admin/developer）のみを許可するAPIルートの入口で使う。
export async function requireHqAdmin(): Promise<SessionUser | NextResponse> {
  const session = await requireRoleSession(isHqRole);
  if (!session) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  return session;
}
