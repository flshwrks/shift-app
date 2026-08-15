'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Feedback, FeedbackStatus } from '@/lib/types';

// 本部管理者だけが見る、「開発者へ」宛ての要望の受信箱（全店舗横断）。
//
// 店舗の受信箱（/s/[storeSlug]/admin/feedback）とは宛先で完全に分けている:
//   - 店舗の受信箱 = destination 'store'（管理者へ）… その店舗の管理者が対応する
//   - この画面      = destination 'dev'  （開発者へ）… アプリの作り手が対応する
// 同じ画面に混ぜると「誰が対応すべき要望なのか」が曖昧になるため、置き場を分けた。
//
// RLS上、本部管理者(is_hq_admin)は全店舗の全要望が見える。ここでは
// destination='dev' に絞ることで、店舗の管理者宛ての要望が紛れ込まないようにしている。

const GITHUB_REPO = process.env.NEXT_PUBLIC_FEEDBACK_REPO ?? '';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CATEGORY_LABEL: Record<Feedback['category'], string> = { request: '要望', bug: '不具合' };
const CATEGORY_STYLE: Record<Feedback['category'], string> = {
  request: 'bg-violet-50 text-violet-700 border-violet-200',
  bug: 'bg-red-50 text-red-500 border-red-100',
};

type Tab = 'open' | 'done';

export default function HqFeedbackPage() {
  const [tab, setTab] = useState<Tab>('open');
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('feedback')
      .select('*, user:users(name), store:stores(name, slug)')
      .eq('destination', 'dev')
      .order('created_at', { ascending: false });
    // 取得エラーを握りつぶすと「0件」と「読めていない」が区別できなくなるので画面に出す
    if (fetchError) setError(fetchError.message);
    setItems((data as Feedback[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('hq-feedback')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const openItems = items.filter(i => i.status !== 'done');
  const doneItems = items.filter(i => i.status === 'done');
  const displayed = tab === 'open' ? openItems : doneItems;

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
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">開発者へ届いた要望</h2>
      <p className="text-[13px] text-slate-500 mt-1 mb-4">
        全店舗のスタッフが「開発者へ」宛てに送ったものです。各店舗の管理者宛ての要望は、店舗ごとの管理画面にあります。
      </p>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        <button
          onClick={() => setTab('open')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'open' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
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
                  {item.store && (
                    <span className="text-[10px] px-1.5 py-px rounded font-medium border bg-slate-50 text-slate-600 border-slate-200">
                      {item.store.name}
                    </span>
                  )}
                  {item.app_version && (
                    <span className="text-[10px] text-slate-400 tabular-nums">v{item.app_version}</span>
                  )}
                </div>
                <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">{formatDateTime(item.created_at)}</span>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">{item.user?.name ?? '不明なユーザー'}</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{item.body}</p>

              <div className="border-t border-slate-100 mt-3 pt-3 flex items-center justify-between gap-2">
                {item.github_issue_number && GITHUB_REPO ? (
                  <a
                    href={`https://github.com/${GITHUB_REPO}/issues/${item.github_issue_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-700 hover:text-blue-800 underline underline-offset-2 tabular-nums"
                  >
                    Issue #{item.github_issue_number}
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">Issue未作成</span>
                )}

                {item.status === 'done' ? (
                  <button
                    onClick={() => handlePatch(item.id, 'new')}
                    disabled={patchingId === item.id}
                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    {patchingId === item.id ? '処理中…' : '未対応に戻す'}
                  </button>
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
