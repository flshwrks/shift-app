import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { getReleaseHistory, ReleaseNotesBody } from '@/components/ReleaseNotes';

export const metadata = {
  title: '更新履歴 | シフト管理',
};

// 全バージョンの更新内容をまとめて読めるページ。
//
// ログイン不要にしてある。proxy.ts の matcher は ['/s/:path*', '/admin/:path*', '/login',
// '/staff/:path*'] なので、ルート直下のこのパスはガードの対象外。更新のお知らせ（UpdateToast）は
// 数秒で消えるため、見逃した人がPINを入れ直さずに後から読めることを優先した。
// 内容は「アプリの変更履歴」であって店舗やスタッフの情報を含まないので、公開して問題ない。
//
// データはビルド時に CHANGELOG.md から取り込まれている（next.config.ts 参照）ので、
// このページ自体は静的に生成される。
export default function ReleaseNotesPage() {
  const entries = getReleaseHistory();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white/90 backdrop-blur border-b border-slate-300 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 flex items-center h-[52px] gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            <span className="text-slate-300 text-sm">|</span>
            <span className="text-[13px] text-slate-500 truncate">更新履歴</span>
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
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg p-6 text-center">
            更新履歴を読み込めませんでした。
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <section key={entry.version} className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex items-baseline gap-2 mb-3 pb-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900 tabular-nums">v{entry.version}</h2>
                  {entry.date && <span className="text-xs text-slate-400 tabular-nums">{entry.date}</span>}
                  {i === 0 && (
                    <span className="text-[10px] px-1.5 py-px rounded font-medium border bg-blue-50 text-blue-700 border-blue-200">
                      最新
                    </span>
                  )}
                </div>
                <ReleaseNotesBody markdown={entry.body} />
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
