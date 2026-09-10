'use client';
import { useCallback, useEffect, useState } from 'react';

// 本部管理者アカウントの管理。
//
// これまで本部管理者はデータベースに直接入れるしかなく、増やすことも
// 名前やPINを変えることもできなかった。担当者を2人以上にする、
// 引き継ぎ先に権限を渡す、といったことがUIから行えるようにする。
//
// ★本部管理者が0人になると誰も本部管理画面に入れなくなる。
//   「自分は消せない」「最後の1人は消せない」の2つで防いでいる（lib/hqAdmins.ts）。

interface HqAdmin { id: string; name: string; created_at: string }

const PIN_HINT = '数字4桁';

export default function HqAdminsPage() {
  const [admins, setAdmins] = useState<HqAdmin[]>([]);
  const [selfId, setSelfId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPin, setAddPin] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<HqAdmin | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/hq/admins');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? '読み込みに失敗しました'); setLoading(false); return; }
    setAdmins(body.admins ?? []);
    setSelfId(body.selfId ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async (method: 'POST' | 'PATCH' | 'DELETE', payload: unknown, id: string) => {
    setError('');
    setBusyId(id);
    const res = await fetch('/api/hq/admins', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusyId(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? '処理に失敗しました'); return false; }
    await load();
    return true;
  };

  const handleAdd = async () => {
    if (await send('POST', { name: addName, pin: addPin }, 'new')) {
      setAddName(''); setAddPin(''); setShowAdd(false);
    }
  };

  const handleSave = async (id: string) => {
    if (await send('PATCH', { id, name: editName, pin: editPin }, id)) {
      setEditId(null); setEditPin('');
    }
  };

  const handleDelete = async (id: string) => {
    if (await send('DELETE', { id }, id)) setConfirmDelete(null);
  };

  const openEdit = (a: HqAdmin) => {
    setEditId(a.id); setEditName(a.name); setEditPin(''); setError('');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">本部管理者</h2>
        <button
          onClick={() => { setShowAdd(true); setError(''); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          + 本部管理者を追加
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4 leading-relaxed">
        全店舗を横断して扱える権限です。店舗には所属しません。
        <br />
        <span className="text-slate-400">
          障害や不在に備えて、<b className="text-slate-500">2人以上</b>にしておくことをおすすめします。
        </span>
      </p>

      {error && (
        <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {showAdd && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-3">
          <h3 className="font-semibold text-slate-700 mb-3">本部管理者を追加</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">名前 *</label>
              <input
                type="text" value={addName} maxLength={20}
                onChange={e => setAddName(e.target.value)} placeholder="山田"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">PIN *</label>
              <input
                type="text" inputMode="numeric" value={addPin} maxLength={4}
                onChange={e => setAddPin(e.target.value.replace(/\D/g, ''))} placeholder="0000"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-[11px] text-slate-400 mt-1">{PIN_HINT}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAdd} disabled={busyId === 'new'}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              {busyId === 'new' ? '追加中…' : '追加する'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setError(''); }}
              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50"
            >
              やめる
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400 py-8 text-center">読み込み中…</p>
      ) : (
        <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {admins.map(a => (
            <li key={a.id} className="p-4">
              {editId === a.id ? (
                <div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">名前</label>
                      <input
                        type="text" value={editName} maxLength={20}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">PIN（変えるときだけ）</label>
                      <input
                        type="text" inputMode="numeric" value={editPin} maxLength={4}
                        onChange={e => setEditPin(e.target.value.replace(/\D/g, ''))} placeholder="空欄なら変更しない"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleSave(a.id)} disabled={busyId === a.id}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                    >
                      {busyId === a.id ? '保存中…' : '保存する'}
                    </button>
                    <button
                      onClick={() => { setEditId(null); setError(''); }}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50"
                    >
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {a.name.slice(0, 1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {a.name}
                      {a.id === selfId && (
                        <span className="ml-2 text-[10px] px-1.5 py-px rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                          自分
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                      {a.created_at.slice(0, 10)} 追加
                    </p>
                  </div>
                  <button onClick={() => openEdit(a)} className="text-sm text-blue-600 hover:text-blue-700">編集</button>
                  <button
                    onClick={() => { setConfirmDelete(a); setError(''); }}
                    disabled={a.id === selfId || admins.length <= 1}
                    title={
                      a.id === selfId ? '自分自身は削除できません'
                        : admins.length <= 1 ? '本部管理者は1人以上必要です' : undefined
                    }
                    className="text-sm text-red-600 hover:text-red-700 disabled:text-slate-300 disabled:hover:text-slate-300"
                  >
                    削除
                  </button>
                </div>
              )}

              {confirmDelete?.id === a.id && (
                <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs text-red-800 leading-relaxed">
                    <b>{a.name} を削除しますか？</b> この人は本部管理画面に入れなくなります。元に戻せません。
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleDelete(a.id)} disabled={busyId === a.id}
                      className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-40"
                    >
                      {busyId === a.id ? '削除中…' : '削除する'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-600 text-xs hover:bg-white"
                    >
                      やめる
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && admins.length === 1 && (
        <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 leading-relaxed">
          <b>本部管理者が1人だけです。</b>
          この人が使えなくなると、店舗の追加も権限の発行もできなくなります。もう1人追加しておくことをおすすめします。
        </p>
      )}
    </div>
  );
}
