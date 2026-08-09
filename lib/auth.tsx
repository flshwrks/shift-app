'use client';
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { SessionUser } from './types';
import { setSupabaseAccessToken } from './supabase';

interface AuthContextType {
  user: SessionUser | null;
  login: (user: SessionUser, supabaseToken: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

const SESSION_KEY = 'shift_session';
// SupabaseJWTのTTL(1時間)より短い間隔で先回りして更新し、失効による瞬断を防ぐ
const REFRESH_INTERVAL_MS = 45 * 60 * 1000;

// /api/session/token からSupabase用JWTを取得し、成功したらSupabaseクライアントに反映する。
// httpOnly Cookieが失効している場合は401が返るので、呼び出し側でログアウト状態に倒す。
async function fetchAndApplyToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/session/token');
    if (!res.ok) return false;
    const { token } = (await res.json()) as { token: string };
    setSupabaseAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let stored: SessionUser | null = null;
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) stored = JSON.parse(raw);
      } catch {}

      // トークン取得を待ってから isLoading=false にする。先に false にすると、
      // 子コンポーネントがSupabaseへのJWT未添付リクエストを投げてRLSに弾かれるため。
      const ok = await fetchAndApplyToken();
      if (cancelled) return;

      if (ok) {
        setUser(stored);
      } else {
        // Cookie失効（401等）＝ログアウト状態。ローカルの残骸も消す。
        localStorage.removeItem(SESSION_KEY);
        setUser(null);
      }
      setIsLoading(false);
    })();

    const interval = setInterval(() => {
      fetchAndApplyToken();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const login = useCallback((u: SessionUser, supabaseToken: string) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setSupabaseAccessToken(supabaseToken);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSupabaseAccessToken(null);
    setUser(null);
  }, []);

  // このContextはほぼ全画面が購読するため、毎レンダーで新しいオブジェクトを渡すと
  // user/isLoadingが変わっていなくても全消費者が再レンダーされてしまう。
  const value = useMemo(() => ({ user, login, logout, isLoading }), [user, login, logout, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
