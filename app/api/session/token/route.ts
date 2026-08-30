import { NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE, buildSessionCookieValue } from '@/lib/session';
import { getVerifiedSession, SessionCheckUnavailable } from '@/lib/sessionGuard';
import { signJwtForSession } from '@/lib/supabaseJwt';

// クライアントはSupabase JWTをlocalStorageに保存しない（XSS対策）ため、
// ページ読み込み時・定期リフレッシュ時に毎回このエンドポイントから取り直す。
//
// ここは「まだこの人にデータを見せてよいか」を再確認できる唯一の定期実行点でもある（F-2）。
// Cookieの署名だけで発行していたころは、退職者を削除してもCookieの有効期限（30日）が
// 切れるまでデータを読み続けられた。DBと突き合わせることで、
// **削除・降格が最長でも次のトークン更新（45分間隔）で効く**ようになっている。
export async function GET() {
  let session;
  try {
    session = await getVerifiedSession();
  } catch (e) {
    if (e instanceof SessionCheckUnavailable) {
      // DB障害と「セッションが無効」を混同させない。
      // ここで401を返すと、DBが落ちている間に全利用者が強制ログアウトされてしまう。
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
    throw e;
  }

  if (!session) {
    // 退職・削除・所属不明。Cookieも消して、次のリクエストで確実にログイン画面へ落とす
    const res = NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    res.cookies.delete(SESSION_COOKIE.name);
    return res;
  }

  const token = await signJwtForSession(session);
  // クライアント側の表示権限（管理メニューの有無など）をDBに追随させるため、
  // 検証後のセッションも返す
  const res = NextResponse.json({ token, user: session });

  // 権限や所属が変わっていた場合はCookieも貼り直す。
  // 貼り直さないと、次のリクエストでまた古い権限のCookieが送られてくる
  const raw = await getSession();
  if (raw && (raw.role !== session.role || raw.storeId !== session.storeId)) {
    res.cookies.set(SESSION_COOKIE.name, buildSessionCookieValue(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_COOKIE.maxAge,
    });
  }

  return res;
}
