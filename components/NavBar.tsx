'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
}

const staffNav: NavItem[] = [
  { href: '/staff/shifts', label: 'シフト申請' },
  { href: '/staff/schedule', label: 'シフト確認' },
];

const adminNav: NavItem[] = [
  { href: '/admin/schedule', label: 'シフト管理' },
  { href: '/admin/staff', label: 'スタッフ管理' },
  { href: '/admin/settings', label: '設定' },
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
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 flex items-center h-14 gap-1">
        <span className="font-bold text-blue-600 mr-4 text-sm">シフト管理</span>
        <nav className="flex gap-1 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-sm text-slate-500">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
