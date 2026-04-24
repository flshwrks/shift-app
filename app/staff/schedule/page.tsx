'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { monthStart, monthEnd } from '@/lib/shifts';
import TableView from '@/components/TableView';
import TimelineView from '@/components/TimelineView';
import ShiftDetailModal from '@/components/ShiftDetailModal';
import type { Shift, User } from '@/lib/types';

type ViewMode = 'table' | 'timeline';

export default function StaffSchedulePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<ViewMode>('table');
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [detailShift, setDetailShift] = useState<Shift | null>(null);

  useEffect(() => {
    let alive = true;

    async function fetchData() {
      const [{ data: usersData }, { data: shiftsData }] = await Promise.all([
        supabase.from('users').select('id, name, role, created_at').order('display_order', { ascending: true, nullsFirst: false }),
        supabase.from('shifts').select('*').gte('date', monthStart(year, month)).lte('date', monthEnd(year, month)).order('date'),
      ]);
      if (!alive) return;
      setUsers(usersData ?? []);
      setShifts(shiftsData ?? []);
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

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600">◀</button>
          <h2 className="text-lg font-bold text-slate-800">{year}年{month + 1}月</h2>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600">▶</button>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>表形式</button>
          <button onClick={() => setView('timeline')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>タイムライン</button>
        </div>
      </div>

      {view === 'table'
        ? <TableView year={year} month={month} users={users} shifts={shifts} onShiftClick={s => setDetailShift(s)} />
        : <TimelineView year={year} month={month} users={users} shifts={shifts} onShiftClick={s => setDetailShift(s)} />}

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
