'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';

export interface StoreContextValue {
  storeId: string;
  storeSlug: string;
  storeName: string;
}

const StoreContext = createContext<StoreContextValue | null>(null);

// 解決中は null、該当店舗なしは 'not-found'。2つの真偽値フラグに分けると
// 状態の組み合わせが増え「両方立つ/両方立たない」といった不整合が起きうるため、
// ひとつの判別可能な値にまとめている。
type ResolvedState = StoreContextValue | 'not-found' | null;

// URLの storeSlug から stores.id / name を解決し、配下の画面へ Context として配る。
// /s/[storeSlug]/... 配下のレイアウトで一度だけラップする想定。
export function StoreProvider({
  storeSlug,
  children,
}: {
  storeSlug: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<ResolvedState>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);

    supabase
      .from('stores')
      .select('id, name')
      .eq('slug', storeSlug)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        setState(error || !data ? 'not-found' : { storeId: data.id, storeSlug, storeName: data.name });
      });

    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  if (state === 'not-found') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-screen text-slate-600">
        <p className="text-lg font-semibold">店舗が見つかりません</p>
        <p className="text-sm text-slate-400">URLをご確認ください</p>
      </div>
    );
  }

  if (state === null) {
    return <AuthLoadingScreen />;
  }

  return <StoreContext.Provider value={state}>{children}</StoreContext.Provider>;
}

// Provider外で呼ぶと throw する（店舗配下の画面専用コンポーネントで使う）
export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}

// Provider外でも null を返す安全版。NavBar等、店舗配下・本部配下の両方で使われる
// 共有コンポーネントはこちらを使うこと。
export function useStoreOptional(): StoreContextValue | null {
  return useContext(StoreContext);
}
