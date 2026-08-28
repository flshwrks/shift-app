'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { monthStart, monthEnd, buildMonthTabs } from '@/lib/shifts';
import type { Shift, ShiftType, User } from '@/lib/types';
import { SHIFT_PRESETS } from '@/lib/types';
import {
  KOT_DEFAULT_SETTINGS,
  KOT_PATTERN_TARGETS,
  KOT_MAX_CODE_DIGITS,
  buildKotCsv,
  clampKotCodeDigits,
  kotCodeKey,
  kotConfigKeys,
  kotPatternKey,
  parseKotSettings,
  serializeKotSetting,
  type KotSettings,
} from '@/lib/kot';
import { IconAlertTriangle, IconDownload, IconChevronRight } from '@/components/icons';
import BackToSettings from '@/components/BackToSettings';

const PREVIEW_ROWS = 8;

/** app_settings の取得結果を key→value のマップに畳む */
function toValueMap(rows: { key: string; value: string }[] | null): Record<string, string> {
  const map: Record<string, string> = {};
  (rows ?? []).forEach(({ key, value }) => { map[key] = value; });
  return map;
}

function shiftTypeLabel(type: ShiftType): string {
  if (type === 'off') return '休み';
  if (type === 'custom') return 'カスタム';
  const p = SHIFT_PRESETS[type];
  return `${type}（${p.start}〜${p.end}）`;
}

export default function KotPage() {
  const { storeId } = useStore();
  const tabs = useMemo(() => buildMonthTabs(1), []);
  const [tabIdx, setTabIdx] = useState(2); // 既定は翌月（KOTに予定を入れるのは基本的に先の月）
  const { year, month } = tabs[tabIdx];

  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [patterns, setPatterns] = useState<Partial<Record<ShiftType, string>>>({});
  const [settings, setSettings] = useState<KotSettings>(KOT_DEFAULT_SETTINGS);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    supabase.from('users').select('id, name, role, display_order, created_at')
      .eq('store_id', storeId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .then(({ data }) => setUsers(data ?? []));
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    supabase.from('shifts').select('*')
      .eq('store_id', storeId)
      .gte('date', monthStart(year, month))
      .lte('date', monthEnd(year, month))
      .then(({ data }) => setShifts(data ?? []));
  }, [storeId, year, month]);

  // 出力設定とパターンコードはスタッフ一覧に依存しないので、users の取得を待たずに並行して取る
  useEffect(() => {
    if (!storeId) return;
    supabase.from('app_settings').select('key, value').eq('store_id', storeId).in('key', kotConfigKeys())
      .then(({ data }) => {
        const map = toValueMap(data);
        setSettings(parseKotSettings(map));
        const patternMap: Partial<Record<ShiftType, string>> = {};
        KOT_PATTERN_TARGETS.forEach(t => { const v = map[kotPatternKey(t)]; if (v) patternMap[t] = v; });
        setPatterns(patternMap);
      });
  }, [storeId]);

  // 従業員コードのキーはスタッフのidから作るので、こちらだけ users を待つ
  useEffect(() => {
    if (!storeId || users.length === 0) return;
    supabase.from('app_settings').select('key, value').eq('store_id', storeId).in('key', users.map(u => kotCodeKey(u.id)))
      .then(({ data }) => {
        const map = toValueMap(data);
        const codeMap: Record<string, string> = {};
        users.forEach(u => { const v = map[kotCodeKey(u.id)]; if (v) codeMap[u.id] = v; });
        setCodes(codeMap);
      });
  }, [storeId, users]);

  // app_settingsの主キーは(store_id, key)の複合キーなのでonConflictを明示する
  const saveSetting = useCallback(async (key: string, value: string) => {
    await supabase.from('app_settings').upsert({ store_id: storeId, key, value }, { onConflict: 'store_id,key' });
  }, [storeId]);

  const updateSetting = <K extends keyof KotSettings>(key: K, value: KotSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    const entry = serializeKotSetting(key, value);
    saveSetting(entry.key, entry.value);
  };

  const result = useMemo(
    () => buildKotCsv({ shifts, users, codes, patterns, settings }),
    [shifts, users, codes, patterns, settings]
  );

  const handleDownload = () => {
    // BOMを付けるとKOT側が1列目のタイトルを認識できず取り込みに失敗するため、
    // 明示的にBOM無しのUTF-8で書き出す
    const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kot_schedule_${year}-${String(month + 1).padStart(2, '0')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const inputClass = 'w-32 px-2 py-1.5 text-sm border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400';

  return (
    <div>
      <BackToSettings />
      <h2 className="text-xl font-bold text-slate-800 mb-1">KING OF TIME 連携</h2>
      <p className="text-xs text-slate-500 mb-6">
        確定したシフトを KING OF TIME の「スケジュールデータ［CSV］」で取り込める形式に変換します。
      </p>

      {/* KOT側の準備。最初の1回だけ必要な作業なので既定では畳んでおく */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6">
        <button
          onClick={() => setShowSetup(v => !v)}
          className="w-full flex items-center justify-between gap-2 p-5 text-left"
        >
          <div>
            <h3 className="font-semibold text-slate-700">KING OF TIME 側の準備（初回のみ）</h3>
            <p className="text-xs text-slate-400 mt-0.5">入力レイアウトを1つ作れば、以降は毎月アップロードするだけです</p>
          </div>
          <IconChevronRight className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform ${showSetup ? 'rotate-90' : ''}`} />
        </button>
        {showSetup && (
          <div className="px-5 pb-5 -mt-1">
            <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
              <li>KING OF TIME の管理画面で「エクスポート／インポート」→「スケジュールデータ［CSV］」を開く</li>
              <li>「入力レイアウト作成」で新規レイアウトを作り、列を下の順番どおりに並べる</li>
              <li>作ったレイアウトを選び、このページで出力したCSVをアップロードする</li>
            </ol>
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">レイアウトの列（この順番）</p>
              <ol className="text-sm text-slate-700 space-y-0.5 list-decimal list-inside tabular-nums">
                {result.columns.map(c => <li key={c}>{c}</li>)}
              </ol>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              出力したCSVは Excel で開いて保存し直さないでください。先頭に見えない印（BOM）が付き、取り込みに失敗します。
            </p>
          </div>
        )}
      </div>

      {/* 月タブ */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar">
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setTabIdx(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              i === tabIdx ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.year}年{t.month + 1}月
          </button>
        ))}
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* 出力設定 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4">出力設定</h3>
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">出力する内容</span>
              <select
                value={settings.outputMode}
                onChange={e => updateSetting('outputMode', e.target.value as KotSettings['outputMode'])}
                className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="both">パターンコード＋予定時刻</option>
                <option value="pattern">パターンコードのみ</option>
                <option value="time">予定時刻のみ</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">日付の形式</span>
              <select
                value={settings.dateFormat}
                onChange={e => updateSetting('dateFormat', e.target.value as KotSettings['dateFormat'])}
                className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="slash">2026/09/01</option>
                <option value="compact">20260901</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">
                従業員コードの桁数
                <span className="block text-xs text-slate-400">0なら桁揃えしない。KOT側が「007」形式なら3</span>
              </span>
              <input
                type="number"
                min={0}
                max={KOT_MAX_CODE_DIGITS}
                value={settings.codeDigits}
                onChange={e => setSettings(prev => ({ ...prev, codeDigits: clampKotCodeDigits(e.target.value) }))}
                onBlur={() => updateSetting('codeDigits', settings.codeDigits)}
                className="w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg tabular-nums"
              />
            </label>
            {[
              { label: '休みの日も出力する', hint: '公休をKOTに登録する場合。「休み」のパターンコードが必要です', key: 'includeOff' as const },
              { label: '申請中のシフトも含める', hint: '既定は確定済みのみ', key: 'includeDraft' as const },
              { label: '1行目にタイトル行を付ける', hint: 'KOTのテンプレートに合わせます。取り込めない場合は外す', key: 'header' as const },
            ].map(item => (
              <label key={item.key} className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-slate-600">
                  {item.label}
                  <span className="block text-xs text-slate-400">{item.hint}</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings[item.key]}
                  onChange={e => updateSetting(item.key, e.target.checked)}
                  className="w-4 h-4 accent-blue-600 flex-shrink-0"
                />
              </label>
            ))}
          </div>
        </div>

        {/* 従業員コード */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-1">従業員コードの対応表</h3>
          <p className="text-xs text-slate-400 mb-4">KING OF TIME に登録されている従業員コードを入れてください（半角英数3〜10文字）。未入力のスタッフは出力されません。</p>
          <div className="divide-y divide-slate-50">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-slate-700 truncate">{u.name}</span>
                <input
                  value={codes[u.id] ?? ''}
                  onChange={e => setCodes(prev => ({ ...prev, [u.id]: e.target.value }))}
                  onBlur={e => saveSetting(kotCodeKey(u.id), e.target.value.trim())}
                  placeholder="未設定"
                  className={inputClass}
                />
              </div>
            ))}
            {users.length === 0 && <p className="text-sm text-slate-400 py-2">スタッフが登録されていません</p>}
          </div>
        </div>

        {/* パターンコード */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-1">パターンコードの対応表</h3>
          <p className="text-xs text-slate-400 mb-4">シフト種別を KING OF TIME のパターン（勤務区分）に対応させます。「カスタム」は時刻が毎回違うため未設定で構いません。</p>
          <div className="divide-y divide-slate-50">
            {KOT_PATTERN_TARGETS.map(t => (
              <div key={t} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-slate-700 truncate">{shiftTypeLabel(t)}</span>
                <input
                  value={patterns[t] ?? ''}
                  onChange={e => setPatterns(prev => ({ ...prev, [t]: e.target.value }))}
                  onBlur={e => saveSetting(kotPatternKey(t), e.target.value.trim())}
                  placeholder="未設定"
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 結果 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-baseline justify-between gap-2 mb-4">
            <h3 className="font-semibold text-slate-700">出力内容</h3>
            <p className="text-xs text-slate-400 tabular-nums">
              {result.rows.length}件{result.skipped > 0 && ` / 対象外 ${result.skipped}件`}
            </p>
          </div>

          {result.issues.length > 0 && (
            <div className="space-y-2 mb-4">
              {result.issues.map((issue, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                    issue.level === 'error'
                      ? 'bg-red-50 border-red-100 text-red-700'
                      : 'bg-amber-50 border-amber-100 text-amber-700'
                  }`}
                >
                  <IconAlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {result.rows.length > 0 && (
            <div className="overflow-x-auto border border-slate-100 rounded-lg mb-4">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-400">
                    {result.columns.map(c => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 tabular-nums">
                  {result.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => <td key={j} className="px-3 py-1.5 text-slate-600">{cell || '－'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > PREVIEW_ROWS && (
                <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">ほか {result.rows.length - PREVIEW_ROWS} 件</p>
              )}
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={result.rows.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
          >
            <IconDownload className="w-4 h-4" />
            CSVをダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}
