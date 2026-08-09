'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { homePathFor, HQ_LOGIN } from '@/lib/routes';
import BrandMark from '@/components/BrandMark';

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;
    const home = homePathFor(user.role, user.storeSlug);
    // homePathFor は行き先が決まらない場合 '/' を返す。ここで replace すると
    // 自分自身へのリダイレクトになるので、その場合は下の案内画面を出したままにする。
    if (home !== '/') router.replace(home);
  }, [user, isLoading, router]);

  // 未ログインの場合、どの店舗のスタッフかが分からないので名前一覧を出せない。
  // 店舗ごとのURL（店頭のQRコード）へ誘導する。
  if (!isLoading && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] border border-slate-200 p-8 w-full max-w-md text-center">
          <div className="mx-auto mb-4 w-fit">
            <BrandMark size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">シフト管理</h1>
          <p className="text-slate-500 text-sm mt-3 leading-relaxed">
            お店ごとのログインURLからアクセスしてください。
            <br />
            URLが分からない場合は、店舗の管理者にお尋ねください。
          </p>
          <div className="mt-8 pt-5 border-t border-slate-100">
            <Link
              href={HQ_LOGIN}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              本部管理者の方はこちら
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
