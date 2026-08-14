'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useStoreOptional } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { canAccessAdmin, isHqRole } from '@/lib/types';
import { HQ_LOGIN, HQ_HOME, storeLoginPath } from '@/lib/routes';
import BrandMark from '@/components/BrandMark';
import AppMenu from '@/components/AppMenu';
import { IconPencil, IconCalendar, IconInbox, IconUsers, IconSettings, IconMessageSquare } from '@/components/icons';

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
  { path: '/admin/settings', label: '設定', shortLabel: '設定', Icon: IconSettings },
  { path: '/admin/feedback', label: '要望', shortLabel: '要望', Icon: IconMessageSquare },
];

export default function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
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
      path === '/admin/feedback' ? feedbackUnreadCount : 0;
    return { isDraftBadge, badgeCount };
  };

  const handleLogout = () => {
    if (user) sessionStorage.removeItem(`login_notif_shown_${user.id}`);
    fetch('/api/logout', { method: 'POST' }).catch(() => {});
    // 本部管理者は店舗の管理画面(/s/[storeSlug]/admin/*)を横断的に閲覧できるため、
    // storeSlugの有無だけで判定すると「本部管理者が今見ている店舗のログイン画面」に
    // 送られてしまう。ロールを先に見て、本部管理者は必ず本部ログインへ戻す。
    const destination = user && isHqRole(user.role)
      ? HQ_LOGIN
      : storeSlug ? storeLoginPath(storeSlug) : HQ_LOGIN;
    logout();
    router.replace(destination);
  };

  return (
    <>
      {/* ヘッダーの罫は太罫（slate-300 = rule-2）。在庫管理アプリと同じ重みにしておかないと、
          2つのアプリを行き来したときに「別のサービス」に見える */}
      <header className="bg-white/90 backdrop-blur border-b border-slate-300 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-[52px] gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            {orgName && (
              <>
                <span className="text-slate-300 text-sm">|</span>
                <span className="text-[13px] text-slate-500 truncate">{orgName}</span>
              </>
            )}
          </div>
          <span className="text-xs text-slate-500 truncate max-w-[80px] flex-shrink-0">{user?.name}</span>
          {user && isHqRole(user.role) && (
            // 本部管理者が店舗の管理画面を覗いた後、ログアウト（PIN再入力）せずに
            // セッションを保ったまま店舗一覧へ戻れるようにする専用リンク。
            // 「ログアウト」は文字通りセッションを破棄するボタンなので、
            // 単に本部へ戻りたいだけの場面ではこちらを使う。
            <Link
              href={HQ_HOME}
              className="text-xs px-2.5 h-7 rounded-[3px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex-shrink-0 flex items-center"
            >
              本部管理へ戻る
            </Link>
          )}
          <AppMenu />
          <button
            onClick={handleLogout}
            className="text-xs px-2.5 h-7 rounded-[3px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex-shrink-0"
          >
            ログアウト
          </button>
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
