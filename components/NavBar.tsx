'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useStoreOptional } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { canAccessAdmin } from '@/lib/types';
import BrandMark from '@/components/BrandMark';
import AppMenu from '@/components/AppMenu';
import { IconPencil, IconCalendar, IconInbox, IconUsers, IconSettings } from '@/components/icons';

// パス断片のみを持たせ、レンダリング時に店舗プレフィックス（/s/[storeSlug]）を付ける。
// こうすることでプレフィックスの付け方を1箇所（buildHref）に集約できる。
const staffNav = [
  { path: '/staff/shifts', label: 'シフト申請', shortLabel: '申請', Icon: IconPencil },
  { path: '/staff/schedule', label: '確認', shortLabel: '確認', Icon: IconCalendar },
  { path: '/staff/requests', label: '依頼', shortLabel: '依頼', Icon: IconInbox },
];

const adminNav = [
  { path: '/admin/schedule', label: 'シフト管理', shortLabel: 'シフト', Icon: IconCalendar },
  { path: '/admin/requests', label: '依頼管理', shortLabel: '依頼', Icon: IconInbox },
  { path: '/admin/staff', label: 'スタッフ', shortLabel: 'スタッフ', Icon: IconUsers },
  // 「要望」はナビに出さず設定画面の中に置く。日常的に開くものではないので、
  // 毎日使うシフト・依頼・スタッフと同じ高さに並べると重要度を取り違える。
  // 未対応があることは設定のバッジで気づける
  { path: '/admin/settings', label: '設定', shortLabel: '設定', Icon: IconSettings },
];

export default function NavBar() {
  const { user } = useAuth();
  const pathname = usePathname();
  // NavBar は /s/[storeSlug]/ 配下でのみ使われる想定だが、Provider外で呼ばれても
  // クラッシュしないよう useStoreOptional を使う（storeSlug が無ければリンクは素のパスにフォールバック）。
  const store = useStoreOptional();
  const storeSlug = store?.storeSlug ?? null;
  const storeId = store?.storeId ?? null;
  const orgName = store?.storeName ?? '';
  const [hasDraft, setHasDraft] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [feedbackUnreadCount, setFeedbackUnreadCount] = useState(0);

  const buildHref = (path: string) => (storeSlug ? `/s/${storeSlug}${path}` : path);

  useEffect(() => {
    if (!user || user.role !== 'staff') return;
    const prefix = `shift_draft_${user.id}_`;
    const check = () => {
      setHasDraft(Object.keys(localStorage).some(k => k.startsWith(prefix)));
    };
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, [user]);

  useEffect(() => {
    if (!user || !storeId) return;

    const fetchPendingCount = async () => {
      if (canAccessAdmin(user.role)) {
        const { count } = await supabase
          .from('shift_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open')
          .eq('store_id', storeId);
        setPendingRequestCount(count ?? 0);
      } else {
        // shift_request_targets には store_id 列が無いためフィルタ不要
        // （user_id が既に自店のスタッフに一意に紐づくため自然にスコープされる）
        const [{ data: targeted }, { data: openReqs }] = await Promise.all([
          supabase
            .from('shift_request_targets')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'pending'),
          supabase
            .from('shift_requests')
            .select('id, targets:shift_request_targets(user_id, status)')
            .eq('request_type', 'open')
            .eq('status', 'open')
            .eq('store_id', storeId),
        ]);

        const openUnanswered = (openReqs ?? []).filter(r => {
          const myResponse = (r.targets as { user_id: string; status: string }[]).find(t => t.user_id === user.id);
          return !myResponse;
        });

        setPendingRequestCount((targeted?.length ?? 0) + openUnanswered.length);
      }
    };

    fetchPendingCount();

    const channel = supabase.channel(`navbar-requests-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_requests', filter: `store_id=eq.${storeId}` }, fetchPendingCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_request_targets' }, fetchPendingCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, storeId]);

  // 要望の未対応件数。管理者(admin/hq_admin/developer)だけが受信箱を持つため、
  // スタッフの場合は購読しない（pendingRequestCountの絞り込み方針と同じ）。
  // 受信箱のタブ（未対応/対応済み）と数が食い違わないよう、'new'ではなく
  // 「done でないもの」を数える
  useEffect(() => {
    if (!user || !storeId || !canAccessAdmin(user.role)) return;

    const fetchFeedbackUnreadCount = async () => {
      const { count } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('destination', 'store')
        .neq('status', 'done');
      setFeedbackUnreadCount(count ?? 0);
    };

    fetchFeedbackUnreadCount();

    const channel = supabase.channel(`navbar-feedback-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback', filter: `store_id=eq.${storeId}` }, fetchFeedbackUnreadCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, storeId]);

  const navItems = (user && canAccessAdmin(user.role)) ? adminNav : staffNav as typeof adminNav;

  // 件数バッジは経路ごとに高々1種類しか付かない（依頼バッジと要望バッジは別パス）ため、
  // どちらの件数かをここで解決してから1つの数値として返す。呼び出し側で
  // 「どちらのバッジか」を判定するのはmobile/desktopの2箇所で重複するだけなので避ける。
  const getBadges = (path: string, active: boolean) => {
    if (active) return { isDraftBadge: false, badgeCount: 0 };
    const isDraftBadge = hasDraft && path === '/staff/shifts';
    const badgeCount =
      path === '/staff/requests' || path === '/admin/requests' ? pendingRequestCount :
      // 要望は設定画面の中にあるので、未対応件数は設定に出す
      path === '/admin/settings' ? feedbackUnreadCount : 0;
    return { isDraftBadge, badgeCount };
  };


  return (
    <>
      {/* ヘッダーの罫は太罫（slate-300 = rule-2）。在庫管理アプリと同じ重みにしておかないと、
          2つのアプリを行き来したときに「別のサービス」に見える */}
      <header className="bg-white/90 backdrop-blur border-b border-slate-300 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-[52px] gap-2">
          {/* ヘッダーに置くのは「今どの店舗を見ているか」だけにする。
              ユーザー名・本部管理へ戻る・ログアウトはメニュー(AppMenu)へ移した。
              全部を横並びにすると、店舗名が truncate で潰れたり、
              本部管理者では要素が重なって読めなくなっていた */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            {/* 狭い画面ではアプリ名を省き、店舗名に幅を譲る（ブランドマークで識別できる） */}
            <span className="hidden sm:inline text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            {orgName && (
              <>
                <span className="hidden sm:inline text-slate-300 text-sm">|</span>
                <span className="text-[13px] text-slate-600 truncate">{orgName}</span>
              </>
            )}
          </div>
          <AppMenu />
        </div>
      </header>

      {/* ボトムナビ（スマホ用） */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-300 flex pb-[env(safe-area-inset-bottom)] sm:hidden">
        {navItems.map(item => {
          const href = buildHref(item.path);
          const active = pathname === href;
          const { isDraftBadge, badgeCount } = getBadges(item.path, active);
          const Icon = item.Icon;
          return (
            <Link
              key={item.path}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[11px] font-medium transition-colors relative ${
                active ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-b" />}
              <span className="relative flex items-center justify-center w-5 h-5">
                <Icon className="w-5 h-5" />
                {isDraftBadge && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white" />
                )}
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center px-0.5">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </span>
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      {/* デスクトップ用横ナビ */}
      <div className="hidden sm:block bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 py-1">
          {navItems.map(item => {
            const href = buildHref(item.path);
            const active = pathname === href;
            const { isDraftBadge, badgeCount } = getBadges(item.path, active);
            return (
              <Link
                key={item.path}
                href={href}
                className={`relative px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'text-blue-700 font-semibold border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-800 border-b-2 border-transparent'
                }`}
              >
                {item.label}
                {isDraftBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

    </>
  );
}
