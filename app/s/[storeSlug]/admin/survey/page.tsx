'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';

interface SurveyOption {
  id: string;
  label: string;
  display_order: number;
  is_other: boolean;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'closed';
  created_at: string;
}

interface ResponseRow {
  id: string;
  option_id: string | null;
  custom_text: string;
  user: { name: string };
}

const STATUS_LABEL: Record<string, string> = { draft: '下書き', active: '実施中', closed: '終了' };
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-slate-200 text-slate-500',
};

export default function AdminSurveyPage() {
  const { storeId } = useStore();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [optionLabels, setOptionLabels] = useState(['', '']);
  const [includeOther, setIncludeOther] = useState(true);
  const [saving, setSaving] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [options, setOptions] = useState<SurveyOption[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [staffCount, setStaffCount] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);

  const fetchSurveys = useCallback(async () => {
    const { data } = await supabase.from('surveys').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
    setSurveys(data ?? []);
  }, [storeId]);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  const fetchResults = useCallback(async (surveyId: string) => {
    // survey_options / survey_responses は survey_id経由で親（surveys）にスコープされるため店舗フィルタ不要
    const [{ data: opts }, { data: resps }, { count }] = await Promise.all([
      supabase.from('survey_options').select('*').eq('survey_id', surveyId).order('display_order'),
      supabase.from('survey_responses').select('id, option_id, custom_text, user:users(name)').eq('survey_id', surveyId),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'staff').eq('store_id', storeId),
    ]);
    setOptions(opts ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setResponses((resps ?? []) as any);
    setStaffCount(count ?? 0);
  }, [storeId]);

  const handleViewToggle = (id: string) => {
    if (viewingId === id) { setViewingId(null); return; }
    setViewingId(id);
    fetchResults(id);
  };

  const handleCreate = async () => {
    const labels = optionLabels.map(l => l.trim()).filter(Boolean);
    if (!title.trim() || labels.length < 2) return;
    setSaving(true);
    const { data: survey } = await supabase.from('surveys').insert({
      store_id: storeId, title: title.trim(), description: description.trim(), status: 'draft',
    }).select().single();
    if (survey) {
      const opts = labels.map((label, i) => ({ survey_id: survey.id, label, display_order: i, is_other: false }));
      if (includeOther) opts.push({ survey_id: survey.id, label: 'その他', display_order: opts.length, is_other: true });
      await supabase.from('survey_options').insert(opts);
    }
    setSaving(false);
    setCreating(false);
    setTitle(''); setDescription(''); setOptionLabels(['', '']); setIncludeOther(true);
    fetchSurveys();
  };

  const handleActivate = async (id: string) => {
    // 他の実施中を終了させてから公布。store_idで絞らないと他店舗のアンケートまで
    // 閉じてしまうため必ず自店のものだけに限定する
    await supabase.from('surveys').update({ status: 'closed' }).eq('status', 'active').eq('store_id', storeId);
    await supabase.from('surveys').update({ status: 'active' }).eq('id', id);
    fetchSurveys();
  };

  const handleClose = async (id: string) => {
    await supabase.from('surveys').update({ status: 'closed' }).eq('id', id);
    fetchSurveys();
  };

  const handleDelete = async (survey: Survey) => {
    await supabase.from('surveys').delete().eq('id', survey.id);
    if (viewingId === survey.id) setViewingId(null);
    setDeleteTarget(null);
    fetchSurveys();
  };

  const addOption = () => setOptionLabels(prev => [...prev, '']);
  const removeOption = (i: number) => setOptionLabels(prev => prev.filter((_, idx) => idx !== i));
  const updateOption = (i: number, val: string) => setOptionLabels(prev => prev.map((v, idx) => idx === i ? val : v));

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">アンケート管理</h2>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
          >
            + 新規作成
          </button>
        )}
      </div>

      {/* 作成フォーム */}
      {creating && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-semibold text-slate-700">アンケートを作成</h3>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">タイトル</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例: アプリの名前を決めよう！"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">説明（任意）</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="例: みんなで決めよう！"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">選択肢</label>
            <div className="space-y-2">
              {optionLabels.map((label, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={label}
                    onChange={e => updateOption(i, e.target.value)}
                    placeholder={`選択肢 ${i + 1}`}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  {optionLabels.length > 2 && (
                    <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-600 px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addOption} className="mt-2 text-sm text-blue-500 hover:text-blue-700">+ 選択肢を追加</button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includeOther} onChange={e => setIncludeOther(e.target.checked)} className="accent-blue-600" />
            <span className="text-sm text-slate-700">「その他（自由記述）」を追加する</span>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={saving || !title.trim() || optionLabels.filter(l => l.trim()).length < 2}
              className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? '保存中…' : '下書き保存'}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* アンケート一覧 */}
      {surveys.length === 0 && !creating && (
        <p className="text-sm text-slate-400 text-center py-8">アンケートがまだありません</p>
      )}
      {surveys.map(survey => {
        const isViewing = viewingId === survey.id;
        const totalResponses = isViewing ? responses.length : 0;
        return (
          <div key={survey.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-800">{survey.title}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[survey.status]}`}>
                      {STATUS_LABEL[survey.status]}
                    </span>
                  </div>
                  {survey.description && <p className="text-xs text-slate-400 mt-0.5">{survey.description}</p>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {survey.status === 'draft' && (
                  <>
                    <button
                      onClick={() => handleActivate(survey.id)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
                    >
                      公布する
                    </button>
                    <button
                      onClick={() => setDeleteTarget(survey)}
                      className="px-3 py-1.5 bg-slate-100 text-red-500 text-xs font-medium rounded-lg hover:bg-red-50"
                    >
                      削除
                    </button>
                  </>
                )}
                {survey.status === 'active' && (
                  <button
                    onClick={() => handleClose(survey.id)}
                    className="px-3 py-1.5 bg-slate-700 text-white text-xs font-medium rounded-lg hover:bg-slate-800"
                  >
                    終了する
                  </button>
                )}
                <button
                  onClick={() => handleViewToggle(survey.id)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200"
                >
                  {isViewing ? '結果を閉じる' : '結果を見る'}
                </button>
              </div>
            </div>

            {/* 結果パネル */}
            {isViewing && (
              <div className="border-t border-slate-100 p-5 bg-slate-50/50 space-y-4">
                <p className="text-xs text-slate-500 font-medium">
                  回答数: {totalResponses} / スタッフ {staffCount} 名
                </p>
                {options.filter(o => !o.is_other).map(opt => {
                  const count = responses.filter(r => r.option_id === opt.id).length;
                  const pct = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0;
                  return (
                    <div key={opt.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-700">{opt.label}</span>
                        <span className="text-sm font-semibold text-slate-800">{count} 票 ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {/* その他の回答 */}
                {options.some(o => o.is_other) && (() => {
                  const otherId = options.find(o => o.is_other)?.id;
                  const otherResps = responses.filter(r => r.option_id === otherId && r.custom_text);
                  const otherCount = responses.filter(r => r.option_id === otherId).length;
                  const pct = totalResponses > 0 ? Math.round((otherCount / totalResponses) * 100) : 0;
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-700">その他</span>
                        <span className="text-sm font-semibold text-slate-800">{otherCount} 票 ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      {otherResps.length > 0 && (
                        <ul className="space-y-1">
                          {otherResps.map(r => (
                            <li key={r.id} className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg px-3 py-1.5">
                              <span className="text-slate-400 mr-2">{r.user?.name}</span>{r.custom_text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">アンケートを削除</h3>
            <p className="text-slate-600 text-sm mb-6">
              <span className="font-semibold">{deleteTarget.title}</span> を削除します。この操作は取り消せません。
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(deleteTarget)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">
                削除する
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
