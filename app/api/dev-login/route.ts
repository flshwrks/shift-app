import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

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

  const inputBuf = Buffer.from(input);
  const secretBuf = Buffer.from(secret);
  const match = inputBuf.length === secretBuf.length && timingSafeEqual(inputBuf, secretBuf);

  if (!match) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
