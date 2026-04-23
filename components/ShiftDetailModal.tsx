'use client';
import { SHIFT_COLORS } from '@/lib/types';
import type { Shift, User } from '@/lib/types';

const DAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

interface Props {
  shift: Shift;
  users: User[];
  isAdmin?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onConfirm?: () => void;
}

export default function ShiftDetailModal({ shift, users, isAdmin, onClose, onEdit, onConfirm }: Props) {
  const staffUser = users.find(u => u.id === shift.user_id);
  const d = new Date(shift.date + 'T00:00:00');
  const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日（${DAY_JA[d.getDay()]}）`;
  const color = SHIFT_COLORS[shift.shift_type];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* 上部カラーバー */}
        <div className="h-1.5" style={{ backgroundColor: color }} />

        <div className="p-5 space-y-3">
          {/* 名前 + 種別バッジ */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                {staffUser?.name[0] ?? '?'}
              </span>
              <span className="font-bold text-slate-800 text-base truncate">{staffUser?.name ?? '—'}</span>
            </div>
            <span
              className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {shift.shift_type === 'custom' ? 'カスタム' : shift.shift_type}
            </span>
          </div>

          <hr className="border-slate-100" />

          {/* 詳細情報グリッド */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">日付</p>
              <p className="text-sm font-medium text-slate-700">{dateLabel}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">時間</p>
              <p className="text-sm font-medium text-slate-700">{shift.start_time} 〜 {shift.end_time}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">ステータス</p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                shift.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {shift.status === 'confirmed' ? '確定済み' : '申請中'}
              </span>
            </div>
          </div>

          {shift.comment && (
            <div>
              <p className="text-[11px] text-slate-400 mb-1">コメント</p>
              <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2">{shift.comment}</p>
            </div>
          )}
        </div>

        {/* ボタン */}
        <div className="px-5 pb-5 flex gap-2">
          {isAdmin && onEdit && (
            <button
              onClick={onEdit}
              className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
            >
              編集
            </button>
          )}
          {isAdmin && shift.status === 'draft' && onConfirm && (
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700"
            >
              確定
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
