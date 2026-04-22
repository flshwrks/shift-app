'use client';
import { getDaysInMonth, formatDate, getDayLabel } from '@/lib/shifts';
import { SHIFT_PRESETS, SHIFT_COLORS, type Shift, type ShiftType } from '@/lib/types';
import type { User } from '@/lib/types';

interface Props {
  year: number;
  month: number;
  users: User[];
  shifts: Shift[];
  isAdmin?: boolean;
  onConfirm?: (shiftId: string) => void;
}

function getShiftLabel(s: Shift): string {
  if (s.shift_type === 'custom') return `${s.start_time}〜${s.end_time}`;
  return s.shift_type;
}

export default function TableView({ year, month, users, shifts, isAdmin, onConfirm }: Props) {
  const days = getDaysInMonth(year, month);

  const shiftMap: Record<string, Record<string, Shift>> = {};
  shifts.forEach((s) => {
    if (!shiftMap[s.user_id]) shiftMap[s.user_id] = {};
    shiftMap[s.user_id][s.date] = s;
  });

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="border-collapse text-xs min-w-full">
        <thead>
          <tr className="bg-slate-50">
            <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-600 border-b border-r border-slate-200 min-w-[100px] z-10">
              スタッフ
            </th>
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
        </thead>
        <tbody>
          {users.map((u, ui) => (
            <tr key={u.id} className={ui % 2 === 0 ? '' : 'bg-slate-50/50'}>
              <td className="sticky left-0 bg-white px-4 py-2.5 font-medium text-slate-700 border-r border-slate-200 z-10 whitespace-nowrap">
                {ui % 2 === 0 ? '' : <span className="sr-only" />}
                {u.name}
              </td>
              {days.map((d) => {
                const key = formatDate(d);
                const s = shiftMap[u.id]?.[key];
                return (
                  <td key={key} className="px-1 py-1.5 border-r border-slate-100 text-center align-middle">
                    {s ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className="inline-block px-2 py-0.5 rounded-md text-white font-bold text-xs"
                          style={{ backgroundColor: SHIFT_COLORS[s.shift_type] }}
                        >
                          {getShiftLabel(s)}
                        </span>
                        {isAdmin && s.status === 'draft' && onConfirm && (
                          <button
                            onClick={() => onConfirm(s.id)}
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            確定
                          </button>
                        )}
                        {s.status === 'confirmed' && (
                          <span className="text-[10px] text-green-600 font-medium">確定</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-200">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
