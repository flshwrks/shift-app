import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buildSessionCookieValue, SESSION_COOKIE } from '@/lib/session';
import type { UserRole } from '@/lib/types';

interface VerifyLoginRow {
  id: string;
  name: string;
  role: UserRole;
}

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
  if (!data) {
    return NextResponse.json({ ok: false, error: 'invalid_pin' }, { status: 401 });
  }

  const user = { id: data.id, name: data.name, role: data.role };
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE.name, buildSessionCookieValue(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE.maxAge,
  });
  return res;
}
