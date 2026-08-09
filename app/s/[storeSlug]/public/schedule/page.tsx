'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { monthStart, monthEnd } from '@/lib/shifts';
import { usePersistedMonth } from '@/lib/usePersistedMonth';
import TableView from '@/components/TableView';
import TimelineView from '@/components/TimelineView';
import ShiftDetailModal from '@/components/ShiftDetailModal';
import BrandMark from '@/components/BrandMark';
import type { Shift, User } from '@/lib/types';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';

type ViewMode = 'table' | 'timeline';

// list_login_users RPC の戻り値
interface LoginUserRow {
  id: string;
  name: string;
  role: 'admin' | 'staff';
  display_order?: number;
}

// get_public_shifts RPC の戻り値。comment等の私的な列は含めていない。
interface PublicShiftRow {
  id: string;
  user_id: string;
  date: string;
  shift_type: Shift['shift_type'];
  start_time: string;
  end_time: string;
  status: Shift['status'];
}

// ログイン不要でシフト表だけを閲覧できる公開ページ。店舗ログイン画面から
// 1タップで開ける導線を想定している（例: 休憩室に置いたタブレットで
// PIN入力なしにその日の予定を確認する、といった用途）。
// 提出・編集・確定などの操作は一切できない、完全な読み取り専用。
//
// RLSは匿名アクセスを全面的にブロックしたままなので、データ取得は
// list_login_users / get_public_shifts の SECURITY DEFINER RPC 経由のみで行う
// （テーブルへの直接SELECTは、この画面でも0件になる）。
export default function PublicSchedulePage() {
  const { storeSlug, storeName } = useStore();
  const { year, month, prevMonth, nextMonth, goToCurrentMonth, isCurrentMonth } = usePersistedMonth('month_public_schedule');
  const [view, setView] = useState<ViewMode>('table');
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailShift, setDetailShift] = useState<Shift | null>(null);

  useEffect(() => {
    let alive = true;

    async function fetchData() {
      setLoading(true);
      const [{ data: userRows }, { data: shiftRows }] = await Promise.all([
        supabase.rpc('list_login_users', { p_store_slug: storeSlug }),
        supabase.rpc('get_public_shifts', { p_store_slug: storeSlug, p_start: monthStart(year, month), p_end: monthEnd(year, month) }),
      ]);
      if (!alive) return;

      setUsers(((userRows ?? []) as LoginUserRow[]).map(u => ({
        id: u.id, name: u.name, role: u.role, created_at: '', display_order: u.display_order,
      })));
      setShifts(((shiftRows ?? []) as PublicShiftRow[]).map(s => ({
        id: s.id, user_id: s.user_id, date: s.date, shift_type: s.shift_type,
        start_time: s.start_time, end_time: s.end_time, comment: '', status: s.status,
        created_at: '', updated_at: '',
      })));
      setLoading(false);
    }

    fetchData();
    return () => { alive = false; };
    // RLSが匿名の postgres_changes 配信も拒否するため、Realtime購読はできない。
    // 一覧は月切り替え・再訪時に取得し直す形にとどめている。
  }, [storeSlug, year, month]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white/85 backdrop-blur border-b border-slate-200/80 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-[52px] gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <BrandMark size="sm" />
            <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">シフト管理</span>
            {storeName && (
              <>
                <span className="text-slate-200 text-sm">|</span>
                <span className="text-[13px] text-slate-500 truncate">{storeName}</span>
              </>
            )}
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium whitespace-nowrap">
            閲覧のみ
          </span>
          <Link
            href={`/s/${storeSlug}/login`}
            className="text-xs px-2.5 h-7 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex-shrink-0 flex items-center"
          >
            ログイン
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} aria-label="前の月" className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center">
              <IconChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 whitespace-nowrap">{year}年{month + 1}月</h2>
            <button onClick={nextMonth} aria-label="次の月" className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center">
              <IconChevronRight className="w-4 h-4" />
            </button>
            {!isCurrentMonth && (
              <button
                onClick={goToCurrentMonth}
                className="text-xs px-2 h-7 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                今月へ
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>表形式</button>
            <button onClick={() => setView('timeline')} className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${view === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>タイムライン</button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-12 text-sm">読み込み中…</p>
        ) : view === 'table' ? (
          <TableView year={year} month={month} users={users} shifts={shifts} onShiftClick={s => setDetailShift(s)} />
        ) : (
          <TimelineView year={year} month={month} users={users} shifts={shifts} onShiftClick={s => setDetailShift(s)} />
        )}
      </main>

      {detailShift && (
        <ShiftDetailModal
          shift={detailShift}
          users={users}
          onClose={() => setDetailShift(null)}
        />
      )}
    </div>
  );
}
