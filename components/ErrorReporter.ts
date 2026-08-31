// ブラウザで起きたエラーをサーバーへ送る。エラー境界から呼ぶ。
// 送信自体が失敗しても何もしない（エラー報告の失敗を報告する術は無い）。
export function reportClientError(error: Error & { digest?: string }): void {
  try {
    const payload = JSON.stringify({
      message: error?.message || String(error),
      // digest は本番ビルドでサーバー側のログと突き合わせるための識別子
      stack: [error?.digest ? `digest: ${error.digest}` : '', error?.stack ?? ''].filter(Boolean).join('\n'),
      path: typeof location !== 'undefined' ? location.pathname : null,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    });
    // 画面遷移やタブを閉じる操作に巻き込まれても送り切れるよう sendBeacon を優先する
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/error-log', new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch('/api/error-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 握りつぶす
  }
}
