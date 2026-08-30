'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { isHqRole } from '@/lib/types';
import BrandMark from '@/components/BrandMark';
import SessionEndedNotice from '@/components/SessionEndedNotice';
import PinPad, { applyPinKey } from '@/components/PinPad';

interface HqAdminUser {
  id: string;
  name: string;
}

// 本部管理者専用のログイン画面。既存 /login のPIN入力UX（4桁ドット・テンキー・
// 失敗時シェイク）をそのまま踏襲しつつ、一覧取得とログインAPIだけ本部用に差し替える。
export default function AdminLoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<HqAdminUser[]>([]);
  const [selected, setSelected] = useState<HqAdminUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user && isHqRole(user.role)) {
      router.replace('/admin/stores');
    }
  }, [user, router]);

  useEffect(() => {
    supabase.rpc('list_hq_admin_users').then(({ data }) => setUsers((data ?? []) as HqAdminUser[]));
  }, []);

  const handleKey = (key: string) => {
    applyPinKey(key, pin, setPin, () => setError(''), (code) => { handleLogin(code); });
  };

  const handleLogin = async (enteredPin: string) => {
    if (!selected) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/hq-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, pin: enteredPin }),
      });
      const body = await res.json().catch(() => ({ ok: false }));
      if (res.ok && body.ok) {
        login(body.user, body.supabaseToken);
        router.replace('/admin/stores');
      } else {
        setIsShaking(true);
        setError(res.status === 429 ? 'しばらくしてから再度お試しください' : 'PINコードが違います');
        setPin('');
        setTimeout(() => setIsShaking(false), 400);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (selected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className={`bg-white rounded-2xl border border-slate-200 p-8 w-full max-w-sm ${isShaking ? 'shake' : ''}`}>
          <button
            onClick={() => { setSelected(null); setPin(''); setError(''); }}
            className="text-slate-400 text-sm mb-4 hover:text-slate-600 flex items-center gap-1 rounded-md"
          >
            ← 戻る
          </button>
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-bold text-blue-600">{selected.name[0]}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">{selected.name}</h2>
            <p className="text-slate-500 text-sm mt-1">PINコードを入力してください</p>
          </div>

          <PinPad pin={pin} error={error} disabled={isLoading} onKey={handleKey} />

          <p className="text-center text-xs text-slate-400 mt-5">
            PINが分からない場合は開発担当者にお尋ねください
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <SessionEndedNotice />
      <div className="bg-white rounded-2xl border border-slate-200 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-fit">
            <BrandMark size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">シフト管理</h1>
          <p className="text-slate-500 text-sm mt-2">本部管理者ログイン</p>
        </div>
        {users.length === 0 ? (
          <p className="text-center text-slate-400 py-8">本部管理者が登録されていません</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:border-slate-400 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-blue-500">
                  {u.name[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{u.name}</p>
                  <p className="text-xs text-slate-400">本部管理者</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
