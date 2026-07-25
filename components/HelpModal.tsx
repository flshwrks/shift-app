'use client';
import { useRef, useState } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { SectionIcon, type Section, type SectionColor } from '@/components/HelpSection';
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

const staffSections: Section[] = [
  {
    id: 'shifts',
    icon: '📝',
    title: 'シフト申請',
    subtitle: '希望シフトを入力して提出する',
    color: 'blue',
    steps: [
      { text: 'ナビの「申請」をタップして申請ページを開く', note: '提出期間が設定されている月は、自動的にその月に切り替わります' },
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
  {
    id: 'requests',
    icon: '📨',
    title: '調整依頼',
    subtitle: '管理者からのシフト依頼を確認・応答する',
    color: 'purple',
    steps: [
      { text: 'ナビの「依頼」をタップして依頼ページを開く', note: 'バッジの数字が未対応の依頼件数を表します' },
      { text: '「未対応」タブで届いている依頼の日付・時間帯を確認する' },
      { text: '「受ける」をタップすると、その日のシフトが自動的に下書き登録される', note: 'すでにシフトが入っている日は上書き確認が表示されます' },
      { text: '「断る」をタップすると辞退として記録される（掲示板型は他の人に回ります）' },
      { text: '対応済みの依頼は「過去の依頼」タブに移動する' },
    ],
    tips: [
      'ログイン時に未対応の依頼があるとポップアップで通知されます',
      '掲示板型は早い者勝ちです。他の人が先に受けると自動的に締め切られます',
      '承諾した後に管理者が依頼を取り消した場合も、次回ログイン時に通知されます',
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
    id: 'requests',
    icon: '📨',
    title: '調整依頼',
    subtitle: '人手不足の日にスタッフへシフトを依頼する',
    color: 'green',
    steps: [
      { text: '「依頼管理」ページの「+ 依頼を出す」をタップしてモーダルを開く', note: 'タイムラインの赤・黄のコマをタップすると日時が自動入力された状態で開けます' },
      { text: '「指名型」か「掲示板型」を選ぶ', note: '指名型はスタッフを個別に選択。掲示板型は全員に公開して先着1名が受け取れます' },
      { text: '対象日・時間帯・メッセージを入力して「依頼を送る」をタップ' },
      { text: '「募集中」タブで各スタッフの応答状況（✓承諾 / ✗辞退 / …未対応）を確認する' },
      { text: 'スタッフが承諾すると「承諾済み」タブに移動する' },
      { text: '「承諾済み」タブの「シフトを確定する」ボタンで下書きシフトを確定する' },
    ],
    tips: [
      'スタッフがログインすると未対応の依頼をポップアップでお知らせします',
      '承諾済みの依頼を取り消すと、承諾したスタッフへ通知が届きます',
      '依頼から確定したシフトは「シフト管理」ページでも確認・編集できます',
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
                  {!isAdmin && idx === 0 && (
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
