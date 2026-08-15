import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { isHqRole } from '@/lib/types';

// 日付が過ぎた調整依頼を削除する。管理者が依頼管理画面を開いたときに呼ばれる。
//
// 「募集中のまま日付だけ過ぎた依頼」が溜まると、スタッフ側の未対応バッジが
// 永久に減らず、通知が意味を失う。そのため過去日の依頼は自動的に片付ける。
//
// 依頼を消しても、承諾によって作成済みのシフト(shifts)は別テーブルなので残る。
// shift_request_targets は外部キーの on delete cascade で一緒に消える。
//
// 「今日」はサーバー側で日本時間として求める。クライアントから受け取ると
// 端末の時計や改ざんで消える範囲が変わってしまうため。
function todayInJst(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const storeId = typeof b?.storeId === 'string' ? b.storeId : '';
  if (!storeId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  // 本部管理者は任意店舗を管理できるが、店舗管理者は自店以外を消せてはいけない
  if (!isHqRole(session.role) && session.storeId !== storeId) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('shift_requests')
    .delete()
    .eq('store_id', storeId)
    .lt('date', todayInJst())
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
