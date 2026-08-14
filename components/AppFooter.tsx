'use client';
import { useState } from 'react';
import Link from 'next/link';
import FeedbackModal from '@/components/FeedbackModal';

// ログイン後の画面いちばん下に出る、控えめなフッター。
// ヘッダーは既に混んでいるため、要望送信の導線はここに置く。
// モバイルの固定ボトムナビに隠れないための余白は、呼び出し側（各layoutのmain）が
// 既存ページと同じ pb-[calc(5rem+...)] を確保しているので、ここでは重ねて確保しない
// （footerをmainの最後の子として置くことで、その余白をそのまま利用する）。
export default function AppFooter() {
  const [showFeedback, setShowFeedback] = useState(false);
  const version = process.env.NEXT_PUBLIC_APP_VERSION;

  return (
    <footer className="mt-10 pt-6 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
      <button
        onClick={() => setShowFeedback(true)}
        className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
      >
        要望を送る
      </button>
      {/* バージョンは更新履歴への入口も兼ねる。ただの表示に見えて実はリンク、にならないよう
          「更新履歴」と明示し、下線を付けてリンクだと分かる形にしている */}
      {version && (
        <p className="text-[11px] text-slate-400">
          シフト管理 <span className="tabular-nums">v{version}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <Link href="/release-notes" className="underline underline-offset-2 hover:text-slate-600 transition-colors">
            更新履歴
          </Link>
        </p>
      )}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </footer>
  );
}
