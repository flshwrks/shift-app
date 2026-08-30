'use client';
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { isHqRole, type SessionUser } from './types';
import { setSupabaseAccessToken } from './supabase';
import { HQ_LOGIN, storeLoginPath } from './routes';

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

// /api/session/token の結果。「セッションが無効」と「サーバーに繋がらない」を区別する。
// 一緒くたに扱うと、通信が一瞬切れただけで利用者を強制ログアウトさせてしまう。
type TokenResult =
  | { status: 'ok'; user: SessionUser | null }
  | { status: 'invalid' }    // 401 = 退職・削除済み。ログアウトさせる
  | { status: 'unavailable' }; // 通信断・DB障害など。何もせず次の周期に任せる

// Supabase用JWTを取得し、成功したらSupabaseクライアントに反映する。
// サーバー側は発行のたびに利用者がまだDBに存在するかを確認しているため（lib/sessionGuard.ts）、
// 退職者のセッションはここで 401 になって断ち切られる。
async function fetchAndApplyToken(): Promise<TokenResult> {
  let res: Response;
  try {
    res = await fetch('/api/session/token');
  } catch {
    return { status: 'unavailable' };
  }
  if (res.status === 401) return { status: 'invalid' };
  if (!res.ok) return { status: 'unavailable' };
  try {
    const { token, user } = (await res.json()) as { token: string; user?: SessionUser };
    setSupabaseAccessToken(token);
    // サーバーが返す user はDBと突き合わせ済み。権限を落とされていればここで最新になる
    return { status: 'ok', user: user ?? null };
  } catch {
    return { status: 'unavailable' };
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
      const result = await fetchAndApplyToken();
      if (cancelled) return;

      if (result.status === 'ok') {
        // サーバー側で権限が変わっていたら、そちらを正とする
        const current = result.user ?? stored;
        if (current) localStorage.setItem(SESSION_KEY, JSON.stringify(current));
        setUser(current);
      } else {
        if (result.status === 'invalid') localStorage.removeItem(SESSION_KEY);
        // 'unavailable' のときは localStorage を残す。サーバーが復旧すれば再読み込みで戻れる
        setUser(null);
      }
      setIsLoading(false);
    })();

    const interval = setInterval(async () => {
      const result = await fetchAndApplyToken();
      if (cancelled) return;
      if (result.status === 'invalid') {
        // 使っている最中に退職・削除された場合。黙ってデータが出なくなると原因が分からないので、
        // 理由を添えてログイン画面へ送る。行き先はログアウト前の所属で決める
        let last: SessionUser | null = null;
        try {
          const raw = localStorage.getItem(SESSION_KEY);
          if (raw) last = JSON.parse(raw);
        } catch {}
        localStorage.removeItem(SESSION_KEY);
        setSupabaseAccessToken(null);
        const target = !last || isHqRole(last.role) || !last.storeSlug
          ? HQ_LOGIN
          : storeLoginPath(last.storeSlug);
        window.location.replace(`${target}?reason=session_invalid`);
        return;
      }
      if (result.status === 'ok' && result.user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
        setUser(result.user);
      }
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
