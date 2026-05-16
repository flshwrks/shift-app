'use client';
import { useState, useEffect } from 'react';
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
const MEMO_HEIGHT = 32;

const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

interface Props {
  year: number;
  month: number;
  users: User[];
  shifts: Shift[];
  memos?: Record<string, string>;
  onMemoChange?: (date: string, value: string) => void;
  isAdmin?: boolean;
  currentUserId?: string;
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

function MemoCell({ value, onChange, expanded }: { value: string; onChange?: (v: string) => void; expanded: boolean }) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => { setLocal(value); }, [value]);

  if (onChange && editing) {
    return (
      <textarea
        autoFocus
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { setEditing(false); if (local !== value) onChange(local); }}
        rows={3}
        className="w-full text-[10px] text-slate-700 bg-blue-50 rounded px-1 py-0.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300 leading-relaxed"
      />
    );
  }

  return (
    <div
      onClick={() => onChange && setEditing(true)}
      className={`w-full text-[10px] break-words whitespace-pre-wrap leading-relaxed px-1 ${
        expanded ? '' : 'line-clamp-2'
      } ${value ? 'text-slate-600' : 'text-slate-300'} ${onChange ? 'cursor-text' : ''}`}
    >
      {value || (onChange ? 'メモ' : '')}
    </div>
  );
}

export default function TimelineView({ year, month, users, shifts, memos = {}, onMemoChange, isAdmin, currentUserId, onConfirm, onShiftClick }: Props) {
  const days = getDaysInMonth(year, month);
  const minWidth = TIME_COL_WIDTH + COL_WIDTH * days.length;
  const [allExpanded, setAllExpanded] = useState(false);
  const hasMemos = Object.values(memos).some(v => v);

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
      <div className="overflow-auto">
        <div style={{ minWidth }}>

          {/* ===== 日付ヘッダー行（sticky top） ===== */}
          <div className="flex sticky top-0 z-20 border-b border-slate-200" style={{ minWidth }}>
            <div
              className="flex-shrink-0 sticky left-0 z-30 bg-slate-50 border-r border-slate-200"
              style={{ width: TIME_COL_WIDTH, height: HEADER_HEIGHT }}
            />
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

          {/* ===== メモ行 ===== */}
          <div className="flex border-b border-slate-200" style={{ minWidth }}>
            <div
              className="flex-shrink-0 sticky left-0 z-10 bg-white border-r border-slate-200 flex flex-col items-start px-2 pt-2 gap-0.5"
              style={{ width: TIME_COL_WIDTH, minHeight: MEMO_HEIGHT }}
            >
              <span className="text-[9px] text-slate-400 leading-none">メモ</span>
              {hasMemos && (
                <button
                  onClick={() => setAllExpanded(v => !v)}
                  className="text-[9px] text-blue-400 hover:text-blue-600 leading-none"
                  title={allExpanded ? 'すべて閉じる' : 'すべて展開'}
                >
                  {allExpanded ? '▲' : '▼'}
                </button>
              )}
            </div>
            {days.map((day) => {
              const dateStr = formatDate(day);
              return (
                <div
                  key={dateStr}
                  className="flex-shrink-0 border-r border-slate-100 flex items-start py-1.5"
                  style={{ width: COL_WIDTH, minHeight: MEMO_HEIGHT }}
                >
                  <MemoCell
                    value={memos[dateStr] ?? ''}
                    expanded={allExpanded}
                    onChange={isAdmin && onMemoChange ? (v) => onMemoChange(dateStr, v) : undefined}
                  />
                </div>
              );
            })}
          </div>

          {/* ===== シフトエリア行 ===== */}
          <div className="flex">
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

                  {HOURS.map((h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-slate-200"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
                  ))}
                  {HOURS.slice(0, -1).map((h) => (
                    <div key={`hh${h}`} className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  ))}

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
                    const isMe = currentUserId != null && s.user_id === currentUserId;
                    const isOther = currentUserId != null && !isMe;

                    return (
                      <div
                        key={s.id}
                        className="absolute overflow-hidden flex flex-col cursor-pointer hover:brightness-110 transition-[filter]"
                        style={{
                          top,
                          height: Math.max(height, 28),
                          left: l,
                          width: w,
                          backgroundColor: SHIFT_COLORS[s.shift_type] + (isOther ? '70' : 'CC'),
                          borderLeft: `${isMe ? 4 : 3}px solid ${SHIFT_COLORS[s.shift_type]}`,
                          boxShadow: isMe ? `0 0 0 1.5px white, 0 0 0 2.5px ${SHIFT_COLORS[s.shift_type]}` : undefined,
                          opacity: isOther ? 0.7 : 1,
                        }}
                        onClick={() => onShiftClick?.(s)}
                        title={`${name}  ${s.start_time}〜${s.end_time}${s.comment ? `  ${s.comment}` : ''}`}
                      >
                        <div className="flex items-start justify-between px-1 pt-0.5 gap-0.5">
                          <span className="text-white text-[10px] font-bold leading-tight drop-shadow-sm flex-1 min-w-0"
                            style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: w >= 60 ? 'ellipsis' : 'clip' }}>
                            {w >= 60 ? name : name.slice(0, 2)}
                          </span>
                          {s.comment && w >= 48 && (
                            <span className="w-2 h-2 rounded-full bg-white flex-shrink-0 mt-px opacity-90" />
                          )}
                        </div>
                        <span className="text-white/90 text-[9px] leading-tight truncate px-1">
                          {s.start_time}〜{s.end_time}
                        </span>
                        {isAdmin && s.status === 'draft' && onConfirm && height > 44 && (
                          <button
                            onClick={e => { e.stopPropagation(); onConfirm(s.id); }}
                            className="mx-1 mb-0.5 mt-auto text-[9px] bg-white/30 hover:bg-white/50 text-white rounded px-1 py-px"
                          >
                            確定する
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* ===== 人数バー行 ===== */}
          <div className="flex border-t-2 border-slate-300" style={{ minWidth }}>
            <div
              className="flex-shrink-0 sticky left-0 z-10 bg-slate-50 border-r border-slate-200"
              style={{ width: TIME_COL_WIDTH, height: COUNT_BAR_HEIGHT }}
            >
              <span className="text-[9px] text-slate-400 pl-1.5 pt-1 block leading-none">人数</span>
            </div>
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
