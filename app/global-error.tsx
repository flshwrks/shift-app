'use client';
import { useEffect } from 'react';
import { reportClientError } from '@/components/ErrorReporter';

// 全体のレイアウトごと壊れた場合の最後の受け皿（Next.jsの規約）。
// app/error.tsx では拾えない範囲なので、<html> から自前で描く必要がある。
// ここではアプリのCSSが当たらない前提で、素のスタイルだけで組む。
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F4F7FA', color: '#10151B' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8ED', borderRadius: 16, padding: 32, maxWidth: 360, textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>アプリを表示できませんでした</h2>
            <p style={{ fontSize: 14, color: '#48535F', lineHeight: 1.8, margin: 0 }}>
              一時的な不具合の可能性があります。ページを再読み込みしてください。<br />
              何度も起きる場合は管理者にお知らせください。
            </p>
            <p style={{ fontSize: 11, color: '#67717D', marginTop: 12 }}>この不具合は自動的に記録されました。</p>
            <button
              onClick={reset}
              style={{ marginTop: 20, width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: '#0A66C2', color: '#fff', fontSize: 14, cursor: 'pointer' }}
            >
              再読み込み
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
