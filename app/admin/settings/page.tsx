'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatYM } from '@/lib/shifts';

function getUpcomingMonths(count = 3): { year: number; month: number; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: `${d.getFullYear()}年${d.getMonth() + 1}月` };
  });
}

export default function AdminSettingsPage() {
  const months = getUpcomingMonths(4);
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});
  const [savedDeadlines, setSavedDeadlines] = useState<Record<string, boolean>>({});
  const [orgName, setOrgName] = useState('');
  const [orgSaved, setOrgSaved] = useState(false);

  useEffect(() => {
    // 組織名
    supabase.from('app_settings').select('value').eq('key', 'org_name').single()
      .then(({ data }) => { if (data?.value) setOrgName(data.value); });

    // 月別締切
    const keys = months.map(m => `deadline_${formatYM(m.year, m.month)}`);
    supabase.from('app_settings').select('key, value').in('key', keys)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach(({ key, value }: { key: string; value: string }) => { map[key] = value; });
        setDeadlines(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveOrgName = async () => {
    await supabase.from('app_settings').upsert({ key: 'org_name', value: orgName });
    setOrgSaved(true);
    setTimeout(() => setOrgSaved(false), 2000);
  };

  const saveDeadline = async (year: number, month: number) => {
    const key = `deadline_${formatYM(year, month)}`;
    await supabase.from('app_settings').upsert({ key, value: deadlines[key] ?? '' });
    setSavedDeadlines(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setSavedDeadlines(prev => ({ ...prev, [key]: false })), 2000);
  };

  const clearDeadline = async (year: number, month: number) => {
    const key = `deadline_${formatYM(year, month)}`;
    await supabase.from('app_settings').upsert({ key, value: '' });
    setDeadlines(prev => ({ ...prev, [key]: '' }));
  };

  return (
    <div className="space-y-6 max-w-md">
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

      {/* 月別締切 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-1">シフト申請 締切日</h3>
        <p className="text-xs text-slate-400 mb-4">月ごとに設定できます。設定日時以降はスタッフが変更できなくなります。</p>
        <div className="space-y-4">
          {months.map(({ year, month, label }) => {
            const key = `deadline_${formatYM(year, month)}`;
            const val = deadlines[key] ?? '';
            const saved = savedDeadlines[key];
            return (
              <div key={key}>
                <p className="text-sm font-medium text-slate-600 mb-1.5">{label}</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="datetime-local"
                    value={val}
                    onChange={e => { setDeadlines(prev => ({ ...prev, [key]: e.target.value })); setSavedDeadlines(prev => ({ ...prev, [key]: false })); }}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    onClick={() => saveDeadline(year, month)}
                    className={`px-3 py-2 text-sm font-medium rounded-xl flex-shrink-0 transition-colors ${
                      saved ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {saved ? '✓' : '保存'}
                  </button>
                  {val && (
                    <button onClick={() => clearDeadline(year, month)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">解除</button>
                  )}
                </div>
                {val && (
                  <p className="text-xs text-slate-400 mt-1">
                    締切: {new Date(val).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
