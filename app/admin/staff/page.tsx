'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hashPin } from '@/lib/shifts';
import type { User, UserRole } from '@/lib/types';

function PinCell({ pin }: { pin?: string }) {
  const [visible, setVisible] = useState(false);
  if (!pin) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <button
      onClick={() => setVisible(v => !v)}
      className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 tracking-widest select-all"
    >
      {visible ? pin : '••••'}
    </button>
  );
}

export default function AdminStaffPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // 追加フォーム
  const [addName, setAddName] = useState('');
  const [addPin, setAddPin] = useState('');
  const [addPinConfirm, setAddPinConfirm] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('staff');
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // 編集モーダル
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editPin, setEditPin] = useState('');
  const [editPinConfirm, setEditPinConfirm] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // 削除確認
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('id, name, role, pin, display_order, created_at').order('display_order', { ascending: true, nullsFirst: false });
    setUsers(data ?? []);
  };

  useEffect(() => {
    console.log('[AdminStaff] mounted');
    loadUsers();
    return () => console.log('[AdminStaff] unmounted');
  }, []);

  // 追加
  const handleAdd = async () => {
    setAddError('');
    if (!addName.trim()) return setAddError('名前を入力してください');
    if (!/^\d{4}$/.test(addPin)) return setAddError('PINは数字4桁で入力してください');
    if (addPin !== addPinConfirm) return setAddError('PINが一致しません');
    setAddSaving(true);
    const pin_hash = await hashPin(addPin);
    const maxOrder = users.reduce((m, u) => Math.max(m, u.display_order ?? 0), 0);
    const { error } = await supabase.from('users').insert({ name: addName.trim(), pin_hash, pin: addPin, role: addRole, display_order: maxOrder + 1 });
    setAddSaving(false);
    if (error) { setAddError(error.message.includes('unique') ? 'この名前は既に登録されています' : error.message); return; }
    setAddName(''); setAddPin(''); setAddPinConfirm(''); setAddRole('staff');
    setShowAddForm(false);
    loadUsers();
  };

  // 編集モーダルを開く
  const openEdit = (u: User) => {
    setEditTarget(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditPin('');
    setEditPinConfirm('');
    setEditError('');
  };

  // 編集保存
  const handleEdit = async () => {
    if (!editTarget) return;
    setEditError('');
    if (!editName.trim()) return setEditError('名前を入力してください');
    if (editPin && !/^\d{4}$/.test(editPin)) return setEditError('PINは数字4桁で入力してください');
    if (editPin && editPin !== editPinConfirm) return setEditError('PINが一致しません');
    setEditSaving(true);
    const patch: Record<string, string> = { name: editName.trim(), role: editRole };
    if (editPin) { patch.pin_hash = await hashPin(editPin); patch.pin = editPin; }
    const { error } = await supabase.from('users').update(patch).eq('id', editTarget.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); return; }
    setEditTarget(null);
    loadUsers();
  };

  // 削除
  const handleDelete = async (u: User) => {
    await supabase.from('users').delete().eq('id', u.id);
    setDeleteTarget(null);
    loadUsers();
  };

  // 並び替え
  const moveUser = async (idx: number, dir: 'up' | 'down') => {
    console.log('[moveUser] called idx=%d dir=%s users.length=%d', idx, dir, users.length, users.map(u => u.name));
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= users.length) {
      console.log('[moveUser] early return: targetIdx=%d out of range', targetIdx);
      return;
    }
    const next = [...users];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    const withOrder = next.map((u, i) => ({ ...u, display_order: i + 1 }));
    console.log('[moveUser] calling setUsers:', withOrder.map(u => u.name));
    setUsers(withOrder);
    Promise.all(withOrder.map(u =>
      supabase.from('users').update({ display_order: u.display_order }).eq('id', u.id)
    )).then(() => console.log('[moveUser] DB updates done'));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800">スタッフ管理</h2>
        <button onClick={() => { setShowAddForm(true); setAddError(''); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
          + スタッフを追加
        </button>
      </div>

      {/* 追加フォーム */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
          <h3 className="font-semibold text-slate-700 mb-4">新しいスタッフ</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">名前 *</label>
              <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="山田 太郎"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">権限</label>
              <select value={addRole} onChange={e => setAddRole(e.target.value as UserRole)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="staff">スタッフ</option>
                <option value="admin">管理者</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">PIN (4桁) *</label>
              <input type="password" inputMode="numeric" maxLength={4} value={addPin}
                onChange={e => setAddPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="0000"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">PIN 確認 *</label>
              <input type="password" inputMode="numeric" maxLength={4} value={addPinConfirm}
                onChange={e => setAddPinConfirm(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="0000"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          {addError && <p className="text-red-500 text-sm mt-3">{addError}</p>}
          <div className="flex gap-2 mt-4">
            <button onClick={handleAdd} disabled={addSaving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {addSaving ? '追加中…' : '追加'}
            </button>
            <button onClick={() => { setShowAddForm(false); setAddError(''); }}
              className="px-5 py-2 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* スタッフ一覧 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        {users.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">スタッフが登録されていません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-3 w-10" />
                <th className="text-left px-5 py-3 font-semibold text-slate-600">名前</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">権限</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">PIN</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600 whitespace-nowrap hidden sm:table-cell">登録日</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {console.log('[render] users:', users.map(u => u.name))}
              {users.map((u, ui) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-2 py-2">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => moveUser(ui, 'up')}
                        disabled={ui === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed text-sm"
                      >▲</button>
                      <button
                        onClick={() => moveUser(ui, 'down')}
                        disabled={ui === users.length - 1}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed text-sm"
                      >▼</button>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${u.role === 'admin' ? 'bg-orange-500' : 'bg-blue-500'}`}>
                        {u.name[0]}
                      </span>
                      {u.name}
                    </div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${u.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.role === 'admin' ? '管理者' : 'スタッフ'}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <PinCell pin={u.pin} />
                  </td>
                  <td className="px-5 py-3 text-slate-400 hidden sm:table-cell whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(u)}
                      className="text-xs px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-1">
                      編集
                    </button>
                    <button onClick={() => setDeleteTarget(u)}
                      className="text-xs px-3 py-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 編集モーダル */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{editTarget.name} を編集</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">名前</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">権限</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">新しいPIN（変更する場合のみ）</label>
                <input type="password" inputMode="numeric" maxLength={4} value={editPin}
                  onChange={e => setEditPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="4桁の数字"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {editPin && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">PIN 確認</label>
                  <input type="password" inputMode="numeric" maxLength={4} value={editPinConfirm}
                    onChange={e => setEditPinConfirm(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="4桁の数字"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              )}
            </div>
            {editError && <p className="text-red-500 text-sm mt-3">{editError}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={handleEdit} disabled={editSaving}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {editSaving ? '保存中…' : '保存'}
              </button>
              <button onClick={() => setEditTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-2">スタッフを削除</h3>
            <p className="text-slate-600 text-sm mb-6">
              <span className="font-semibold">{deleteTarget.name}</span> を削除します。このスタッフのシフトデータも削除されます。
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(deleteTarget)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700">
                削除する
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
