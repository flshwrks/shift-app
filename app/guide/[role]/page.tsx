import Link from 'next/link';
import { notFound } from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import { NavPath } from '../parts';
import { GUIDES, ROLE_ORDER } from '../content';
import GuideNav, { type TocItem } from '../GuideNav';
import type { RoleId } from '../parts';

// 役割ごとに1ページ。静的に生成する。
//
// 役割を state で持たず URL に置いているのは、
//   - 共有・ブックマーク・再訪のたびに選び直さずに済む
//   - 本文がHTMLに載るので、ページ内検索・印刷・読み上げが効く
// ため。アプリのメニューからは、ログイン中の役割に応じた URL へ直接飛ばしている
// （lib/routes.ts の fullGuidePath）。

export function generateStaticParams() {
  return ROLE_ORDER.map(role => ({ role }));
}

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const g = GUIDES[role as RoleId];
  return { title: g ? `${g.name}の使い方 | シフト管理` : '詳しい使い方 | シフト管理' };
}

export default async function RoleGuidePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const guide = GUIDES[role as RoleId];
  if (!guide) notFound();

  // 節に通し番号を振る。目次・追従バー・見出しで同じ番号を使う
  const toc: TocItem[] = [];
  let n = 0;
  for (const g of guide.groups) {
    for (const s of g.sections) {
      n += 1;
      toc.push({ id: s.id, title: s.title, group: g.title, n });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="guide-no-print bg-white/90 backdrop-blur border-b border-slate-300 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 flex items-center h-[52px] gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            <span className="text-slate-300 text-sm">|</span>
            <span className="text-[13px] text-slate-500 truncate">{guide.name}</span>
          </div>
          <Link
            href="/"
            className="text-[13px] px-3 h-9 rounded-[3px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex-shrink-0 flex items-center"
          >
            アプリに戻る
          </Link>
        </div>
      </header>

      <main className="guide-doc flex-1 max-w-3xl mx-auto w-full px-4 pb-10">
        <GuideNav items={toc} />

        <h1 className="text-[26px] font-bold text-slate-900 mt-6 tracking-tight">
          {guide.name}の使い方
        </h1>
        <p className="mt-2 text-[16px] leading-[1.9] text-slate-600 max-w-[38rem]">{guide.summary}</p>

        {/* 役割の切り替え。押せるものは青＋下線という約束に合わせる */}
        <nav aria-label="役割" className="guide-no-print mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
          <span className="text-slate-500">他の役割：</span>
          {ROLE_ORDER.filter(r => r !== guide.id).map(r => (
            <Link
              key={r}
              href={`/guide/${r}`}
              className="text-blue-700 font-bold underline underline-offset-2"
            >
              {GUIDES[r].name}
            </Link>
          ))}
        </nav>

        {/* 見た目の凡例。押せるものと、アプリの中の名前を読者に先に伝える */}
        <p className="mt-5 text-[14px] leading-[1.9] text-slate-600 border-l-2 border-slate-300 pl-3.5 max-w-[38rem]">
          <span className="inline-block bg-slate-100 border border-slate-200 rounded-[3px] px-1.5 py-px mx-px text-[0.94em] font-bold text-slate-800">
            灰色の枠
          </span>
          はアプリの中にあるボタンや画面の名前です。
          <span className="text-blue-700 font-bold underline underline-offset-2">青い文字</span>
          はこのページで押せます。
        </p>

        {/* 冒頭の目次。全体像をここで一度に見せる */}
        <nav aria-label="このページの内容" className="guide-no-print mt-6 border-y border-slate-300 -mx-4 sm:mx-0 sm:border sm:rounded-[4px] bg-white">
          <p className="px-4 py-2.5 text-[13px] font-bold text-slate-500 border-b border-slate-200">
            このページの内容（{toc.length}項目）
          </p>
          <div className="px-4 py-3 space-y-3">
            {guide.groups.map(g => (
              <div key={g.id}>
                <p className="text-[13px] font-bold text-slate-900">{g.title}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">{g.lead}</p>
                <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                  {g.sections.map(s => {
                    const item = toc.find(t => t.id === s.id)!;
                    return (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className="flex items-baseline gap-2 py-1 text-[15px] text-blue-700 underline underline-offset-2"
                        >
                          <span className="text-slate-500 tabular-nums w-5 flex-shrink-0 no-underline">
                            {item.n}
                          </span>
                          <span className="min-w-0">{s.title}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* 本文 */}
        {guide.groups.map(g => (
          <section key={g.id} aria-labelledby={`h-${g.id}`} className="mt-10">
            <h2
              id={`h-${g.id}`}
              className="text-[13px] font-bold tracking-wider text-slate-500 border-b-2 border-slate-300 pb-2"
            >
              {g.title}
            </h2>

            {g.sections.map(s => {
              const item = toc.find(t => t.id === s.id)!;
              return (
                <section key={s.id} id={s.id} className="scroll-mt-[104px] pt-7">
                  <h3 className="flex items-baseline gap-2.5 text-[19px] font-bold text-slate-900">
                    <span className="text-[15px] text-slate-500 tabular-nums flex-shrink-0">{item.n}</span>
                    <span className="min-w-0">{s.title}</span>
                  </h3>
                  {s.nav && <NavPath steps={s.nav} />}
                  <div className="mt-3 space-y-4 text-[16px] leading-[1.9] text-slate-700 max-w-[38rem]">
                    {s.body}
                  </div>
                </section>
              );
            })}
          </section>
        ))}
      </main>

      <footer className="border-t border-slate-300 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-5 text-[14px] text-slate-600 leading-relaxed">
          <p>
            ここに書いていないことは、アプリの <span className="font-bold">≡</span> →
            <span className="font-bold">要望を送る</span> から知らせてください。
          </p>
          <p className="guide-no-print mt-3">
            <Link href="/guide" className="text-blue-700 font-bold underline underline-offset-2">
              役割を選びなおす
            </Link>
          </p>
          <p className="hidden print:block mt-3 text-[11px]">
            シフト管理アプリ 詳しい使い方（{guide.name}）
          </p>
        </div>
      </footer>
    </div>
  );
}
