'use client';
import { useRef, useState } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { SectionIcon } from '@/components/icons';
import { HELP_CONTENT, type SectionColor } from '@/lib/help/content';
import { SHIFT_COLORS, SHIFT_PRESETS, type ShiftType } from '@/lib/types';

/** 表示用に先頭0を省く（"08:00" → "8:00"） */
function trimLeadingZero(time: string): string {
  return time.startsWith('0') ? time.slice(1) : time;
}

const SHIFT_TYPES = (Object.keys(SHIFT_PRESETS) as Exclude<ShiftType, 'custom' | 'off'>[]).map((type) => ({
  type,
  color: SHIFT_COLORS[type],
  time: `${trimLeadingZero(SHIFT_PRESETS[type].start)}〜${trimLeadingZero(SHIFT_PRESETS[type].end)}`,
}));

const colorAccent: Record<SectionColor, { bg: string; text: string; light: string; border: string }> = {
  blue:   { bg: 'bg-blue-600',   text: 'text-blue-600',   light: 'bg-blue-50',   border: 'border-blue-200' },
  green:  { bg: 'bg-green-600',  text: 'text-green-600',  light: 'bg-green-50',  border: 'border-green-200' },
  purple: { bg: 'bg-purple-600', text: 'text-purple-600', light: 'bg-purple-50', border: 'border-purple-200' },
  slate:  { bg: 'bg-slate-600',  text: 'text-slate-600',  light: 'bg-slate-50',  border: 'border-slate-200' },
};

interface Props {
  role: 'admin' | 'staff' | 'hq_admin';
  onClose: () => void;
}

export default function HelpModal({ role, onClose }: Props) {
  useBodyScrollLock();

  const sections = HELP_CONTENT[role];
  const total = sections.length;

  const [current, setCurrent] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const lockedAxis = useRef<'h' | 'v' | null>(null);

  const goTo = (i: number) => setCurrent(Math.max(0, Math.min(total - 1, i)));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    lockedAxis.current = null;
    setDragging(false);
    setDragOffset(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!lockedAxis.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4) lockedAxis.current = 'h';
      else if (Math.abs(dy) > Math.abs(dx) + 4) lockedAxis.current = 'v';
      else return;
    }

    if (lockedAxis.current === 'h') {
      e.preventDefault();
      setDragging(true);
      setDragOffset(dx);
    }
  };

  const onTouchEnd = () => {
    if (dragging && Math.abs(dragOffset) > 48) {
      goTo(current + (dragOffset < 0 ? 1 : -1));
    }
    touchStartX.current = null;
    touchStartY.current = null;
    lockedAxis.current = null;
    setDragging(false);
    setDragOffset(0);
  };

  const section = sections[current];
  const c = colorAccent[section.color];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative bg-white w-full rounded-t-3xl sm:rounded-2xl sm:max-w-lg shadow-2xl flex flex-col"
        style={{ maxHeight: '90dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* モバイルハンドル */}
        <div className="sm:hidden w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 flex-shrink-0" />

        {/* ヘッダー */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 flex-shrink-0">
          <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
            <SectionIcon icon={section.icon} className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 leading-tight truncate">{section.title}</p>
            <p className="text-[11px] font-medium text-slate-500 truncate">{section.subtitle}</p>
          </div>
          {/* ページ番号 */}
          <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">{current + 1} / {total}</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* スライドエリア */}
        <div
          className="flex-1 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex h-full"
            style={{
              transform: `translateX(calc(-${current * 100}% + ${dragOffset}px))`,
              transition: dragging ? 'none' : 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'transform',
            }}
          >
            {sections.map((sec, idx) => {
              const sc = colorAccent[sec.color];
              return (
                <div key={sec.id} className="w-full flex-shrink-0 overflow-y-auto overscroll-contain px-5 pb-4">
                  {/* 画像 */}
                  {sec.image && (
                    <div className="mb-4 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                      <img src={sec.image} alt={sec.title} className="w-full object-cover" draggable={false} />
                    </div>
                  )}

                  {/* シフト種別早見表（スタッフの最初のスライドのみ） */}
                  {role === 'staff' && idx === 0 && (
                    <div className="mb-4 bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">シフト種別早見表</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {SHIFT_TYPES.map(({ type, color, time }) => (
                          <div key={type} className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: color }}>
                              {type}
                            </span>
                            <span className="text-[11px] text-slate-500">{time}</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-slate-400 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">自</span>
                          <span className="text-[11px] text-slate-500">カスタム（30分刻み）</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ステップ */}
                  <div className="space-y-3 mb-4">
                    {sec.steps.map((step, i) => (
                      <div key={i} className="flex gap-3">
                        <div className={`w-6 h-6 rounded-full ${sc.bg} text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-[13px] text-slate-600 leading-relaxed">{step.text}</p>
                          {step.note && (
                            <p className="text-xs text-slate-400 mt-1 pl-2 border-l-2 border-slate-200">{step.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ヒント */}
                  {sec.tips && sec.tips.length > 0 && (
                    <div className={`${sc.light} ${sc.border} border rounded-lg p-3`}>
                      <p className={`text-xs font-semibold ${sc.text} mb-1.5 flex items-center gap-1`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0012 3z" />
                        </svg>
                        ヒント
                      </p>
                      <ul className="space-y-1">
                        {sec.tips.map((tip, i) => (
                          <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                            <span className="text-slate-300 flex-shrink-0">•</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* フッター：ドット + 矢印 */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <button
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* ドットインジケーター */}
          <div className="flex items-center gap-2">
            {sections.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`rounded-full transition-all duration-200 ${
                  i === current
                    ? `w-5 h-2 ${c.bg}`
                    : 'w-2 h-2 bg-slate-200 hover:bg-slate-300'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => goTo(current + 1)}
            disabled={current === total - 1}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
