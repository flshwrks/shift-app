'use client';
import { getDaysInMonth, formatDate, timeToMinutes } from '@/lib/shifts';
import { SHIFT_COLORS, type Shift } from '@/lib/types';
import type { User } from '@/lib/types';

const HOUR_HEIGHT = 64;
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR; // 14
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const COL_WIDTH = 112;
const TIME_COL_WIDTH = 44;

const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

interface Props {
  year: number;
  month: number;
  users: User[];
  shifts: Shift[];
  isAdmin?: boolean;
  onConfirm?: (shiftId: string) => void;
}

export default function TimelineView({ year, month, users, shifts, isAdmin, onConfirm }: Props) {
  const days = getDaysInMonth(year, month);

  const shiftsByDate: Record<string, Shift[]> = {};
  shifts.forEach((s) => {
    if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
    shiftsByDate[s.date].push(s);
  });

  // 30分スロット×28 の人数を返す
  function getSlotCounts(date: string): number[] {
    const dayShifts = shiftsByDate[date] ?? [];
    return Array.from({ length: 28 }, (_, i) => {
      const slotStart = START_HOUR * 60 + i * 30;
      const slotEnd = slotStart + 30;
      return dayShifts.filter((s) => {
        const sStart = timeToMinutes(s.start_time);
        const sEnd = timeToMinutes(s.end_time);
        return sStart < slotEnd && sEnd > slotStart;
      }).length;
    });
  }

  // スロット index が 8:00〜9:00 かどうか（1人でOKな時間帯）
  const isEarlySlot = (i: number) => i < 2;

  function slotBg(count: number, slotIdx: number): string {
    if (count === 0) return 'rgba(239,68,68,0.28)';
    if (count === 1 && !isEarlySlot(slotIdx)) return 'rgba(245,158,11,0.22)';
    return 'transparent';
  }

  function heatmapColor(count: number, hourIdx: number): string {
    const early = hourIdx === 0; // 8:00〜9:00
    if (count === 0) return '#FCA5A5';   // red-300
    if (count === 1 && !early) return '#FCD34D'; // amber-300
    if (count === 1 && early) return '#86EFAC';  // green-300
    if (count === 2) return '#4ADE80';   // green-400
    return '#16A34A';                    // green-600 (3人以上)
  }

  function heatmapText(count: number, hourIdx: number): string {
    const early = hourIdx === 0;
    if (count === 0) return 'text-red-700';
    if (count === 1 && !early) return 'text-amber-800';
    return 'text-green-800';
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-auto">
        <div className="flex" style={{ minWidth: TIME_COL_WIDTH + COL_WIDTH * days.length }}>

          {/* 時刻軸 */}
          <div className="flex-shrink-0 sticky left-0 z-10 bg-white border-r border-slate-200" style={{ width: TIME_COL_WIDTH }}>
            {/* ヘッダー空白 */}
            <div className="h-10 border-b border-slate-200 bg-slate-50" />
            {/* 時刻ラベル */}
            <div className="relative bg-white" style={{ height: TOTAL_HEIGHT }}>
              {HOURS.map((h) => (
                <div key={h} className="absolute left-0 right-0" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}>
                  <span className="text-[10px] text-slate-400 pl-1.5 leading-none block -translate-y-2">
                    {h}:00
                  </span>
                  <div className="absolute top-0 left-0 right-0 border-t border-slate-200" />
                </div>
              ))}
            </div>
            {/* ヒートマップ行ラベル */}
            <div className="border-t-2 border-slate-300 bg-slate-50" style={{ height: TOTAL_HOURS * 20 + 8 }}>
              <span className="text-[9px] text-slate-400 pl-1.5 pt-1 block">人数</span>
            </div>
          </div>

          {/* 日付カラム */}
          {days.map((day) => {
            const dateStr = formatDate(day);
            const dayShifts = shiftsByDate[dateStr] ?? [];
            const counts = getSlotCounts(dateStr);
            const dow = day.getDay();
            const isSun = dow === 0;
            const isSat = dow === 6;

            // 1時間ごとの最低人数（ヒートマップ用）
            const hourCounts = Array.from({ length: TOTAL_HOURS }, (_, hi) => {
              const c0 = counts[hi * 2] ?? 0;
              const c1 = counts[hi * 2 + 1] ?? 0;
              return Math.min(c0, c1);
            });

            return (
              <div
                key={dateStr}
                className={`flex-shrink-0 border-r border-slate-100 ${isSun ? 'bg-red-50/40' : isSat ? 'bg-blue-50/30' : ''}`}
                style={{ width: COL_WIDTH }}
              >
                {/* 日付ヘッダー */}
                <div className={`h-10 border-b border-slate-200 flex flex-col items-center justify-center ${
                  isSun ? 'bg-red-50' : isSat ? 'bg-blue-50' : 'bg-slate-50'
                }`}>
                  <span className={`text-[11px] font-bold ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-slate-700'}`}>
                    {day.getDate()}
                  </span>
                  <span className={`text-[9px] ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                    {'日月火水木金土'[dow]}
                  </span>
                </div>

                {/* シフトエリア */}
                <div className="relative" style={{ height: TOTAL_HEIGHT }}>

                  {/* 人数不足の背景 */}
                  {counts.map((count, i) => {
                    const bg = slotBg(count, i);
                    if (!bg || bg === 'transparent') return null;
                    return (
                      <div
                        key={`bg-${i}`}
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{
                          top: (i * 30 / 60) * HOUR_HEIGHT,
                          height: (30 / 60) * HOUR_HEIGHT,
                          backgroundColor: bg,
                        }}
                      />
                    );
                  })}

                  {/* 時間グリッド */}
                  {HOURS.map((h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-slate-200"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
                  ))}
                  {HOURS.slice(0, -1).map((h) => (
                    <div key={`h${h}`} className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  ))}

                  {/* シフトブロック */}
                  {dayShifts.map((s, si) => {
                    const startMin = timeToMinutes(s.start_time);
                    const endMin = timeToMinutes(s.end_time);
                    const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                    const staffUser = users.find((u) => u.id === s.user_id);
                    const total = dayShifts.length;
                    const w = 100 / total;
                    const l = (si / total) * 100;
                    const isDraft = s.status === 'draft';

                    return (
                      <div
                        key={s.id}
                        className="absolute overflow-hidden flex flex-col"
                        style={{
                          top: top + 1,
                          height: Math.max(height - 2, 14),
                          left: `calc(${l}% + 1px)`,
                          width: `calc(${w}% - 2px)`,
                          backgroundColor: SHIFT_COLORS[s.shift_type] + 'CC',
                          borderLeft: `3px solid ${SHIFT_COLORS[s.shift_type]}`,
                          borderRadius: 4,
                        }}
                      >
                        <div className="flex flex-col px-1 pt-0.5 overflow-hidden">
                          <span className="text-white text-[10px] font-bold leading-tight truncate drop-shadow-sm">
                            {staffUser?.name ?? '?'}
                          </span>
                          {height > 28 && (
                            <span className="text-white/90 text-[9px] leading-tight truncate">
                              {s.start_time}〜{s.end_time}
                            </span>
                          )}
                        </div>
                        {isDraft && isAdmin && onConfirm && height > 36 && (
                          <button
                            onClick={() => onConfirm(s.id)}
                            className="mx-0.5 mb-0.5 mt-auto text-[9px] bg-white/30 hover:bg-white/50 text-white rounded px-1 py-px leading-tight text-center"
                          >
                            確定
                          </button>
                        )}
                        {isDraft && (
                          <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white/60" title="未確定" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ヒートマップ（時間ごとの人数） */}
                <div className="border-t-2 border-slate-300 bg-white" style={{ height: TOTAL_HOURS * 20 + 8 }}>
                  <div className="flex flex-col gap-px px-0.5 py-1">
                    {hourCounts.map((count, hi) => (
                      <div
                        key={hi}
                        className={`flex items-center justify-center rounded-sm text-[9px] font-bold ${heatmapText(count, hi)}`}
                        style={{ height: 16, backgroundColor: heatmapColor(count, hi) }}
                        title={`${START_HOUR + hi}:00〜${START_HOUR + hi + 1}:00 — ${count}人`}
                      >
                        {count}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        <span className="font-medium text-slate-600">人数:</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded inline-flex items-center justify-center text-[9px] font-bold text-green-800" style={{ backgroundColor: '#4ADE80' }}>2</span>2人以上 (正常)</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded inline-flex items-center justify-center text-[9px] font-bold text-amber-800" style={{ backgroundColor: '#FCD34D' }}>1</span>1人 (注意)</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded inline-flex items-center justify-center text-[9px] font-bold text-red-700" style={{ backgroundColor: '#FCA5A5' }}>0</span>0人 (要対応)</span>
        <span className="flex items-center gap-1 text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-white/60 border border-slate-300 inline-block mr-0.5" />未確定</span>
      </div>
    </div>
  );
}
