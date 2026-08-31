'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import EmptyState from '@/components/EmptyState';
import BackToSettings from '@/components/BackToSettings';

// 操作の記録（監査ログ）の閲覧。点検項目 F-3 への対応。
// 「勝手にシフトを変えられた」「知らない間に権限が変わった」という申し立てを
// 検証するための画面なので、**検索や編集はできない**。並べて見せるだけでよい。

const PAGE_SIZE = 100;

interface AuditLog {
  id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_name: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  'shift.confirm': 'シフトを確定した',
  'shift.unconfirm': '確定を取り消した',
  'shift.time_change': 'シフトの時刻を変えた',
  'shift.delete': 'シフトを削除した',
  'user.create': 'スタッフを追加した',
  'user.delete': 'スタッフを削除した',
  'user.role_change': '権限を変えた',
  'user.rename': '名前を変えた',
  'user.pin_reset': '暗証番号を再発行した',
  'store.create': '店舗を追加した',
  'store.delete': '店舗を削除した',
};

// 権限に関わる操作は後から必ず問われるため、視覚的に区別する
const IMPORTANT = new Set(['user.role_change', 'user.delete', 'user.pin_reset', 'store.delete']);

const ROLE_LABEL: Record<string, string> = {
  hq_admin: '本部管理者', admin: '店舗管理者', staff: 'スタッフ', developer: '開発者', unknown: '不明',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}） ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** detail(jsonb) を日本語の一文にする。中身は操作の種類ごとに違う */
function describeDetail(action: string, detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const s = (k: string) => (detail[k] == null ? '' : String(detail[k]));
  const date = s('date');
  // 休みは時刻を持たない（00:00〜00:00 になる）ので、時刻ではなく種別を出す。
  // shift_type は 2026-08-31b の追補で入れたため、それ以前の記録には無い
  const isOff = s('shift_type') === 'off';
  switch (action) {
    case 'shift.confirm':
    case 'shift.unconfirm':
      return date ? `${date} の${isOff ? '休み' : 'シフト'}` : '';
    case 'shift.time_change':
      return `${date ? date + ' ' : ''}${s('from')} → ${s('to')}`;
    case 'shift.delete':
      return isOff ? `${date} の休み` : `${date ? date + ' ' : ''}${s('time')}`;
    case 'user.role_change':
      return `${ROLE_LABEL[s('from')] ?? s('from')} → ${ROLE_LABEL[s('to')] ?? s('to')}`;
    case 'user.rename':
      return `${s('from')} → ${s('to')}`;
    case 'user.create':
      return ROLE_LABEL[s('role')] ?? s('role');
    case 'store.create':
    case 'store.delete':
      return s('slug') ? `店舗ID: ${s('slug')}` : '';
    default:
      return '';
  }
}

export default function AdminAuditPage() {
  const { storeId } = useStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  // マイグレーション未適用（テーブルが無い）ことと、単に記録が0件であることを区別する
  const [notReady, setNotReady] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, actor_name, actor_role, action, target_type, target_name, detail, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (!alive) return;
      if (error) {
        setNotReady(true);
      } else {
        setNotReady(false);
        setHasMore((data ?? []).length > PAGE_SIZE);
        setLogs((data ?? []).slice(0, PAGE_SIZE) as AuditLog[]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [storeId]);

  return (
    <div>
      <BackToSettings />
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">操作の記録</h2>
        <p className="text-sm text-slate-500 mt-1">
          シフトの確定・取消、スタッフの追加・削除、権限の変更などを記録しています。あとから消したり書き換えたりはできません。
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-8 text-center">読み込み中…</p>
      ) : notReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">記録はまだ有効になっていません</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            データベース側の準備（<code className="font-mono">supabase/migrations/2026-08-31_audit_log.sql</code> の適用）が必要です。
            適用すると、それ以降の操作が記録されます。
          </p>
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon="clipboard" message="まだ記録がありません" />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {logs.map(log => {
                const detail = describeDetail(log.action, log.detail);
                return (
                  <li key={log.id} className="px-4 py-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-xs text-slate-400 tabular-nums w-28 flex-shrink-0">
                      {formatDateTime(log.created_at)}
                    </span>
                    <span className="text-sm font-medium text-slate-700">{log.actor_name}</span>
                    <span className="text-[10px] px-1.5 py-px rounded border border-slate-200 text-slate-500">
                      {ROLE_LABEL[log.actor_role] ?? log.actor_role}
                    </span>
                    <span className={`text-sm ${IMPORTANT.has(log.action) ? 'text-rose-700 font-medium' : 'text-slate-600'}`}>
                      {ACTION_LABEL[log.action] ?? log.action}
                    </span>
                    {log.target_name && (
                      <span className="text-sm text-slate-500">対象: {log.target_name}</span>
                    )}
                    {detail && <span className="text-xs text-slate-400">{detail}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          {hasMore && (
            <p className="text-xs text-slate-400 mt-3 text-center">
              最新の{PAGE_SIZE}件を表示しています。それより前の記録はデータベースに残っています
            </p>
          )}
        </>
      )}
    </div>
  );
}
