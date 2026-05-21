'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  getDaysInMonth, formatDate, formatYM, monthStart, monthEnd, getDayLabel, isWeekend,
} from '@/lib/shifts';
import { SHIFT_PRESETS, SHIFT_COLORS, type Shift, type ShiftType } from '@/lib/types';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

const SHIFT_LIST = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

interface DayShift {
  shiftType: ShiftType | null;
  startTime: string;
  endTime: string;
  comment: string;
  dirty: boolean;       // ローカルで変更済み（未提出）
  existingId?: string;
  status?: string;
}

const defaultDay = (): DayShift => ({
  shiftType: null, startTime: '08:00', endTime: '17:00', comment: '', dirty: false,
});

export default function ShiftsPage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [days, setDays] = useState<Date[]>([]);
  const [shifts, setShifts] = useState<Record<string, DayShift>>({});
  const [openDate, setOpenDate] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  const [popup, setPopup] = useState<{ date: string; day: Date } | null>(null);
  const [showDraftAlert, setShowDraftAlert] = useState(false);
  const [showSubmitPrompt, setShowSubmitPrompt] = useState(false);
  useBodyScrollLock(popup !== null || showDraftAlert || showSubmitPrompt);

  // ①：起動時に未提出の下書きがあればアラートを表示
  useEffect(() => {
    if (!user) return;
    const prefix = `shift_draft_${user.id}_`;
    if (Object.keys(localStorage).some(k => k.startsWith(prefix))) {
      setShowDraftAlert(true);
    }
  }, [user]);

  // 初回マウント時：提出期間がアクティブな月に自動ジャンプ
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const candidates = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    const keys = candidates.flatMap(c => [
      `period_open_${formatYM(c.year, c.month)}`,
      `period_close_${formatYM(c.year, c.month)}`,
    ]);
    supabase.from('app_settings').select('key, value').in('key', keys)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach(({ key, value }: { key: string; value: string }) => { map[key] = value ?? ''; });
        for (const c of candidates) {
          const ym = formatYM(c.year, c.month);
          const open = map[`period_open_${ym}`] ?? '';
          const close = map[`period_close_${ym}`] ?? '';
          if ((open || close) && (!open || today >= open) && (!close || today <= close)) {
            setYear(c.year);
            setMonth(c.month);
            return;
          }
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setDays(getDaysInMonth(year, month)); }, [year, month]);

  useEffect(() => {
    const ym = formatYM(year, month);
    supabase.from('app_settings').select('key, value')
      .in('key', [`period_open_${ym}`, `period_close_${ym}`])
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach(({ key, value }: { key: string; value: string }) => { map[key] = value ?? ''; });
        setOpenDate(map[`period_open_${ym}`] ?? '');
        setCloseDate(map[`period_close_${ym}`] ?? '');
      });
  }, [year, month]);

  const loadShifts = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', monthStart(year, month))
      .lte('date', monthEnd(year, month));
    if (error) { console.error('loadShifts error:', error); return; }
    const next: Record<string, DayShift> = {};
    getDaysInMonth(year, month).forEach(d => { next[formatDate(d)] = defaultDay(); });
    (data ?? []).forEach((s: Shift) => {
      next[s.date] = {
        shiftType: s.shift_type, startTime: s.start_time, endTime: s.end_time,
        comment: s.comment ?? '', dirty: false, existingId: s.id, status: s.status,
      };
    });
    // localStorage に保存された未提出の下書きを復元
    const draftKey = `shift_draft_${user.id}_${formatYM(year, month)}`;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const drafts = JSON.parse(saved) as Record<string, DayShift>;
        Object.entries(drafts).forEach(([date, s]) => {
          if (next[date] !== undefined) next[date] = s;
        });
      } catch { localStorage.removeItem(draftKey); }
    }
    setShifts(next);
  }, [user, year, month]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // 未提出の変更を localStorage に自動保存
  useEffect(() => {
    if (!user || Object.keys(shifts).length === 0) return;
    const draftKey = `shift_draft_${user.id}_${formatYM(year, month)}`;
    const dirty = Object.fromEntries(Object.entries(shifts).filter(([, s]) => s.dirty));
    if (Object.keys(dirty).length > 0) {
      localStorage.setItem(draftKey, JSON.stringify(dirty));
    } else {
      localStorage.removeItem(draftKey);
    }
    window.dispatchEvent(new Event('storage'));
  }, [shifts, user, year, month]);

  // ブラウザ離脱・更新時の警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.values(shifts).some(s => s.dirty)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [shifts]);

  // ポップアップ内の一時編集状態
  const [editShift, setEditShift] = useState<DayShift>(defaultDay());

  const openPopup = (date: string, day: Date) => {
    setEditShift({ ...(shifts[date] ?? defaultDay()) });
    setPopup({ date, day });
    setSubmitDone(false);
  };

  const closePopup = () => setPopup(null);

  const applyEdit = () => {
    if (!popup) return;
    const newShifts = { ...shifts, [popup.date]: { ...editShift, dirty: true } };
    setShifts(newShifts);
    setPopup(null);

    // ③：全日程を入力し終えたら提出を促す
    const remaining = days.filter(day => {
      const s = newShifts[formatDate(day)];
      return !s?.shiftType && !s?.existingId && !s?.dirty;
    }).length;
    const newDirtyCount = Object.values(newShifts).filter(s => s.dirty).length;
    if (remaining === 0 && newDirtyCount > 0) setShowSubmitPrompt(true);
  };

  const selectType = (type: ShiftType | null) => {
    if (type && type !== 'custom' && type !== 'off') {
      const p = SHIFT_PRESETS[type as Exclude<ShiftType, 'custom' | 'off'>];
      setEditShift(e => ({ ...e, shiftType: type, startTime: p.start, endTime: p.end }));
    } else {
      setEditShift(e => ({ ...e, shiftType: type }));
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const monthsAhead = (year - now.getFullYear()) * 12 + (month - now.getMonth());
  const periodSet = !!(openDate || closeDate);
  const inPeriod = (!openDate || today >= openDate) && (!closeDate || today <= closeDate);
  const isFarFuture = !periodSet && monthsAhead >= 3;
  const isLocked = isFarFuture || (periodSet && !inPeriod);

  const fmtPeriodDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

  const dirtyCount = Object.values(shifts).filter(s => s.dirty).length;

  const handleSubmitAll = async () => {
    if (!user || isLocked) return;
    setSubmitting(true);

    const entries = Object.entries(shifts).filter(([, s]) => s.dirty);

    // 「休み」に変更されたものを削除
    const toDelete = entries.filter(([, s]) => !s.shiftType && s.existingId);
    await Promise.all(toDelete.map(([, s]) => supabase.from('shifts').delete().eq('id', s.existingId!)));

    // シフトがあるものは upsert（INSERT or UPDATE を自動判定）
    const toUpsert = entries
      .filter(([, s]) => s.shiftType)
      .map(([date, s]) => ({
        user_id: user.id,
        date,
        shift_type: s.shiftType!,
        start_time: s.shiftType === 'off' ? '00:00' : s.startTime,
        end_time: s.shiftType === 'off' ? '00:00' : s.endTime,
        comment: s.comment,
        status: 'draft' as const,
      }));

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('shifts')
        .upsert(toUpsert, { onConflict: 'user_id,date' });
      if (error) {
        console.error('upsert error:', error);
        setSubmitting(false);
        return;
      }
    }

    // 提出成功 → localStorage の下書きを削除してからDB再取得
    localStorage.removeItem(`shift_draft_${user.id}_${formatYM(year, month)}`);
    window.dispatchEvent(new Event('storage'));
    await loadShifts();
    setSubmitting(false);
    setSubmitDone(true);
    setTimeout(() => setSubmitDone(false), 3000);
  };

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  // コピーモード
  const [copyingShift, setCopyingShift] = useState<DayShift | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());

  const startCopy = (date: string) => {
    setCopyingShift({ ...shifts[date] });
    setCopyTargets(new Set());
  };

  const toggleCopyTarget = (date: string) => {
    setCopyTargets(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const applyCopy = () => {
    if (!copyingShift) return;
    setShifts(prev => {
      const next = { ...prev };
      copyTargets.forEach(date => { next[date] = { ...copyingShift, dirty: true, existingId: prev[date]?.existingId, status: prev[date]?.status }; });
      return next;
    });
    setCopyingShift(null);
    setCopyTargets(new Set());
  };

  const cancelCopy = () => { setCopyingShift(null); setCopyTargets(new Set()); };

  const [copying, setCopying] = useState(false);
  const copyFromPrevMonth = async () => {
    if (!user || copying) return;
    setCopying(true);
    const [prevY, prevM] = month === 0 ? [year - 1, 11] : [year, month - 1];
    const { data } = await supabase
      .from('shifts').select('*').eq('user_id', user.id)
      .gte('date', monthStart(prevY, prevM)).lte('date', monthEnd(prevY, prevM));
    setCopying(false);
    if (!data || data.length === 0) { alert('前月のシフトデータがありません'); return; }
    const currentDays = getDaysInMonth(year, month);
    const next = { ...shifts };
    for (const s of data) {
      const prevDate = new Date(s.date + 'T00:00:00');
      const weekday = prevDate.getDay();
      const occurrence = Math.floor((prevDate.getDate() - 1) / 7);
      let count = 0;
      for (const d of currentDays) {
        if (d.getDay() === weekday) {
          if (count === occurrence) {
            const key = formatDate(d);
            next[key] = {
              shiftType: s.shift_type, startTime: s.start_time, endTime: s.end_time,
              comment: s.comment ?? '', dirty: true,
              existingId: next[key]?.existingId, status: next[key]?.status,
            };
            break;
          }
          count++;
        }
      }
    }
    setShifts(next);
  };

  return (
    <div className="pb-48 sm:pb-32">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 text-lg">◀</button>
          <h2 className="text-lg font-bold text-slate-800 whitespace-nowrap">{year}年{month + 1}月</h2>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 text-lg">▶</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isLocked && (
            <button
              onClick={copyFromPrevMonth}
              disabled={copying}
              className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg disabled:opacity-50"
            >
              {copying ? '取得中…' : '前月コピー'}
            </button>
          )}
          {periodSet && (
            <div className={`text-xs px-2.5 py-1.5 rounded-lg ${isLocked ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
              提出期間 {openDate ? fmtPeriodDate(openDate) : '?'} 〜 {closeDate ? fmtPeriodDate(closeDate) : '?'}
            </div>
          )}
        </div>
      </div>

      {copyingShift && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
          <span className="text-blue-700 text-sm font-medium">
            {copyingShift.shiftType === 'off'
              ? '休み'
              : copyingShift.shiftType === 'custom'
              ? `${copyingShift.startTime}〜${copyingShift.endTime}`
              : copyingShift.shiftType ?? '未選択'} をコピー中 — コピー先を選択
          </span>
          <button onClick={cancelCopy} className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0">キャンセル</button>
        </div>
      )}

      {isLocked && !copyingShift && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
          {isFarFuture ? '申請期間が設定されていないため申請できません' : '提出期間外のため申請できません'}
        </div>
      )}

      {/* シフト凡例 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 mb-4">
        <p className="text-[10px] font-semibold text-slate-400 mb-2 uppercase tracking-wide">シフト種別</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SHIFT_LIST.map(type => {
            const p = SHIFT_PRESETS[type];
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: SHIFT_COLORS[type] }}>{type}</span>
                <span className="text-[11px] text-slate-500">{p.start}〜{p.end}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center bg-slate-400 text-white text-[10px] font-bold flex-shrink-0">自</span>
            <span className="text-[11px] text-slate-500">カスタム</span>
          </div>
        </div>
      </div>

      {/* 日付リスト */}
      <div className="space-y-1.5">
        {days.map(day => {
          const key = formatDate(day);
          const s = shifts[key] ?? defaultDay();
          const dow = day.getDay();
          const isRed = dow === 0;
          const isBlue = dow === 6;

          return (
            <div key={key} className={`bg-white rounded-2xl border flex items-center px-4 py-3 gap-3 ${s.dirty ? 'border-blue-300' : 'border-slate-200'}`}>
              {/* 日付 */}
              <div className={`w-14 flex-shrink-0 text-sm font-bold ${isRed ? 'text-red-500' : isBlue ? 'text-blue-500' : 'text-slate-700'}`}>
                {getDayLabel(day)}
              </div>

              {/* シフト表示 */}
              <div className="flex-1 min-w-0">
                {s.shiftType ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: SHIFT_COLORS[s.shiftType] }}>
                      {s.shiftType === 'off' ? '休み' : s.shiftType === 'custom' ? `${s.startTime}〜${s.endTime}` : `${s.shiftType}  ${s.startTime}〜${s.endTime}`}
                    </span>
                    {s.dirty && <span className="text-[10px] text-blue-500 font-medium">未提出</span>}
                    {!s.dirty && s.status === 'draft' && <span className="text-[10px] text-amber-600 font-medium">申請中</span>}
                    {!s.dirty && s.status === 'confirmed' && <span className="text-[10px] text-green-600 font-medium">確定</span>}
                  </div>
                ) : (
                  <span className="text-sm text-slate-300">—</span>
                )}
                {s.comment && <p className="text-xs text-slate-400 mt-0.5 truncate">{s.comment}</p>}
              </div>

              {/* コピーモード：選択トグル */}
              {copyingShift && (
                <button
                  onClick={() => toggleCopyTarget(key)}
                  className={`flex-shrink-0 w-9 h-9 rounded-xl border-2 flex items-center justify-center text-sm transition-colors ${
                    copyTargets.has(key) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-300'
                  }`}
                >
                  {copyTargets.has(key) ? '✓' : ''}
                </button>
              )}

              {/* 通常モード：入力 + コピーボタン */}
              {!copyingShift && !isLocked && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {s.shiftType && (
                    <button
                      onClick={() => startCopy(key)}
                      className="px-2 h-9 rounded-xl bg-slate-100 hover:bg-amber-50 hover:text-amber-600 text-slate-400 text-xs font-medium transition-colors active:scale-95"
                      title="他の日にコピー"
                    >
                      コピー
                    </button>
                  )}
                  <button
                    onClick={() => openPopup(key, day)}
                    className="w-16 h-9 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 text-xs font-medium transition-colors active:scale-95"
                  >
                    入力
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* コピーモードフッター */}
      {copyingShift && (
        <div className="fixed bottom-14 sm:bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-200">
          <button
            onClick={applyCopy}
            disabled={copyTargets.size === 0}
            className={`w-full h-14 rounded-2xl text-base font-bold transition-all active:scale-[0.98] ${
              copyTargets.size === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white shadow-lg shadow-blue-200'
            }`}
          >
            {copyTargets.size > 0 ? `${copyTargets.size}日にコピーする` : 'コピー先を選択してください'}
          </button>
        </div>
      )}

      {/* まとめて提出ボタン（固定フッター、期間外・コピーモードは非表示） */}
      {!isLocked && !copyingShift && (
        <div className="fixed bottom-14 sm:bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-200">
          <button
            onClick={handleSubmitAll}
            disabled={dirtyCount === 0 || submitting}
            className={`w-full h-14 rounded-2xl text-base font-bold transition-all active:scale-[0.98] ${
              submitDone
                ? 'bg-green-500 text-white'
                : dirtyCount === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white shadow-lg shadow-blue-200'
            }`}
          >
            {submitting ? '提出中…' : submitDone ? '✓ 提出完了' : dirtyCount > 0 ? `${dirtyCount}日分をまとめて提出` : '変更なし'}
          </button>
        </div>
      )}

      {/* ① 未提出アラート */}
      {showDraftAlert && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-3xl leading-none">📋</span>
              <div>
                <p className="font-bold text-slate-800">未提出のシフトがあります</p>
                <p className="text-sm text-slate-500 mt-0.5">前回の入力がまだ提出されていません。確認して提出してください。</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDraftAlert(false)}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
              >
                確認する
              </button>
              <button
                onClick={() => setShowDraftAlert(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200"
              >
                あとで
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ③ 全日程入力完了→提出促進 */}
      {showSubmitPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">✅</span>
            </div>
            <p className="font-bold text-slate-800 text-base">全日程の入力が完了しました</p>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              {Object.values(shifts).filter(s => s.dirty).length}日分をまとめて提出しますか？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowSubmitPrompt(false); handleSubmitAll(); }}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
              >
                今すぐ提出
              </button>
              <button
                onClick={() => setShowSubmitPrompt(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200"
              >
                あとで
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ポップアップ（ボトムシート） */}
      {popup && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={closePopup}>
          <div className="bg-black/40 absolute inset-0" />
          <div
            className="relative bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* ハンドル */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800">
                {getDayLabel(popup.day)} のシフト
              </h3>
              {editShift.shiftType && (
                <button
                  onClick={() => setEditShift(e => ({ ...e, shiftType: null }))}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  選択解除
                </button>
              )}
            </div>

            {/* シフト種別ボタン */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SHIFT_LIST.map(type => {
                const p = SHIFT_PRESETS[type];
                const selected = editShift.shiftType === type;
                return (
                  <button
                    key={type}
                    onClick={() => selectType(type)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all active:scale-[0.97] text-left ${
                      selected ? 'border-transparent text-white' : 'border-slate-100 bg-slate-50 text-slate-700'
                    }`}
                    style={selected ? { backgroundColor: SHIFT_COLORS[type] } : {}}
                  >
                    <span className={`text-xl font-black ${selected ? 'text-white' : ''}`}>{type}</span>
                    <span className={`text-xs leading-tight ${selected ? 'text-white/90' : 'text-slate-500'}`}>
                      {p.start}<br />〜{p.end}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* カスタム */}
            <button
              onClick={() => selectType('custom')}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 mb-2 transition-all ${
                editShift.shiftType === 'custom' ? 'border-slate-600 bg-slate-600 text-white' : 'border-slate-100 bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-bold">カスタム</span>
              <span className={`text-xs ${editShift.shiftType === 'custom' ? 'text-white/80' : 'text-slate-400'}`}>30分刻みで指定</span>
            </button>

            {editShift.shiftType === 'custom' && (
              <div className="flex items-center gap-2 mb-3 px-1">
                <input
                  type="time"
                  value={editShift.startTime}
                  onChange={e => { if (e.target.value) setEditShift(ev => ({ ...ev, startTime: e.target.value })); }}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <span className="text-slate-400">〜</span>
                <input
                  type="time"
                  value={editShift.endTime}
                  onChange={e => { if (e.target.value) setEditShift(ev => ({ ...ev, endTime: e.target.value })); }}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            )}

            {/* 休み */}
            <button
              onClick={() => selectType('off')}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 mb-4 font-medium transition-all ${
                editShift.shiftType === 'off' ? 'border-transparent text-white' : 'border-slate-100 bg-slate-50 text-slate-500'
              }`}
              style={editShift.shiftType === 'off' ? { backgroundColor: SHIFT_COLORS.off } : {}}
            >
              <span className="font-bold">休み</span>
              <span className={`text-xs ${editShift.shiftType === 'off' ? 'text-white/80' : 'text-slate-400'}`}>休暇・公休など</span>
            </button>

            {/* コメント */}
            <input
              type="text"
              placeholder="コメント（任意）"
              value={editShift.comment}
              onChange={e => setEditShift(ev => ({ ...ev, comment: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300"
            />

            {/* 決定 */}
            <button
              onClick={applyEdit}
              className="w-full h-13 py-3.5 bg-blue-600 text-white rounded-2xl font-bold text-base active:scale-[0.98] transition-transform"
            >
              決定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
