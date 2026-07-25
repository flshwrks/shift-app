import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { createAdminClient } from '@/lib/supabaseAdmin';

const PIN_PATTERN = /^\d{4}$/;

function parseUserPayload(body: unknown) {
  const b = body as Record<string, unknown> | null;
  return {
    id: typeof b?.id === 'string' ? b.id : '',
    name: typeof b?.name === 'string' ? b.name.trim() : '',
    role: b?.role === 'admin' ? 'admin' : 'staff',
    pin: typeof b?.pin === 'string' ? b.pin : '',
  };
}

// admin_set_pin RPC(bcryptハッシュ化はDB側で実施)を呼び、失敗時はエラーメッセージを返す
async function setPin(admin: ReturnType<typeof createAdminClient>, userId: string, pin: string): Promise<string | null> {
  const { error } = await admin.rpc('admin_set_pin', { p_user_id: userId, p_new_pin: pin });
  return error ? `PINの設定に失敗しました: ${error.message}` : null;
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { name, role, pin } = parseUserPayload(await request.json().catch(() => null));
  if (!name) return NextResponse.json({ error: '名前を入力してください' }, { status: 400 });
  if (!PIN_PATTERN.test(pin)) return NextResponse.json({ error: 'PINは数字4桁で入力してください' }, { status: 400 });

  const admin = createAdminClient();

  const { data: top } = await admin.from('users').select('display_order').order('display_order', { ascending: false }).limit(1);
  const nextOrder = (top?.[0]?.display_order ?? 0) + 1;

  const { data, error } = await admin
    .from('users')
    .insert({ name, role, display_order: nextOrder })
    .select('id')
    .single();
  if (error || !data) {
    const message = error?.message.includes('unique') ? 'この名前は既に登録されています' : (error?.message ?? '追加に失敗しました');
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const pinError = await setPin(admin, data.id, pin);
  if (pinError) return NextResponse.json({ error: pinError }, { status: 400 });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { id, name, role, pin } = parseUserPayload(await request.json().catch(() => null));
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (!name) return NextResponse.json({ error: '名前を入力してください' }, { status: 400 });
  if (pin && !PIN_PATTERN.test(pin)) return NextResponse.json({ error: 'PINは数字4桁で入力してください' }, { status: 400 });

  const admin = createAdminClient();

  const [updateResult, pinError] = await Promise.all([
    admin.from('users').update({ name, role }).eq('id', id),
    pin ? setPin(admin, id, pin) : Promise.resolve(null),
  ]);
  if (updateResult.error) return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
  if (pinError) return NextResponse.json({ error: pinError }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { id } = parseUserPayload(await request.json().catch(() => null));
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('users').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
