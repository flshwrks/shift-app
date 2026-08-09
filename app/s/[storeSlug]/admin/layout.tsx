'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { canAccessAdmin } from '@/lib/types';
import NavBar from '@/components/NavBar';
import LoginNotificationModal from '@/components/LoginNotificationModal';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';

// 店舗コンテキストは親の /s/[storeSlug]/layout.tsx が StoreProvider で
// 一度だけ配っている想定なので、ここでは useStore() で受け取るだけでよい。
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { storeSlug } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace(`/s/${storeSlug}/login`);
    // hq_admin（本部管理者）も任意店舗の管理画面を見られる必要があるため canAccessAdmin で判定する
    else if (!canAccessAdmin(user.role)) router.replace(`/s/${storeSlug}/staff/shifts`);
  }, [user, isLoading, router, storeSlug]);

  if (isLoading || !user || !canAccessAdmin(user.role)) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <LoginNotificationModal />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">{children}</main>
    </div>
  );
}
