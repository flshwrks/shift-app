'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import NavBar from '@/components/NavBar';
import LoginNotificationModal from '@/components/LoginNotificationModal';
import SurveyModal from '@/components/SurveyModal';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';

interface SurveyWithOptions {
  id: string;
  title: string;
  description: string;
  options: { id: string; label: string; is_other: boolean; display_order: number }[];
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { storeId, storeSlug } = useStore();
  const router = useRouter();
  const [survey, setSurvey] = useState<SurveyWithOptions | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace(`/s/${storeSlug}/login`);
  }, [user, isLoading, router, storeSlug]);

  useEffect(() => {
    if (!user) return;

    const check = async () => {
      // セッション中に「後で」を押した場合はスキップ
      if (sessionStorage.getItem(`survey_skip_${user.id}`)) return;

      const { data: active } = await supabase
        .from('surveys').select('id, title, description')
        .eq('status', 'active').eq('store_id', storeId).order('created_at', { ascending: false }).limit(1);
      if (!active?.length) return;

      const s = active[0];
      const { data: answered } = await supabase
        .from('survey_responses').select('id')
        .eq('survey_id', s.id).eq('user_id', user.id).single();
      if (answered) return;

      const { data: opts } = await supabase
        .from('survey_options').select('id, label, is_other, display_order')
        .eq('survey_id', s.id).order('display_order');

      setSurvey({ ...s, options: opts ?? [] });
    };

    check();
  }, [user, storeId]);

  const handleSurveyClose = () => {
    if (user) sessionStorage.setItem(`survey_skip_${user.id}`, '1');
    setSurvey(null);
  };

  const handleSurveyAnswered = () => setSurvey(null);

  if (isLoading || !user) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <LoginNotificationModal />
      {survey && (
        <SurveyModal
          survey={survey}
          userId={user.id}
          onClose={handleSurveyClose}
          onAnswered={handleSurveyAnswered}
        />
      )}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">{children}</main>
    </div>
  );
}
