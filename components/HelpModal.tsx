'use client';
import { useRef, useState } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import type { Section, SectionColor } from '@/components/HelpSection';

const SHIFT_TYPES = [
  { type: 'A', color: '#3B82F6', time: '8:00〜13:00' },
  { type: 'B', color: '#8B5CF6', time: '9:00〜14:00' },
  { type: 'C', color: '#10B981', time: '8:00〜17:00' },
  { type: 'D', color: '#F59E0B', time: '9:00〜18:00' },
  { type: 'E', color: '#EF4444', time: '13:00〜22:00' },
  { type: 'F', color: '#EC4899', time: '17:00〜22:00' },
  { type: 'G', color: '#0EA5E9', time: '9:00〜22:00' },
] as const;

const colorAccent: Record<SectionColor, { bg: string; text: string; light: string; border: string }> = {
  blue:   { bg: 'bg-blue-600',   text: 'text-blue-600',   light: 'bg-blue-50',   border: 'border-blue-200' },
  green:  { bg: 'bg-green-600',  text: 'text-green-600',  light: 'bg-green-50',  border: 'border-green-200' },
  purple: { bg: 'bg-purple-600', text: 'text-purple-600', light: 'bg-purple-50', border: 'border-purple-200' },
  slate:  { bg: 'bg-slate-600',  text: 'text-slate-600',  light: 'bg-slate-50',  border: 'border-slate-200' },
};

const staffSections: Section[] = [
  {
    id: 'shifts',
    icon: '📝',
    title: 'シフト申請',
    subtitle: '希望シフトを入力して提出する',
    color: 'blue',
    steps: [
      { text: 'ナビの「シフト申請」をタップして申請ページを開く', note: '提出期間が設定されている月は、自動的にその月に切り替わります' },
      { text: '申請したい日付の行にある「入力」ボタンをタップ' },
      { text: 'シフト種別（A〜G）またはカスタムを選んで「決定」をタップ', note: '「休み / 申請なし」を選ぶとその日の申請を取り消せます' },
      { text: '全ての日程を入力したら、画面下部の「X日分をまとめて提出」をタップ' },
      { text: '提出完了後、各日のバッジが「申請中」に変わったら管理者へ届いています' },
    ],
    tips: [
      '「前月コピー」で先月と同じパターンをそのまま引き継げます',
      'シフト済みの日の「コピー」ボタンで同じシフトを複数日に一括適用できます',
      '途中で閉じても入力内容は自動保存されます',
    ],
  },
  {
    id: 'schedule',
    icon: '📅',
    title: 'シフト確認',
    subtitle: '確定したシフト表を確認する',
    color: 'green',
    steps: [
      { text: 'ナビの「確認」をタップしてスケジュールページを開く' },
      { text: '「◀ ▶」で月を切り替える' },
      { text: '「表形式」または「タイムライン」を選んで確認' },
      { text: 'シフトをタップすると開始・終了時刻やコメントの詳細を確認できる' },
      { text: 'ページ上部に今月の合計勤務時間が表示される' },
    ],
    tips: [
      'タイムライン形式は誰といっしょに働くか一目でわかります',
      '自分の列は強調表示されます',
    ],
  },
];

const adminSections: Section[] = [
  {
    id: 'schedule',
    icon: '📅',
    title: 'シフト管理',
    subtitle: 'スタッフのシフトを確認・編集・確定する',
    color: 'blue',
    steps: [
      { text: '「◀ ▶」で表示月を切り替える' },
      { text: 'スタッフが申請したシフトは「未確定」（黄色）で表示される' },
      { text: '「すべて確定」ボタンで全未確定シフトを一括承認', note: '件数バッジ付きのボタンが未確定シフトがある場合のみ表示されます' },
      { text: 'セルをクリックして個別に確認・確定・編集ができる' },
      { text: '「+ シフト追加」で手動でシフトを作成できる' },
      { text: '「未提出者」ボタンで未提出スタッフを確認し、リマインダーをコピーできる' },
    ],
    tips: [
      '「表形式」はカレンダー全体を俯瞰、「タイムライン」は時間帯ごとの人数確認に向いています',
      '各日付のメモ欄に予定やコメントを記録できます',
    ],
  },
  {
    id: 'staff',
    icon: '👥',
    title: 'スタッフ管理',
    subtitle: 'スタッフの登録・編集・並び替えを行う',
    color: 'purple',
    steps: [
      { text: '「+ スタッフを追加」ボタンで新しいスタッフを登録する', note: '名前・PIN（4桁）・権限（スタッフ / 管理者）を設定します' },
      { text: 'PINはスタッフがログイン時に使用する番号。クリックで表示/非表示を切り替えできる' },
      { text: '「編集」ボタンで名前・権限・PINを変更できる' },
      { text: '「▲ ▼」ボタンでスタッフの表示順を変更できる', note: 'シフト表の列順に反映されます' },
    ],
    tips: [
      'スタッフに「管理者」権限を付与すると管理画面にアクセスできます',
      'PINを忘れたスタッフは編集から再設定できます',
    ],
  },
  {
    id: 'settings',
    icon: '⚙️',
    title: '設定',
    subtitle: '組織名・提出期間を管理する',
    color: 'slate',
    steps: [
      { text: '「組織名」を入力して保存するとヘッダーに表示される' },
      { text: '「シフト提出期間」で月ごとにスタッフが申請できる期間を設定する', note: '未設定の月はいつでも申請可能。期間外はスタッフが提出できなくなります' },
      { text: '開始日・終了日を入力して「保存」をクリック' },
      { text: '「人件費予測」で月ごとの労働時間 × 時給で概算コストを確認できる' },
    ],
    tips: [
      '翌月の提出期間を今月中に設定しておくとスタッフが早めに申請できます',
    ],
  },
];

interface Props {
  role: 'admin' | 'staff';
  onClose: () => void;
}

export default function HelpModal({ role, onClose }: Props) {
  useBodyScrollLock();

  const isAdmin = role === 'admin';
  const sections = isAdmin ? adminSections : staffSections;
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
          <div className={`w-8 h-8 rounded-xl ${c.bg} flex items-center justify-center text-base flex-shrink-0`}>
            {section.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-sm leading-tight truncate">{section.title}</p>
            <p className="text-[11px] text-slate-400 truncate">{section.subtitle}</p>
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
                    <div className="mb-4 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                      <img src={sec.image} alt={sec.title} className="w-full object-cover" draggable={false} />
                    </div>
                  )}

                  {/* シフト種別早見表（スタッフの最初のスライドのみ） */}
                  {!isAdmin && idx === 0 && (
                    <div className="mb-4 bg-slate-50 rounded-2xl p-3">
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
                          <p className="text-sm text-slate-700 leading-relaxed">{step.text}</p>
                          {step.note && (
                            <p className="text-xs text-slate-400 mt-1 pl-2 border-l-2 border-slate-200">{step.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ヒント */}
                  {sec.tips && sec.tips.length > 0 && (
                    <div className={`${sc.light} ${sc.border} border rounded-xl p-3`}>
                      <p className={`text-xs font-bold ${sc.text} mb-1.5 flex items-center gap-1`}>
                        <span>💡</span> ヒント
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
