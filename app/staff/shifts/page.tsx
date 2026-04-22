'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getDaysInMonth,
  formatDate,
  formatYM,
  getDayLabel,
  generateTimeSlots,
  isWeekend,
} from '@/lib/shifts';
import { SHIFT_PRESETS, SHIFT_COLORS, type Shift, type ShiftType } from '@/lib/types';

const TIME_SLOTS = generateTimeSlots();

interface DayShift {
  shiftType: ShiftType | null;
  startTime: string;
  endTime: string;
  comment: string;
  saved: boolean;
  saving: boolean;
  existingId?: string;
}

const defaultDay = (): DayShift => ({
  shiftType: null,
  startTime: '08:00',
  endTime: '17:00',
  comment: '',
  saved: false,
  saving: false,
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

  useEffect(() => {
    setDays(getDaysInMonth(year, month));
  }, [year, month]);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'deadline')
      .single()
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
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', `${ym}-01`)
      .lte('date', `${ym}-31`);

    const map: Record<string, DayShift> = {};
    (data ?? []).forEach((s: Shift) => {
      map[s.date] = {
        shiftType: s.shift_type,
        startTime: s.start_time,
        endTime: s.end_time,
        comment: s.comment ?? '',
        saved: true,
        saving: false,
        existingId: s.id,
      };
    });
    setShifts((prev) => {
      const next: Record<string, DayShift> = {};
      getDaysInMonth(year, month).forEach((d) => {
        const key = formatDate(d);
        next[key] = map[key] ?? defaultDay();
      });
      return next;
    });
  }, [user, year, month]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  const updateShift = (date: string, patch: Partial<DayShift>) => {
    setShifts((prev) => ({
      ...prev,
      [date]: { ...prev[date], ...patch, saved: false },
    }));
  };

  const selectShiftType = (date: string, type: ShiftType | null) => {
    if (type && type !== 'custom') {
      const preset = SHIFT_PRESETS[type as Exclude<ShiftType, 'custom'>];
      setShifts((prev) => ({
        ...prev,
        [date]: { ...prev[date], shiftType: type, startTime: preset.start, endTime: preset.end, saved: false },
      }));
    } else {
      setShifts((prev) => ({
        ...prev,
        [date]: { ...prev[date], shiftType: type, saved: false },
      }));
    }
  };

  const saveDay = async (date: string) => {
    if (!user || isDeadlinePassed) return;
    const s = shifts[date];
    if (!s || !s.shiftType) {
      // Delete if exists
      if (s?.existingId) {
        await supabase.from('shifts').delete().eq('id', s.existingId);
        setShifts((prev) => ({
          ...prev,
          [date]: { ...defaultDay(), saved: true },
        }));
      }
      return;
    }
    setShifts((prev) => ({ ...prev, [date]: { ...prev[date], saving: true } }));
    const payload = {
      user_id: user.id,
      date,
      shift_type: s.shiftType,
      start_time: s.startTime,
      end_time: s.endTime,
      comment: s.comment,
      status: 'draft' as const,
    };
    if (s.existingId) {
      await supabase.from('shifts').update(payload).eq('id', s.existingId);
    } else {
      const { data } = await supabase.from('shifts').insert(payload).select().single();
      if (data) {
        setShifts((prev) => ({ ...prev, [date]: { ...prev[date], existingId: data.id } }));
      }
    }
    setShifts((prev) => ({ ...prev, [date]: { ...prev[date], saving: false, saved: true } }));
  };

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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">◀</button>
          <h2 className="text-xl font-bold text-slate-800">{year}年{month + 1}月</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">▶</button>
        </div>
        {deadline && (
          <div className={`text-sm px-3 py-1.5 rounded-lg ${isDeadlinePassed ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
            締切: {deadline} {isDeadlinePassed ? '（締切済み）' : ''}
          </div>
        )}
      </div>

      {isDeadlinePassed && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          締切を過ぎているため、シフトを変更できません。
        </div>
      )}

      {/* Day list */}
      <div className="space-y-2">
        {days.map((day) => {
          const key = formatDate(day);
          const s = shifts[key] ?? defaultDay();
          const isWE = isWeekend(day);
          return (
            <div
              key={key}
              className={`bg-white rounded-xl border p-4 ${isWE ? 'border-slate-200 bg-slate-50' : 'border-slate-200'}`}
            >
              <div className="flex flex-wrap items-start gap-3">
                {/* Date label */}
                <div className={`w-20 font-semibold text-sm pt-1 flex-shrink-0 ${
                  day.getDay() === 0 ? 'text-red-500' : day.getDay() === 6 ? 'text-blue-500' : 'text-slate-700'
                }`}>
                  {getDayLabel(day)}
                </div>

                {/* Shift type buttons */}
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {(Object.keys(SHIFT_PRESETS) as Exclude<ShiftType, 'custom'>[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => !isDeadlinePassed && selectShiftType(key, type)}
                      disabled={isDeadlinePassed}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        s.shiftType === type
                          ? 'text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      style={s.shiftType === type ? { backgroundColor: SHIFT_COLORS[type] } : {}}
                    >
                      {type}
                    </button>
                  ))}
                  <button
                    onClick={() => !isDeadlinePassed && selectShiftType(key, 'custom')}
                    disabled={isDeadlinePassed}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      s.shiftType === 'custom'
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    カスタム
                  </button>
                  <button
                    onClick={() => !isDeadlinePassed && selectShiftType(key, null)}
                    disabled={isDeadlinePassed}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      s.shiftType === null
                        ? 'bg-slate-300 text-slate-700'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    休み
                  </button>
                </div>

                {/* Time display / custom picker */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.shiftType && s.shiftType !== 'custom' && (
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                      {s.startTime}〜{s.endTime}
                    </span>
                  )}
                  {s.shiftType === 'custom' && (
                    <div className="flex items-center gap-1">
                      <select
                        value={s.startTime}
                        onChange={(e) => updateShift(key, { startTime: e.target.value })}
                        disabled={isDeadlinePassed}
                        className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white disabled:opacity-50"
                      >
                        {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-slate-400 text-xs">〜</span>
                      <select
                        value={s.endTime}
                        onChange={(e) => updateShift(key, { endTime: e.target.value })}
                        disabled={isDeadlinePassed}
                        className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white disabled:opacity-50"
                      >
                        {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Save button */}
                {!isDeadlinePassed && (
                  <button
                    onClick={() => saveDay(key)}
                    disabled={s.saving || s.saved}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex-shrink-0 ${
                      s.saved
                        ? 'bg-green-100 text-green-700'
                        : s.saving
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {s.saving ? '保存中…' : s.saved ? '✓ 保存済' : '保存'}
                  </button>
                )}
              </div>

              {/* Comment */}
              {s.shiftType && !isDeadlinePassed && (
                <div className="mt-2 ml-20">
                  <input
                    type="text"
                    placeholder="コメント（任意）"
                    value={s.comment}
                    onChange={(e) => updateShift(key, { comment: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              )}
              {s.shiftType && isDeadlinePassed && s.comment && (
                <div className="mt-1 ml-20 text-xs text-slate-500">{s.comment}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
