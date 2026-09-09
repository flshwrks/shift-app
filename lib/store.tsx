'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import {
  DEFAULT_PATTERNS, SETTINGS_KEY, parsePatterns, type ShiftPattern,
} from './shiftPatterns';

export interface StoreContextValue {
  storeId: string;
  storeSlug: string;
  storeName: string;
  /** 店舗ごとのシフトパターン（未設定なら既定値）。A〜Gの7枠が常に揃う */
  patterns: ShiftPattern[];
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
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data) { setState('not-found'); return; }

        // パターンの取得に失敗しても店舗の解決は止めない。
        // 設定が読めないだけでシフト画面が開かなくなるほうが困るため、既定値で続行する。
        const { data: row } = await supabase
          .from('app_settings')
          .select('value')
          .eq('store_id', data.id)
          .eq('key', SETTINGS_KEY)
          .maybeSingle<{ value: string }>();
        if (cancelled) return;

        setState({
          storeId: data.id,
          storeSlug,
          storeName: data.name,
          patterns: row?.value ? parsePatterns(row.value) : DEFAULT_PATTERNS.map(p => ({ ...p })),
        });
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

// 店舗のシフトパターン。本部配下など Provider の外で呼ばれた場合は既定値を返す
// （ヘルプなど、店舗に属さない画面でも凡例を出せるようにするため）。
export function useShiftPatterns(): ShiftPattern[] {
  const ctx = useContext(StoreContext);
  return ctx?.patterns ?? DEFAULT_PATTERNS;
}
