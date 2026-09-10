import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/sessionGuard';
import { recordAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { isHqRole, type SessionUser } from '@/lib/types';
import { isStoreScopedTarget } from '@/lib/hqAdmins';

const PIN_PATTERN = /^\d{4}$/;

function parseUserPayload(body: unknown) {
  const b = body as Record<string, unknown> | null;
  return {
    id: typeof b?.id === 'string' ? b.id : '',
    name: typeof b?.name === 'string' ? b.name.trim() : '',
    role: b?.role === 'admin' ? 'admin' : 'staff',
    pin: typeof b?.pin === 'string' ? b.pin : '',
    storeId: typeof b?.storeId === 'string' ? b.storeId : '',
  };
}

// このAPIは**店舗に属する人（admin/staff）専用**。本部管理者（hq_admin）は
// 店舗に属さないため、`/api/hq/admins` でしか操作できないようにする。
//
// ★2026-09-11の点検(SEC-1)で見つかった穴★
//   店舗境界の検査は「hqロールなら省略」する作りになっていたため、本部管理者と
//   開発者はこの経路から**任意のIDを指定して他の本部管理者を削除・降格できた**。
//   前日に /api/hq/admins へ入れた歯止め（再認証・自分は消せない・最後の1人は
//   消せない）を、古いこの入口から素通りできる状態だった。
//   店舗境界の検査を省くことと、**操作対象の種類を絞らない**ことは別の話で、
//   後者が抜けていた。対象が hq_admin なら、呼び出し元の権限によらず断る。
const HQ_TARGET_REJECTED =
  '本部管理者はこの画面からは変更できません。本部管理の「本部管理者」から操作してください';

// createAdminClient() はRLSを完全にバイパスするため、「店舗管理者は自店しか
// 操作できない」という保証はここでのチェックにしか存在しない。
// hq_admin/developerはbodyのstoreIdで任意店舗を指定できるが、店舗管理者に対しては
// bodyのstoreIdを一切信用せず、常にセッションのstoreIdを強制する。
function resolveEffectiveStoreId(session: SessionUser, bodyStoreId: string): string | NextResponse {
  if (isHqRole(session.role)) {
    if (!bodyStoreId) return NextResponse.json({ error: 'storeIdを指定してください' }, { status: 400 });
    return bodyStoreId;
  }
  if (!session.storeId) return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  return session.storeId;
}

// admin_set_pin RPC(bcryptハッシュ化はDB側で実施)を呼び、失敗時はエラーメッセージを返す
async function setPin(admin: ReturnType<typeof createAdminClient>, userId: string, pin: string): Promise<string | null> {
  const { error } = await admin.rpc('admin_set_pin', { p_user_id: userId, p_new_pin: pin });
  return error ? `PINの設定に失敗しました: ${error.message}` : null;
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { name, role, pin, storeId } = parseUserPayload(await request.json().catch(() => null));
  if (!name) return NextResponse.json({ error: '名前を入力してください' }, { status: 400 });
  if (!PIN_PATTERN.test(pin)) return NextResponse.json({ error: 'PINは数字4桁で入力してください' }, { status: 400 });

  const effectiveStoreId = resolveEffectiveStoreId(session, storeId);
  if (effectiveStoreId instanceof NextResponse) return effectiveStoreId;

  const admin = createAdminClient();

  const { data: top } = await admin
    .from('users')
    .select('display_order')
    .eq('store_id', effectiveStoreId)
    .order('display_order', { ascending: false })
    .limit(1);
  const nextOrder = (top?.[0]?.display_order ?? 0) + 1;

  const { data, error } = await admin
    .from('users')
    .insert({ name, role, display_order: nextOrder, store_id: effectiveStoreId })
    .select('id')
    .single();
  if (error || !data) {
    const message = error?.message.includes('unique') ? 'この名前は既に登録されています' : (error?.message ?? '追加に失敗しました');
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const pinError = await setPin(admin, data.id, pin);
  if (pinError) return NextResponse.json({ error: pinError }, { status: 400 });

  void recordAudit(session, {
    storeId: effectiveStoreId, action: 'user.create',
    targetType: 'user', targetId: data.id, targetName: name, detail: { role },
  });

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

  // service_roleはRLSを見ないため、対象行が本当に自店のものかをここで確認してから書き込む。
  //
  // ⚠️ この事前SELECTを「UPDATEに .eq('store_id', ...) を足せば1往復で済む」と
  // 最適化してはいけない。下の setPin が呼ぶ admin_set_pin RPC は user_id だけを受け取り
  // 店舗スコープを一切見ないため、条件付きUPDATEに置き換えると
  // 「UPDATEは0行だが他店スタッフのPINだけ書き換わる」状態を作れてしまう。
  // これは docs/SECURITY.md に記録されている admin_set_pin のインシデントと同型。
  // 権限判定は必ずPIN設定より前に、この形で行うこと。
  // store_id は権限判定に、name/role は「何がどう変わったか」を記録するために取る
  const { data: existing, error: existingError } = await admin
    .from('users')
    .select('store_id, name, role')
    .eq('id', id)
    .maybeSingle<{ store_id: string | null; name: string; role: string }>();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  // 対象が本部管理者なら、呼び出し元が誰であっても断る（SEC-1）。
  // ここを通すと role が 'admin' に書き換わり、store_id が null のままの壊れた行になる。
  // finalizeSession() がそれを無効セッションとして扱うため対象は恒久的にログイン不能になり、
  // /api/hq/admins は role !== 'hq_admin' を弾くので画面からは元に戻せない
  if (!isStoreScopedTarget(existing.role)) {
    return NextResponse.json({ error: HQ_TARGET_REJECTED }, { status: 403 });
  }
  if (!isHqRole(session.role) && existing.store_id !== session.storeId) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  const [updateResult, pinError] = await Promise.all([
    admin.from('users').update({ name, role }).eq('id', id),
    pin ? setPin(admin, id, pin) : Promise.resolve(null),
  ]);
  if (updateResult.error) return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
  if (pinError) return NextResponse.json({ error: pinError }, { status: 400 });

  // 変わったものだけを個別に記録する。「権限を変えた」と「名前を直した」は
  // 後から見たときの重みが違うので、1行にまとめない
  const audit = { storeId: existing.store_id, targetType: 'user' as const, targetId: id, targetName: name };
  if (existing.role !== role) {
    void recordAudit(session, { ...audit, action: 'user.role_change', detail: { from: existing.role, to: role } });
  }
  if (existing.name !== name) {
    void recordAudit(session, { ...audit, action: 'user.rename', detail: { from: existing.name, to: name } });
  }
  if (pin) {
    void recordAudit(session, { ...audit, action: 'user.pin_reset' });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { id } = parseUserPayload(await request.json().catch(() => null));
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const admin = createAdminClient();

  // service_roleはRLSを見ないため、削除範囲をこのコードで絞る。
  //
  // 以前は条件付きDELETE1回で済ませていたが、それだと「対象が本部管理者かどうか」を
  // 消す前に判定できなかった（SEC-1）。1往復増えるが、先に対象を確認してから消す。
  const { data: target, error: targetError } = await admin
    .from('users')
    .select('role')
    .eq('id', id)
    .maybeSingle<{ role: string }>();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 400 });
  // 存在しないIDと権限外のIDは同じ応答にする（存在の有無を相手に漏らさない）
  if (target && !isStoreScopedTarget(target.role)) {
    return NextResponse.json({ error: HQ_TARGET_REJECTED }, { status: 403 });
  }

  const query = admin.from('users').delete().eq('id', id);
  // 削除後は氏名を引けないため、消える行から name/store_id を受け取っておく
  const { data: deleted, error } = await (
    isHqRole(session.role) ? query : query.eq('store_id', session.storeId)
  ).select('id, name, store_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!deleted?.length) return NextResponse.json({ error: '権限がありません' }, { status: 403 });

  const gone = deleted[0] as { id: string; name: string; store_id: string | null };
  void recordAudit(session, {
    storeId: gone.store_id, action: 'user.delete',
    targetType: 'user', targetId: gone.id, targetName: gone.name,
  });

  return NextResponse.json({ ok: true });
}
