'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { isHqRole } from '@/lib/types';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import HelpModal from '@/components/HelpModal';
import FeedbackModal from '@/components/FeedbackModal';
import { IconMenu, IconHelp, IconHistory, IconMessageSquare } from '@/components/icons';

// ヘッダー右上のメニュー。
//
// 使い方・要望を送る・更新履歴を1か所に集約している。以前はヘルプがヘッダーの「?」、
// 要望と更新履歴がページ最下部のフッターに分かれていたが、
//   - フッターは長いシフト表の一番下にあり、たどり着くのにスクロールが要る
//     （片手・数秒で使う前提の画面に合わない）
//   - 「困ったときに開く場所」が2か所あると、どちらを見ればよいか分からない
// という理由でヘッダーの1メニューにまとめた。
//
// 要望の送信はスタッフにだけ出す。管理者・本部管理者は受け取って対応する側であり、
// 自分宛てに要望を送る導線があるのは不自然なため（/api/feedback 側でも検証している）。
//
// ★オーバーレイは必ずポータルで body 直下に描く★
// このコンポーネントは backdrop-blur の掛かった <header> の中に置かれる。
// backdrop-filter は position:fixed の子孫に対する「包含ブロック」を作るため、
// ヘッダーの中に普通に書いた fixed 要素はビューポートではなく
// ヘッダー(高さ52px)を基準に配置され、メニューが潰れて見えなくなる。
// sticky + z-index による重なり順の問題も同時に避けられるので、
// メニュー本体も各モーダルもまとめて body 直下へ逃がす。
export default function AppMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useBodyScrollLock(open);

  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const canSendFeedback = user?.role === 'staff';
  const helpRole = user ? (isHqRole(user.role) ? 'hq_admin' : user.role === 'staff' ? 'staff' : 'admin') : 'staff';

  const itemClass =
    'w-full flex items-center gap-3 px-4 py-3.5 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left';

  const menu = (
    <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/30" />
      {/* モバイルは下からのシート、sm以上はヘッダー右下に出るパネル */}
      <div
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-xl overflow-hidden
          sm:inset-x-auto sm:bottom-auto sm:top-14 sm:right-4 sm:w-64 sm:rounded-lg sm:border sm:border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3" />

        <div className="py-1">
          <button onClick={() => { setOpen(false); setShowHelp(true); }} className={itemClass}>
            <IconHelp className="w-4 h-4 text-slate-400 flex-shrink-0" />
            使い方
          </button>

          {canSendFeedback && (
            <button onClick={() => { setOpen(false); setShowFeedback(true); }} className={itemClass}>
              <IconMessageSquare className="w-4 h-4 text-slate-400 flex-shrink-0" />
              要望を送る
            </button>
          )}

          <Link href="/release-notes" onClick={() => setOpen(false)} className={itemClass}>
            <IconHistory className="w-4 h-4 text-slate-400 flex-shrink-0" />
            更新履歴
          </Link>
        </div>

        {version && (
          <p className="px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400">
            シフト管理 <span className="tabular-nums">v{version}</span>
          </p>
        )}
        {/* モバイルのシートがホームバーに被らないようにする */}
        <div className="pb-[env(safe-area-inset-bottom)] sm:hidden" />
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-7 h-7 rounded-[3px] bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 flex items-center justify-center flex-shrink-0 transition-colors"
        title="メニュー"
        aria-label="メニュー"
        aria-expanded={open}
      >
        <IconMenu className="w-4 h-4" />
      </button>

      {/* open/showHelp/showFeedback はクリック後にしか真にならないので、
          document を参照するこのポータルがSSR時に評価されることはない */}
      {open && createPortal(menu, document.body)}
      {showHelp && createPortal(<HelpModal role={helpRole} onClose={() => setShowHelp(false)} />, document.body)}
      {showFeedback && createPortal(<FeedbackModal onClose={() => setShowFeedback(false)} />, document.body)}
    </>
  );
}
