'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import type { Feedback, FeedbackStatus } from '@/lib/types';

type Tab = 'new' | 'done';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}） ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CATEGORY_LABEL: Record<Feedback['category'], string> = { request: '要望', bug: '不具合' };
const CATEGORY_STYLE: Record<Feedback['category'], string> = {
  request: 'bg-violet-50 text-violet-700 border-violet-200',
  bug: 'bg-red-50 text-red-500 border-red-100',
};
const STATUS_LABEL: Record<FeedbackStatus, string> = { new: '未読', read: '既読', done: '対応済み' };
const STATUS_STYLE: Record<FeedbackStatus, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  read: 'bg-slate-50 text-slate-500 border-slate-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function AdminFeedbackPage() {
  // hq_admin(本部管理者)がこのページを開いた場合もRLS上は全店の要望が見えるが、
  // 「今表示している店舗」に絞り込むためクエリ側でも明示的にstore_idで絞る
  const { storeId } = useStore();
  const [tab, setTab] = useState<Tab>('new');
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('feedback')
      .select('*, user:users(name)')
      .eq('store_id', storeId)
      .eq('destination', 'store')
      .order('created_at', { ascending: false });
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

  const newItems = items.filter(i => i.status === 'new');
  const doneItems = items.filter(i => i.status !== 'new');
  const displayed = tab === 'new' ? newItems : doneItems;

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
      <h2 className="text-lg font-semibold tracking-tight text-slate-900 mb-4">要望・不具合</h2>

      {/* タブ */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        <button
          onClick={() => setTab('new')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors relative ${tab === 'new' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          未読
          {newItems.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full">
              {newItems.length}
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
          <p className="text-3xl mb-2">{tab === 'new' ? '📭' : '✅'}</p>
          <p className="text-sm">{tab === 'new' ? '未読の要望はありません' : '対応済みの要望はありません'}</p>
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

              {item.status !== 'done' && (
                <div className="border-t border-slate-100 mt-3 pt-3 flex justify-end">
                  <button
                    onClick={() => handlePatch(item.id, item.status === 'new' ? 'read' : 'done')}
                    disabled={patchingId === item.id}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
                  >
                    {patchingId === item.id ? '処理中…' : item.status === 'new' ? '既読にする' : '対応済みにする'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
