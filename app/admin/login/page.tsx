'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isHqRole } from '@/lib/types';
import BrandMark from '@/components/BrandMark';
import SessionEndedNotice from '@/components/SessionEndedNotice';
import PinPad, { applyPinKey } from '@/components/PinPad';

// 本部管理者専用のログイン画面。既存 /login のPIN入力UX（4桁ドット・テンキー・
// 失敗時シェイク）をそのまま踏襲する。
//
// ★店舗のログイン画面と違い、名前の一覧を出さない（点検項目 F-13）★
//   店舗は「名前を選んで押すだけ」でよい。URLに付いたランダム6文字(F-6)が
//   前段の守りになっていて、そもそもその画面にたどり着けないからである。
//   一方この画面は会社に1つの固定パスなので、同じことをすると
//   **最強の権限を持つ人の実名一覧が、誰でも見られる場所に出る**。
//   本部管理者は2〜3人で自分の名前を覚えているため、入力にしても負担は小さい。
export default function AdminLoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  // 名前を確定して初めてPIN入力へ進む（画面の流れは店舗ログインと同じ）
  const [entered, setEntered] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user && isHqRole(user.role)) {
      router.replace('/admin/stores');
    }
  }, [user, router]);

  const handleKey = (key: string) => {
    applyPinKey(key, pin, setPin, () => setError(''), (code) => { handleLogin(code); });
  };

  const handleLogin = async (enteredPin: string) => {
    if (!entered) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/hq-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: entered, pin: enteredPin }),
      });
      const body = await res.json().catch(() => ({ ok: false }));
      if (res.ok && body.ok) {
        login(body.user, body.supabaseToken);
        router.replace('/admin/stores');
      } else {
        setIsShaking(true);
        // 名前が存在しない場合もここに来る（区別すると名前の有無を確かめられてしまう）
        setError(res.status === 429 ? 'しばらくしてから再度お試しください' : '名前かPINコードが違います');
        setPin('');
        setTimeout(() => setIsShaking(false), 400);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (entered) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className={`bg-white rounded-2xl border border-slate-200 p-8 w-full max-w-sm ${isShaking ? 'shake' : ''}`}>
          <button
            onClick={() => { setEntered(''); setPin(''); setError(''); }}
            className="text-slate-500 text-sm mb-4 hover:text-slate-700 flex items-center gap-1 rounded-md py-2 px-1 -ml-1"
          >
            ← 戻る
          </button>
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-bold text-blue-600">{entered[0]}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">{entered}</h2>
            <p className="text-slate-500 text-sm mt-1">PINコードを入力してください</p>
          </div>

          <PinPad pin={pin} error={error} disabled={isLoading} onKey={handleKey} />

          <p className="text-center text-xs text-slate-400 mt-5">
            PINが分からない場合は、もう1人の本部管理者から再発行してもらってください
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
        <form
          onSubmit={e => { e.preventDefault(); const v = name.trim(); if (v) { setEntered(v); setError(''); } }}
        >
          <label htmlFor="hq-name" className="block text-xs font-medium text-slate-500 mb-1.5">
            お名前
          </label>
          <input
            id="hq-name"
            type="text"
            value={name}
            maxLength={20}
            autoComplete="off"
            onChange={e => setName(e.target.value)}
            placeholder="登録されている名前"
            className="w-full border border-slate-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="mt-4 w-full h-12 bg-blue-600 text-white rounded-xl font-bold text-base disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            次へ
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-5 leading-relaxed">
          本部管理者として登録されている名前を入力してください。<br />
          店舗のスタッフの方は、店舗ごとのログインURLからお入りください。
        </p>
      </div>
    </div>
  );
}
