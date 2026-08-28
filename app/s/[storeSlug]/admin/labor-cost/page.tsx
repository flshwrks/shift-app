'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { monthStart, monthEnd, netWorkMinutes, buildMonthTabs } from '@/lib/shifts';
import type { User, Shift } from '@/lib/types';
import { IconAlertTriangle } from '@/components/icons';
import BackToSettings from '@/components/BackToSettings';

const DEFAULT_WAGE = 1268; // 神奈川県最低賃金 (2024年10月〜)

function monthLabel(year: number, month: number) {
  return `${year}年${month + 1}月`;
}

export default function LaborCostPage() {
  const { storeId } = useStore();
  const tabs = useMemo(() => buildMonthTabs(2), []);
  const [tabIdx, setTabIdx] = useState(2);

  const { year, month } = tabs[tabIdx];

  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [wages, setWages] = useState<Record<string, number>>({});
  const [savingWage, setSavingWage] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('users').select('id, name, role, display_order, created_at')
      .eq('store_id', storeId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .then(({ data }) => setUsers(data ?? []));
  }, [storeId]);

  useEffect(() => {
    if (users.length === 0) return;
    const keys = users.map(u => `wage_${u.id}`);
    // 他店舗の時給が見えるのは特に避けたい情報なのでstore_idで必ず絞る
    supabase.from('app_settings').select('key, value').eq('store_id', storeId).in('key', keys)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data ?? []).forEach(({ key, value }: { key: string; value: string }) => {
          const uid = key.replace('wage_', '');
          const n = parseInt(value, 10);
          if (!isNaN(n)) map[uid] = n;
        });
        setWages(map);
      });
  }, [users, storeId]);

  useEffect(() => {
    supabase.from('shifts')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', monthStart(year, month))
      .lte('date', monthEnd(year, month))
      .then(({ data }) => setShifts(data ?? []));
  }, [year, month, storeId]);

  const minutesByUser = useMemo(() =>
    shifts.reduce<Record<string, number>>((acc, s) => {
      acc[s.user_id] = (acc[s.user_id] ?? 0) + netWorkMinutes(s.start_time, s.end_time);
      return acc;
    }, {}),
    [shifts]
  );

  const getWage = (uid: string) => wages[uid] ?? DEFAULT_WAGE;

  const saveWage = async (uid: string, wage: number) => {
    setSavingWage(uid);
    // app_settingsの主キーは(store_id, key)の複合キーなのでonConflictを明示する
    await supabase.from('app_settings').upsert({ store_id: storeId, key: `wage_${uid}`, value: String(wage) }, { onConflict: 'store_id,key' });
    setSavingWage(null);
  };

  const handleWageChange = (uid: string, val: string) => {
    const n = parseInt(val.replace(/\D/g, ''), 10);
    if (!isNaN(n)) setWages(prev => ({ ...prev, [uid]: n }));
  };

  const totalHoursMin = users.reduce((acc, u) => acc + (minutesByUser[u.id] ?? 0), 0);
  const totalCost = users.reduce((acc, u) => {
    const mins = minutesByUser[u.id] ?? 0;
    return acc + (mins / 60) * getWage(u.id);
  }, 0);

  return (
    <div>
      <BackToSettings />
      <h2 className="text-xl font-bold text-slate-800 mb-6">人件費予測</h2>

      {/* 月タブ */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar">
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setTabIdx(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              i === tabIdx
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {monthLabel(t.year, t.month)}
          </button>
        ))}
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1">合計勤務時間</p>
          <p className="text-2xl font-bold text-slate-800">
            {Math.floor(totalHoursMin / 60)}
            <span className="text-base font-medium text-slate-500">h</span>
            {totalHoursMin % 60 > 0 && (
              <>{totalHoursMin % 60}<span className="text-base font-medium text-slate-500">m</span></>
            )}
          </p>
        </div>
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
          <p className="text-xs text-blue-400 mb-1">人件費合計（概算）</p>
          <p className="text-2xl font-bold text-blue-700">
            ¥{Math.round(totalCost).toLocaleString('ja-JP')}
          </p>
        </div>
      </div>

      {/* スタッフ別テーブル */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {users.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">スタッフが登録されていません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 font-semibold text-slate-600">スタッフ</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">月間時間</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">時給 (¥)</th>
                <th className="text-right px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">人件費</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => {
                const mins = minutesByUser[u.id] ?? 0;
                const wage = getWage(u.id);
                const cost = (mins / 60) * wage;
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${u.role === 'admin' ? 'bg-orange-500' : 'bg-blue-500'}`}>
                          {u.name[0]}
                        </span>
                        {u.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {mins === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <>{h}h{m > 0 && <span className="text-slate-400 text-xs">{m}m</span>}</>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-slate-400 text-xs">¥</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={wages[u.id] ?? DEFAULT_WAGE}
                          onChange={e => handleWageChange(u.id, e.target.value)}
                          onBlur={() => saveWage(u.id, getWage(u.id))}
                          className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 tabular-nums"
                        />
                        {savingWage === u.id && (
                          <span className="text-xs text-slate-400">...</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {mins === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span className="text-slate-800">¥{Math.round(cost).toLocaleString('ja-JP')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-5 py-3 font-bold text-slate-700" colSpan={2}>合計</td>
                <td className="px-4 py-3" />
                <td className="px-5 py-3 text-right font-bold text-blue-700 tabular-nums text-base">
                  ¥{Math.round(totalCost).toLocaleString('ja-JP')}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
        <p className="font-medium flex items-center gap-1.5">
          <IconAlertTriangle className="w-4 h-4 flex-shrink-0" />この数値はあくまで概算です
        </p>
        <p>シフト変更・残業・深夜割増賃金・各種手当・社会保険料等により、実際の人件費は大きく異なる場合があります。</p>
        <p className="text-amber-600">※ デフォルト時給は神奈川県最低賃金（2024年10月1日時点）¥{DEFAULT_WAGE.toLocaleString()}/h を設定しています。各スタッフの実際の時給に合わせて調整してください。</p>
      </div>
    </div>
  );
}
