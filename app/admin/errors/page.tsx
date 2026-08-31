'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/EmptyState';

// 記録されたエラーの確認（本部管理者のみ）。点検項目 F-4。
// 外部の監視サービスを使わず自前で記録しているため、ここが唯一の確認場所になる。
// 即時通知は無いので、ナビのバッジで未対応件数に気づく形にしている。

const PAGE_SIZE = 100;

interface ErrorLog {
  id: string;
  source: 'client' | 'server';
  message: string;
  stack: string | null;
  path: string | null;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  actor_name: string | null;
  app_version: string | null;
  user_agent: string | null;
  status: 'new' | 'done';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dow = '日月火水木金土'[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${dow}） ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HqErrorsPage() {
  const [tab, setTab] = useState<'new' | 'done'>('new');
  const [items, setItems] = useState<ErrorLog[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // マイグレーション未適用（テーブルが無い）ことと、単に記録が0件であることを区別する
  const [notReady, setNotReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('error_logs')
      .select('id, source, message, stack, path, count, first_seen_at, last_seen_at, actor_name, app_version, user_agent, status')
      .eq('status', tab)
      .order('last_seen_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      setNotReady(true);
    } else {
      setNotReady(false);
      setItems((data ?? []) as ErrorLog[]);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const markDone = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.from('error_logs').update({ status: 'done' }).eq('id', id);
    setBusyId(null);
    if (!error) setItems(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">エラーの記録</h2>
        <p className="text-sm text-slate-500 mt-1">
          利用者の画面やサーバーで起きた想定外のエラーを記録しています。同じ内容はまとめて件数で表示されます。
        </p>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4">
        {(['new', 'done'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            {t === 'new' ? '未対応' : '対応済み'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-8 text-center">読み込み中…</p>
      ) : notReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">記録はまだ有効になっていません</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            データベース側の準備（<code className="font-mono">supabase/migrations/2026-08-31c_error_log.sql</code> の適用）が必要です。
          </p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="check" message={tab === 'new' ? '未対応のエラーはありません' : '対応済みの記録はありません'} />
      ) : (
        <ul className="space-y-2">
          {items.map(e => (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`text-[10px] px-1.5 py-px rounded border font-medium ${
                  e.source === 'server'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {e.source === 'server' ? 'サーバー' : '画面'}
                </span>
                {e.count > 1 && (
                  <span className="text-[10px] px-1.5 py-px rounded bg-slate-100 text-slate-600 font-medium tabular-nums">
                    {e.count}回
                  </span>
                )}
                <span className="text-xs text-slate-400 tabular-nums">最終 {formatDateTime(e.last_seen_at)}</span>
                {e.app_version && <span className="text-xs text-slate-400">v{e.app_version}</span>}
              </div>

              <p className="text-sm text-slate-800 mt-2 break-words font-medium">{e.message}</p>
              {e.path && <p className="text-xs text-slate-500 mt-1 font-mono break-all">{e.path}</p>}
              <p className="text-xs text-slate-400 mt-1">
                {e.actor_name ? `${e.actor_name} の画面` : '利用者不明'} ／ 初回 {formatDateTime(e.first_seen_at)}
              </p>

              {e.stack && (
                <>
                  <button
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                  >
                    {expanded === e.id ? '詳細を閉じる' : '詳細を見る'}
                  </button>
                  {expanded === e.id && (
                    <pre className="mt-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words text-slate-600">
                      {e.stack}
                      {e.user_agent ? `\n\n端末: ${e.user_agent}` : ''}
                    </pre>
                  )}
                </>
              )}

              {tab === 'new' && (
                <button
                  onClick={() => markDone(e.id)}
                  disabled={busyId === e.id}
                  className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busyId === e.id ? '処理中…' : '対応済みにする'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
