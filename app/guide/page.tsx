import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { PermissionTable } from './parts';
import { GUIDES, ROLE_ORDER } from './content';

export const metadata = {
  title: '詳しい使い方 | シフト管理',
};

// 役割を選ぶページ。
//
// アプリのメニューからは、ログイン中の役割に応じた /guide/{role} へ直接飛ぶので、
// 通常の経路でこのページを通ることはない。ここに来るのは、URLを直接開いた人・
// リンクを共有された人・ログアウト状態の人。
//
// ログイン不要にしてある。proxy.ts の matcher は ['/s/:path*', '/admin/:path*',
// '/login', '/staff/:path*'] なので、ルート直下のこのパスはガードの対象外。
// 内容は操作説明だけで、店舗やスタッフの情報を含まない。
export default function GuideHubPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="guide-no-print bg-white/90 backdrop-blur border-b border-slate-300 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 flex items-center h-[52px] gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            <span className="text-slate-300 text-sm">|</span>
            <span className="text-[13px] text-slate-500 truncate">詳しい使い方</span>
          </div>
          <Link
            href="/"
            className="text-[13px] px-3 h-9 rounded-[3px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex-shrink-0 flex items-center"
          >
            アプリに戻る
          </Link>
        </div>
      </header>

      <main className="guide-doc flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <h1 className="text-[26px] font-bold text-slate-900 tracking-tight">詳しい使い方</h1>
        <p className="mt-2 text-[16px] leading-[1.9] text-slate-600 max-w-[38rem]">
          自分の役割を選んでください。選んだページだけを読めば済むようになっています。
        </p>

        <p className="mt-4 text-[15px] leading-[1.9] text-slate-600 border-l-2 border-slate-300 pl-3.5 max-w-[38rem]">
          どれか分からないときは、アプリの画面で見分けられます。
          画面の下のナビが<b className="text-slate-900">3つ</b>ならスタッフ、
          <b className="text-slate-900">4つ</b>なら店舗管理者です。
          店舗を選ぶ画面から始まるなら本部管理者です。
        </p>

        <nav aria-label="役割" className="mt-6 grid gap-2.5 sm:grid-cols-3">
          {ROLE_ORDER.map(r => {
            const g = GUIDES[r];
            return (
              <Link
                key={r}
                href={`/guide/${r}`}
                className="bg-white border border-slate-300 rounded-xl p-4 hover:border-slate-500 hover:bg-slate-50 transition-colors min-h-[88px] flex flex-col"
              >
                <span className="text-[12px] font-bold text-slate-500">{g.scope}</span>
                <span className="text-[17px] font-bold text-slate-900 mt-0.5">{g.name}</span>
                <span className="text-[13px] text-slate-600 mt-1 leading-relaxed">{g.summary}</span>
              </Link>
            );
          })}
        </nav>

        <section aria-labelledby="perm" className="mt-10">
          <h2 id="perm" className="text-[19px] font-bold text-slate-900 border-b-2 border-slate-300 pb-2">
            誰が何をできるか
          </h2>
          <p className="mt-3 mb-3 text-[15px] leading-[1.9] text-slate-600 max-w-[38rem]">
            役割によってできることが違います。自分がどれか分からないときの手がかりにもなります。
          </p>
          <PermissionTable />
        </section>
      </main>

      <footer className="border-t border-slate-300 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-5 text-[14px] text-slate-600 leading-relaxed">
          ここに書いていないことは、アプリの <span className="font-bold">≡</span> →
          <span className="font-bold">要望を送る</span> から知らせてください。
        </div>
      </footer>
    </div>
  );
}
