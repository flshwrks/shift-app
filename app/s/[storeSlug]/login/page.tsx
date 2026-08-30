'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { homePathFor, storeLoginPath, HQ_LOGIN } from '@/lib/routes';
import { isHqRole, type UserRole } from '@/lib/types';
import BrandMark from '@/components/BrandMark';
import SessionEndedNotice from '@/components/SessionEndedNotice';
import PinPad, { applyPinKey } from '@/components/PinPad';

// list_login_users RPC の戻り値。ログイン画面に必要な最小限のフィールドのみ。
interface LoginUser {
  id: string;
  name: string;
  role: UserRole;
  display_order?: number;
}

export default function LoginPage() {
  const { user, login, logout } = useAuth();
  const { storeSlug, storeName } = useStore();
  const router = useRouter();
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [selected, setSelected] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [devPassword, setDevPassword] = useState('');

  // 自店のログイン画面に、その店舗の人がログイン済みで来た場合だけ素通しする。
  // （QRやブックマークからの再訪。毎回ログイン画面を挟むと煩わしい）
  const isOwnStore = user != null && user.storeSlug === storeSlug;

  useEffect(() => {
    if (!user || !isOwnStore) return;
    router.replace(homePathFor(user.role, storeSlug));
  }, [user, isOwnStore, router, storeSlug]);

  const switchAccount = async () => {
    // Cookieを消し切ってから遷移する（遷移が先だとリクエストが中断されうる）
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    logout();
    // ★router.replace ではなく完全な遷移にする★（AppMenu と同じ理由。
    // クライアント側のルーティングに割り込まれると、ログアウト直後の行き先が上書きされる）
    window.location.replace(storeLoginPath(storeSlug));
  };

  useEffect(() => {
    // RLS適用後は未認証(JWTなし)状態で users テーブルを直接読めないため、
    // ログイン画面用のスタッフ一覧は RPC 経由で取得する。
    supabase
      .rpc('list_login_users', { p_store_slug: storeSlug })
      .then(({ data }) => setUsers(data ?? []));
  }, [storeSlug]);

  const handlePinKey = (key: string, onComplete: (code: string) => void) =>
    applyPinKey(key, pin, setPin, () => setError(''), onComplete);

  // 開発者ログインは全店舗を横断できる最も強い入口のため、4桁のPINパッドではなく
  // 長いランダム文字列を入力する形にしている（2026-08-29 の点検 F-1）。
  const handleDevSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devPassword || isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: devPassword }),
      });
      const body = await res.json().catch(() => ({ ok: false }));
      if (res.ok && body.ok) {
        login(body.user, body.supabaseToken);
        return;
      }
      // 設定漏れ・試行超過は原因が分かる文言にする（PIN不一致と区別する）
      if (res.status === 503) setError('開発者ログインは無効です（パスワード未設定）');
      else if (res.status === 429) setError('試行回数の上限です。しばらく待ってから再試行してください');
      else setError('パスワードが違います');
    } catch {
      setError('通信に失敗しました');
    }
    setIsShaking(true);
    setDevPassword('');
    setTimeout(() => setIsShaking(false), 400);
    setIsLoading(false);
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
        body: JSON.stringify({ userId: selected.id, pin: enteredPin, storeSlug }),
      });
      const body = await res.json().catch(() => ({ ok: false }));
      if (res.ok && body.ok) {
        login(body.user, body.supabaseToken);
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

  // 本部管理者や他店の人がこの店舗のログイン画面を開いた場合。
  // 黙ってホームへ飛ばすと「勝手に別のアカウントに切り替わった」ように見えるため、
  // 今の状態を見せて選ばせる。ブラウザのCookieは全タブで共有されるので、
  // 1つのブラウザで2つのアカウントに同時ログインすることはできない。
  if (user && !isOwnStore) {
    const roleLabel = isHqRole(user.role) ? '本部管理者' : user.role === 'admin' ? '店舗管理者' : 'スタッフ';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-amber-600">!</span>
            </div>
            <h2 className="text-lg font-bold text-slate-800">別のアカウントでログイン中です</h2>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">
              現在 <span className="font-semibold text-slate-700">{user.name}</span>（{roleLabel}）として
              ログインしています。<br />
              このブラウザでは同時に2つのアカウントを使えません。
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => router.replace(homePathFor(user.role, storeSlug))}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              {user.name} のまま続ける
            </button>
            <button
              onClick={switchAccount}
              className="w-full py-2.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              ログアウトして{storeName ? `「${storeName}」` : 'この店舗'}でログインする
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mt-5 leading-relaxed">
            2つのアカウントを同時に開いて確認したい場合は、シークレットウィンドウか別のブラウザを使ってください。
          </p>
        </div>
      </div>
    );
  }

  if (devMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className={`bg-white rounded-2xl border border-slate-200 p-8 w-full max-w-sm ${isShaking ? 'shake' : ''}`}>
          <button
            onClick={() => { setDevMode(false); setPin(''); setDevPassword(''); setError(''); }}
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
          <form onSubmit={handleDevSubmit} className="space-y-3">
            <input
              type="password"
              autoFocus
              autoComplete="off"
              value={devPassword}
              onChange={e => { setDevPassword(e.target.value); setError(''); }}
              disabled={isLoading}
              aria-label="開発者パスワード"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-mono text-sm tracking-tight focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            />
            {error && <p className="text-sm text-rose-600 text-center">{error}</p>}
            <button
              type="submit"
              disabled={isLoading || !devPassword}
              className="w-full py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-40"
            >
              {isLoading ? '確認中…' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    );
  }

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
            PINが分からない場合は管理者にお尋ねください
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
          <p className="text-blue-600 text-sm font-semibold mt-1">{storeName}</p>
          <p className="text-slate-500 text-sm mt-2">名前を選択してください</p>
        </div>

        {/* PIN不要でシフト表だけ見たい人向けの一発リンク（休憩室のタブレット等を想定） */}
        <Link
          href={`/s/${storeSlug}/public/schedule`}
          className="mb-6 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          シフト表を見る（ログイン不要）
        </Link>

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

        {/* 本部管理者が店舗の画面からログアウトすると、この画面に来ることがある。
            そこから本部のログインへ戻る手段が無いと、URLを覚えていない限り詰む。
            スタッフの邪魔にならないよう、控えめに置いておく */}
        <div className="flex items-center justify-between mt-4">
          <Link
            href={HQ_LOGIN}
            className="text-[11px] text-slate-400 hover:text-slate-600 px-1 py-1 rounded transition-colors"
          >
            本部管理者の方はこちら
          </Link>
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
