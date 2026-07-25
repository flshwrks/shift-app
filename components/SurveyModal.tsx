'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface SurveyOption {
  id: string;
  label: string;
  is_other: boolean;
  display_order: number;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  options: SurveyOption[];
}

interface Props {
  survey: Survey;
  userId: string;
  onClose: () => void;
  onAnswered?: () => void;
}

export default function SurveyModal({ survey, userId, onClose, onAnswered }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const sorted = [...survey.options].sort((a, b) => a.display_order - b.display_order);
  const selectedOpt = sorted.find(o => o.id === selectedId);
  const canSubmit = selectedId !== null && (!selectedOpt?.is_other || customText.trim() !== '');

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    await supabase.from('survey_responses').upsert({
      survey_id: survey.id,
      user_id: userId,
      option_id: selectedId,
      custom_text: selectedOpt?.is_other ? customText.trim() : '',
    }, { onConflict: 'survey_id,user_id' });
    setDone(true);
    setTimeout(() => { onAnswered ? onAnswered() : onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        {done ? (
          <div className="py-6 text-center">
            <svg className="w-8 h-8 mx-auto mb-2 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-semibold text-slate-900">回答ありがとうございます！</p>
          </div>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">{survey.title}</h3>
            {survey.description && (
              <p className="text-[13px] text-slate-600 mb-4">{survey.description}</p>
            )}
            <div className="space-y-2 mb-4">
              {sorted.map(opt => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedId === opt.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="survey"
                    value={opt.id}
                    checked={selectedId === opt.id}
                    onChange={() => setSelectedId(opt.id)}
                    className="accent-blue-600 shrink-0"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
            {selectedOpt?.is_other && (
              <textarea
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder="ご意見をどうぞ"
                rows={2}
                autoFocus
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none mb-4"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-40"
              >
                {submitting ? '送信中…' : '回答する'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
              >
                後で
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
