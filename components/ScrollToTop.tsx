'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// 画面遷移のたびにページ先頭へ戻す。
//
// App Router は遷移時に新しいページ要素を scrollIntoView するため、
// sticky なヘッダーがある画面では「ページの先頭がヘッダーの裏に潜り込んだ状態」で
// 表示が始まってしまう（設定を下までスクロールしてから要望・アンケートを開いた場合に顕著）。
// 明示的に window の先頭へ戻すことで、どの画面でも見出しから読み始められるようにする。
export default function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
