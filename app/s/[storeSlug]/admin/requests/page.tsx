'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { usePersistedMonth } from '@/lib/usePersistedMonth';
import ShiftRequestModal from '@/components/ShiftRequestModal';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import type { ShiftRequest, ShiftRequestTarget, User } from '@/lib/types';

type Tab = 'open' | 'fulfilled';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;
}

interface ShiftInfo { id: string; status: 'draft' | 'confirmed'; user_id: string; }

export default function AdminRequestsPage() {
  const { user } = useAuth();
  const { storeId } = useStore();
  const [tab, setTab] = useState<Tab>('open');
  const { year, month, prevMonth, nextMonth } = usePersistedMonth('month_admin_requests');
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [shiftMap, setShiftMap] = useState<Record<string, ShiftInfo>>({});
  const [showModal, setShowModal] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<ShiftRequest | null>(null);
  const [cancelError, setCancelError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState('');

  const fetchData = useCallback(async () => {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [{ data: reqData }, { data: usersData }, { data: shiftsData }] = await Promise.all([
      supabase
        .from('shift_requests')
        .select('*, targets:shift_request_targets(*, user:users(id, name))')
        .eq('store_id', storeId)
        .neq('status', 'cancelled')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase.from('users').select('id, name, role, created_at').eq('store_id', storeId).order('display_order', { ascending: true, nullsFirst: false }),
      supabase.from('shifts').select('id, user_id, date, status').eq('store_id', storeId).gte('date', start).lte('date', end),
    ]);

    setRequests((reqData as ShiftRequest[]) ?? []);
    setUsers(usersData ?? []);

    const newShiftMap: Record<string, ShiftInfo> = {};
    (shiftsData ?? []).forEach((s: ShiftInfo & { date: string }) => {
      newShiftMap[`${s.user_id}_${s.date}`] = { id: s.id, status: s.status, user_id: s.user_id };
    });
    setShiftMap(newShiftMap);
  }, [year, month, storeId]);

  useEffect(() => {
    fetchData();
    // shift_request_targetsにはstore_id列が無いためfilterを付けない（親のshift_requests経由でスコープされる）
    const channel = supabase.channel(`admin-requests-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_requests', filter: `store_id=eq.${storeId}` }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_request_targets' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `store_id=eq.${storeId}` }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, storeId]);

  const handleCancel = async (req: ShiftRequest) => {
    // 承諾済みの下書きシフトが残っていると「依頼は取消済みなのにシフトだけ残る」
    // 不整合が起きるため、取消と同時に削除する。確定済みシフトがある場合は
    // このフローでは取消できないようにする（ボタン側でも disabled にしている）。
    const acceptedShift = getAcceptedShift(req);
    if (acceptedShift?.status === 'confirmed') return;

    setCancelError('');
    if (acceptedShift) {
      const { error } = await supabase.from('shifts').delete().eq('id', acceptedShift.id);
      if (error) { setCancelError('シフトの削除に失敗しました: ' + error.message); return; }
    }
    const { error } = await supabase.from('shift_requests').update({ status: 'cancelled' }).eq('id', req.id);
    if (error) { setCancelError('依頼の取消に失敗しました: ' + error.message); return; }
    setCancelConfirm(null);
    fetchData();
  };

  const startCancel = (req: ShiftRequest) => {
    setCancelError('');
    setCancelConfirm(req);
  };

  const confirmShift = async (req: ShiftRequest) => {
    const accepted = (req.targets ?? []).find((t: ShiftRequestTarget) => t.status === 'accepted');
    if (!accepted) return;
    const shiftKey = `${accepted.user_id}_${req.date}`;
    const shift = shiftMap[shiftKey];
    if (!shift) return;

    setConfirming(req.id);
    setConfirmError('');
    const { error } = await supabase.from('shifts').update({ status: 'confirmed' }).eq('id', shift.id);
    setConfirming(null);
    if (error) { setConfirmError('確定に失敗しました: ' + error.message); return; }
    fetchData();
  };

  const getAcceptedShift = (req: ShiftRequest) => {
    const accepted = (req.targets ?? []).find((t: ShiftRequestTarget) => t.status === 'accepted');
    if (!accepted) return null;
    return shiftMap[`${accepted.user_id}_${req.date}`] ?? null;
  };

  const openRequests = requests.filter(r => r.status === 'open');
  const fulfilledRequests = requests.filter(r => r.status === 'fulfilled');
  const displayed = tab === 'open' ? openRequests : fulfilledRequests;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} aria-label="前の月" className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center">
            <IconChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 whitespace-nowrap">{year}年{month + 1}月</h2>
          <button onClick={nextMonth} aria-label="次の月" className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center">
            <IconChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors whitespace-nowrap"
        >
          + 依頼を出す
        </button>
      </div>

      {/* タブ */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        <button
          onClick={() => setTab('open')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors relative ${tab === 'open' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          募集中
          {openRequests.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full">
              {openRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('fulfilled')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'fulfilled' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          承諾済み
          {fulfilledRequests.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-green-500 text-white text-xs font-bold rounded-full">
              {fulfilledRequests.length}
            </span>
          )}
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-3xl mb-2">{tab === 'open' ? '📋' : '✅'}</p>
          <p className="text-sm">
            {tab === 'open' ? '募集中の依頼はありません' : '承諾済みの依頼はありません'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(req => {
            const acceptedTarget = (req.targets ?? []).find((t: ShiftRequestTarget) => t.status === 'accepted');
            const acceptedShift = getAcceptedShift(req);
            const isConfirmed = acceptedShift?.status === 'confirmed';

            return (
              <div key={req.id} className={`bg-white rounded-xl border p-4 ${isConfirmed ? 'border-emerald-200' : 'border-slate-200'}`}>
                {/* カードヘッダー */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-[10px] px-1.5 py-px rounded font-medium border ${req.request_type === 'targeted' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                        {req.request_type === 'targeted' ? '指名' : '掲示板'}
                      </span>
                      {isConfirmed && (
                        <span className="text-[10px] px-1.5 py-px rounded font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">シフト確定済み</span>
                      )}
                    </div>
                    <p className="font-semibold text-slate-800">{formatDate(req.date)}</p>
                    <p className="text-sm text-blue-700 font-medium mt-0.5">{req.start_time}〜{req.end_time}</p>
                    {req.message && (
                      <p className="text-sm text-slate-500 mt-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">{req.message}</p>
                    )}
                  </div>
                  <button
                    onClick={() => startCancel(req)}
                    className="text-xs px-2.5 py-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 flex-shrink-0 transition-colors"
                  >
                    取消
                  </button>
                </div>

                {/* 募集中タブ: スタッフ応答状況 */}
                {tab === 'open' && (
                  <>
                    {req.request_type === 'targeted' && req.targets && req.targets.length > 0 && (
                      <div className="border-t border-slate-100 pt-2.5">
                        <p className="text-xs text-slate-400 mb-2">送信先</p>
                        <div className="flex flex-wrap gap-2">
                          {req.targets.map((t: ShiftRequestTarget) => (
                            <span key={t.id} className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-medium ${
                              t.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              t.status === 'declined' ? 'bg-red-50 text-red-500 border border-red-100' :
                              'bg-slate-50 text-slate-500 border border-slate-200'
                            }`}>
                              {t.user?.name ?? '—'}
                              <span>{t.status === 'accepted' ? '✓' : t.status === 'declined' ? '✗' : '…'}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {req.request_type === 'open' && req.targets && req.targets.length > 0 && (
                      <div className="border-t border-slate-100 pt-2.5 flex flex-wrap gap-2">
                        {req.targets.filter((t: ShiftRequestTarget) => t.status === 'declined').map((t: ShiftRequestTarget) => (
                          <span key={t.id} className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-400 border border-slate-100">
                            {t.user?.name} 辞退
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* 承諾済みタブ: 承諾者と確定ボタン */}
                {tab === 'fulfilled' && acceptedTarget && (
                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">承諾スタッフ</p>
                        <p className="text-sm font-semibold text-slate-800">{acceptedTarget.user?.name ?? '—'}</p>
                      </div>
                      {isConfirmed ? (
                        <div className="flex items-center gap-1.5 text-emerald-600">
                          <span className="text-base">✅</span>
                          <span className="text-sm font-medium">確定済み</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => confirmShift(req)}
                          disabled={confirming === req.id}
                          className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 transition-colors"
                        >
                          {confirming === req.id ? '処理中…' : 'シフトを確定する'}
                        </button>
                      )}
                    </div>
                    {!isConfirmed && (
                      <p className="text-xs text-slate-400 mt-2">確定するとスタッフの下書きシフトが確定されます</p>
                    )}
                    {confirming === null && confirmError && (
                      <p className="text-xs text-red-500 mt-2">{confirmError}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && user && (
        <ShiftRequestModal
          users={users}
          createdBy={user.id}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchData(); }}
        />
      )}

      {cancelConfirm && (() => {
        const acceptedTarget = (cancelConfirm.targets ?? []).find((t: ShiftRequestTarget) => t.status === 'accepted');
        const acceptedShift = getAcceptedShift(cancelConfirm);
        const blockedByConfirmed = acceptedShift?.status === 'confirmed';
        return (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-2">依頼を取り消しますか？</h3>
            {blockedByConfirmed ? (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4">
                <p className="text-sm text-red-700 font-medium">⚠️ このシフトはすでに確定済みです</p>
                <p className="text-sm text-red-600 mt-0.5">取消するには、シフト管理画面から直接シフトを削除してください</p>
              </div>
            ) : acceptedTarget ? (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4">
                <p className="text-sm text-red-700 font-medium">⚠️ {acceptedTarget.user?.name ?? '承諾済みのスタッフ'} が承諾済みです</p>
                <p className="text-sm text-red-600 mt-0.5">取消すると、登録された下書きシフトも削除されます</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 mb-4">この操作は取り消せません。</p>
            )}
            {cancelError && <p className="text-sm text-red-500 mb-3">{cancelError}</p>}
            <div className="space-y-2">
              <button
                onClick={() => handleCancel(cancelConfirm)}
                disabled={blockedByConfirmed}
                className="w-full py-3 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                取り消す
              </button>
              <button
                onClick={() => setCancelConfirm(null)}
                className="w-full py-2 text-slate-400 text-sm hover:text-slate-600 transition-colors"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
