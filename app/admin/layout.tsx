'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import NavBar from '@/components/NavBar';
import LoginNotificationModal from '@/components/LoginNotificationModal';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'admin' && user.role !== 'developer') router.replace('/staff/shifts');
  }, [user, isLoading, router]);

  if (isLoading || !user || (user.role !== 'admin' && user.role !== 'developer')) {
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
