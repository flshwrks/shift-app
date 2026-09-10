import { NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/sessionGuard';
import { recordAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { canDeleteHqAdmin, validateHqAdminInput } from '@/lib/hqAdmins';

// 本部管理者アカウントの管理。
//
// 店舗のスタッフ管理（/api/admin/users）とは別の経路にしている。
// あちらは「店舗に属する人」を扱い store_id が必須だが、本部管理者は
// どの店舗にも属さない（store_id が null）ため、同じ経路に混ぜると
// 店舗境界の判定が複雑になりすぎる。
//
// ★本部管理者を空にすると誰も本部管理画面に入れなくなる。
//   歯止めの条件は lib/hqAdmins.ts に切り出してテストしてある。

interface HqAdminRow { id: string; name: string; created_at: string }

function parsePayload(body: unknown) {
  const b = body as Record<string, unknown> | null;
  return {
    id: typeof b?.id === 'string' ? b.id : '',
    name: typeof b?.name === 'string' ? b.name.trim() : '',
    pin: typeof b?.pin === 'string' ? b.pin : '',
  };
}

async function countHqAdmins(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { count } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'hq_admin');
  return count ?? 0;
}

export async function GET() {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, name, created_at')
    .eq('role', 'hq_admin')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ admins: (data ?? []) as HqAdminRow[], selfId: session.id });
}

export async function POST(request: Request) {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const { name, pin } = parsePayload(await request.json().catch(() => null));
  const valid = validateHqAdminInput(name, pin, true);
  if (!valid.ok) return NextResponse.json({ error: valid.reason }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    // 本部管理者はどの店舗にも属さないので store_id は null。
    // display_order は本部ログイン画面での並び順に使う
    .insert({ name, role: 'hq_admin', store_id: null, display_order: 0 })
    .select('id')
    .single();
  if (error || !data) {
    const message = error?.message.includes('unique')
      ? 'この名前は既に登録されています'
      : (error?.message ?? '追加に失敗しました');
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error: pinError } = await admin.rpc('admin_set_pin', { p_user_id: data.id, p_new_pin: pin });
  if (pinError) {
    return NextResponse.json({ error: `PINの設定に失敗しました: ${pinError.message}` }, { status: 400 });
  }

  void recordAudit(session, {
    storeId: null, action: 'user.create',
    targetType: 'user', targetId: data.id, targetName: name, detail: { role: 'hq_admin' },
  });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const { id, name, pin } = parsePayload(await request.json().catch(() => null));
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const valid = validateHqAdminInput(name, pin, false);
  if (!valid.ok) return NextResponse.json({ error: valid.reason }, { status: 400 });

  const admin = createAdminClient();

  // createAdminClient() はRLSを見ないため、対象が本当に本部管理者かをここで確かめる。
  // 店舗スタッフのIDを渡して権限を書き換えられるのを防ぐ
  const { data: existing } = await admin
    .from('users')
    .select('name, role')
    .eq('id', id)
    .maybeSingle<{ name: string; role: string }>();
  if (!existing) return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 });
  if (existing.role !== 'hq_admin') {
    return NextResponse.json({ error: 'この画面で変更できるのは本部管理者だけです' }, { status: 400 });
  }

  const { error } = await admin.from('users').update({ name }).eq('id', id);
  if (error) {
    const message = error.message.includes('unique') ? 'この名前は既に登録されています' : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (pin) {
    const { error: pinError } = await admin.rpc('admin_set_pin', { p_user_id: id, p_new_pin: pin });
    if (pinError) {
      return NextResponse.json({ error: `PINの設定に失敗しました: ${pinError.message}` }, { status: 400 });
    }
    void recordAudit(session, {
      storeId: null, action: 'user.pin_reset',
      targetType: 'user', targetId: id, targetName: name,
    });
  }

  if (existing.name !== name) {
    void recordAudit(session, {
      storeId: null, action: 'user.rename',
      targetType: 'user', targetId: id, targetName: name,
      detail: { before: existing.name },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const { id } = parsePayload(await request.json().catch(() => null));
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('users')
    .select('name, role')
    .eq('id', id)
    .maybeSingle<{ name: string; role: string }>();
  if (!existing) return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 });
  if (existing.role !== 'hq_admin') {
    return NextResponse.json({ error: 'この画面で削除できるのは本部管理者だけです' }, { status: 400 });
  }

  const guard = canDeleteHqAdmin(id, session.id, await countHqAdmins(admin));
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 400 });

  const { error } = await admin.from('users').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  void recordAudit(session, {
    storeId: null, action: 'user.delete',
    targetType: 'user', targetId: id, targetName: existing.name,
    detail: { role: 'hq_admin' },
  });

  return NextResponse.json({ ok: true });
}
