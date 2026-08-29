import { NextResponse } from 'next/server';
import { buildSessionCookieValue, constantTimeEqual, SESSION_COOKIE } from '@/lib/session';
import { signJwtForSession } from '@/lib/supabaseJwt';
import type { SessionUser } from '@/lib/types';

// 開発者ログイン。通過すると developer（RLS上は hq_admin と同格＝全店舗横断）の
// セッションが発行される、このアプリで最も強い入口。
//
// 2026-08-29 の点検(F-1)で、次の状態だったため塞いだ:
//   - パスワードが4桁の数字1つ（1万通り）
//   - 試行回数の制限が無い（利用者のPINには5回ロックがあるのに、ここだけ素通り）
//   - 成功・失敗のどちらも記録が残らない
//
// 対策は3つ。いずれもこの入口だけに効かせている（店舗ログインは
// verify_login 側のDBロックで保護されているため、IP単位の制限を掛けると
// 店舗の共有Wi-Fiから複数人がログインできなくなる副作用のほうが大きい）。
const MIN_SECRET_LENGTH = 24;   // 短い値は事故のもとなので、設定ミスとして拒否する
const MAX_ATTEMPTS = 5;         // 同一IPからの失敗許容回数
const WINDOW_MS = 10 * 60 * 1000;
const FAILURE_DELAY_MS = 700;   // 総当たりの試行速度を落とす

interface Attempt { count: number; resetAt: number }
// サーバーレスではインスタンスごとに揮発するため完全な制限にはならないが、
// 総当たりの速度を数桁落とせる。恒久対策はDB側のカウンタ（F-1の残作業）。
const attempts = new Map<string, Attempt>();

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || 'unknown';
}

function takeAttempt(ip: string): boolean {
  const now = Date.now();
  // 期限切れのエントリを掃除する（放置するとMapが際限なく膨らむ）
  for (const [key, v] of attempts) {
    if (v.resetAt <= now) attempts.delete(key);
  }
  const cur = attempts.get(ip);
  if (!cur) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  cur.count += 1;
  return cur.count <= MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  const secret = process.env.DEV_LOGIN_PASSWORD;
  const ip = clientIp(request);

  // 未設定・短すぎる場合は開くより閉じる。安全側に倒す
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.warn(`[dev-login] DEV_LOGIN_PASSWORD が未設定または${MIN_SECRET_LENGTH}文字未満のため拒否した`);
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  if (!takeAttempt(ip)) {
    console.warn(`[dev-login] 試行回数の上限に達したため拒否した ip=${ip}`);
    return NextResponse.json({ ok: false, error: 'too_many_attempts' }, { status: 429 });
  }

  const { code } = await request.json().catch(() => ({ code: '' }));
  const input = typeof code === 'string' ? code : '';

  if (!constantTimeEqual(input, secret)) {
    console.warn(`[dev-login] 認証に失敗した ip=${ip}`);
    await new Promise(r => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  attempts.delete(ip);
  console.info(`[dev-login] 開発者としてログインした ip=${ip}`);

  // developer は既存のDB非保存の合成ロール。全店舗を横断できるためstoreId/storeSlugはnull。
  const user: SessionUser = { id: '__dev__', name: '開発者', role: 'developer', storeId: null, storeSlug: null };
  const supabaseToken = await signJwtForSession(user);
  const res = NextResponse.json({ ok: true, user, supabaseToken });
  res.cookies.set(SESSION_COOKIE.name, buildSessionCookieValue(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE.maxAge,
  });
  return res;
}
