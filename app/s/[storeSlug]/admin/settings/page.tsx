'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { formatYM } from '@/lib/shifts';
import { IconTrendingUp, IconClipboard, IconMessageSquare, IconChevronRight, IconDownload } from '@/components/icons';

// 提出期間は当面の1〜2ヶ月しか触らないのに6ヶ月分を常に並べていたため、
// 設定画面が縦に長くなりすぎていた。手前の数ヶ月だけ出し、残りは畳む
const ALWAYS_VISIBLE_MONTHS = 2;

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
  const [showAllMonths, setShowAllMonths] = useState(false);

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
        <div className="space-y-4">
          {(showAllMonths ? months : months.slice(0, ALWAYS_VISIBLE_MONTHS)).map(({ year, month, label }) => {
            const ym = formatYM(year, month);
            const openKey = `period_open_${ym}`;
            const closeKey = `period_close_${ym}`;
            const openVal = periods[openKey] ?? '';
            const closeVal = periods[closeKey] ?? '';
            const isUnchanged = openVal === (committedPeriods[openKey] ?? '') && closeVal === (committedPeriods[closeKey] ?? '');
            const hasPeriod = openVal || closeVal;
            return (
              <div key={ym}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <p className="text-sm font-medium text-slate-600">{label}</p>
                  {hasPeriod && (
                    <p className="text-xs text-slate-400 tabular-nums truncate">
                      {openVal ? new Date(openVal + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '?'} 〜 {closeVal ? new Date(closeVal + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '?'}
                    </p>
                  )}
                </div>
                {/* min-w-0 が無いと、date入力が持つ最小幅より縮まず行がはみ出す
                    （flexアイテムの min-width は既定が auto のため） */}
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={openVal}
                    onChange={e => setPeriods(prev => ({ ...prev, [openKey]: e.target.value }))}
                    className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="text-slate-400 text-sm flex-shrink-0">〜</span>
                  <input
                    type="date"
                    value={closeVal}
                    onChange={e => setPeriods(prev => ({ ...prev, [closeKey]: e.target.value }))}
                    className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                {/* 操作ボタンは必要なときだけ出す。常に置くと縦に伸びて一覧性が落ちる */}
                {(!isUnchanged || hasPeriod) && (
                  <div className="flex justify-end gap-2 mt-1.5">
                    {hasPeriod && (
                      <button onClick={() => clearPeriod(year, month)} className="px-3 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        解除
                      </button>
                    )}
                    {!isUnchanged && (
                      <button
                        onClick={() => savePeriod(year, month)}
                        className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        保存
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {months.length > ALWAYS_VISIBLE_MONTHS && (
          <button
            onClick={() => setShowAllMonths(v => !v)}
            className="mt-4 w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
          >
            {showAllMonths ? '先の月を閉じる' : `先の月も設定する（あと${months.length - ALWAYS_VISIBLE_MONTHS}ヶ月）`}
          </button>
        )}
      </div>

      {/* 管理メニュー: 同じ見た目の白いボタンが並ぶと区別がつかず、押せることも伝わりにくい。
          色付きのアイコンタイルで種類を見分けられるようにする（配色はヘルプの
          セクション色と同じ言語を使い、新しい配色を持ち込まない） */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">管理メニュー</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { path: 'labor-cost', title: '人件費予測', desc: '労働時間 × 時給で概算を確認', Icon: IconTrendingUp, tile: 'bg-blue-600', badge: 0 },
            { path: 'survey', title: 'アンケート管理', desc: '作成・公布・集計', Icon: IconClipboard, tile: 'bg-green-600', badge: 0 },
            { path: 'kot', title: 'KING OF TIME 連携', desc: '確定シフトを勤怠システム用CSVに変換', Icon: IconDownload, tile: 'bg-slate-600', badge: 0 },
            { path: 'feedback', title: '要望', desc: 'スタッフから届いた要望・不具合', Icon: IconMessageSquare, tile: 'bg-violet-600', badge: openFeedbackCount },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => router.push(`/s/${storeSlug}/admin/${item.path}`)}
              className="bg-white rounded-xl border border-slate-200 p-4 flex sm:flex-col items-center sm:items-start gap-3 hover:bg-slate-50 hover:border-slate-300 transition-colors text-left"
            >
              <div className={`relative w-10 h-10 rounded-lg ${item.tile} flex items-center justify-center flex-shrink-0`}>
                <item.Icon className="w-5 h-5 text-white" />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center px-0.5">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
              <IconChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 sm:hidden" />
            </button>
          ))}
        </div>
      </div>

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
