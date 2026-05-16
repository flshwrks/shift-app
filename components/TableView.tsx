'use client';
import { useState, useEffect } from 'react';
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
  onConfirm?: (shiftId: string) => void;
  onCellClick?: (userId: string, date: string, shift?: Shift) => void;
  onShiftClick?: (shift: Shift) => void;
}

function getShiftLabel(s: Shift): string {
  return `${s.shift_type === 'custom' ? '' : s.shift_type + ' '}${s.start_time}〜${s.end_time}`;
}

function calcTotalMinutes(userId: string, shiftMap: Record<string, Record<string, Shift>>): number {
  const userShifts = shiftMap[userId];
  if (!userShifts) return 0;
  return Object.values(userShifts).reduce((sum, s) => sum + netWorkMinutes(s.start_time, s.end_time), 0);
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

export default function TableView({ year, month, users, shifts, memos = {}, onMemoChange, isAdmin, currentUserId, onConfirm, onCellClick, onShiftClick }: Props) {
  const days = getDaysInMonth(year, month);
  const [allExpanded, setAllExpanded] = useState(false);
  const hasMemos = Object.values(memos).some(v => v);

  const shiftMap: Record<string, Record<string, Shift>> = {};
  shifts.forEach((s) => {
    if (!shiftMap[s.user_id]) shiftMap[s.user_id] = {};
    shiftMap[s.user_id][s.date] = s;
  });

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="border-collapse text-xs min-w-full">
        <thead>
          {/* 日付行 */}
          <tr className="bg-slate-50">
            <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-600 border-b border-r border-slate-200 min-w-[100px] z-10">
              スタッフ
            </th>
            {isAdmin && (
              <th className="px-3 py-3 font-semibold text-slate-600 border-b border-r border-slate-200 whitespace-nowrap bg-slate-50 text-center">
                月計
              </th>
            )}
            {days.map((d) => {
              const dow = d.getDay();
              return (
                <th
                  key={formatDate(d)}
                  className={`px-2 py-3 font-medium border-b border-r border-slate-100 whitespace-nowrap min-w-[64px] ${
                    dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-600'
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
                    onChange={isAdmin && onMemoChange ? (v) => onMemoChange(key, v) : undefined}
                  />
                </td>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {users.map((u, ui) => {
            const totalMin = calcTotalMinutes(u.id, shiftMap);
            const isMe = currentUserId === u.id;
            return (
            <tr key={u.id} className={isMe ? 'bg-blue-50/40' : ui % 2 === 0 ? '' : 'bg-slate-50/50'}>
              <td className={`sticky left-0 px-4 py-2.5 font-medium border-r border-slate-200 z-10 whitespace-nowrap ${isMe ? 'bg-blue-50 text-blue-700 border-l-2 border-l-blue-400' : 'bg-white text-slate-700'}`}>
                {u.name}
              </td>
              {isAdmin && (
                <td className="px-3 py-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                  <span className={`text-xs font-semibold ${totalMin > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                    {formatTotalHours(totalMin)}
                  </span>
                </td>
              )}
              {days.map((d) => {
                const key = formatDate(d);
                const s = shiftMap[u.id]?.[key];
                return (
                  <td
                    key={key}
                    className={`px-1 py-1.5 border-r border-slate-100 text-center align-middle ${isAdmin && onCellClick ? 'cursor-pointer hover:bg-blue-50/50' : ''}`}
                    onClick={() => isAdmin && onCellClick && onCellClick(u.id, key, s)}
                  >
                    {s ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-white font-bold text-xs hover:brightness-110 transition-[filter]"
                          style={{ backgroundColor: SHIFT_COLORS[s.shift_type] }}
                          title={s.comment || undefined}
                          onClick={e => { e.stopPropagation(); onShiftClick?.(s); }}
                        >
                          {getShiftLabel(s)}
                          {s.comment && <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 flex-shrink-0" />}
                        </button>
                        {s.status === 'draft' && (
                          <span className="text-[10px] text-amber-600 font-medium">申請中</span>
                        )}
                        {s.status === 'draft' && isAdmin && onConfirm && (
                          <button
                            onClick={e => { e.stopPropagation(); onConfirm(s.id); }}
                            className="text-[10px] px-1.5 py-px rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                          >
                            確定する
                          </button>
                        )}
                        {s.status === 'confirmed' && (
                          <span className="text-[10px] text-green-600 font-medium">確定</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-200">+</span>
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
}
