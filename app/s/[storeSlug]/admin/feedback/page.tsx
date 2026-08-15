'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import type { Feedback, FeedbackStatus } from '@/lib/types';

type Tab = 'open' | 'done';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}） ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CATEGORY_LABEL: Record<Feedback['category'], string> = { request: '要望', bug: '不具合' };
const CATEGORY_STYLE: Record<Feedback['category'], string> = {
  request: 'bg-violet-50 text-violet-700 border-violet-200',
  bug: 'bg-red-50 text-red-500 border-red-100',
};
// 状態は「未対応」と「対応済み」の2つだけを見せる。
// DBには 'read'（既読）もあるが、画面上で未読/既読/対応済みの3段階を出すと
// 「既読にしただけの要望が『対応済み』タブに並ぶ」という分かりにくさが生じたため、
// UIとしては done かどうかだけで扱う。
const STATUS_LABEL: Record<FeedbackStatus, string> = { new: '未対応', read: '未対応', done: '対応済み' };
const STATUS_STYLE: Record<FeedbackStatus, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  read: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function AdminFeedbackPage() {
  // hq_admin(本部管理者)がこのページを開いた場合もRLS上は全店の要望が見えるが、
  // 「今表示している店舗」に絞り込むためクエリ側でも明示的にstore_idで絞る
  const { storeId } = useStore();
  const [tab, setTab] = useState<Tab>('open');
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('feedback')
      .select('*, user:users(name)')
      .eq('store_id', storeId)
      .eq('destination', 'store')
      .order('created_at', { ascending: false });
    // 取得エラーを握りつぶすと「0件」と「読めていない」が区別できなくなるので画面に出す
    if (fetchError) setError(fetchError.message);
    setItems((data as Feedback[]) ?? []);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel(`admin-feedback-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback', filter: `store_id=eq.${storeId}` }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, storeId]);

  const openItems = items.filter(i => i.status !== 'done');
  const doneItems = items.filter(i => i.status === 'done');
  const displayed = tab === 'open' ? openItems : doneItems;

  // 対応済みのものだけ削除できる（未対応を読まずに消せてしまわないようにする）。
  // 元に戻せない操作なので確認を挟む
  const handleDelete = async (id: string) => {
    if (!window.confirm('この要望を削除します。元に戻せません。よろしいですか？')) return;
    setError('');
    setPatchingId(id);
    const res = await fetch('/api/feedback', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setPatchingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? '削除に失敗しました');
      return;
    }
    fetchData();
  };

  const handlePatch = async (id: string, status: FeedbackStatus) => {
    setError('');
    setPatchingId(id);
    const res = await fetch('/api/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    setPatchingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? '更新に失敗しました');
      return;
    }
    fetchData();
  };

  if (loading) {
    return <p className="text-center text-slate-400 py-12 text-sm">読み込み中…</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">要望・不具合</h2>
      <p className="text-[13px] text-slate-500 mt-1 mb-4">
        スタッフが「管理者へ」宛てに送ったものです。「開発者へ」宛てのものはここには届きません。
      </p>

      {/* タブ */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        <button
          onClick={() => setTab('open')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors relative ${tab === 'open' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          未対応
          {openItems.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full">
              {openItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('done')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'done' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          対応済み
          {doneItems.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-green-500 text-white text-xs font-bold rounded-full">
              {doneItems.length}
            </span>
          )}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-3xl mb-2">{tab === 'open' ? '📭' : '✅'}</p>
          <p className="text-sm">{tab === 'open' ? '未対応の要望はありません' : '対応済みの要望はありません'}</p>
          {/* 「片方のタブが空」だけを見て何も無いと誤解されないよう、もう一方の件数を出す */}
          {tab === 'open' && doneItems.length > 0 && (
            <button onClick={() => setTab('done')} className="mt-2 text-xs text-blue-700 underline underline-offset-2">
              対応済みが{doneItems.length}件あります
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(item => (
            <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-px rounded font-medium border ${CATEGORY_STYLE[item.category]}`}>
                    {CATEGORY_LABEL[item.category]}
                  </span>
                  <span className={`text-[10px] px-1.5 py-px rounded font-medium border ${STATUS_STYLE[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">{formatDateTime(item.created_at)}</span>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">{item.user?.name ?? '不明なユーザー'}</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{item.body}</p>

              <div className="border-t border-slate-100 mt-3 pt-3 flex justify-end gap-2">
                {item.status === 'done' ? (
                  <>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={patchingId === item.id}
                      className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      削除
                    </button>
                    {/* 押し間違いから戻せるようにしておく（誤操作しないことを最優先にする方針） */}
                    <button
                      onClick={() => handlePatch(item.id, 'new')}
                      disabled={patchingId === item.id}
                      className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    >
                      {patchingId === item.id ? '処理中…' : '未対応に戻す'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handlePatch(item.id, 'done')}
                    disabled={patchingId === item.id}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
                  >
                    {patchingId === item.id ? '処理中…' : '対応済みにする'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
