'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatYM } from '@/lib/shifts';

function getUpcomingMonths(count = 6): { year: number; month: number; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: `${d.getFullYear()}年${d.getMonth() + 1}月` };
  });
}

export default function AdminSettingsPage() {
  const months = getUpcomingMonths(6);
  const [periods, setPeriods] = useState<Record<string, string>>({});
  const [savedPeriods, setSavedPeriods] = useState<Record<string, boolean>>({});
  const [orgName, setOrgName] = useState('');
  const [orgSaved, setOrgSaved] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'org_name').single()
      .then(({ data }) => { if (data?.value) setOrgName(data.value); });

    const keys = months.flatMap(m => [
      `period_open_${formatYM(m.year, m.month)}`,
      `period_close_${formatYM(m.year, m.month)}`,
    ]);
    supabase.from('app_settings').select('key, value').in('key', keys)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach(({ key, value }: { key: string; value: string }) => { map[key] = value; });
        setPeriods(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveOrgName = async () => {
    await supabase.from('app_settings').upsert({ key: 'org_name', value: orgName });
    setOrgSaved(true);
    setTimeout(() => setOrgSaved(false), 2000);
  };

  const savePeriod = async (year: number, month: number) => {
    const ym = formatYM(year, month);
    const openKey = `period_open_${ym}`;
    const closeKey = `period_close_${ym}`;
    const saveKey = `${ym}`;
    await Promise.all([
      supabase.from('app_settings').upsert({ key: openKey, value: periods[openKey] ?? '' }),
      supabase.from('app_settings').upsert({ key: closeKey, value: periods[closeKey] ?? '' }),
    ]);
    setSavedPeriods(prev => ({ ...prev, [saveKey]: true }));
    setTimeout(() => setSavedPeriods(prev => ({ ...prev, [saveKey]: false })), 2000);
  };

  const clearPeriod = async (year: number, month: number) => {
    const ym = formatYM(year, month);
    const openKey = `period_open_${ym}`;
    const closeKey = `period_close_${ym}`;
    await Promise.all([
      supabase.from('app_settings').upsert({ key: openKey, value: '' }),
      supabase.from('app_settings').upsert({ key: closeKey, value: '' }),
    ]);
    setPeriods(prev => ({ ...prev, [openKey]: '', [closeKey]: '' }));
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-bold text-slate-800">設定</h2>

      {/* 組織名 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-1">組織名</h3>
        <p className="text-xs text-slate-400 mb-3">ヘッダーに表示されます</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={orgName}
            onChange={e => { setOrgName(e.target.value); setOrgSaved(false); }}
            placeholder="例: ○○カフェ"
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={saveOrgName}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              orgSaved ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {orgSaved ? '✓ 保存' : '保存'}
          </button>
        </div>
      </div>

      {/* 提出期間 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-1">シフト提出期間</h3>
        <p className="text-xs text-slate-400 mb-4">月ごとに提出可能な期間を設定します。期間外はスタッフが提出できなくなります。未設定の月はいつでも提出可能です。</p>
        <div className="space-y-5">
          {months.map(({ year, month, label }) => {
            const ym = formatYM(year, month);
            const openKey = `period_open_${ym}`;
            const closeKey = `period_close_${ym}`;
            const openVal = periods[openKey] ?? '';
            const closeVal = periods[closeKey] ?? '';
            const saved = savedPeriods[ym];
            const hasPeriod = openVal || closeVal;
            return (
              <div key={ym}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-slate-600">{label}</p>
                  {hasPeriod && (
                    <button onClick={() => clearPeriod(year, month)} className="text-xs text-red-400 hover:text-red-600">
                      解除
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={openVal}
                    onChange={e => setPeriods(prev => ({ ...prev, [openKey]: e.target.value }))}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="text-slate-400 text-sm flex-shrink-0">〜</span>
                  <input
                    type="date"
                    value={closeVal}
                    onChange={e => setPeriods(prev => ({ ...prev, [closeKey]: e.target.value }))}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    onClick={() => savePeriod(year, month)}
                    className={`px-3 py-2 text-sm font-medium rounded-xl flex-shrink-0 transition-colors ${
                      saved ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {saved ? '✓' : '保存'}
                  </button>
                </div>
                {hasPeriod && (
                  <p className="text-xs text-slate-400 mt-1">
                    提出可能期間: {openVal ? new Date(openVal + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '?'} 〜 {closeVal ? new Date(closeVal + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '?'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* シフト種別一覧 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3">シフト種別</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="pb-2">種別</th><th className="pb-2">開始</th><th className="pb-2">終了</th><th className="pb-2">時間</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(['A','B','C','D','E','F'] as const).map(type => {
              const p = { A:['8:00','13:00',5], B:['9:00','14:00',5], C:['8:00','17:00',9], D:['9:00','18:00',9], E:['13:00','22:00',9], F:['17:00','22:00',5] }[type] as [string,string,number];
              return (
                <tr key={type}>
                  <td className="py-1.5 font-bold text-blue-600">{type}</td>
                  <td className="py-1.5 text-slate-600">{p[0]}</td>
                  <td className="py-1.5 text-slate-600">{p[1]}</td>
                  <td className="py-1.5 text-slate-400">{p[2]}h</td>
                </tr>
              );
            })}
            <tr><td className="py-1.5 font-medium text-slate-500">カスタム</td><td className="py-1.5 text-slate-400" colSpan={3}>8:00〜22:00 / 30分刻み</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
