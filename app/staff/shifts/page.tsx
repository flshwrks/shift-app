'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getDaysInMonth, formatDate, formatYM, getDayLabel, generateTimeSlots, isWeekend,
} from '@/lib/shifts';
import { SHIFT_PRESETS, SHIFT_COLORS, type Shift, type ShiftType } from '@/lib/types';

const TIME_SLOTS = generateTimeSlots();

const SHIFT_LIST = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

interface DayShift {
  shiftType: ShiftType | null;
  startTime: string;
  endTime: string;
  comment: string;
  dirty: boolean;       // ローカルで変更済み（未提出）
  existingId?: string;
  status?: string;
}

const defaultDay = (): DayShift => ({
  shiftType: null, startTime: '08:00', endTime: '17:00', comment: '', dirty: false,
});

export default function ShiftsPage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [days, setDays] = useState<Date[]>([]);
  const [shifts, setShifts] = useState<Record<string, DayShift>>({});
  const [deadline, setDeadline] = useState('');
  const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  // ポップアップ
  const [popup, setPopup] = useState<{ date: string; day: Date } | null>(null);

  useEffect(() => { setDays(getDaysInMonth(year, month)); }, [year, month]);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'deadline').single()
      .then(({ data }) => {
        if (data?.value) {
          setDeadline(data.value);
          setIsDeadlinePassed(new Date() > new Date(data.value));
        }
      });
  }, []);

  const loadShifts = useCallback(async () => {
    if (!user) return;
    const ym = formatYM(year, month);
    const { data } = await supabase.from('shifts').select('*')
      .eq('user_id', user.id).gte('date', `${ym}-01`).lte('date', `${ym}-31`);
    setShifts(() => {
      const next: Record<string, DayShift> = {};
      getDaysInMonth(year, month).forEach(d => { next[formatDate(d)] = defaultDay(); });
      (data ?? []).forEach((s: Shift) => {
        next[s.date] = { shiftType: s.shift_type, startTime: s.start_time, endTime: s.end_time, comment: s.comment ?? '', dirty: false, existingId: s.id, status: s.status };
      });
      return next;
    });
  }, [user, year, month]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // ポップアップ内の一時編集状態
  const [editShift, setEditShift] = useState<DayShift>(defaultDay());

  const openPopup = (date: string, day: Date) => {
    setEditShift({ ...(shifts[date] ?? defaultDay()) });
    setPopup({ date, day });
    setSubmitDone(false);
  };

  const closePopup = () => setPopup(null);

  const applyEdit = () => {
    if (!popup) return;
    setShifts(prev => ({
      ...prev,
      [popup.date]: { ...editShift, dirty: true },
    }));
    setPopup(null);
  };

  const selectType = (type: ShiftType | null) => {
    if (type && type !== 'custom') {
      const p = SHIFT_PRESETS[type as Exclude<ShiftType, 'custom'>];
      setEditShift(e => ({ ...e, shiftType: type, startTime: p.start, endTime: p.end }));
    } else {
      setEditShift(e => ({ ...e, shiftType: type }));
    }
  };

  const dirtyCount = Object.values(shifts).filter(s => s.dirty).length;

  const handleSubmitAll = async () => {
    if (!user || isDeadlinePassed) return;
    setSubmitting(true);
    const entries = Object.entries(shifts).filter(([, s]) => s.dirty);
    for (const [date, s] of entries) {
      if (!s.shiftType) {
        if (s.existingId) await supabase.from('shifts').delete().eq('id', s.existingId);
        setShifts(prev => ({ ...prev, [date]: { ...prev[date], dirty: false, existingId: undefined } }));
        continue;
      }
      const payload = { user_id: user.id, date, shift_type: s.shiftType, start_time: s.startTime, end_time: s.endTime, comment: s.comment, status: 'draft' };
      if (s.existingId) {
        await supabase.from('shifts').update(payload).eq('id', s.existingId);
      } else {
        const { data } = await supabase.from('shifts').insert(payload).select().single();
        if (data) setShifts(prev => ({ ...prev, [date]: { ...prev[date], existingId: data.id } }));
      }
      setShifts(prev => ({ ...prev, [date]: { ...prev[date], dirty: false } }));
    }
    setSubmitting(false);
    setSubmitDone(true);
    setTimeout(() => setSubmitDone(false), 3000);
  };

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  return (
    <div className="pb-48 sm:pb-32">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 text-lg">◀</button>
          <h2 className="text-lg font-bold text-slate-800">{year}年{month + 1}月</h2>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 text-lg">▶</button>
        </div>
        {deadline && (
          <div className={`text-xs px-2.5 py-1.5 rounded-lg ${isDeadlinePassed ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
            締切 {new Date(deadline).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* シフト凡例 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 mb-4">
        <p className="text-[10px] font-semibold text-slate-400 mb-2 uppercase tracking-wide">シフト種別</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SHIFT_LIST.map(type => {
            const p = SHIFT_PRESETS[type];
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: SHIFT_COLORS[type] }}>{type}</span>
                <span className="text-[11px] text-slate-500">{p.start}〜{p.end}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center bg-slate-400 text-white text-[10px] font-bold flex-shrink-0">自</span>
            <span className="text-[11px] text-slate-500">カスタム</span>
          </div>
        </div>
      </div>

      {isDeadlinePassed && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
          締切を過ぎているため変更できません
        </div>
      )}

      {/* 日付リスト */}
      <div className="space-y-1.5">
        {days.map(day => {
          const key = formatDate(day);
          const s = shifts[key] ?? defaultDay();
          const dow = day.getDay();
          const isRed = dow === 0;
          const isBlue = dow === 6;

          return (
            <div key={key} className={`bg-white rounded-2xl border flex items-center px-4 py-3 gap-3 ${s.dirty ? 'border-blue-300' : 'border-slate-200'}`}>
              {/* 日付 */}
              <div className={`w-14 flex-shrink-0 text-sm font-bold ${isRed ? 'text-red-500' : isBlue ? 'text-blue-500' : 'text-slate-700'}`}>
                {getDayLabel(day)}
              </div>

              {/* シフト表示 */}
              <div className="flex-1 min-w-0">
                {s.shiftType ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: SHIFT_COLORS[s.shiftType] }}>
                      {s.shiftType === 'custom' ? `${s.startTime}〜${s.endTime}` : `${s.shiftType}  ${s.startTime}〜${s.endTime}`}
                    </span>
                    {s.dirty && <span className="text-[10px] text-blue-500 font-medium">未提出</span>}
                    {!s.dirty && s.status === 'confirmed' && <span className="text-[10px] text-green-600 font-medium">確定</span>}
                  </div>
                ) : (
                  <span className="text-sm text-slate-300">{s.dirty ? '休み（未提出）' : '—'}</span>
                )}
                {s.comment && <p className="text-xs text-slate-400 mt-0.5 truncate">{s.comment}</p>}
              </div>

              {/* 入力ボタン */}
              {!isDeadlinePassed && (
                <button
                  onClick={() => openPopup(key, day)}
                  className="flex-shrink-0 w-16 h-9 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 text-xs font-medium transition-colors active:scale-95"
                >
                  入力
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* まとめて提出ボタン（固定フッター） */}
      {!isDeadlinePassed && (
        <div className="fixed bottom-14 sm:bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-200">
          <button
            onClick={handleSubmitAll}
            disabled={dirtyCount === 0 || submitting}
            className={`w-full h-14 rounded-2xl text-base font-bold transition-all active:scale-[0.98] ${
              submitDone
                ? 'bg-green-500 text-white'
                : dirtyCount === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white shadow-lg shadow-blue-200'
            }`}
          >
            {submitting ? '提出中…' : submitDone ? '✓ 提出完了' : dirtyCount > 0 ? `${dirtyCount}日分をまとめて提出` : '変更なし'}
          </button>
        </div>
      )}

      {/* ポップアップ（ボトムシート） */}
      {popup && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={closePopup}>
          <div className="bg-black/40 absolute inset-0" />
          <div
            className="relative bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* ハンドル */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

            <h3 className="text-base font-bold text-slate-800 mb-4">
              {getDayLabel(popup.day)} のシフト
            </h3>

            {/* シフト種別ボタン */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SHIFT_LIST.map(type => {
                const p = SHIFT_PRESETS[type];
                const selected = editShift.shiftType === type;
                return (
                  <button
                    key={type}
                    onClick={() => selectType(type)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all active:scale-[0.97] text-left ${
                      selected ? 'border-transparent text-white' : 'border-slate-100 bg-slate-50 text-slate-700'
                    }`}
                    style={selected ? { backgroundColor: SHIFT_COLORS[type] } : {}}
                  >
                    <span className={`text-xl font-black ${selected ? 'text-white' : ''}`}>{type}</span>
                    <span className={`text-xs leading-tight ${selected ? 'text-white/90' : 'text-slate-500'}`}>
                      {p.start}<br />〜{p.end}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* カスタム */}
            <button
              onClick={() => selectType('custom')}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 mb-2 transition-all ${
                editShift.shiftType === 'custom' ? 'border-slate-600 bg-slate-600 text-white' : 'border-slate-100 bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-bold">カスタム</span>
              <span className={`text-xs ${editShift.shiftType === 'custom' ? 'text-white/80' : 'text-slate-400'}`}>30分刻みで指定</span>
            </button>

            {editShift.shiftType === 'custom' && (
              <div className="flex items-center gap-2 mb-3 px-1">
                <select value={editShift.startTime} onChange={e => setEditShift(ev => ({ ...ev, startTime: e.target.value }))}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-slate-400">〜</span>
                <select value={editShift.endTime} onChange={e => setEditShift(ev => ({ ...ev, endTime: e.target.value }))}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {/* 休み */}
            <button
              onClick={() => selectType(null)}
              className={`w-full p-3.5 rounded-2xl border-2 mb-4 font-medium transition-all ${
                editShift.shiftType === null ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-slate-100 bg-slate-50 text-slate-400'
              }`}
            >
              休み / 申請なし
            </button>

            {/* コメント */}
            <input
              type="text"
              placeholder="コメント（任意）"
              value={editShift.comment}
              onChange={e => setEditShift(ev => ({ ...ev, comment: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300"
            />

            {/* 決定 */}
            <button
              onClick={applyEdit}
              className="w-full h-13 py-3.5 bg-blue-600 text-white rounded-2xl font-bold text-base active:scale-[0.98] transition-transform"
            >
              決定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
