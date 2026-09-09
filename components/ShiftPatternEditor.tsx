'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SHIFT_COLORS } from '@/lib/types';
import {
  DEFAULT_PATTERNS, SETTINGS_KEY, serializePatterns, validatePatterns,
  type ShiftPattern,
} from '@/lib/shiftPatterns';
import { netWorkMinutes, formatTotalHours, generateTimeSlots } from '@/lib/shifts';

// 店舗ごとのシフトパターンを編集する。
//
// A〜G の枠は固定で、店舗が変えられるのは「表示名・開始・終了・使うかどうか」。
// 枠を固定しているのは shifts.shift_type のCHECK制約に合わせるため（lib/shiftPatterns.ts）。
//
// ★保存しても、すでに入力済みのシフトの時刻は変わらない。
//   シフト行は自分で start_time / end_time を持っているため。
//   変わるのは「次にこの枠を選んだときに入る時刻」と、一覧の凡例表示だけ。

const TIME_SLOTS = generateTimeSlots();

export default function ShiftPatternEditor({
  storeId,
  initial,
}: {
  storeId: string;
  initial: ShiftPattern[];
}) {
  const [rows, setRows] = useState<ShiftPattern[]>(initial.map(p => ({ ...p })));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const update = (key: string, patch: Partial<ShiftPattern>) => {
    setRows(prev => prev.map(p => (p.key === key ? { ...p, ...patch } : p)));
    setSaved(false);
  };

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
    setTimeout(() => window.location.reload(), 600);
  };

  const resetToDefault = () => {
    setRows(DEFAULT_PATTERNS.map(p => ({ ...p })));
    setErrors([]);
    setSaved(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-700 mb-1">シフト種別</h3>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        この店舗で使うシフトの時間帯を設定します。使わない種別は「使う」を外すと、
        シフト入力の選択肢に出なくなります。
        <br />
        <span className="text-slate-400">
          変更しても<b className="text-slate-500">すでに入力済みのシフトの時刻は変わりません</b>。
          次にこの種別を選んだときの時刻と、一覧の凡例が変わります。
        </span>
      </p>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm min-w-[30rem]">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="pb-2 w-12">使う</th>
              <th className="pb-2 w-10">種別</th>
              <th className="pb-2">表示名（任意）</th>
              <th className="pb-2 w-24">開始</th>
              <th className="pb-2 w-24">終了</th>
              <th className="pb-2 w-14 text-right">時間</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(p => {
              const mins = netWorkMinutes(p.start, p.end);
              const invalid = p.end <= p.start;
              return (
                <tr key={p.key} className={p.enabled ? '' : 'opacity-45'}>
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={e => update(p.key, { enabled: e.target.checked })}
                      aria-label={`${p.key}を使う`}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </td>
                  <td className="py-2">
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[11px] font-bold"
                      style={{ backgroundColor: SHIFT_COLORS[p.key] }}
                    >
                      {p.key}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={p.label}
                      maxLength={12}
                      placeholder="早番・通し など"
                      onChange={e => update(p.key, { label: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={p.start}
                      onChange={e => update(p.key, { start: e.target.value })}
                      aria-label={`${p.key}の開始時刻`}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={p.end}
                      onChange={e => update(p.key, { end: e.target.value })}
                      aria-label={`${p.key}の終了時刻`}
                      className={`w-full border rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                        invalid ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-400'
                      }`}
                    >
                      {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-right text-slate-400 tabular-nums whitespace-nowrap">
                    {invalid ? '—' : formatTotalHours(mins)}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="py-2 text-slate-300">—</td>
              <td className="py-2">
                <span className="w-6 h-6 rounded-md flex items-center justify-center bg-slate-400 text-white text-[11px] font-bold">自</span>
              </td>
              <td className="py-2 text-slate-500" colSpan={4}>
                カスタム（30分刻みで自由に指定）。<span className="text-slate-400">常に使えます</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {errors.map(e => <li key={e} className="text-xs text-red-600">{e}</li>)}
        </ul>
      )}

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600"
        >
          {saving ? '保存中…' : '保存する'}
        </button>
        <button
          onClick={resetToDefault}
          className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50"
        >
          既定に戻す
        </button>
        {saved && <span className="text-xs text-emerald-600">保存しました。画面を更新します…</span>}
        {!saved && dirty && <span className="text-xs text-amber-600">未保存の変更があります</span>}
      </div>
    </div>
  );
}
