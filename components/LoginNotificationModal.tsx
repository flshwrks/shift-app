'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useStoreOptional } from '@/lib/store';

interface PendingRequest {
  id: string; date: string; start_time: string; end_time: string; message: string; request_type: string;
}
interface FulfilledRequest {
  id: string; date: string; start_time: string; end_time: string; acceptedBy: string;
}
interface CancelledRequest {
  id: string; date: string; start_time: string; end_time: string;
}

type NotifScreen =
  | { type: 'staff_cancelled'; items: CancelledRequest[] }
  | { type: 'staff_pending'; items: PendingRequest[] }
  | { type: 'admin_fulfilled'; items: FulfilledRequest[] };

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;
}

export default function LoginNotificationModal() {
  const { user } = useAuth();
  // 店舗が特定できない文脈（本部レイアウト等）では通知を出しようがないので何も描画しない
  const store = useStoreOptional();
  const storeId = store?.storeId ?? null;
  const [queue, setQueue] = useState<NotifScreen[]>([]);

  useEffect(() => {
    if (!user || !storeId) return;
    const sessionKey = `login_notif_shown_${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');

    const build = async () => {
      const screens: NotifScreen[] = [];

      if (user.role === 'staff') {
        // 取消通知（承諾済みだったのに取り消された依頼）
        const seenKey = `cancelled_seen_${user.id}`;
        const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) ?? '[]'));

        const { data: myTargets } = await supabase
          .from('shift_request_targets')
          .select('request_id')
          .eq('user_id', user.id)
          .eq('status', 'accepted');

        const acceptedIds = (myTargets ?? []).map(t => t.request_id).filter(id => !seen.has(id));

        if (acceptedIds.length > 0) {
          const { data: cancelledReqs } = await supabase
            .from('shift_requests')
            .select('id, date, start_time, end_time')
            .in('id', acceptedIds)
            .eq('store_id', storeId)
            .eq('status', 'cancelled');

          if (cancelledReqs && cancelledReqs.length > 0) {
            screens.push({ type: 'staff_cancelled', items: cancelledReqs });
          }
        }

        // 未対応依頼
        const { data: pendingTargets } = await supabase
          .from('shift_request_targets')
          .select('request_id')
          .eq('user_id', user.id)
          .eq('status', 'pending');

        const pendingIds = (pendingTargets ?? []).map(t => t.request_id);

        const [{ data: targetedReqs }, { data: openReqs }] = await Promise.all([
          pendingIds.length > 0
            ? supabase.from('shift_requests').select('id, date, start_time, end_time, message, request_type').in('id', pendingIds).eq('store_id', storeId).eq('status', 'open')
            : Promise.resolve({ data: [] as PendingRequest[] }),
          supabase.from('shift_requests')
            .select('id, date, start_time, end_time, message, request_type, targets:shift_request_targets(user_id)')
            .eq('store_id', storeId)
            .eq('request_type', 'open')
            .eq('status', 'open'),
        ]);

        const openUnanswered = (openReqs ?? []).filter(r => {
          const targets = r.targets as { user_id: string }[];
          return !targets.some(t => t.user_id === user.id);
        });

        const pending: PendingRequest[] = [
          ...(targetedReqs ?? []),
          ...openUnanswered.map(r => ({ id: r.id, date: r.date, start_time: r.start_time, end_time: r.end_time, message: r.message, request_type: r.request_type })),
        ];

        if (pending.length > 0) screens.push({ type: 'staff_pending', items: pending });

      } else {
        // 管理者: 充足された依頼（未読のもののみ）
        const seenKey = `fulfilled_seen_${user.id}`;
        const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) ?? '[]'));

        const { data: fulfilledReqs } = await supabase
          .from('shift_requests')
          .select('id, date, start_time, end_time, targets:shift_request_targets(status, user:users(name))')
          .eq('store_id', storeId)
          .eq('status', 'fulfilled');

        const fulfilled: FulfilledRequest[] = (fulfilledReqs ?? [])
          .filter(r => !seen.has(r.id))
          .map(r => {
            const targets = r.targets as { status: string; user: { name: string } | { name: string }[] | null }[];
            const accepted = targets.find(t => t.status === 'accepted');
            const name = Array.isArray(accepted?.user) ? accepted.user[0]?.name : (accepted?.user as { name: string } | null)?.name;
            return { id: r.id, date: r.date, start_time: r.start_time, end_time: r.end_time, acceptedBy: name ?? '不明' };
          });

        if (fulfilled.length > 0) screens.push({ type: 'admin_fulfilled', items: fulfilled });
      }

      if (screens.length > 0) setQueue(screens);
    };

    build();
  }, [user, storeId]);

  const current = queue[0] ?? null;
  if (!current) return null;

  const dismiss = () => {
    if (user) {
      if (current.type === 'staff_cancelled') {
        const seenKey = `cancelled_seen_${user.id}`;
        const seen = JSON.parse(localStorage.getItem(seenKey) ?? '[]') as string[];
        localStorage.setItem(seenKey, JSON.stringify([...new Set([...seen, ...current.items.map(i => i.id)])]));
      }
      if (current.type === 'admin_fulfilled') {
        const seenKey = `fulfilled_seen_${user.id}`;
        const seen = JSON.parse(localStorage.getItem(seenKey) ?? '[]') as string[];
        localStorage.setItem(seenKey, JSON.stringify([...new Set([...seen, ...current.items.map(i => i.id)])]));
      }
    }
    setQueue(q => q.slice(1));
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm max-h-[80vh] flex flex-col">

        {current.type === 'staff_cancelled' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-900">承諾した依頼が取り消されました</h3>
            </div>
            <p className="text-sm text-slate-500 mb-3">{current.items.length} 件の依頼が管理者により取り消されました。シフトを確認してください。</p>
            <ul className="space-y-2 overflow-y-auto flex-1 mb-4">
              {current.items.map(r => (
                <li key={r.id} className="bg-rose-50 rounded-lg px-3 py-3 border border-rose-100">
                  <p className="text-sm font-semibold text-slate-700">{formatDate(r.date)}</p>
                  <p className="text-sm text-slate-500 tabular-nums">{r.start_time}〜{r.end_time}</p>
                </li>
              ))}
            </ul>
          </>
        )}

        {current.type === 'staff_pending' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18v12H3V6zM3 6l9 7 9-7" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-900">調整依頼があります</h3>
            </div>
            <p className="text-sm text-slate-500 mb-3">{current.items.length} 件の依頼に未対応です</p>
            <ul className="space-y-2 overflow-y-auto flex-1 mb-4">
              {current.items.map(r => (
                <li key={r.id} className="bg-slate-50 rounded-lg px-3 py-3 border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-px rounded font-medium border ${r.request_type === 'open' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                      {r.request_type === 'open' ? '掲示板' : '指名'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{formatDate(r.date)}</p>
                  <p className="text-sm text-slate-500 tabular-nums">{r.start_time}〜{r.end_time}</p>
                  {r.message && <p className="text-xs text-slate-400 mt-1">{r.message}</p>}
                </li>
              ))}
            </ul>
          </>
        )}

        {current.type === 'admin_fulfilled' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-900">調整依頼に受け手が現れました</h3>
            </div>
            <p className="text-sm text-slate-500 mb-3">{current.items.length} 件の依頼が充足されました</p>
            <ul className="space-y-2 overflow-y-auto flex-1 mb-4">
              {current.items.map(r => (
                <li key={r.id} className="bg-emerald-50 rounded-lg px-3 py-3 border border-emerald-100">
                  <p className="text-sm font-semibold text-slate-700">{formatDate(r.date)}</p>
                  <p className="text-sm text-slate-500 tabular-nums">{r.start_time}〜{r.end_time}</p>
                  <p className="text-sm text-emerald-700 font-medium mt-1">{r.acceptedBy} が承諾</p>
                </li>
              ))}
            </ul>
          </>
        )}

        <button
          onClick={dismiss}
          className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          確認しました
        </button>
      </div>
    </div>
  );
}
