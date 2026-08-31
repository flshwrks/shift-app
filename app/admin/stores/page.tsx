'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Store } from '@/lib/types';
import { IconCheck } from '@/components/icons';

export default function AdminStoresPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState('');

  // 追加フォーム
  const [addSlug, setAddSlug] = useState('');
  const [addName, setAddName] = useState('');
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // 編集モーダル
  const [editTarget, setEditTarget] = useState<Store | null>(null);
  const [editSlug, setEditSlug] = useState('');
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // 削除確認
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const loadStores = async () => {
    const res = await fetch('/api/hq/stores');
    const body = await res.json().catch(() => ({ stores: [] }));
    setStores((body.stores ?? []) as Store[]);
    setLoading(false);
  };

  useEffect(() => { loadStores(); }, []);

  // 追加
  const handleAdd = async () => {
    setAddError('');
    if (!addName.trim()) return setAddError('店舗名を入力してください');
    setAddSaving(true);
    const res = await fetch('/api/hq/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: addSlug.trim(), name: addName.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    setAddSaving(false);
    if (!res.ok) { setAddError(body.error ?? '追加に失敗しました'); return; }
    // 店舗IDはサーバー側でランダムな接尾辞が付く。入力値と変わるので確定値を知らせる
    setCreatedSlug(typeof body.slug === 'string' ? body.slug : '');
    setAddSlug(''); setAddName('');
    setShowAddForm(false);
    loadStores();
  };

  // 編集モーダルを開く
  const openEdit = (s: Store) => {
    setEditTarget(s);
    setEditSlug(s.slug);
    setEditName(s.name);
    setEditError('');
  };

  // 編集保存
  const handleEdit = async () => {
    if (!editTarget) return;
    setEditError('');
    if (!editName.trim()) return setEditError('店舗名を入力してください');
    setEditSaving(true);
    const res = await fetch('/api/hq/stores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editTarget.id, slug: editSlug.trim(), name: editName.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    setEditSaving(false);
    if (!res.ok) { setEditError(body.error ?? '保存に失敗しました'); return; }
    const savedId = editTarget.id;
    const savedSlug = editSlug.trim();
    const savedName = editName.trim();
    setStores(prev => prev.map(s => s.id === savedId ? { ...s, slug: savedSlug, name: savedName } : s));
    setEditTarget(null);
  };

  // 削除
  const handleDelete = async (s: Store) => {
    setDeleteError('');
    const res = await fetch('/api/hq/stores', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteError(body.error ?? '削除に失敗しました');
      return;
    }
    setStores(prev => prev.filter(existing => existing.id !== s.id));
    setDeleteTarget(null);
  };

  // 作成直後に確定した店舗IDを知らせる（入力値と変わるため）
  const dismissCreated = () => setCreatedSlug('');

  // ログイン用URLをコピー（店頭掲示のQRコード運用を想定）
  const copyLoginUrl = (s: Store) => {
    const url = `${window.location.origin}/s/${s.slug}/login`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div>
      {createdSlug && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">店舗を追加しました</p>
          <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
            店舗IDは <code className="font-mono font-semibold">{createdSlug}</code> になりました。
            URLを推測されないよう末尾にランダムな文字を付けています。
            下の一覧の「URLをコピー」から、店舗に配るQRコードを作成してください。
          </p>
          <button onClick={dismissCreated} className="text-xs text-emerald-700 underline mt-2">閉じる</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">店舗管理</h2>
        <button onClick={() => { setShowAddForm(true); setAddError(''); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + 店舗を追加
        </button>
      </div>

      {/* 追加フォーム */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <h3 className="font-semibold text-slate-700 mb-4">新しい店舗</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">店舗名 *</label>
              <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="梅田店"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">店舗ID *</label>
              <input type="text" value={addSlug} onChange={e => setAddSlug(e.target.value)} placeholder="umeda"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <p className="text-[11px] text-slate-400 mt-1">
                英小文字・数字・ハイフン（例: umeda）。<br />
                URLを推測されないよう、<span className="font-medium text-slate-500">末尾にランダムな6文字が自動で付きます</span>（例: umeda-k3f9q2）
              </p>
            </div>
          </div>
          {addError && <p className="text-red-500 text-sm mt-3">{addError}</p>}
          <div className="flex gap-2 mt-4">
            <button onClick={handleAdd} disabled={addSaving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {addSaving ? '追加中…' : '追加'}
            </button>
            <button onClick={() => { setShowAddForm(false); setAddError(''); }}
              className="px-5 py-2 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 店舗一覧 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <p className="text-center text-slate-400 py-12 text-sm">読み込み中…</p>
        ) : stores.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">店舗が登録されていません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 font-semibold text-slate-600">店舗名</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-600 whitespace-nowrap">店舗ID</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stores.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 bg-blue-500">
                        {s.name[0]}
                      </span>
                      {s.name}
                    </div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="inline-block text-[10px] px-1.5 py-px rounded font-medium border bg-slate-50 text-slate-600 border-slate-200 font-mono">
                      {s.slug}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => copyLoginUrl(s)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors mr-1 ${
                        copiedId === s.id ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 hover:bg-slate-100'
                      }`}>
                      {copiedId === s.id ? <span className="flex items-center justify-center gap-1.5"><IconCheck className="w-4 h-4" />コピーしました</span> : 'ログインURLをコピー'}
                    </button>
                    <button onClick={() => router.push(`/s/${s.slug}/admin/schedule`)}
                      className="text-xs px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors mr-1">
                      この店舗を管理
                    </button>
                    <button onClick={() => openEdit(s)}
                      className="text-xs px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-1">
                      編集
                    </button>
                    <button onClick={() => { setDeleteError(''); setDeleteTarget(s); }}
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
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-4">{editTarget.name} を編集</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">店舗名</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">店舗ID</label>
                <input type="text" value={editSlug} onChange={e => setEditSlug(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <p className="text-[11px] text-slate-400 mt-1">
                英小文字・数字・ハイフン（例: umeda）。<br />
                URLを推測されないよう、<span className="font-medium text-slate-500">末尾にランダムな6文字が自動で付きます</span>（例: umeda-k3f9q2）
              </p>
              </div>
            </div>
            {editError && <p className="text-red-500 text-sm mt-3">{editError}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={handleEdit} disabled={editSaving}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {editSaving ? '保存中…' : '保存'}
              </button>
              <button onClick={() => setEditTarget(null)}
                className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50">
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
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">店舗を削除</h3>
            <p className="text-slate-600 text-sm mb-6">
              <span className="font-semibold">{deleteTarget.name}</span> を削除します。この操作は取り消せません。
            </p>
            {deleteError && <p className="text-red-500 text-sm mb-3">{deleteError}</p>}
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
