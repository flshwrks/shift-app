'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useStore } from '@/lib/store';
import type { User, ShiftType, RequestType } from '@/lib/types';
import { SHIFT_PRESETS } from '@/lib/types';

interface Props {
  users: User[];
  defaultDate?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  createdBy: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ShiftRequestModal({ users, defaultDate, defaultStartTime, defaultEndTime, createdBy, onClose, onSaved }: Props) {
  useBodyScrollLock();
  const { storeId } = useStore();

  const hasCustomTime = !!defaultStartTime && !!defaultEndTime;
  const [requestType, setRequestType] = useState<RequestType>('targeted');
  const [date, setDate] = useState(defaultDate ?? '');
  const [shiftType, setShiftType] = useState<Exclude<ShiftType, 'off'> | 'custom'>(hasCustomTime ? 'custom' : 'A');
  const [startTime, setStartTime] = useState(defaultStartTime ?? SHIFT_PRESETS.A.start);
  const [endTime, setEndTime] = useState(defaultEndTime ?? SHIFT_PRESETS.A.end);
  const [message, setMessage] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const staffUsers = users.filter(u => u.role === 'staff');

  function selectPreset(type: Exclude<ShiftType, 'custom' | 'off'>) {
    setShiftType(type);
    setStartTime(SHIFT_PRESETS[type].start);
    setEndTime(SHIFT_PRESETS[type].end);
  }

  function toggleUser(id: string) {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const handleSave = async () => {
    setError('');
    if (!date) return setError('対象日を選択してください');
    if (startTime >= endTime) return setError('終了時刻は開始時刻より後にしてください');
    if (requestType === 'targeted' && selectedUserIds.length === 0) return setError('送信先スタッフを1人以上選択してください');

    setSaving(true);
    const { data: reqData, error: reqErr } = await supabase
      .from('shift_requests')
      .insert({
        store_id: storeId,
        date,
        start_time: startTime,
        end_time: endTime,
        shift_type: shiftType === 'custom' ? 'custom' : shiftType,
        message,
        request_type: requestType,
        created_by: /^[0-9a-f-]{36}$/i.test(createdBy) ? createdBy : null,
        status: 'open',
      })
      .select('id')
      .single();

    if (reqErr || !reqData) {
      setError(reqErr?.message ?? '送信に失敗しました');
      setSaving(false);
      return;
    }

    if (requestType === 'targeted') {
      const targets = selectedUserIds.map(userId => ({
        request_id: reqData.id,
        user_id: userId,
        status: 'pending',
      }));
      const { error: tErr } = await supabase.from('shift_request_targets').insert(targets);
      if (tErr) {
        setError(tErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-bold text-slate-800 mb-4">調整依頼を出す</h3>

        {/* 依頼タイプ */}
        <div className="mb-4">
          <label className="block text-[11px] font-medium text-slate-500 mb-1.5">依頼タイプ</label>
          <div className="flex gap-2">
            <button
              onClick={() => setRequestType('targeted')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                requestType === 'targeted'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              指名型
            </button>
            <button
              onClick={() => setRequestType('open')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                requestType === 'open'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              掲示板型
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {requestType === 'targeted'
              ? '指定したスタッフにのみ届きます'
              : '全員に公開・先着1名が受け取れます'}
          </p>
        </div>

        <div className="space-y-3">
          {/* 対象日 */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">対象日</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* シフト種別 */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">希望シフト</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(Object.keys(SHIFT_PRESETS) as Exclude<ShiftType, 'custom' | 'off'>[]).map(t => (
                <button
                  key={t}
                  onClick={() => selectPreset(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    shiftType === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {t}
                </button>
              ))}
              <button
                onClick={() => setShiftType('custom')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  shiftType === 'custom'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                カスタム
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={e => { setStartTime(e.target.value); setShiftType('custom'); }}
                className="flex-1 border border-slate-300 rounded-lg px-2 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="text-slate-400 text-sm">〜</span>
              <input
                type="time"
                value={endTime}
                onChange={e => { setEndTime(e.target.value); setShiftType('custom'); }}
                className="flex-1 border border-slate-300 rounded-lg px-2 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* メッセージ */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">メッセージ（任意）</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="急募です。よろしくお願いします。"
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          {/* 指名型のみ: スタッフ選択 */}
          {requestType === 'targeted' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                送信先スタッフ
                {selectedUserIds.length > 0 && (
                  <span className="ml-1 text-blue-600">（{selectedUserIds.length}名選択中）</span>
                )}
              </label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {staffUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-2 px-3 py-3 rounded-md hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="rounded"
                    />
                    <span className="text-sm text-slate-700">{u.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-rose-600 text-sm mt-3">{error}</p>}

        <div className="space-y-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {saving ? '送信中…' : '依頼を送る'}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
