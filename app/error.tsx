'use client';
import { useEffect } from 'react';
import { reportClientError } from '@/components/ErrorReporter';

// 画面のどこかで想定外のエラーが起きたときに表示される（Next.jsの規約）。
// これが無かったころは、真っ白な画面か素っ気ない英語のエラーが出るだけで、
// 利用者は何が起きたか分からず、こちらも起きたこと自体を知れなかった（点検項目 F-4）。
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 w-full max-w-sm text-center">
        <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-xl font-bold text-amber-600">!</span>
        </div>
        <h2 className="text-lg font-bold text-slate-800">画面を表示できませんでした</h2>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          一時的な不具合の可能性があります。もう一度お試しください。<br />
          何度も起きる場合は管理者にお知らせください。
        </p>
        <p className="text-[11px] text-slate-400 mt-3">この不具合は自動的に記録されました。</p>
        <div className="mt-5 space-y-2">
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            もう一度読み込む
          </button>
          <button
            onClick={() => { window.location.href = '/'; }}
            className="w-full py-2.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            最初の画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
}
