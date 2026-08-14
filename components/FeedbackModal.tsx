'use client';
import { useState } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useAuth } from '@/lib/auth';
import { isHqRole } from '@/lib/types';
import type { FeedbackCategory, FeedbackDestination } from '@/lib/types';
import { IconCheck } from '@/components/icons';

interface Props {
  onClose: () => void;
}

const BODY_MAX = 2000;

export default function FeedbackModal({ onClose }: Props) {
  useBodyScrollLock();
  const { user } = useAuth();

  // 本部管理者(hq_admin/developer)は所属店舗が無く「店長へ」の届け先が無い。
  // /api/feedback も400で弾くが、そもそも選ばせないことで利用者が宛先を間違えないようにする
  const canSendToStore = !!user && !isHqRole(user.role);

  const [destination, setDestination] = useState<FeedbackDestination>(canSendToStore ? 'store' : 'dev');
  const [category, setCategory] = useState<FeedbackCategory>('request');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const remaining = BODY_MAX - body.length;
  const canSubmit = body.trim().length > 0 && !sending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          category,
          body,
          appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
          userAgent: navigator.userAgent,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? '送信に失敗しました');
        setSending(false);
        return;
      }
      setDone(true);
      setTimeout(onClose, 1200);
    } catch {
      setError('送信に失敗しました');
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        {done ? (
          <div className="py-6 text-center">
            <IconCheck className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-900">送信しました</p>
          </div>
        ) : (
          <>
            <h3 className="text-base font-bold text-slate-800 mb-4">要望・不具合を送る</h3>

            {/* 宛先 */}
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">送信先</label>
              {canSendToStore ? (
                <>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDestination('store')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        destination === 'store'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      店長へ
                    </button>
                    <button
                      onClick={() => setDestination('dev')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        destination === 'dev'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      開発者へ
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {destination === 'store'
                      ? 'お店の管理者に届きます'
                      : 'アプリの改善要望として開発者に届きます'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  開発者へ（アプリの改善要望として届きます）
                </p>
              )}
            </div>

            {/* 種別 */}
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">種別</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCategory('request')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    category === 'request'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  要望
                </button>
                <button
                  onClick={() => setCategory('bug')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    category === 'bug'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  不具合
                </button>
              </div>
            </div>

            {/* 本文 */}
            <div className="mb-1">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">内容</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value.slice(0, BODY_MAX))}
                placeholder="ご意見・不具合の内容をお書きください"
                rows={5}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>
            <p className="text-xs text-right mb-3 text-slate-400">残り{remaining}文字</p>

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

            <div className="space-y-2">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {sending ? '送信中…' : '送信する'}
              </button>
              <button
                onClick={onClose}
                disabled={sending}
                className="w-full py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
