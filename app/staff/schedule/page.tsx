'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { monthStart, monthEnd, netWorkMinutes, formatTotalHours } from '@/lib/shifts';
import { useAuth } from '@/lib/auth';
import { usePersistedMonth } from '@/lib/usePersistedMonth';
import TableView from '@/components/TableView';
import TimelineView from '@/components/TimelineView';
import ShiftDetailModal from '@/components/ShiftDetailModal';
import type { Shift, User } from '@/lib/types';
import { useTableExport } from '@/lib/useTableExport';
import { IconChevronLeft, IconChevronRight, IconDownload } from '@/components/icons';

type ViewMode = 'table' | 'timeline';

export default function StaffSchedulePage() {
  const { user: authUser } = useAuth();
  const { year, month, prevMonth, nextMonth, goToCurrentMonth, isCurrentMonth } = usePersistedMonth('month_staff_schedule');
  const [view, setView] = useState<ViewMode>('table');
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [detailShift, setDetailShift] = useState<Shift | null>(null);

  const myTotalMin = authUser
    ? shifts
        .filter(s => s.user_id === authUser.id)
        .reduce((sum, s) => sum + netWorkMinutes(s.start_time, s.end_time), 0)
    : 0;

  useEffect(() => {
    let alive = true;

    async function fetchData() {
      const start = monthStart(year, month);
      const end = monthEnd(year, month);
      const memoKeys: string[] = [];
      for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
        memoKeys.push(`memo_${d.toISOString().split('T')[0]}`);
      }
      const [{ data: usersData }, { data: shiftsData }, { data: memosData }] = await Promise.all([
        supabase.from('users').select('id, name, role, created_at').order('display_order', { ascending: true, nullsFirst: false }),
        supabase.from('shifts').select('*').gte('date', start).lte('date', end).order('date'),
        supabase.from('app_settings').select('key, value').in('key', memoKeys),
      ]);
      if (!alive) return;
      setUsers(usersData ?? []);
      setShifts(shiftsData ?? []);
      const memoMap: Record<string, string> = {};
      (memosData ?? []).forEach(({ key, value }: { key: string; value: string }) => {
        memoMap[key.replace('memo_', '')] = value;
      });
      setMemos(memoMap);
    }

    fetchData();

    const channel = supabase
      .channel(`staff-schedule-${year}-${month}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchData)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [year, month]);

  const { tableRef, exporting, handleExportImage } = useTableExport(year, month);

  return (
    <div>
      <div className="mb-4 space-y-2">
        {/* Row1: 月ナビ ＋ 今月バッジ — コントロール類は置かない */}
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
          {authUser && myTotalMin > 0 && (
            <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap">
              今月 {formatTotalHours(myTotalMin)}
            </span>
          )}
        </div>
        {/* Row2: ビュー切替 ＋ 保存 — 右寄せで独立 */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>表形式</button>
            <button onClick={() => setView('timeline')} className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${view === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>タイムライン</button>
          </div>
          {view === 'table' && (
            <button
              onClick={handleExportImage}
              disabled={exporting}
              title={exporting ? '生成中…' : '画像保存'}
              className="ml-auto w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center justify-center disabled:opacity-50"
            >
              {exporting
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/></svg>
                : <IconDownload className="w-4 h-4" />
              }
            </button>
          )}
        </div>
      </div>

      {view === 'table'
        ? <TableView ref={tableRef} year={year} month={month} users={users} shifts={shifts} memos={memos} currentUserId={authUser?.id} exportMode={exporting} onShiftClick={s => setDetailShift(s)} />
        : <TimelineView year={year} month={month} users={users} shifts={shifts} memos={memos} currentUserId={authUser?.id} onShiftClick={s => setDetailShift(s)} />}

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
