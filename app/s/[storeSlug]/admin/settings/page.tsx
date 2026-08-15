'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { formatYM } from '@/lib/shifts';

function getUpcomingMonths(count = 6): { year: number; month: number; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: `${d.getFullYear()}年${d.getMonth() + 1}月` };
  });
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const { storeId, storeSlug, storeName } = useStore();
  const months = getUpcomingMonths(6);
  const [periods, setPeriods] = useState<Record<string, string>>({});
  const [committedPeriods, setCommittedPeriods] = useState<Record<string, string>>({});
  const [openFeedbackCount, setOpenFeedbackCount] = useState(0);

  // 要望はナビに出さず、この画面から開く。未対応があることに気づけるよう件数を出す
  useEffect(() => {
    if (!storeId) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('destination', 'store')
        .neq('status', 'done');
      setOpenFeedbackCount(count ?? 0);
    };
    fetchCount();
    const channel = supabase.channel(`settings-feedback-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback', filter: `store_id=eq.${storeId}` }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId]);

  useEffect(() => {
    const keys = months.flatMap(m => [
      `period_open_${formatYM(m.year, m.month)}`,
      `period_close_${formatYM(m.year, m.month)}`,
    ]);
    supabase.from('app_settings').select('key, value').eq('store_id', storeId).in('key', keys)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach(({ key, value }: { key: string; value: string }) => { map[key] = value; });
        setPeriods(map);
        setCommittedPeriods(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const savePeriod = async (year: number, month: number) => {
    const ym = formatYM(year, month);
    const openKey = `period_open_${ym}`;
    const closeKey = `period_close_${ym}`;
    // app_settingsの主キーは(store_id, key)の複合キーなのでonConflictを明示する
    await Promise.all([
      supabase.from('app_settings').upsert({ store_id: storeId, key: openKey, value: periods[openKey] ?? '' }, { onConflict: 'store_id,key' }),
      supabase.from('app_settings').upsert({ store_id: storeId, key: closeKey, value: periods[closeKey] ?? '' }, { onConflict: 'store_id,key' }),
    ]);
    setCommittedPeriods(prev => ({ ...prev, [openKey]: periods[openKey] ?? '', [closeKey]: periods[closeKey] ?? '' }));
  };

  const clearPeriod = async (year: number, month: number) => {
    const ym = formatYM(year, month);
    const openKey = `period_open_${ym}`;
    const closeKey = `period_close_${ym}`;
    await Promise.all([
      supabase.from('app_settings').upsert({ store_id: storeId, key: openKey, value: '' }, { onConflict: 'store_id,key' }),
      supabase.from('app_settings').upsert({ store_id: storeId, key: closeKey, value: '' }, { onConflict: 'store_id,key' }),
    ]);
    setPeriods(prev => ({ ...prev, [openKey]: '', [closeKey]: '' }));
    setCommittedPeriods(prev => ({ ...prev, [openKey]: '', [closeKey]: '' }));
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">設定</h2>

      {/* 店舗名（表示のみ）: マルチ店舗化に伴い店舗名はstores.nameに一本化されたため、
          ここでは編集させず参照のみとする */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-1">店舗名</h3>
        <p className="text-xs text-slate-400 mb-3">ヘッダーに表示されます</p>
        <p className="text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{storeName}</p>
        <p className="text-xs text-slate-400 mt-2">店舗名の変更は本部管理者にご依頼ください</p>
      </div>

      {/* 提出期間 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-1">シフト提出期間</h3>
        <p className="text-xs text-slate-400 mb-4">月ごとに提出可能な期間を設定します。期間外はスタッフが提出できなくなります。未設定の月はいつでも提出可能です。</p>
        <div className="space-y-5">
          {months.map(({ year, month, label }) => {
            const ym = formatYM(year, month);
            const openKey = `period_open_${ym}`;
            const closeKey = `period_close_${ym}`;
            const openVal = periods[openKey] ?? '';
            const closeVal = periods[closeKey] ?? '';
            const isUnchanged = openVal === (committedPeriods[openKey] ?? '') && closeVal === (committedPeriods[closeKey] ?? '');
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
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="text-slate-400 text-sm flex-shrink-0">〜</span>
                  <input
                    type="date"
                    value={closeVal}
                    onChange={e => setPeriods(prev => ({ ...prev, [closeKey]: e.target.value }))}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    onClick={() => savePeriod(year, month)}
                    disabled={isUnchanged}
                    className={`px-3 py-2 text-sm font-medium rounded-lg flex-shrink-0 transition-colors ${
                      isUnchanged ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    保存
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

      {/* 人件費予測 */}
      <button
        onClick={() => router.push(`/s/${storeSlug}/admin/labor-cost`)}
        className="w-full bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
      >
        <div>
          <h3 className="font-semibold text-slate-700">人件費予測</h3>
          <p className="text-xs text-slate-400 mt-0.5">月別の労働時間 × 時給で概算人件費を確認</p>
        </div>
        <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* アンケート */}
      <button
        onClick={() => router.push(`/s/${storeSlug}/admin/survey`)}
        className="w-full bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
      >
        <div>
          <h3 className="font-semibold text-slate-700">アンケート管理</h3>
          <p className="text-xs text-slate-400 mt-0.5">スタッフへのアンケートを作成・公布・集計</p>
        </div>
        <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* 要望 */}
      <button
        onClick={() => router.push(`/s/${storeSlug}/admin/feedback`)}
        className="w-full bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
      >
        <div>
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            要望
            {openFeedbackCount > 0 && (
              <span className="min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {openFeedbackCount > 9 ? '9+' : openFeedbackCount}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">スタッフから届いた要望・不具合を確認</p>
        </div>
        <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* シフト種別一覧 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3">シフト種別</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="pb-2">種別</th><th className="pb-2">開始</th><th className="pb-2">終了</th><th className="pb-2">時間</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(['A','B','C','D','E','F','G'] as const).map(type => {
              const p = { A:['8:00','13:00',5], B:['9:00','14:00',5], C:['8:00','17:00',9], D:['9:00','18:00',9], E:['13:00','22:00',9], F:['17:00','22:00',5], G:['9:00','22:00',13] }[type] as [string,string,number];
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
