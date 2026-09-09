import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import GuideContent from './GuideContent';

export const metadata = {
  title: '詳しい使い方 | シフト管理',
};

// 詳しい使い方。以前は外部サイト（別サービス上のページ）に置いていたが、
// アプリ内へ移した。理由は3つ:
//   - 読む人はスタッフで、外部サービスのアカウントを持っていない
//   - 外部に置くと、アプリを引き継ぐ人が別サービスの管理も引き継ぐことになる
//   - 店舗ごとに違うログインURLを本文へ書けない（書くと1店舗専用の資料になる）
//
// ログイン不要にしてある。proxy.ts の matcher は ['/s/:path*', '/admin/:path*',
// '/login', '/staff/:path*'] なので、ルート直下のこのパスはガードの対象外。
// 内容は操作説明だけで、店舗やスタッフの情報を含まないため公開して問題ない。
// 画面写真もテスト店舗のもので、実在のスタッフ名は含まれない。
export default function GuidePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white/90 backdrop-blur border-b border-slate-300 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 flex items-center h-[52px] gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            <span className="text-slate-300 text-sm">|</span>
            <span className="text-[13px] text-slate-500 truncate">詳しい使い方</span>
          </div>
          <Link
            href="/"
            className="text-xs px-2.5 h-7 rounded-[3px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex-shrink-0 flex items-center"
          >
            アプリに戻る
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <GuideContent />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-5 text-xs text-slate-500 leading-relaxed">
          ここに書いていないことがあれば、アプリの「≡」→「要望を送る」から知らせてください。
        </div>
      </footer>
    </div>
  );
}
