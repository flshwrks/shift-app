'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hashPin } from '@/lib/shifts';
import type { User, UserRole } from '@/lib/types';

export default function AdminStaffPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('id, name, role, created_at').order('name');
    setUsers(data ?? []);
  };

  useEffect(() => { loadUsers(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('staff-list-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, loadUsers)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleAdd = async () => {
    setError('');
    if (!name.trim()) return setError('名前を入力してください');
    if (pin.length !== 4) return setError('PINは4桁で入力してください');
    if (!/^\d{4}$/.test(pin)) return setError('PINは数字4桁で入力してください');
    if (pin !== confirmPin) return setError('PINが一致しません');

    setSaving(true);
    const pinHash = await hashPin(pin);
    const { error: err } = await supabase.from('users').insert({ name: name.trim(), pin_hash: pinHash, role });
    setSaving(false);

    if (err) {
      setError(err.message.includes('unique') ? 'この名前は既に登録されています' : err.message);
    } else {
      setName(''); setPin(''); setConfirmPin(''); setRole('staff');
      setShowForm(false);
    }
  };

  const handleDelete = async (user: User) => {
    await supabase.from('users').delete().eq('id', user.id);
    setDeleteTarget(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800">スタッフ管理</h2>
        <button
          onClick={() => { setShowForm(true); setError(''); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + スタッフを追加
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h3 className="font-semibold text-slate-700 mb-4">新しいスタッフ</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">名前 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">権限</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="staff">スタッフ</option>
                <option value="admin">管理者</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">PINコード (4桁) *</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 tracking-widest"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">PINコード確認 *</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 tracking-widest"
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '追加中…' : '追加'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(''); setName(''); setPin(''); setConfirmPin(''); }}
              className="px-5 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Staff list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {users.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">スタッフが登録されていません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 font-semibold text-slate-600">名前</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">権限</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600">登録日</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    <span className={`inline-block w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center mr-2 ${u.role === 'admin' ? 'bg-orange-500' : 'bg-blue-500'}`}>
                      {u.name[0]}
                    </span>
                    {u.name}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role === 'admin' ? '管理者' : 'スタッフ'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {new Date(u.created_at).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setDeleteTarget(u)}
                      className="text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-2">スタッフを削除</h3>
            <p className="text-slate-600 text-sm mb-6">
              <span className="font-semibold">{deleteTarget.name}</span> を削除します。
              このスタッフのシフトデータもすべて削除されます。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
              >
                削除する
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200"
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
