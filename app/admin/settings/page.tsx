'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminSettingsPage() {
  const [deadline, setDeadline] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'deadline')
      .single()
      .then(({ data }) => {
        if (data?.value) setDeadline(data.value);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from('app_settings')
      .upsert({ key: 'deadline', value: deadline });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = async () => {
    setDeadline('');
    setSaving(true);
    await supabase
      .from('app_settings')
      .upsert({ key: 'deadline', value: '' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-6">設定</h2>

      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md">
        <h3 className="font-semibold text-slate-700 mb-1">シフト申請 締切日</h3>
        <p className="text-sm text-slate-500 mb-4">
          この日時以降はスタッフがシフトを変更できなくなります。
        </p>
        <div className="flex gap-3 items-center">
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => { setDeadline(e.target.value); setSaved(false); }}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              saved
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {saving ? '保存中…' : saved ? '✓ 保存済' : '保存'}
          </button>
        </div>
        {deadline && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-600">
              現在の締切: <span className="font-medium">{new Date(deadline).toLocaleString('ja-JP')}</span>
            </span>
            <button
              onClick={handleClear}
              className="text-xs text-red-500 hover:underline"
            >
              締切を解除
            </button>
          </div>
        )}
      </div>

      {/* Shift type reference */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md mt-6">
        <h3 className="font-semibold text-slate-700 mb-3">シフト種別</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="pb-2">種別</th>
              <th className="pb-2">開始</th>
              <th className="pb-2">終了</th>
              <th className="pb-2">時間</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((type) => {
              const p = { A: ['8:00', '13:00', 5], B: ['9:00', '14:00', 5], C: ['8:00', '17:00', 9], D: ['9:00', '18:00', 9], E: ['13:00', '22:00', 9], F: ['17:00', '22:00', 5] }[type] as [string, string, number];
              return (
                <tr key={type}>
                  <td className="py-1.5 font-bold text-blue-600">{type}</td>
                  <td className="py-1.5 text-slate-600">{p[0]}</td>
                  <td className="py-1.5 text-slate-600">{p[1]}</td>
                  <td className="py-1.5 text-slate-500">{p[2]}時間</td>
                </tr>
              );
            })}
            <tr>
              <td className="py-1.5 font-medium text-slate-600">カスタム</td>
              <td className="py-1.5 text-slate-500" colSpan={3}>8:00〜22:00 / 30分刻み</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
