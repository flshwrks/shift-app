'use client';
import { getDaysInMonth, formatDate, timeToMinutes } from '@/lib/shifts';
import { SHIFT_COLORS, type Shift } from '@/lib/types';
import type { User } from '@/lib/types';

const HOUR_HEIGHT = 56; // px per hour
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR; // 14
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const COL_WIDTH = 100; // px per day column

const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

interface StaffCount { green: boolean; yellow: boolean; }

function getCountColor(count: number): string {
  if (count >= 2) return '#22C55E';
  if (count === 1) return '#F59E0B';
  return '#EF4444';
}

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

  // Group shifts by date
  const shiftsByDate: Record<string, Shift[]> = {};
  shifts.forEach((s) => {
    if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
    shiftsByDate[s.date].push(s);
  });

  // Compute count per 30-min slot per date
  function getSlotCounts(date: string): number[] {
    const dayShifts = shiftsByDate[date] ?? [];
    // 28 slots: 8:00 to 21:30 (each 30 min)
    return Array.from({ length: 28 }, (_, i) => {
      const slotStart = (START_HOUR * 60) + i * 30;
      const slotEnd = slotStart + 30;
      return dayShifts.filter((s) => {
        const sStart = timeToMinutes(s.start_time);
        const sEnd = timeToMinutes(s.end_time);
        return sStart < slotEnd && sEnd > slotStart;
      }).length;
    });
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <div className="flex">
        {/* Time axis */}
        <div className="flex-shrink-0 w-14 border-r border-slate-200">
          <div className="h-8 border-b border-slate-200 bg-slate-50" />
          <div className="relative" style={{ height: TOTAL_HEIGHT }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-center"
                style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 8 }}
              >
                <span className="text-[10px] text-slate-400 pl-1 leading-none">
                  {h}:00
                </span>
              </div>
            ))}
            {/* Hour grid lines */}
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-slate-100"
                style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
              />
            ))}
          </div>
          {/* Count legend row */}
          <div className="h-16 border-t border-slate-200 bg-slate-50" />
        </div>

        {/* Days */}
        <div className="flex overflow-x-auto">
          {days.map((day) => {
            const dateStr = formatDate(day);
            const dayShifts = shiftsByDate[dateStr] ?? [];
            const counts = getSlotCounts(dateStr);
            const dow = day.getDay();

            return (
              <div key={dateStr} className="flex-shrink-0 border-r border-slate-200" style={{ width: COL_WIDTH }}>
                {/* Date header */}
                <div
                  className={`h-8 border-b border-slate-200 bg-slate-50 flex items-center justify-center text-xs font-medium ${
                    dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-600'
                  }`}
                >
                  {day.getDate()}日
                </div>

                {/* Shift blocks */}
                <div className="relative" style={{ height: TOTAL_HEIGHT }}>
                  {/* 人数不足の背景色（8:00〜9:00は1人でOK） */}
                  {counts.map((count, i) => {
                    const isEarly = i < 2; // 8:00〜9:00（slot 0, 1）
                    const needsRed = count === 0;
                    const needsYellow = count === 1 && !isEarly;
                    if (!needsRed && !needsYellow) return null;
                    return (
                      <div
                        key={`alert-${i}`}
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{
                          top: (i * 30 / 60) * HOUR_HEIGHT,
                          height: (30 / 60) * HOUR_HEIGHT,
                          backgroundColor: needsRed ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                        }}
                      />
                    );
                  })}

                  {/* Hour grid */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-slate-100"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                    />
                  ))}
                  {/* 30-min lines */}
                  {HOURS.slice(0, -1).map((h) => (
                    <div
                      key={`${h}h`}
                      className="absolute left-0 right-0 border-t border-dashed border-slate-50"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                    />
                  ))}

                  {/* Staff blocks */}
                  {dayShifts.map((s, si) => {
                    const startMin = timeToMinutes(s.start_time);
                    const endMin = timeToMinutes(s.end_time);
                    const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                    const user = users.find((u) => u.id === s.user_id);
                    const widthPct = dayShifts.length > 1 ? 100 / dayShifts.length : 100;
                    const leftPct = (si / dayShifts.length) * 100;

                    return (
                      <div
                        key={s.id}
                        className="absolute overflow-hidden rounded-sm flex flex-col justify-start pt-0.5 px-0.5"
                        style={{
                          top,
                          height: Math.max(height, 16),
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: SHIFT_COLORS[s.shift_type] + 'DD',
                          borderLeft: `2px solid ${SHIFT_COLORS[s.shift_type]}`,
                        }}
                      >
                        <span className="text-white text-[9px] font-bold leading-tight truncate">
                          {user?.name ?? '?'}
                        </span>
                        {height > 30 && (
                          <span className="text-white/80 text-[8px] leading-tight">
                            {s.start_time}〜{s.end_time}
                          </span>
                        )}
                        {isAdmin && s.status === 'draft' && onConfirm && height > 24 && (
                          <button
                            onClick={() => onConfirm(s.id)}
                            className="text-[8px] bg-white/20 hover:bg-white/30 text-white rounded mt-0.5 leading-tight px-0.5"
                          >
                            確定
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Count bars (bottom) */}
                <div className="h-16 border-t border-slate-200 bg-slate-50 flex gap-px px-0.5 pt-1 overflow-hidden">
                  {counts.map((count, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-[1px] min-w-0"
                      style={{
                        backgroundColor: getCountColor(count),
                        opacity: 0.7,
                        minHeight: count > 0 ? 4 : 2,
                        alignSelf: 'flex-end',
                        height: count === 0 ? 2 : count === 1 ? 8 : 16,
                      }}
                      title={`${8 + Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'} — ${count}人`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        <span className="font-medium">人数:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#22C55E' }} /> 2人以上</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#F59E0B' }} /> 1人</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#EF4444' }} /> 0人</span>
      </div>
    </div>
  );
}
