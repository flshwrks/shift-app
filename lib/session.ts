import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import type { SessionUser } from './types';

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

function verifyToken(raw: string): SessionUser | null {
  const [encoded, sig] = raw.split('.');
  if (!encoded || !sig) return null;

  if (!constantTimeEqual(sig, sign(encoded))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Payload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return { id: payload.id, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

// 現在のリクエストのセッションCookieを検証して返す（Route Handler内で使用）
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifyToken(raw);
}

async function requireAdminSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== 'admin' && session.role !== 'developer') return null;
  return session;
}

// 管理者権限（admin/developer）が必要なAPIルートの入口で使う。
// 権限がなければ403レスポンスを返すので、呼び出し側は
// `if (session instanceof NextResponse) return session;` だけでガードできる。
export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  return session;
}
