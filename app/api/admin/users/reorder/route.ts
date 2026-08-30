import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/sessionGuard';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { isHqRole } from '@/lib/types';

interface ReorderItem {
  id: string;
  display_order: number;
}

function isReorderItem(it: unknown): it is ReorderItem {
  return typeof it === 'object' && it !== null &&
    typeof (it as ReorderItem).id === 'string' && typeof (it as ReorderItem).display_order === 'number';
}

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => null);
  const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0 || !items.every(isReorderItem)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  // 店舗管理者が自店以外のidを紛れ込ませて他店の並びを書き換えられないよう、
  // 各UPDATEに自店のstore_idを条件として付ける。hq_admin/developerは全店舗を
  // 横断管理できる権限なのでこの絞り込みを省く。
  const admin = createAdminClient();
  const scopeToOwnStore = !isHqRole(session.role);
  if (scopeToOwnStore && !session.storeId) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 });
  }

  // upsert にすると、name等のNOT NULL列を含まないINSERT扱いになりPostgresに拒否されるため
  // （ON CONFLICT DO UPDATE 経路でもINSERT側のNOT NULL制約は検証される）、行ごとの更新にする
  const results = await Promise.all(
    (items as ReorderItem[]).map(it => {
      const query = admin.from('users').update({ display_order: it.display_order }).eq('id', it.id);
      return scopeToOwnStore ? query.eq('store_id', session.storeId as string) : query;
    })
  );
  const failed = results.find(r => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
