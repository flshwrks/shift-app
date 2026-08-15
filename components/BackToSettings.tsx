'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { IconChevronLeft } from '@/components/icons';

// 設定画面の「管理メニュー」から開く画面（人件費予測・アンケート管理・要望）用の戻る導線。
// これらはボトムナビに項目が無いため、戻る手段がブラウザバックしかなかった。
export default function BackToSettings() {
  const { storeSlug } = useStore();
  return (
    <Link
      href={`/s/${storeSlug}/admin/settings`}
      className="inline-flex items-center gap-1 -ml-1 mb-2 px-1 py-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
    >
      <IconChevronLeft className="w-4 h-4" />
      設定
    </Link>
  );
}
