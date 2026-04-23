'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { hashPin } from '@/lib/shifts';
import type { User } from '@/lib/types';

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace(user.role === 'admin' ? '/admin/schedule' : '/staff/shifts');
    }
  }, [user, router]);

  useEffect(() => {
    supabase
      .from('users')
      .select('id, name, role, created_at')
      .order('name')
      .then(({ data }) => setUsers(data ?? []));
  }, []);

  const handleKey = async (key: string) => {
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      setError('');
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      await handleLogin(next);
    }
  };

  const handleLogin = async (enteredPin: string) => {
    if (!selected) return;
    setIsLoading(true);
    try {
      const hashed = await hashPin(enteredPin);
      const { data } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('id', selected.id)
        .eq('pin_hash', hashed)
        .single();
      if (data) {
        login({ id: data.id, name: data.name, role: data.role });
      } else {
        setIsShaking(true);
        setError('PINコードが違います');
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
        <div className={`bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm ${isShaking ? 'shake' : ''}`}>
          <button
            onClick={() => { setSelected(null); setPin(''); setError(''); }}
            className="text-slate-400 text-sm mb-4 hover:text-slate-600 flex items-center gap-1"
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

          {/* PIN dots */}
          <div className="flex justify-center gap-4 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all ${
                  i < pin.length ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>

          {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {['1','2','3','4','5','6','7','8','9','','0','del'].map((k) => (
              <button
                key={k}
                onClick={() => k && handleKey(k)}
                disabled={!k || isLoading}
                className={`h-14 rounded-xl text-lg font-semibold transition-all active:scale-95 ${
                  k === 'del'
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : k === ''
                    ? 'bg-transparent cursor-default'
                    : 'bg-slate-100 text-slate-800 hover:bg-blue-50 hover:text-blue-600'
                } disabled:opacity-50`}
              >
                {k === 'del' ? '⌫' : k}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-5">
            PINが分からない場合は管理者にお尋ねください
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">シフト管理</h1>
          <p className="text-slate-500 text-sm mt-2">名前を選択してください</p>
        </div>
        {users.length === 0 ? (
          <p className="text-center text-slate-400 py-8">スタッフが登録されていません</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all text-left group"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                  u.role === 'admin' ? 'bg-orange-500' : 'bg-blue-500'
                }`}>
                  {u.name[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.role === 'admin' ? '管理者' : 'スタッフ'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
