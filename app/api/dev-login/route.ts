import { NextResponse } from 'next/server';
import { buildSessionCookieValue, constantTimeEqual, SESSION_COOKIE } from '@/lib/session';
import { signJwtForSession } from '@/lib/supabaseJwt';
import type { SessionUser } from '@/lib/types';

// 開発者ログインのパスワード検証。以前はクライアント側コード('0805'固定文字列)に
// 直書きされ、ビルド後のJSバンドルを見れば誰でも読み取れる状態だった。
// サーバー専用の環境変数（NEXT_PUBLIC_ を付けない = クライアントに出力されない）に
// 移すことで、パスワードそのものは配信物に含まれなくなる。
export async function POST(request: Request) {
  const secret = process.env.DEV_LOGIN_PASSWORD;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  const { code } = await request.json().catch(() => ({ code: '' }));
  const input = typeof code === 'string' ? code : '';

  if (!constantTimeEqual(input, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

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
