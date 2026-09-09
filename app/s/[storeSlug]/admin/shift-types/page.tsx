'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useStore, useShiftPatterns } from '@/lib/store';
import { SHIFT_COLORS } from '@/lib/types';
import {
  DEFAULT_PATTERNS, MAX_PATTERNS, SETTINGS_KEY,
  addPattern, movePattern, removePattern, nextAvailableKey,
  serializePatterns, validatePatterns, type ShiftPattern,
} from '@/lib/shiftPatterns';
import { netWorkMinutes, formatTotalHours, generateTimeSlots } from '@/lib/shifts';
import { IconChevronLeft } from '@/components/icons';

// シフト種別の編集。設定画面から遷移してくる専用ページ。
//
// 普段の設定画面では読み取り専用の一覧しか出さない。年に数回しか触らない設定を
// 常に編集可能な状態で置いておくと、他の設定を見に来ただけで誤って触れてしまう。
//
// ★記号(A〜G)は一度割り当てたら変えない。並べ替えても記号は動かない。
//   shifts.shift_type に保存されているのがこの記号のため（lib/shiftPatterns.ts）。

const TIME_SLOTS = generateTimeSlots();

export default function ShiftTypesPage() {
  const router = useRouter();
  const { storeId, storeSlug } = useStore();
  const initial = useShiftPatterns();

  const [rows, setRows] = useState<ShiftPattern[]>(initial.map(p => ({ ...p })));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const canAdd = nextAvailableKey(rows) !== null;

  const touch = (next: ShiftPattern[]) => { setRows(next); setSaved(false); };
  const update = (key: string, patch: Partial<ShiftPattern>) =>
    touch(rows.map(p => (p.key === key ? { ...p, ...patch } : p)));

  const save = async () => {
    const found = validatePatterns(rows);
    setErrors(found);
    if (found.length) return;

    setSaving(true);
    // app_settingsの主キーは(store_id, key)の複合キーなのでonConflictを明示する
    const { error } = await supabase
      .from('app_settings')
      .upsert({ store_id: storeId, key: SETTINGS_KEY, value: serializePatterns(rows) },
              { onConflict: 'store_id,key' });
    setSaving(false);
    if (error) { setErrors([error.message]); return; }
    setSaved(true);
    // パターンは店舗解決時に読み込んでいるため、反映には再読み込みが要る
    setTimeout(() => { window.location.href = `/s/${storeSlug}/admin/settings`; }, 700);
  };

  return (
    <div className="pb-8">
      <button
        onClick={() => router.push(`/s/${storeSlug}/admin/settings`)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
      >
        <IconChevronLeft className="w-4 h-4" />設定に戻る
      </button>

      <h2 className="text-lg font-semibold tracking-tight text-slate-900">シフト種別の編集</h2>
      <p className="text-sm text-slate-500 mt-1 mb-4 leading-relaxed">
        この店舗で使うシフトの種別を設定します。並び順は、シフト入力の画面に出る順番です。
      </p>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-4">
        <p className="text-xs text-amber-800 leading-relaxed">
          <b>すでに入力済みのシフトの時刻は変わりません。</b>
          変わるのは、次にその種別を選んだときに入る時刻と、一覧の凡例です。<br />
          <b>記号（A〜G）は並べ替えても変わりません。</b>
          記号は過去のシフトが参照しているため、固定されています。
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((p, i) => {
          const invalid = p.end <= p.start;
          return (
            <div key={p.key} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: SHIFT_COLORS[p.key] }}
                >
                  {p.key}
                </span>
                <input
                  type="text"
                  value={p.label}
                  maxLength={12}
                  placeholder="表示名（早番・通し など・任意）"
                  onChange={e => update(p.key, { label: e.target.value })}
                  className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => touch(movePattern(rows, p.key, -1))}
                    disabled={i === 0}
                    aria-label={`${p.key}を上へ`}
                    className="w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white"
                  >↑</button>
                  <button
                    onClick={() => touch(movePattern(rows, p.key, 1))}
                    disabled={i === rows.length - 1}
                    aria-label={`${p.key}を下へ`}
                    className="w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white"
                  >↓</button>
                  <button
                    onClick={() => setConfirmRemove(p.key)}
                    disabled={rows.length <= 1}
                    aria-label={`${p.key}を削除`}
                    className="w-7 h-7 rounded-md border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-400"
                  >×</button>
                </div>
              </div>

              <div className="flex items-center gap-2 pl-9">
                <select
                  value={p.start}
                  onChange={e => update(p.key, { start: e.target.value })}
                  aria-label={`${p.key}の開始時刻`}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-slate-400 text-sm">〜</span>
                <select
                  value={p.end}
                  onChange={e => update(p.key, { end: e.target.value })}
                  aria-label={`${p.key}の終了時刻`}
                  className={`border rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                    invalid ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-400'
                  }`}
                >
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-xs text-slate-400 tabular-nums ml-auto">
                  {invalid ? '—' : formatTotalHours(netWorkMinutes(p.start, p.end))}
                </span>
              </div>

              {confirmRemove === p.key && (
                <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2.5">
                  <p className="text-xs text-red-800 leading-relaxed">
                    <b>{p.key} を削除しますか？</b> 選択肢から消えます。
                    この種別で入力済みのシフトは残り、時刻もそのまま表示されます。
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => { touch(removePattern(rows, p.key)); setConfirmRemove(null); }}
                      className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                    >削除する</button>
                    <button
                      onClick={() => setConfirmRemove(null)}
                      className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-600 text-xs hover:bg-white"
                    >やめる</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => touch(addPattern(rows))}
        disabled={!canAdd}
        className="w-full mt-2 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {canAdd ? '+ シフト種別を追加' : `シフト種別は最大${MAX_PATTERNS}件です`}
      </button>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs text-slate-500">
          <b className="text-slate-600">自</b> カスタム（30分刻みで自由に指定）は常に使えます。
          設定の対象外です。
        </p>
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {errors.map(e => <li key={e} className="text-xs text-red-600">{e}</li>)}
        </ul>
      )}

      <div className="flex items-center gap-2 mt-5">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600"
        >
          {saving ? '保存中…' : '保存する'}
        </button>
        <button
          onClick={() => { touch(DEFAULT_PATTERNS.map(p => ({ ...p }))); setErrors([]); }}
          className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50"
        >
          既定に戻す
        </button>
        {saved && <span className="text-xs text-emerald-600">保存しました。設定に戻ります…</span>}
        {!saved && dirty && <span className="text-xs text-amber-600">未保存の変更があります</span>}
      </div>
    </div>
  );
}
