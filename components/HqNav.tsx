'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { HQ_HOME, HQ_FEEDBACK } from '@/lib/routes';

// 本部管理エリアのナビ。店舗エリアのNavBarと違い、ここは項目が2つだけなので
// ボトムナビは置かず、ヘッダー直下の横並びタブにとどめる。
export default function HqNav() {
  const pathname = usePathname();
  const [openFeedbackCount, setOpenFeedbackCount] = useState(0);

  // 「開発者へ」宛ての未対応件数。本部管理者はRLS上すべての要望が見えるので
  // 店舗での絞り込みは不要（destinationだけで分ける）
  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .eq('destination', 'dev')
        .neq('status', 'done');
      setOpenFeedbackCount(count ?? 0);
    };
    fetchCount();
    const channel = supabase.channel('hq-nav-feedback')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const items = [
    { href: HQ_HOME, label: '店舗一覧', badge: 0 },
    { href: HQ_FEEDBACK, label: '要望', badge: openFeedbackCount },
  ];

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 flex gap-1 py-1">
        {items.map(item => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative px-3 py-1.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'text-blue-700 font-semibold border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-800 border-b-2 border-transparent'
              }`}
            >
              {item.label}
              {item.badge > 0 && !active && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
