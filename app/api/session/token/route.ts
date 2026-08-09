import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { signJwtForSession } from '@/lib/supabaseJwt';

// クライアントはSupabase JWTをlocalStorageに保存しない（XSS対策）ため、
// ページ読み込み時・定期リフレッシュ時に毎回このエンドポイントから取り直す。
// 発行の可否はhttpOnlyのセッションCookieだけで判断する。
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const token = await signJwtForSession(session);
  return NextResponse.json({ token });
}
