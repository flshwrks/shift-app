'use client';
import { getDaysInMonth, formatDate, timeToMinutes } from '@/lib/shifts';
import { SHIFT_COLORS, type Shift } from '@/lib/types';
import type { User } from '@/lib/types';

const HOUR_HEIGHT = 64;
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const COL_WIDTH = 128;
const TIME_COL_WIDTH = 44;
const COUNT_BAR_HEIGHT = 48;
const HEADER_HEIGHT = 40;

const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

interface Props {
  year: number;
  month: number;
  users: User[];
  shifts: Shift[];
  isAdmin?: boolean;
  onConfirm?: (shiftId: string) => void;
  onShiftClick?: (shift: Shift) => void;
}

function assignLanes(shifts: Shift[]): Map<string, { lane: number; totalLanes: number }> {
  if (shifts.length === 0) return new Map();
  const sorted = [...shifts].sort((a, b) =>
    timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  );
  const laneEnds: number[] = [];
  const laneOf = new Map<string, number>();
  for (const s of sorted) {
    const start = timeToMinutes(s.start_time);
    const end = timeToMinutes(s.end_time);
    let lane = laneEnds.findIndex(e => e <= start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(end); }
    else laneEnds[lane] = end;
    laneOf.set(s.id, lane);
  }
  const totalLanes = laneEnds.length;
  const result = new Map<string, { lane: number; totalLanes: number }>();
  laneOf.forEach((lane, id) => result.set(id, { lane, totalLanes }));
  return result;
}

export default function TimelineView({ year, month, users, shifts, isAdmin, onConfirm, onShiftClick }: Props) {
  const days = getDaysInMonth(year, month);
  const minWidth = TIME_COL_WIDTH + COL_WIDTH * days.length;

  const shiftsByDate: Record<string, Shift[]> = {};
  shifts.forEach((s) => {
    if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
    shiftsByDate[s.date].push(s);
  });

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

  function slotBg(count: number, i: number): string | null {
    if (count === 0) return 'rgba(239,68,68,0.28)';
    if (count === 1 && i >= 2) return 'rgba(245,158,11,0.22)';
    return null;
  }

  function barColor(count: number, i: number): string {
    if (count === 0) return '#EF4444';
    if (count === 1 && i >= 2) return '#F59E0B';
    return '#22C55E';
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {/* スクロールコンテナ（overflow-auto が sticky の基準になる） */}
      <div className="overflow-auto">
        <div style={{ minWidth }}>

          {/* ===== 日付ヘッダー行（sticky top） ===== */}
          <div
            className="flex sticky top-0 z-20 border-b border-slate-200"
            style={{ minWidth }}
          >
            {/* コーナー（sticky top + left） */}
            <div
              className="flex-shrink-0 sticky left-0 z-30 bg-slate-50 border-r border-slate-200"
              style={{ width: TIME_COL_WIDTH, height: HEADER_HEIGHT }}
            />
            {/* 日付セル */}
            {days.map((day) => {
              const dow = day.getDay();
              const isSun = dow === 0;
              const isSat = dow === 6;
              return (
                <div
                  key={formatDate(day)}
                  className={`flex-shrink-0 border-r border-slate-100 flex flex-col items-center justify-center gap-px ${
                    isSun ? 'bg-red-50' : isSat ? 'bg-blue-50' : 'bg-slate-50'
                  }`}
                  style={{ width: COL_WIDTH, height: HEADER_HEIGHT }}
                >
                  <span className={`text-[11px] font-bold leading-none ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-slate-700'}`}>
                    {day.getDate()}
                  </span>
                  <span className={`text-[9px] leading-none ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                    {'日月火水木金土'[dow]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ===== シフトエリア行 ===== */}
          <div className="flex">
            {/* 時刻軸（sticky left） */}
            <div
              className="flex-shrink-0 sticky left-0 z-10 bg-white border-r border-slate-200 relative"
              style={{ width: TIME_COL_WIDTH, height: TOTAL_HEIGHT }}
            >
              {HOURS.map((h) => (
                <div key={h} className="absolute left-0 right-0" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}>
                  <div className="absolute top-0 left-0 right-0 border-t border-slate-200" />
                  <span className="text-[10px] text-slate-400 pl-1.5 block -translate-y-2 leading-none">{h}:00</span>
                </div>
              ))}
            </div>

            {/* 日付ごとのシフト列 */}
            {days.map((day) => {
              const dateStr = formatDate(day);
              const dayShifts = shiftsByDate[dateStr] ?? [];
              const counts = getSlotCounts(dateStr);
              const laneMap = assignLanes(dayShifts);
              const dow = day.getDay();
              const isSun = dow === 0;
              const isSat = dow === 6;

              return (
                <div
                  key={dateStr}
                  className={`flex-shrink-0 border-r border-slate-100 relative ${isSun ? 'bg-red-50/30' : isSat ? 'bg-blue-50/20' : ''}`}
                  style={{ width: COL_WIDTH, height: TOTAL_HEIGHT }}
                >
                  {/* 人数不足の背景 */}
                  {counts.map((count, i) => {
                    const bg = slotBg(count, i);
                    if (!bg) return null;
                    return (
                      <div key={`bg-${i}`} className="absolute left-0 right-0 pointer-events-none"
                        style={{
                          top: (i * 30 / 60) * HOUR_HEIGHT,
                          height: (30 / 60) * HOUR_HEIGHT,
                          backgroundColor: bg,
                        }}
                      />
                    );
                  })}

                  {/* グリッド線 */}
                  {HOURS.map((h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-slate-200"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
                  ))}
                  {HOURS.slice(0, -1).map((h) => (
                    <div key={`hh${h}`} className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  ))}

                  {/* シフトブロック */}
                  {dayShifts.map((s) => {
                    const { lane, totalLanes } = laneMap.get(s.id) ?? { lane: 0, totalLanes: 1 };
                    const startMin = timeToMinutes(s.start_time);
                    const endMin = timeToMinutes(s.end_time);
                    const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                    const w = COL_WIDTH / totalLanes;
                    const l = (lane / totalLanes) * COL_WIDTH;
                    const staffUser = users.find((u) => u.id === s.user_id);
                    const name = staffUser?.name ?? '?';

                    return (
                      <div
                        key={s.id}
                        className="absolute overflow-hidden flex flex-col cursor-pointer hover:brightness-110 transition-[filter]"
                        style={{
                          top,
                          height: Math.max(height, 28),
                          left: l,
                          width: w,
                          backgroundColor: SHIFT_COLORS[s.shift_type] + 'CC',
                          borderLeft: `3px solid ${SHIFT_COLORS[s.shift_type]}`,
                        }}
                        onClick={() => onShiftClick?.(s)}
                        title={`${name}  ${s.start_time}〜${s.end_time}${s.comment ? `  ${s.comment}` : ''}`}
                      >
                        {/* 名前行（フルネーム・省略なし） */}
                        <div className="flex items-start justify-between px-1 pt-0.5 gap-0.5">
                          <span className="text-white text-[10px] font-bold leading-tight truncate drop-shadow-sm flex-1 min-w-0">
                            {name}
                          </span>
                          {s.comment && (
                            <span className="w-2 h-2 rounded-full bg-white flex-shrink-0 mt-px opacity-90" />
                          )}
                        </div>
                        {/* 時間行（常時表示） */}
                        <span className="text-white/90 text-[9px] leading-tight truncate px-1">
                          {s.start_time}〜{s.end_time}
                        </span>
                        {isAdmin && s.status === 'draft' && onConfirm && height > 44 && (
                          <button
                            onClick={e => { e.stopPropagation(); onConfirm(s.id); }}
                            className="mx-1 mb-0.5 mt-auto text-[9px] bg-white/30 hover:bg-white/50 text-white rounded px-1 py-px"
                          >
                            確定
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* ===== 人数バー行（sticky bottom はブラウザ互換が低いので省略） ===== */}
          <div className="flex border-t-2 border-slate-300" style={{ minWidth }}>
            {/* ラベル（sticky left） */}
            <div
              className="flex-shrink-0 sticky left-0 z-10 bg-slate-50 border-r border-slate-200"
              style={{ width: TIME_COL_WIDTH, height: COUNT_BAR_HEIGHT }}
            >
              <span className="text-[9px] text-slate-400 pl-1.5 pt-1 block leading-none">人数</span>
            </div>
            {/* バー */}
            {days.map((day) => {
              const dateStr = formatDate(day);
              const counts = getSlotCounts(dateStr);
              return (
                <div
                  key={dateStr}
                  className="flex-shrink-0 bg-slate-50 flex items-end px-px pb-px gap-px border-r border-slate-100"
                  style={{ width: COL_WIDTH, height: COUNT_BAR_HEIGHT }}
                >
                  {counts.map((count, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-[1px] min-w-0"
                      style={{
                        backgroundColor: barColor(count, i),
                        height: count === 0 ? 4 : count === 1 ? 12 : Math.min(6 + count * 6, COUNT_BAR_HEIGHT - 4),
                      }}
                      title={`${8 + Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'} — ${count}人`}
                    />
                  ))}
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        <span className="font-medium text-slate-600">人数:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-green-500" /> 2人以上</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-amber-400" /> 1人 (注意)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-red-500" /> 0人 (要対応)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-slate-400" /> コメントあり</span>
      </div>
    </div>
  );
}
