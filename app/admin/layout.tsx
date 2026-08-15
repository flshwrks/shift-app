'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isHqRole } from '@/lib/types';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import BrandMark from '@/components/BrandMark';
import AppMenu from '@/components/AppMenu';
import HqNav from '@/components/HqNav';
import UpdateToast from '@/components/UpdateToast';
import ScrollToTop from '@/components/ScrollToTop';

// 本部管理者専用レイアウト。店舗管理者用の中身は /s/[storeSlug]/admin/layout.tsx へ
// 移設済みで、ここは /admin/login, /admin/stores のみを配下に持つ。
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // /admin/login はこのレイアウト配下だが未認証で訪れるページなので、
  // ここでガードすると自分自身へリダイレクトし続けて無限ループになる。
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage || isLoading) return;
    if (!user || !isHqRole(user.role)) router.replace('/admin/login');
  }, [user, isLoading, isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isLoading || !user || !isHqRole(user.role)) {
    return <AuthLoadingScreen />;
  }


  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white/85 backdrop-blur border-b border-slate-200/80 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-[52px] gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            <span className="text-[10px] px-1.5 py-px rounded font-medium border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
              本部管理
            </span>
          </div>
          {/* 「誰でログインしているか」は残し、ログアウト等はメニュー(AppMenu)へ移した。
              ヘッダーに全部並べると狭い画面で要素が重なって読めなくなっていた */}
          <span className="text-[13px] font-medium text-slate-900 truncate max-w-[6rem] flex-shrink-0">{user.name}</span>
          <AppMenu />
        </div>
      </header>
      <HqNav />
      <ScrollToTop />
      <UpdateToast />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
