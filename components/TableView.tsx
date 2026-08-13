'use client';
import { useState, useEffect, forwardRef } from 'react';
import { getDaysInMonth, formatDate, getDayLabel, netWorkMinutes, formatTotalHours } from '@/lib/shifts';
import { SHIFT_PRESETS, SHIFT_COLORS, type Shift, type ShiftType } from '@/lib/types';
import type { User } from '@/lib/types';

interface Props {
  year: number;
  month: number;
  users: User[];
  shifts: Shift[];
  memos?: Record<string, string>;
  onMemoChange?: (date: string, value: string) => void;
  isAdmin?: boolean;
  currentUserId?: string;
  /** 画像出力時 true: 今日ハイライト・操作ボタン・プレースホルダを非表示にする */
  exportMode?: boolean;
  onConfirm?: (shiftId: string) => void;
  onCellClick?: (userId: string, date: string, shift?: Shift) => void;
  onShiftClick?: (shift: Shift) => void;
}

function getShiftLabel(s: Shift): string {
  if (s.shift_type === 'off') return '休み';
  return `${s.shift_type === 'custom' ? '' : s.shift_type + ' '}${s.start_time}〜${s.end_time}`;
}

function calcTotalMinutes(userId: string, shiftMap: Record<string, Record<string, Shift>>): number {
  const userShifts = shiftMap[userId];
  if (!userShifts) return 0;
  return Object.values(userShifts).reduce((sum, s) => s.shift_type === 'off' ? sum : sum + netWorkMinutes(s.start_time, s.end_time), 0);
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
      className={`text-[10px] break-words whitespace-pre-wrap leading-relaxed px-1 ${
        expanded ? '' : 'line-clamp-2'
      } ${value ? 'text-slate-600' : 'text-slate-300'} ${onChange ? 'cursor-text' : ''}`}
    >
      {value || (onChange ? 'メモ' : '')}
    </div>
  );
}

const TableView = forwardRef<HTMLDivElement, Props>(function TableView({ year, month, users, shifts, memos = {}, onMemoChange, isAdmin, currentUserId, exportMode, onConfirm, onCellClick, onShiftClick }, ref) {
  const days = getDaysInMonth(year, month);
  const [allExpanded, setAllExpanded] = useState(false);
  const hasMemos = Object.values(memos).some(v => v);

  const shiftMap: Record<string, Record<string, Shift>> = {};
  shifts.forEach((s) => {
    if (!shiftMap[s.user_id]) shiftMap[s.user_id] = {};
    shiftMap[s.user_id][s.date] = s;
  });

  // 今日ハイライトは閲覧者の文脈情報であり、共有用の出力画像には含めない
  const todayKey = exportMode ? '' : formatDate(new Date());

  // 日ごとの実働時間合計（休みを除く各シフトのnetWorkMinutesを合算）。
  // 「その日に何人出勤しているか」より「その日どれだけ稼働しているか」の方が
  // 人件費・繁閑の把握に直結するため、単純な出勤人数ではなく時間で表示する。
  const dayMinutes: Record<string, number> = {};
  days.forEach((d) => { dayMinutes[formatDate(d)] = 0; });
  shifts.forEach((s) => {
    if (s.shift_type !== 'off' && dayMinutes[s.date] !== undefined) {
      dayMinutes[s.date] += netWorkMinutes(s.start_time, s.end_time);
    }
  });

  return (
    <div ref={ref} className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="border-collapse text-xs min-w-full">
        <thead>
          {/* 日付行 */}
          <tr className="bg-slate-50">
            <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left text-[11px] font-medium text-slate-500 border-b border-r border-slate-200 min-w-[100px] z-10">
              スタッフ
            </th>
            {isAdmin && (
              <th className="px-3 py-3 text-[11px] font-medium text-slate-500 border-b border-r border-slate-200 whitespace-nowrap bg-slate-50 text-center">
                月計
              </th>
            )}
            {days.map((d) => {
              const dow = d.getDay();
              const isToday = formatDate(d) === todayKey;
              return (
                <th
                  key={formatDate(d)}
                  className={`px-2 py-3 text-[11px] font-medium border-b border-r border-slate-100 whitespace-nowrap min-w-[64px] ${
                    isToday ? 'bg-blue-50 text-blue-700 font-semibold' : dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-sky-600' : 'text-slate-500'
                  }`}
                >
                  {getDayLabel(d)}
                </th>
              );
            })}
          </tr>
          {/* メモ行 */}
          <tr className="bg-white border-b border-slate-200">
            <th className="sticky left-0 bg-white px-4 py-1 text-left text-[10px] font-medium text-slate-400 border-r border-slate-200 z-10 whitespace-nowrap align-top">
              <div className="flex items-center gap-1 pt-0.5">
                メモ
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
            </th>
            {isAdmin && <td className="border-r border-slate-100" />}
            {days.map((d) => {
              const key = formatDate(d);
              return (
                <td key={key} className="px-1 py-1 border-r border-slate-100 min-w-[64px]">
                  <MemoCell
                    value={memos[key] ?? ''}
                    expanded={allExpanded}
                    onChange={isAdmin && onMemoChange && !exportMode ? (v) => onMemoChange(key, v) : undefined}
                  />
                </td>
              );
            })}
          </tr>
          {/* 日ごと実働時間行 */}
          <tr className="bg-white border-b border-slate-200">
            <th className="sticky left-0 bg-white px-4 py-1 text-left text-[10px] font-medium text-slate-400 border-r border-slate-200 z-10 whitespace-nowrap">
              実働時間
            </th>
            {isAdmin && <td className="border-r border-slate-100" />}
            {days.map((d) => {
              const key = formatDate(d);
              const minutes = dayMinutes[key] ?? 0;
              return (
                <td key={key} className="px-1 py-1 border-r border-slate-100 min-w-[64px]">
                  <div className={`text-[11px] tabular-nums text-center ${minutes === 0 ? 'text-rose-500 font-semibold' : 'text-slate-600'}`}>
                    {formatTotalHours(minutes)}
                  </div>
                </td>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {users.map((u, ui) => {
            const totalMin = calcTotalMinutes(u.id, shiftMap);
            const isMe = !exportMode && currentUserId === u.id;
            return (
            <tr key={u.id} className={isMe ? 'bg-blue-50/40' : ui % 2 === 0 ? '' : 'bg-slate-50/50'}>
              <td className={`sticky left-0 px-4 py-2.5 font-medium border-r border-slate-200 z-10 whitespace-nowrap ${isMe ? 'bg-blue-50 text-blue-700 border-l-2 border-l-blue-400' : 'bg-white text-slate-700'}`}>
                {u.name}
              </td>
              {isAdmin && (
                <td className="px-3 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                  <span className={`text-xs font-semibold tabular-nums ${totalMin > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                    {formatTotalHours(totalMin)}
                  </span>
                </td>
              )}
              {days.map((d) => {
                const key = formatDate(d);
                const s = shiftMap[u.id]?.[key];
                const isToday = key === todayKey;
                return (
                  <td
                    key={key}
                    className={`group px-1 py-1.5 border-r border-slate-100 text-center align-middle ${isToday ? 'bg-blue-50/30' : ''} ${isAdmin && onCellClick ? 'cursor-pointer hover:bg-blue-50/50' : ''}`}
                    onClick={() => isAdmin && onCellClick && onCellClick(u.id, key, s)}
                  >
                    {s ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-white font-bold text-xs tabular-nums whitespace-nowrap hover:brightness-110 transition-[filter]"
                          style={{ backgroundColor: SHIFT_COLORS[s.shift_type] }}
                          title={s.comment || undefined}
                          onClick={e => { e.stopPropagation(); onShiftClick?.(s); }}
                        >
                          {getShiftLabel(s)}
                          {s.comment && <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 flex-shrink-0" />}
                        </button>
                        {s.status === 'draft' && (
                          <span className="text-[10px] px-1.5 py-px rounded font-medium whitespace-nowrap bg-amber-50 text-amber-700 border border-amber-200">申請中</span>
                        )}
                        {s.status === 'draft' && isAdmin && onConfirm && !exportMode && (
                          <button
                            onClick={e => { e.stopPropagation(); onConfirm(s.id); }}
                            className="text-[10px] px-1.5 py-px rounded whitespace-nowrap bg-white border border-blue-300 text-blue-700 hover:bg-blue-50"
                          >
                            確定する
                          </button>
                        )}
                        {s.status === 'confirmed' && (
                          <span className="text-[10px] px-1.5 py-px rounded font-medium whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200">確定</span>
                        )}
                      </div>
                    ) : (
                      isAdmin && onCellClick ? (
                        <span className="text-slate-300 opacity-0 group-hover:opacity-100">＋</span>
                      ) : null
                    )}
                  </td>
                );
              })}
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default TableView;
