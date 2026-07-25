'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { ShiftRequest, ShiftRequestTarget } from '@/lib/types';
import { SHIFT_PRESETS } from '@/lib/types';

type Tab = 'pending' | 'past';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;
}

interface RequestWithTarget extends ShiftRequest {
  myTarget?: ShiftRequestTarget;
}

export default function StaffRequestsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<RequestWithTarget[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState<RequestWithTarget | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!user) return;

    const { data: reqData } = await supabase
      .from('shift_requests')
      .select('*, targets:shift_request_targets(*, user:users(id, name))')
      .neq('status', 'cancelled')
      .order('date', { ascending: true });

    const rows = (reqData as ShiftRequest[] | null) ?? [];

    const filtered: RequestWithTarget[] = rows
      .flatMap(req => {
        const targets = req.targets ?? [];
        const myTarget = targets.find((t: ShiftRequestTarget) => t.user_id === user.id);
        if (req.request_type === 'targeted' && !myTarget) return [];
        return [{ ...req, myTarget } as RequestWithTarget];
      });

    setRequests(filtered);
  }, [user]);

  useEffect(() => {
    fetchRequests();
    const channel = supabase.channel('staff-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_requests' }, fetchRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_request_targets' }, fetchRequests)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]);

  const isPending = (req: RequestWithTarget) => {
    if (req.status !== 'open') return false;
    if (!req.myTarget) return true;
    return req.myTarget.status === 'pending';
  };

  const pendingRequests = requests.filter(r => isPending(r));
  const pastRequests = requests.filter(r => !isPending(r));
  const displayedRequests = tab === 'pending' ? pendingRequests : pastRequests;

  const acceptRequest = async (req: RequestWithTarget) => {
    if (!user) return;
    setProcessing(req.id);

    const { data: existingShift } = await supabase
      .from('shifts')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', req.date)
      .single();

    if (existingShift) {
      setOverwriteConfirm(req);
      setProcessing(null);
      return;
    }

    await doAccept(req);
    setProcessing(null);
  };

  const doAccept = async (req: RequestWithTarget) => {
    if (!user) return;
    setProcessing(req.id);

    await supabase.from('shifts').upsert(
      {
        user_id: user.id,
        date: req.date,
        shift_type: req.shift_type ?? 'custom',
        start_time: req.start_time,
        end_time: req.end_time,
        comment: req.message ? `調整依頼: ${req.message}` : '調整依頼',
        status: 'draft',
      },
      { onConflict: 'user_id,date' }
    );

    if (req.myTarget) {
      await supabase
        .from('shift_request_targets')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', req.myTarget.id);
    } else {
      await supabase.from('shift_request_targets').insert({
        request_id: req.id,
        user_id: user.id,
        status: 'accepted',
        responded_at: new Date().toISOString(),
      });
    }

    await supabase.from('shift_requests').update({ status: 'fulfilled' }).eq('id', req.id);

    setProcessing(null);
    setOverwriteConfirm(null);
    fetchRequests();
  };

  const declineRequest = async (req: RequestWithTarget) => {
    if (!user) return;
    setProcessing(req.id);

    if (req.myTarget) {
      await supabase
        .from('shift_request_targets')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', req.myTarget.id);
    } else {
      await supabase.from('shift_request_targets').insert({
        request_id: req.id,
        user_id: user.id,
        status: 'declined',
        responded_at: new Date().toISOString(),
      });
    }

    setProcessing(null);
    fetchRequests();
  };

  const getShiftLabel = (req: ShiftRequest) => {
    if (req.shift_type && req.shift_type !== 'custom') {
      const preset = SHIFT_PRESETS[req.shift_type as Exclude<typeof req.shift_type, 'custom' | null>];
      if (preset) return `${preset.label}（${preset.start}〜${preset.end}）`;
    }
    return `${req.start_time}〜${req.end_time}`;
  };

  const getResponseLabel = (req: RequestWithTarget) => {
    const s = req.myTarget?.status;
    if (s === 'accepted') return { text: '承諾済み', cls: 'text-green-700 bg-green-50 border border-green-200' };
    if (s === 'declined') return { text: '辞退済み', cls: 'text-slate-500 bg-slate-50 border border-slate-200' };
    if (req.status === 'fulfilled') return { text: '締め切り済み（他の方が受けました）', cls: 'text-slate-400 bg-slate-50 border border-slate-100' };
    return null;
  };

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900 mb-4">調整依頼</h2>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4">
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors relative ${tab === 'pending' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          未対応
          {pendingRequests.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full">
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('past')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'past' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          過去の依頼
        </button>
      </div>

      {displayedRequests.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-3xl mb-2">{tab === 'pending' ? '📭' : '📋'}</p>
          <p className="text-sm">{tab === 'pending' ? '未対応の依頼はありません' : '過去の依頼はありません'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedRequests.map(req => {
            const responseLabel = getResponseLabel(req);
            const isFulfilledByOther = req.status === 'fulfilled' && req.myTarget?.status !== 'accepted';

            return (
              <div key={req.id} className={`bg-white rounded-xl border shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-4 ${isFulfilledByOther ? 'border-slate-100' : 'border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] px-1.5 py-px rounded font-medium border ${req.request_type === 'open' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                    {req.request_type === 'open' ? '掲示板' : '指名'}
                  </span>
                  {isFulfilledByOther && (
                    <span className="text-[10px] px-1.5 py-px rounded font-medium bg-slate-50 text-slate-500 border border-slate-200">締め切り</span>
                  )}
                </div>

                <p className={`font-semibold text-base ${isFulfilledByOther ? 'text-slate-400' : 'text-slate-800'}`}>
                  {formatDate(req.date)}
                </p>
                <p className={`text-sm mt-0.5 font-medium ${isFulfilledByOther ? 'text-slate-400' : 'text-blue-700'}`}>
                  {getShiftLabel(req)}
                </p>

                {req.message && (
                  <p className="text-sm text-slate-600 mt-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    {req.message}
                  </p>
                )}

                {responseLabel ? (
                  <div className={`mt-3 py-2.5 px-3 rounded-lg text-sm font-medium text-center ${responseLabel.cls}`}>
                    {responseLabel.text}
                  </div>
                ) : !isFulfilledByOther ? (
                  <div className="mt-3 space-y-2">
                    <button
                      onClick={() => acceptRequest(req)}
                      disabled={processing === req.id}
                      className="w-full py-3 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 active:bg-green-800 disabled:opacity-50 transition-colors"
                    >
                      {processing === req.id ? '処理中…' : '受ける'}
                    </button>
                    <button
                      onClick={() => declineRequest(req)}
                      disabled={processing === req.id}
                      className="w-full py-2 text-slate-400 text-sm hover:text-slate-600 disabled:opacity-50 transition-colors"
                    >
                      断る
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {overwriteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm">
            <h3 className="text-base font-bold text-slate-800 mb-1">シフトを上書きしますか？</h3>
            <p className="text-sm text-slate-500 mb-4">
              {formatDate(overwriteConfirm.date)} にはすでにシフトが登録されています。
              この依頼（{overwriteConfirm.start_time}〜{overwriteConfirm.end_time}）で上書きされます。
            </p>
            <div className="space-y-2">
              <button
                onClick={() => doAccept(overwriteConfirm)}
                disabled={processing !== null}
                className="w-full py-3 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                上書きして受ける
              </button>
              <button
                onClick={() => setOverwriteConfirm(null)}
                className="w-full py-2 text-slate-400 text-sm hover:text-slate-600 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
