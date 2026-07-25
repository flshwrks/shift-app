import { useEffect } from 'react';

export function useBodyScrollLock(isOpen = true) {
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const body = document.body;

    // iOS Safari では overflow:hidden だけだと fixed モーダル内の
    // フォーム入力（type="time" 等）のタッチイベントがブロックされる。
    // position:fixed + top でスクロール位置を固定する方式が iOS 互換。
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    return () => {
      body.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);
}
