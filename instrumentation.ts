import type { Instrumentation } from 'next';

// サーバー側で起きた想定外のエラーを1か所で受ける（Next.js 16 の規約。
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md）。
//
// これが無かったころは、APIが500を返してもVercelの実行ログに出るだけで、
// 誰も見ないまま利用者の申告を待つ状態だった（点検項目 F-4）。
//
// ここは全リクエストのエラー経路になるため、**重い処理も外部通信も足さない**。
// 記録先は自前のDBで、失敗しても握りつぶす（lib/errorLog.ts）。
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Edgeランタイムでは service_role クライアント（node:crypto 依存）を使えないため何もしない。
  // 現状 proxy.ts 以外は Node.js ランタイムで動いている
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { recordError } = await import('./lib/errorLog');
    const message = err instanceof Error ? err.message : String(err);
    const digest = typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : null;
    const stack = err instanceof Error ? err.stack ?? null : null;

    await recordError({
      source: 'server',
      message,
      // digest はブラウザ側に出る識別子。クライアントの記録と突き合わせるために残す
      stack: [digest ? `digest: ${digest}` : '', `${context.routeType} ${context.routePath}`, stack ?? '']
        .filter(Boolean).join('\n'),
      path: `${request.method} ${request.path}`,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
    });
  } catch {
    // エラーの記録でエラーを起こさない
  }
};
