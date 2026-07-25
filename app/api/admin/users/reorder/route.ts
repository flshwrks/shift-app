import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { createAdminClient } from '@/lib/supabaseAdmin';

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

  // upsert にすると、name等のNOT NULL列を含まないINSERT扱いになりPostgresに拒否されるため
  // （ON CONFLICT DO UPDATE 経路でもINSERT側のNOT NULL制約は検証される）、行ごとの更新にする
  const admin = createAdminClient();
  const results = await Promise.all(
    (items as ReorderItem[]).map(it => admin.from('users').update({ display_order: it.display_order }).eq('id', it.id))
  );
  const failed = results.find(r => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
