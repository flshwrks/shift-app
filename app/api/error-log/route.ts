import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { recordError } from '@/lib/errorLog';

// ブラウザで起きた未捕捉のエラーを受け取る。
//
// ★認証を必須にしない★
// ログイン画面そのものが壊れた場合が、いちばん知りたいケースだから。
// ただし誰でも書けるとログを埋め立てられるので、IP単位で回数を絞る。
// 記録できるのは service_role を使うこの経路だけ（RLSに追加ポリシーを作っていない）。
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function withinLimit(ip: string): boolean {
  const now = Date.now();
  for (const [key, v] of attempts) if (v.resetAt <= now) attempts.delete(key);
  const cur = attempts.get(ip);
  if (!cur) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  cur.count += 1;
  return cur.count <= MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  if (!withinLimit(clientIp(request))) {
    // 記録しないだけで、呼び出し側には成功として返す。
    // ここで失敗を返しても、エラー報告の失敗を報告する術は無い
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const message = typeof body?.message === 'string' ? body.message : '';
  if (!message) return NextResponse.json({ ok: true });

  // 送信元の申告は信用しない。誰であるかはサーバー側のセッションから取る
  const session = await getSession();

  void recordError({
    source: 'client',
    message,
    stack: typeof body?.stack === 'string' ? body.stack : null,
    path: typeof body?.path === 'string' ? body.path : null,
    appVersion: typeof body?.appVersion === 'string' ? body.appVersion : null,
    userAgent: request.headers.get('user-agent'),
  }, session);

  return NextResponse.json({ ok: true });
}
