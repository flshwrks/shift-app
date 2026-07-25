'use client';
import { useState } from 'react';

interface StoredMonth {
  year: number;
  month: number;
}

function readStoredMonth(key: string): StoredMonth | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredMonth>;
    if (typeof parsed.year === 'number' && typeof parsed.month === 'number') {
      return { year: parsed.year, month: parsed.month };
    }
  } catch {}
  return null;
}

// 画面遷移で表示中の年月を失わないよう sessionStorage に保存・復元する
export function usePersistedMonth(storageKey: string) {
  const now = new Date();
  const [initial] = useState(() => readStoredMonth(storageKey));
  const [year, setYearState] = useState(initial?.year ?? now.getFullYear());
  const [month, setMonthState] = useState(initial?.month ?? now.getMonth());

  const set = (y: number, m: number) => {
    setYearState(y);
    setMonthState(m);
    sessionStorage.setItem(storageKey, JSON.stringify({ year: y, month: m }));
  };

  return {
    year,
    month,
    wasRestored: initial !== null,
    setYearMonth: set,
    prevMonth: () => { if (month === 0) set(year - 1, 11); else set(year, month - 1); },
    nextMonth: () => { if (month === 11) set(year + 1, 0); else set(year, month + 1); },
    goToCurrentMonth: () => set(now.getFullYear(), now.getMonth()),
    isCurrentMonth: year === now.getFullYear() && month === now.getMonth(),
  };
}
