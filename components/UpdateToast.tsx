'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const VERSION_SEEN_KEY = 'app_version_seen';
// 画面の読み込み直後に重ねて出すと、他の要素と一緒に一瞬ちらついて読めない。少しだけ遅らせる
const APPEAR_DELAY_MS = 400;
const AUTO_DISMISS_MS = 6000;
const FADE_OUT_MS = 250;

// バージョンが上がっていた場合だけ、ログイン後に1回だけ出る更新のお知らせ。
//
// 全画面モーダルではなくトーストにしてある。更新内容は読み飛ばしても業務に支障が無いのに、
// タップを強制すると毎回リリースのたびに全員の作業を1手止めることになるため。
// 画面を占有しないので、調整依頼・アンケートの自動ポップアップと同時に出ても邪魔をしない
// （モーダルだった頃はそれらとの衝突を避けるDOM監視が必要だったが、トーストでは不要になった）。
//
// 変更内容そのものはここに載せない。すぐ消えるものに読ませるべきではないので、
// 「変更内容」から /release-notes（全バージョンの更新履歴）へ誘導する。
export default function UpdateToast() {
  const { user } = useAuth();
  const [version, setVersion] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
    if (!currentVersion) return;

    const lastSeen = localStorage.getItem(VERSION_SEEN_KEY);

    if (lastSeen === null) {
      // 初回ログインのユーザーに変更履歴を見せても意味が無い（更新を見せたいのであって、
      // 初見の人に沿革を見せたいわけではない）。表示せず現在のバージョンを保存するだけにする
      localStorage.setItem(VERSION_SEEN_KEY, currentVersion);
      return;
    }
    if (lastSeen === currentVersion) return;

    const timer = setTimeout(() => {
      // 自動で消えるので「閉じた」タイミングが無い。表示した時点で既読にする。
      // 見逃しても /release-notes からいつでも読めるため、取りこぼしにはならない
      localStorage.setItem(VERSION_SEEN_KEY, currentVersion);
      setVersion(currentVersion);
      setVisible(true);
    }, APPEAR_DELAY_MS);

    return () => clearTimeout(timer);
  }, [user]);

  // 一定時間で自動的に引っ込める
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  // フェードアウトを見せてからDOMを外す
  useEffect(() => {
    if (version === null || visible) return;
    const timer = setTimeout(() => setVersion(null), FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [version, visible]);

  if (!version) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // z-40 はモバイルの固定ボトムナビ(z-30)より上、モーダル(z-50)より下。
      // bottom はそのボトムナビに重ならない高さ（main の pb と同じ考え方で safe-area を足す）
      className={`fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-sm
        bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-6
        transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="bg-white border border-slate-300 rounded-lg shadow-lg px-3 py-2.5 flex items-center gap-3">
        <p className="text-[13px] text-slate-600 flex-1 min-w-0">
          バージョン <span className="font-semibold text-slate-900 tabular-nums">{version}</span> に更新されました
        </p>
        <Link
          href="/release-notes"
          className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex-shrink-0 whitespace-nowrap"
        >
          変更内容
        </Link>
        <button
          onClick={() => setVisible(false)}
          aria-label="閉じる"
          className="w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
