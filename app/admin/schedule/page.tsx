'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { monthStart, monthEnd, formatDate, getDaysInMonth } from '@/lib/shifts';
import { useCallback } from 'react';
import TableView from '@/components/TableView';
import TimelineView from '@/components/TimelineView';
import ShiftDetailModal from '@/components/ShiftDetailModal';
import type { Shift, User, ShiftType } from '@/lib/types';
import { SHIFT_PRESETS, SHIFT_COLORS } from '@/lib/types';

type ViewMode = 'table' | 'timeline';

interface ModalState {
  userId: string;
  date: string;
  shift?: Shift;
}

function ShiftModal({
  state,
  users,
  year,
  month,
  onClose,
  onSaved,
}: {
  state: ModalState;
  users: User[];
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = state.shift;
  const [userId, setUserId] = useState(state.userId);
  const [date, setDate] = useState(state.date);
  const [shiftType, setShiftType] = useState<ShiftType>(existing?.shift_type ?? 'A');
  const [startTime, setStartTime] = useState(existing?.start_time ?? SHIFT_PRESETS.A.start);
  const [endTime, setEndTime] = useState(existing?.end_time ?? SHIFT_PRESETS.A.end);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const days = getDaysInMonth(year, month);
  const dateOptions = days.map(d => formatDate(d));

  function selectPreset(type: Exclude<ShiftType, 'custom'>) {
    setShiftType(type);
    setStartTime(SHIFT_PRESETS[type].start);
    setEndTime(SHIFT_PRESETS[type].end);
  }

  const handleSave = async () => {
    setError('');
    if (!userId) return setError('スタッフを選択してください');
    if (!date) return setError('日付を選択してください');
    if (startTime >= endTime) return setError('終了時刻は開始時刻より後にしてください');
    setSaving(true);
    if (existing) {
      const { error: e } = await supabase.from('shifts').update({
        user_id: userId, date, shift_type: shiftType, start_time: startTime, end_time: endTime, comment,
      }).eq('id', existing.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from('shifts').upsert(
        { user_id: userId, date, shift_type: shiftType, start_time: startTime, end_time: endTime, comment, status: 'confirmed' },
        { onConflict: 'user_id,date' }
      );
      if (e) { setError(e.message); setSaving(false); return; }
    }
    setSaving(false);
    onSaved();
  };

  const handleDelete = async () => {
    if (!existing) return;
    await supabase.from('shifts').delete().eq('id', existing.id);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4">
          {existing ? 'シフトを編集' : 'シフトを追加'}
        </h3>

        <div className="space-y-3">
          {/* スタッフ */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">スタッフ</label>
            <select value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">選択してください</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* 日付 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">日付</label>
            <select value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              {dateOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* シフト種別 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">シフト種別</label>
            <div className="grid grid-cols-4 gap-1 mb-2">
              {(Object.keys(SHIFT_PRESETS) as Exclude<ShiftType, 'custom'>[]).map(type => (
                <button
                  key={type}
                  onClick={() => selectPreset(type)}
                  className="py-1.5 rounded-lg text-xs font-bold text-white transition-opacity"
                  style={{
                    backgroundColor: SHIFT_COLORS[type],
                    opacity: shiftType === type ? 1 : 0.4,
                  }}
                >
                  {type}
                </button>
              ))}
              <button
                onClick={() => setShiftType('custom')}
                className="py-1.5 rounded-lg text-xs font-bold text-white col-span-2 transition-opacity"
                style={{ backgroundColor: SHIFT_COLORS.custom, opacity: shiftType === 'custom' ? 1 : 0.4 }}
              >
                カスタム
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                step="1800"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="flex-1 border border-slate-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="text-slate-400 text-sm">〜</span>
              <input
                type="time"
                step="1800"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="flex-1 border border-slate-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* コメント */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">コメント（任意）</label>
            <input type="text" value={comment} onChange={e => setComment(e.target.value)}
              placeholder="備考など"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中…' : '保存'}
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200">
            キャンセル
          </button>
        </div>

        {existing && !showDeleteConfirm && (
          <button onClick={() => setShowDeleteConfirm(true)}
            className="w-full mt-2 py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors">
            このシフトを削除
          </button>
        )}
        {existing && showDeleteConfirm && (
          <div className="mt-3 p-3 bg-red-50 rounded-xl">
            <p className="text-sm text-red-700 mb-2">本当に削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} className="flex-1 py-2 bg-red-600 text-white text-sm rounded-xl hover:bg-red-700">削除する</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 text-sm rounded-xl">戻る</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminSchedulePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<ViewMode>('table');
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [detailShift, setDetailShift] = useState<Shift | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: usersData }, { data: shiftsData }] = await Promise.all([
      supabase.from('users').select('id, name, role, created_at').order('created_at'),
      supabase.from('shifts').select('*').gte('date', monthStart(year, month)).lte('date', monthEnd(year, month)).order('date'),
    ]);
    setUsers(usersData ?? []);
    setShifts(shiftsData ?? []);
  }, [year, month]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`admin-schedule-${year}-${month}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [year, month, fetchData]);

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

  const handleCellClick = (userId: string, date: string, shift?: Shift) => {
    if (shift) {
      setDetailShift(shift);
    } else {
      setModal({ userId, date });
    }
  };

  const handleModalSaved = () => {
    setModal(null);
    setDetailShift(null);
    fetchData();
  };

  const draftCount = shifts.filter(s => s.status === 'draft').length;
  const submittedUserIds = new Set(shifts.map(s => s.user_id));
  const unsubmittedUsers = users.filter(u => !submittedUserIds.has(u.id));

  const copyReminder = () => {
    const names = unsubmittedUsers.map(u => u.name).join('、');
    const text = `【シフト提出のお願い】\n${year}年${month + 1}月のシフトがまだ提出されていません。\n未提出: ${names}\n締切までにご提出をお願いします。`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  // 今月の最初の日付を取得（シフト追加デフォルト用）
  const firstDateOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600">◀</button>
          <h2 className="text-lg font-bold text-slate-800">{year}年{month + 1}月</h2>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600">▶</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setReminderOpen(true)}
            className="relative px-3 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200"
          >
            未提出者
            {unsubmittedUsers.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {unsubmittedUsers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setModal({ userId: users[0]?.id ?? '', date: firstDateOfMonth })}
            className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
          >
            + シフト追加
          </button>
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
        ? <TableView year={year} month={month} users={users} shifts={shifts} isAdmin onConfirm={handleConfirm} onCellClick={handleCellClick} onShiftClick={s => setDetailShift(s)} />
        : <TimelineView year={year} month={month} users={users} shifts={shifts} isAdmin onConfirm={handleConfirm} onShiftClick={s => setDetailShift(s)} />}

      {modal && (
        <ShiftModal
          state={modal}
          users={users}
          year={year}
          month={month}
          onClose={() => setModal(null)}
          onSaved={handleModalSaved}
        />
      )}

      {detailShift && (
        <ShiftDetailModal
          shift={detailShift}
          users={users}
          isAdmin
          onClose={() => setDetailShift(null)}
          onEdit={() => { setModal({ userId: detailShift.user_id, date: detailShift.date, shift: detailShift }); setDetailShift(null); }}
          onConfirm={async () => {
            await handleConfirm(detailShift.id);
            setDetailShift(prev => prev ? { ...prev, status: 'confirmed' } : null);
          }}
        />
      )}

      {reminderOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-1">シフト未提出スタッフ</h3>
            <p className="text-xs text-slate-400 mb-4">{year}年{month + 1}月 — 1件もシフト提出がない人</p>
            {unsubmittedUsers.length === 0 ? (
              <p className="text-green-600 text-sm py-4 text-center">全員提出済みです</p>
            ) : (
              <>
                <ul className="mb-4 space-y-1.5">
                  {unsubmittedUsers.map(u => (
                    <li key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                      {u.name}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={copyReminder}
                  className={`w-full py-2.5 text-sm font-medium rounded-xl transition-colors ${
                    copied ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {copied ? '✓ コピーしました' : 'リマインダーをクリップボードにコピー'}
                </button>
                <p className="text-[11px] text-slate-400 mt-2 text-center">LINE・メール等に貼り付けて送信できます</p>
              </>
            )}
            <button
              onClick={() => setReminderOpen(false)}
              className="w-full mt-3 py-2 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
