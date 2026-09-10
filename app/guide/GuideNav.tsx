'use client';
import { useEffect, useRef, useState } from 'react';
import { IconChevronRight } from '@/components/icons';

// 追従バーと目次。
// 長いページのどこを読んでいるか、あと何があるかを常に出す。
// 「4/13」という数字自体が進捗なので、進捗バーは置かない。

export interface TocItem { id: string; title: string; group: string; n: number }

export default function GuideNav({ items }: { items: TocItem[] }) {
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // いま画面に入っている節のうち、いちばん上のものを現在地とする
  useEffect(() => {
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target.id);
          else seen.delete(e.target.id);
        }
        const first = items.findIndex(i => seen.has(i.id));
        if (first >= 0) setCurrent(first);
      },
      { rootMargin: '-104px 0px -70% 0px' },
    );
    for (const i of items) {
      const el = document.getElementById(i.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);

  // 開いている項目へのリンクで来たときは、その質問を開く
  useEffect(() => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el instanceof HTMLDetailsElement) el.open = true;
  }, []);

  // 目次を開いているあいだは Esc で閉じ、フォーカスを開いたボタンへ戻す
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const now = items[current];

  return (
    <>
      <div className="guide-no-print sticky top-[52px] z-30 -mx-4 px-4 h-12 flex items-center gap-3 bg-white/95 backdrop-blur border-b border-slate-300">
        <span className="text-[13px] font-bold text-slate-900 tabular-nums flex-shrink-0">
          {now ? now.n : 1}
          <span className="text-slate-500 font-normal">/{items.length}</span>
        </span>
        <span className="text-[13px] text-slate-900 truncate flex-1">{now?.title ?? ''}</span>
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-controls="guide-toc"
          className="flex-shrink-0 h-11 px-3 -mr-1 rounded-[3px] text-[13px] font-bold text-blue-700 hover:bg-blue-50 flex items-center gap-1"
        >
          目次
          <IconChevronRight
            className={`w-3.5 h-3.5 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="目次を閉じる"
            onClick={() => setOpen(false)}
            className="guide-no-print fixed inset-0 z-40 bg-slate-900/20"
          />
          <nav
            id="guide-toc"
            aria-label="目次"
            className="guide-no-print fixed z-50 left-0 right-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white border-t border-slate-300 shadow-2xl sm:absolute sm:left-auto sm:right-4 sm:bottom-auto sm:top-[104px] sm:w-80 sm:max-h-[60vh] sm:rounded-xl sm:border sm:shadow-xl"
          >
            <p className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 text-[13px] font-bold text-slate-500">
              目次
            </p>
            <ul className="py-1">
              {items.map((i, idx) => (
                <li key={i.id}>
                  <a
                    href={`#${i.id}`}
                    onClick={() => setOpen(false)}
                    aria-current={idx === current ? 'location' : undefined}
                    className={`flex items-baseline gap-2.5 min-h-[44px] px-4 py-2 text-[15px] border-l-[3px] ${
                      idx === current
                        ? 'border-blue-600 bg-blue-50 text-slate-900 font-bold'
                        : 'border-transparent text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-[13px] text-slate-500 tabular-nums w-5 flex-shrink-0">{i.n}</span>
                    <span className="min-w-0">{i.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </>
  );
}
