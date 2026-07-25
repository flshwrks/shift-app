'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import HelpModal from '@/components/HelpModal';
import BrandMark from '@/components/BrandMark';
import { IconPencil, IconCalendar, IconInbox, IconUsers, IconSettings, IconHelp } from '@/components/icons';

const staffNav = [
  { href: '/staff/shifts', label: 'シフト申請', shortLabel: '申請', Icon: IconPencil },
  { href: '/staff/schedule', label: '確認', shortLabel: '確認', Icon: IconCalendar },
  { href: '/staff/requests', label: '依頼', shortLabel: '依頼', Icon: IconInbox },
];

const adminNav = [
  { href: '/admin/schedule', label: 'シフト管理', shortLabel: 'シフト', Icon: IconCalendar },
  { href: '/admin/requests', label: '依頼管理', shortLabel: '依頼', Icon: IconInbox },
  { href: '/admin/staff', label: 'スタッフ', shortLabel: 'スタッフ', Icon: IconUsers },
  { href: '/admin/settings', label: '設定', shortLabel: '設定', Icon: IconSettings },
];

export default function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'org_name').single()
      .then(({ data }) => { if (data?.value) setOrgName(data.value); });

    const channel = supabase.channel('navbar-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, ({ new: row }) => {
        if ((row as { key: string; value: string }).key === 'org_name') {
          setOrgName((row as { key: string; value: string }).value ?? '');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
    if (!user) return;

    const fetchPendingCount = async () => {
      if (user.role === 'admin' || user.role === 'developer') {
        const { count } = await supabase
          .from('shift_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open');
        setPendingRequestCount(count ?? 0);
      } else {
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
            .eq('status', 'open'),
        ]);

        const openUnanswered = (openReqs ?? []).filter(r => {
          const myResponse = (r.targets as { user_id: string; status: string }[]).find(t => t.user_id === user.id);
          return !myResponse;
        });

        setPendingRequestCount((targeted?.length ?? 0) + openUnanswered.length);
      }
    };

    fetchPendingCount();

    const channel = supabase.channel('navbar-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_requests' }, fetchPendingCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_request_targets' }, fetchPendingCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const navItems = (user?.role === 'admin' || user?.role === 'developer') ? adminNav : staffNav as typeof adminNav;

  const getBadges = (href: string, active: boolean) => ({
    isDraftBadge: hasDraft && href === '/staff/shifts' && !active,
    isRequestBadge: pendingRequestCount > 0 && (href === '/staff/requests' || href === '/admin/requests') && !active,
  });

  const handleLogout = () => {
    if (user) sessionStorage.removeItem(`login_notif_shown_${user.id}`);
    fetch('/api/logout', { method: 'POST' }).catch(() => {});
    logout();
    router.replace('/login');
  };

  return (
    <>
      <header className="bg-white/85 backdrop-blur border-b border-slate-200/80 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-[52px] gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            {orgName && (
              <>
                <span className="text-slate-200 text-sm">|</span>
                <span className="text-[13px] text-slate-500 truncate">{orgName}</span>
              </>
            )}
          </div>
          <span className="text-xs text-slate-500 truncate max-w-[80px] flex-shrink-0">{user?.name}</span>
          <button
            onClick={() => setShowHelp(true)}
            className="w-7 h-7 rounded-md bg-white border border-slate-300 text-slate-500 hover:bg-slate-50 flex items-center justify-center flex-shrink-0 transition-colors"
            title="使い方"
            aria-label="使い方"
          >
            <IconHelp className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="text-xs px-2.5 h-7 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex-shrink-0"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* ボトムナビ（スマホ用） */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex pb-[env(safe-area-inset-bottom)] sm:hidden">
        {navItems.map(item => {
          const active = pathname === item.href;
          const { isDraftBadge, isRequestBadge } = getBadges(item.href, active);
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
                {isRequestBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center px-0.5">
                    {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
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
            const { isDraftBadge, isRequestBadge } = getBadges(item.href, pathname === item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  pathname === item.href
                    ? 'text-blue-700 font-semibold border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-800 border-b-2 border-transparent'
                }`}
              >
                {item.label}
                {isDraftBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
                {isRequestBadge && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {showHelp && user && (
        <HelpModal role={user.role === 'staff' ? 'staff' : 'admin'} onClose={() => setShowHelp(false)} />
      )}
    </>
  );
}
