'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const staffNav = [
  { href: '/staff/shifts', label: 'シフト申請', icon: '📝' },
  { href: '/staff/schedule', label: '確認', icon: '📅' },
];

const adminNav = [
  { href: '/admin/schedule', label: 'シフト管理', icon: '📅' },
  { href: '/admin/staff', label: 'スタッフ', icon: '👥' },
  { href: '/admin/settings', label: '設定', icon: '⚙️' },
];

export default function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const navItems = user?.role === 'admin' ? adminNav : staffNav;

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <>
      {/* トップバー */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-12 gap-2">
          <span className="font-bold text-blue-600 text-sm flex-1">シフト管理</span>
          <span className="text-xs text-slate-500 truncate max-w-[100px]">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 active:bg-slate-200 flex-shrink-0"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* ボトムナビ（スマホ用） */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex sm:hidden">
        {navItems.map(item => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-blue-600' : 'text-slate-400'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-b" />}
            </Link>
          );
        })}
      </nav>

      {/* デスクトップ用横ナビ（topバー内） */}
      <div className="hidden sm:block bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 py-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
