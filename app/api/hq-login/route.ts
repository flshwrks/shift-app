import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { buildSessionCookieValue, SESSION_COOKIE } from '@/lib/session';
import { signJwtForSession } from '@/lib/supabaseJwt';
import type { SessionUser, UserRole } from '@/lib/types';

interface VerifyLoginRow {
  id: string;
  name: string;
  role: UserRole;
  store_id: string | null;
}

// 本部管理者専用のログイン入口。店舗スタッフ/店舗管理者は /api/login を使う
// （store_id突き合わせが無いため、hq_admin以外をここで通してはならない）。
//
// ★2026-09-11(F-13)で「一覧から選ぶ」から「名前を入力する」に変えた★
//   以前は画面が list_hq_admin_users() を未認証で呼び、全本部管理者の
//   氏名とIDを返していた。店舗ログインは店舗IDの推測不能化(F-6)で守られているが、
//   /admin/login は固定パスで同等の前段防御が無く、
//   **最強の権限の実名一覧だけが最も守りの薄い経路にある**状態だった。
//   名前からIDへの解決をここ（service_role）に移し、一覧の公開をやめた。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const pin = typeof body?.pin === 'string' ? body.pin : '';
  if (!name || !pin) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  // 名前 → ID の解決。hq_admin は store_id が null で、名前は
  // users_name_null_store_uidx（部分unique index）により一意
  const admin = createAdminClient();
  const { data: found } = await admin
    .from('users')
    .select('id')
    .eq('name', name)
    .eq('role', 'hq_admin')
    .maybeSingle<{ id: string }>();

  // ★存在しない名前と、PINの誤りを同じ応答にする★
  // 分けると、入力欄から「その名前の本部管理者がいるか」を確かめられてしまい、
  // 一覧の公開をやめた意味が無くなる
  if (!found) {
    return NextResponse.json({ ok: false, error: 'invalid_pin' }, { status: 401 });
  }

  const { data, error } = await supabase
    .rpc('verify_login', { p_user_id: found.id, p_pin: pin })
    .maybeSingle<VerifyLoginRow>();

  if (error) {
    // ロックアウト等、verify_login 側で raise exception したケース
    return NextResponse.json({ ok: false, error: error.message }, { status: 429 });
  }
  if (!data || data.role !== 'hq_admin') {
    return NextResponse.json({ ok: false, error: 'invalid_pin' }, { status: 401 });
  }

  const user: SessionUser = { id: data.id, name: data.name, role: data.role, storeId: null, storeSlug: null };
  const supabaseToken = await signJwtForSession(user);
  const res = NextResponse.json({ ok: true, user, supabaseToken });
  res.cookies.set(SESSION_COOKIE.name, buildSessionCookieValue(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE.maxAge,
  });
  return res;
}
