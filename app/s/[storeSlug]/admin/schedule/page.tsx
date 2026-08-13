'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { monthStart, monthEnd, formatDate, getDaysInMonth } from '@/lib/shifts';
import TableView from '@/components/TableView';
import TimelineView from '@/components/TimelineView';
import ShiftDetailModal from '@/components/ShiftDetailModal';
import ShiftRequestModal from '@/components/ShiftRequestModal';
import type { Shift, User, ShiftType } from '@/lib/types';
import { SHIFT_PRESETS, SHIFT_COLORS } from '@/lib/types';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { usePersistedMonth } from '@/lib/usePersistedMonth';
import { useTableExport } from '@/lib/useTableExport';
import { IconChevronLeft, IconChevronRight, IconDownload } from '@/components/icons';

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
  useBodyScrollLock();
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

  function selectPreset(type: Exclude<ShiftType, 'custom' | 'off'>) {
    setShiftType(type);
    setStartTime(SHIFT_PRESETS[type].start);
    setEndTime(SHIFT_PRESETS[type].end);
  }

  const handleSave = async () => {
    setError('');
    if (!userId) return setError('スタッフを選択してください');
    if (!date) return setError('日付を選択してください');
    if (shiftType !== 'off' && startTime >= endTime) return setError('終了時刻は開始時刻より後にしてください');
    setSaving(true);
    // shiftsへのINSERT/UPDATEにはstore_idを送らない（DBトリガーがuser_idから自動導出して上書きするため）
    if (existing) {
      const { error: e } = await supabase.from('shifts').update({
        user_id: userId, date, shift_type: shiftType, start_time: shiftType === 'off' ? '00:00' : startTime, end_time: shiftType === 'off' ? '00:00' : endTime, comment,
      }).eq('id', existing.id);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from('shifts').upsert(
        { user_id: userId, date, shift_type: shiftType, start_time: shiftType === 'off' ? '00:00' : startTime, end_time: shiftType === 'off' ? '00:00' : endTime, comment, status: 'draft' },
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
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">選択してください</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* 日付 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">日付</label>
            <select value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              {dateOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* シフト種別 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">シフト種別</label>
            <div className="grid grid-cols-4 gap-1 mb-2">
              {(Object.keys(SHIFT_PRESETS) as Exclude<ShiftType, 'custom' | 'off'>[]).map(type => (
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
              <button
                onClick={() => setShiftType('off')}
                className="py-1.5 rounded-lg text-xs font-bold text-white col-span-2 transition-opacity"
                style={{ backgroundColor: SHIFT_COLORS.off, opacity: shiftType === 'off' ? 1 : 0.4 }}
              >
                休み
              </button>
            </div>
            {shiftType !== 'off' && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={e => { setStartTime(e.target.value); setShiftType('custom'); }}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <span className="text-slate-400 text-sm">〜</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => { setEndTime(e.target.value); setShiftType('custom'); }}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            )}
          </div>

          {/* コメント */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">コメント（任意）</label>
            <input type="text" value={comment} onChange={e => setComment(e.target.value)}
              placeholder="備考など"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中…' : '保存'}
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50">
            キャンセル
          </button>
        </div>

        {existing && !showDeleteConfirm && (
          <button onClick={() => setShowDeleteConfirm(true)}
            className="w-full mt-2 py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
            このシフトを削除
          </button>
        )}
        {existing && showDeleteConfirm && (
          <div className="mt-3 p-3 bg-red-50 rounded-lg">
            <p className="text-sm text-red-700 mb-2">本当に削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} className="flex-1 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">削除する</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50">戻る</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminSchedulePage() {
  const { user: authUser } = useAuth();
  const { storeId } = useStore();
  const { year, month, prevMonth, nextMonth, goToCurrentMonth, isCurrentMonth } = usePersistedMonth('month_admin_schedule');
  const { tableRef, exporting, handleExportImage } = useTableExport(year, month);
  const [view, setView] = useState<ViewMode>('table');
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [isConfirming, setIsConfirming] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [detailShift, setDetailShift] = useState<Shift | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [requestModal, setRequestModal] = useState<{ date?: string; startTime?: string; endTime?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState('');
  useBodyScrollLock(reminderOpen);

  const fetchData = useCallback(async () => {
    const start = monthStart(year, month);
    const end = monthEnd(year, month);
    const memoKeys: string[] = [];
    for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
      memoKeys.push(`memo_${d.toISOString().split('T')[0]}`);
    }
    const [{ data: usersData }, { data: shiftsData }, { data: memosData }] = await Promise.all([
      supabase.from('users').select('id, name, role, created_at').eq('store_id', storeId).order('display_order', { ascending: true, nullsFirst: false }),
      supabase.from('shifts').select('*').eq('store_id', storeId).gte('date', start).lte('date', end).order('date'),
      supabase.from('app_settings').select('key, value').eq('store_id', storeId).in('key', memoKeys),
    ]);
    setUsers(usersData ?? []);
    setShifts(shiftsData ?? []);
    const memoMap: Record<string, string> = {};
    (memosData ?? []).forEach(({ key, value }: { key: string; value: string }) => {
      memoMap[key.replace('memo_', '')] = value;
    });
    setMemos(memoMap);
  }, [year, month, storeId]);

  const handleMemoChange = async (date: string, value: string) => {
    setMemos(prev => ({ ...prev, [date]: value }));
    // app_settingsの主キーは(store_id, key)の複合キーなのでonConflictを明示する
    await supabase.from('app_settings').upsert({ store_id: storeId, key: `memo_${date}`, value }, { onConflict: 'store_id,key' });
  };

  useEffect(() => {
    fetchData();

    // 他店舗の変更で不要な再取得が起きないようfilterとチャンネル名にstoreIdを含める
    const channel = supabase
      .channel(`admin-schedule-${storeId}-${year}-${month}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `store_id=eq.${storeId}` }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [year, month, storeId, fetchData]);

  const handleConfirm = async (shiftId: string): Promise<boolean> => {
    setActionError('');
    const { error } = await supabase.from('shifts').update({ status: 'confirmed' }).eq('id', shiftId);
    if (error) {
      setActionError(`確定に失敗しました: ${error.message}`);
      return false;
    }
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status: 'confirmed' } : s));
    return true;
  };

  const handleConfirmAll = async () => {
    setActionError('');
    setIsConfirming(true);
    try {
      const draftIds = shifts.filter(s => s.status === 'draft').map(s => s.id);
      if (draftIds.length === 0) return;
      const { error } = await supabase.from('shifts').update({ status: 'confirmed' }).in('id', draftIds);
      if (error) {
        setActionError(`確定に失敗しました: ${error.message}`);
        return;
      }
      const draftIdSet = new Set(draftIds);
      setShifts(prev => prev.map(s => draftIdSet.has(s.id) ? { ...s, status: 'confirmed' } : s));
    } finally {
      setIsConfirming(false);
    }
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

  // 今月の最初の日付を取得（シフト追加デフォルト用）
  const firstDateOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} aria-label="前の月" className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center">
            <IconChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{year}年{month + 1}月</h2>
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setReminderOpen(true)}
            className="relative px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            未提出者
            {unsubmittedUsers.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {unsubmittedUsers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setRequestModal({})}
            className="px-3 py-2 bg-white border border-orange-300 text-orange-700 text-sm font-medium rounded-lg hover:bg-orange-50"
          >
            調整依頼
          </button>
          <button
            onClick={() => setModal({ userId: users[0]?.id ?? '', date: firstDateOfMonth })}
            className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + シフト追加
          </button>
          {draftCount > 0 && (
            <button onClick={handleConfirmAll} disabled={isConfirming}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {isConfirming ? '確定中…' : `すべて確定 (${draftCount}件)`}
            </button>
          )}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>表形式</button>
            <button onClick={() => setView('timeline')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>タイムライン</button>
          </div>
          {view === 'table' && (
            <button
              onClick={handleExportImage}
              disabled={exporting}
              className="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
            >
              <IconDownload className="w-4 h-4" />
              {exporting ? '生成中…' : '画像保存'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-medium text-slate-500">申請数</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{shifts.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-medium text-slate-500">未確定</p>
          <p className="text-2xl font-semibold tabular-nums text-amber-600">{draftCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-[11px] font-medium text-slate-500">確定済み</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-600">{shifts.length - draftCount}</p>
        </div>
      </div>

      {view === 'table'
        ? <TableView ref={tableRef} year={year} month={month} users={users} shifts={shifts} memos={memos} onMemoChange={handleMemoChange} isAdmin exportMode={exporting} onConfirm={handleConfirm} onCellClick={handleCellClick} onShiftClick={s => setDetailShift(s)} />
        : <TimelineView year={year} month={month} users={users} shifts={shifts} memos={memos} onMemoChange={handleMemoChange} isAdmin onConfirm={handleConfirm} onShiftClick={s => setDetailShift(s)} onRequestSlot={(date, startTime, endTime) => setRequestModal({ date, startTime, endTime })} />}

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
            const ok = await handleConfirm(detailShift.id);
            if (ok) setDetailShift(prev => prev ? { ...prev, status: 'confirmed' } : null);
          }}
        />
      )}

      {requestModal && authUser && (
        <ShiftRequestModal
          users={users}
          createdBy={authUser.id}
          defaultDate={requestModal.date ?? firstDateOfMonth}
          defaultStartTime={requestModal.startTime}
          defaultEndTime={requestModal.endTime}
          onClose={() => setRequestModal(null)}
          onSaved={() => setRequestModal(null)}
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
                  className={`w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    copied ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {copied ? '✓ コピーしました' : 'リマインダーをクリップボードにコピー'}
                </button>
                <p className="text-[11px] text-slate-400 mt-2 text-center">LINE・メール等に貼り付けて送信できます</p>
              </>
            )}
            <button
              onClick={() => setReminderOpen(false)}
              className="w-full mt-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
