'use client';
import { useEffect, useState } from 'react';

// 使用中にセッションが無効になった（退職・削除・権限変更）場合、
// lib/auth.tsx が ?reason=session_invalid を付けてログイン画面へ送ってくる。
// 黙ってログイン画面に戻ると「なぜ落とされたのか」が分からないため、理由を出す。
//
// useSearchParams ではなく window.location を読むのは、
// この1行のためにページ全体を Suspense で包む必要をなくすため。
export default function SessionEndedNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(new URLSearchParams(window.location.search).get('reason') === 'session_invalid');
  }, []);

  if (!show) return null;

  return (
    <div className="w-full max-w-md mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-800">ログインし直してください</p>
      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
        アカウントが削除されたか、権限が変更されたため、ログイン状態が終了しました。
        心当たりがない場合は管理者にお尋ねください。
      </p>
    </div>
  );
}
