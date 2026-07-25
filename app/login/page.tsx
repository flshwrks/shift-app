'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/types';
import BrandMark from '@/components/BrandMark';

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace(user.role === 'staff' ? '/staff/shifts' : '/admin/schedule');
    }
  }, [user, router]);

  useEffect(() => {
    supabase
      .from('users')
      .select('id, name, role, created_at')
      .order('display_order', { ascending: true, nullsFirst: false })
      .then(({ data }) => setUsers(data ?? []));
  }, []);

  const handlePinKey = (key: string, onComplete: (code: string) => void) => {
    if (key === 'del') { setPin(p => p.slice(0, -1)); setError(''); return; }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      onComplete(next);
    }
  };

  const handleDevKey = (key: string) => {
    handlePinKey(key, async (code) => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/dev-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const { ok } = await res.json().catch(() => ({ ok: false }));
        if (ok) {
          login({ id: '__dev__', name: '開発者', role: 'developer' });
          return;
        }
      } catch {}
      setIsShaking(true);
      setError('パスワードが違います');
      setPin('');
      setTimeout(() => setIsShaking(false), 400);
      setIsLoading(false);
    });
  };

  const handleKey = (key: string) => {
    handlePinKey(key, (code) => { handleLogin(code); });
  };

  const handleLogin = async (enteredPin: string) => {
    if (!selected) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, pin: enteredPin }),
      });
      const body = await res.json().catch(() => ({ ok: false }));
      if (res.ok && body.ok) {
        login({ id: body.user.id, name: body.user.name, role: body.user.role });
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

  if (devMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] border border-slate-200 p-8 w-full max-w-sm ${isShaking ? 'shake' : ''}`}>
          <button
            onClick={() => { setDevMode(false); setPin(''); setError(''); }}
            className="text-slate-400 text-sm mb-4 hover:text-slate-600 flex items-center gap-1 rounded-md"
          >
            ← 戻る
          </button>
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-mono text-slate-500">&lt;/&gt;</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">開発者モード</h2>
            <p className="text-slate-500 text-sm mt-1">パスワードを入力してください</p>
          </div>
          <div className="flex justify-center gap-4 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`w-4 h-4 rounded-full transition-all ${i < pin.length ? 'bg-slate-700' : 'bg-slate-200'}`} />
            ))}
          </div>
          {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}
          <div className="grid grid-cols-3 gap-3 tabular-nums">
            {['1','2','3','4','5','6','7','8','9','','0','del'].map((k) => (
              <button
                key={k}
                onClick={() => k && handleDevKey(k)}
                disabled={!k || isLoading}
                className={`h-14 rounded-xl text-lg font-medium tabular-nums transition-all active:scale-95 ${
                  k === 'del' ? 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                  : k === '' ? 'bg-transparent cursor-default'
                  : 'bg-white border border-slate-200 hover:bg-slate-50'
                } disabled:opacity-50`}
              >
                {k === 'del' ? '⌫' : k}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] border border-slate-200 p-8 w-full max-w-sm ${isShaking ? 'shake' : ''}`}>
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
          <div className="grid grid-cols-3 gap-3 tabular-nums">
            {['1','2','3','4','5','6','7','8','9','','0','del'].map((k) => (
              <button
                key={k}
                onClick={() => k && handleKey(k)}
                disabled={!k || isLoading}
                className={`h-14 rounded-xl text-lg font-medium tabular-nums transition-all active:scale-95 ${
                  k === 'del'
                    ? 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                    : k === ''
                    ? 'bg-transparent cursor-default'
                    : 'bg-white border border-slate-200 hover:bg-slate-50'
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
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] border border-slate-200 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-fit">
            <BrandMark size="lg" />
          </div>
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
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:border-slate-400 transition-all text-left group"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                  u.role === 'admin' ? 'bg-amber-500' : 'bg-blue-500'
                }`}>
                  {u.name[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{u.name}</p>
                  <p className={u.role === 'admin' ? 'text-xs font-medium text-amber-700' : 'text-xs text-slate-400'}>{u.role === 'admin' ? '管理者' : 'スタッフ'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button
            onClick={() => { setDevMode(true); setPin(''); setError(''); }}
            className="text-[11px] text-slate-300 hover:text-slate-400 font-mono px-2 py-1 rounded transition-colors"
          >
            &lt;/&gt;
          </button>
        </div>
      </div>
    </div>
  );
}
