'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatYM } from '@/lib/shifts';
import TableView from '@/components/TableView';
import TimelineView from '@/components/TimelineView';
import type { Shift, User } from '@/lib/types';

type ViewMode = 'table' | 'timeline';

export default function StaffSchedulePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<ViewMode>('table');
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const loadData = useCallback(async () => {
    const ym = formatYM(year, month);
    const [{ data: usersData }, { data: shiftsData }] = await Promise.all([
      supabase.from('users').select('id, name, role, created_at').order('name'),
      supabase
        .from('shifts')
        .select('*')
        .gte('date', `${ym}-01`)
        .lte('date', `${ym}-31`)
        .order('date'),
    ]);
    setUsers(usersData ?? []);
    setShifts(shiftsData ?? []);
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('staff-schedule-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">◀</button>
          <h2 className="text-xl font-bold text-slate-800">{year}年{month + 1}月</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">▶</button>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setView('table')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            表形式
          </button>
          <button
            onClick={() => setView('timeline')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            タイムライン
          </button>
        </div>
      </div>

      {view === 'table' ? (
        <TableView year={year} month={month} users={users} shifts={shifts} />
      ) : (
        <TimelineView year={year} month={month} users={users} shifts={shifts} />
      )}
    </div>
  );
}
