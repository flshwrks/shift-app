import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const pin = typeof body?.pin === 'string' ? body.pin : '';
  if (!userId || !pin) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const { data, error } = await supabase
    .rpc('verify_login', { p_user_id: userId, p_pin: pin })
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
