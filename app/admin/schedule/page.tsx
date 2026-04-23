'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { monthStart, monthEnd } from '@/lib/shifts';
import TableView from '@/components/TableView';
import TimelineView from '@/components/TimelineView';
import type { Shift, User } from '@/lib/types';

type ViewMode = 'table' | 'timeline';

export default function AdminSchedulePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<ViewMode>('table');
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    let alive = true;

    async function fetchData() {
      const [{ data: usersData }, { data: shiftsData }] = await Promise.all([
        supabase.from('users').select('id, name, role, created_at').order('name'),
        supabase.from('shifts').select('*').gte('date', monthStart(year, month)).lte('date', monthEnd(year, month)).order('date'),
      ]);
      if (!alive) return;
      setUsers(usersData ?? []);
      setShifts(shiftsData ?? []);
    }

    fetchData();

    const channel = supabase
      .channel(`admin-schedule-${year}-${month}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchData)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [year, month]);

  const handleConfirm = async (shiftId: string) => {
    await supabase.from('shifts').update({ status: 'confirmed' }).eq('id', shiftId);
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status: 'confirmed' } : s));
  };

  const handleConfirmAll = async () => {
    setIsConfirming(true);
    const draftIds = shifts.filter(s => s.status === 'draft').map(s => s.id);
    if (draftIds.length === 0) { setIsConfirming(false); return; }
    await supabase.from('shifts').update({ status: 'confirmed' }).in('id', draftIds);
    setShifts(prev => prev.map(s => ({ ...s, status: 'confirmed' })));
    setIsConfirming(false);
  };

  const draftCount = shifts.filter(s => s.status === 'draft').length;

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600">◀</button>
          <h2 className="text-lg font-bold text-slate-800">{year}年{month + 1}月</h2>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600">▶</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {draftCount > 0 && (
            <button onClick={handleConfirmAll} disabled={isConfirming}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50">
              {isConfirming ? '確定中…' : `すべて確定 (${draftCount}件)`}
            </button>
          )}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>表形式</button>
            <button onClick={() => setView('timeline')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>タイムライン</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">申請数</p>
          <p className="text-2xl font-bold text-slate-800">{shifts.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">未確定</p>
          <p className="text-2xl font-bold text-amber-500">{draftCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">確定済み</p>
          <p className="text-2xl font-bold text-green-500">{shifts.length - draftCount}</p>
        </div>
      </div>

      {view === 'table'
        ? <TableView year={year} month={month} users={users} shifts={shifts} isAdmin onConfirm={handleConfirm} />
        : <TimelineView year={year} month={month} users={users} shifts={shifts} isAdmin onConfirm={handleConfirm} />}
    </div>
  );
}
