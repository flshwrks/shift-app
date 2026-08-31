import { NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/sessionGuard';
import { recordAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabaseAdmin';
import type { Store } from '@/lib/types';
import { SLUG_PATTERN, SLUG_ERROR, MAX_BASE_LENGTH, withRandomSuffix } from '@/lib/storeSlug';

function parseStorePayload(body: unknown) {
  const b = body as Record<string, unknown> | null;
  return {
    id: typeof b?.id === 'string' ? b.id : '',
    slug: typeof b?.slug === 'string' ? b.slug.trim() : '',
    name: typeof b?.name === 'string' ? b.name.trim() : '',
  };
}

export async function GET() {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('stores')
    .select('id, slug, name, created_at')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ stores: (data ?? []) as Store[] });
}

export async function POST(request: Request) {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const { slug, name } = parseStorePayload(await request.json().catch(() => null));
  if (!name) return NextResponse.json({ error: '店舗名を入力してください' }, { status: 400 });
  if (!SLUG_PATTERN.test(slug) || slug.length > MAX_BASE_LENGTH) {
    return NextResponse.json({ error: SLUG_ERROR }, { status: 400 });
  }

  // 公開シフト表がログイン不要で見られるため、URLを推測されないよう
  // サーバー側で必ずランダムな接尾辞を付ける（F-6。詳細は lib/storeSlug.ts）
  const finalSlug = withRandomSuffix(slug);

  const admin = createAdminClient();
  const { data, error } = await admin.from('stores').insert({ slug: finalSlug, name }).select('id').single();
  if (error || !data) {
    const message = error?.message.includes('unique') ? 'この店舗IDは既に使用されています' : (error?.message ?? '店舗の作成に失敗しました');
    return NextResponse.json({ error: message }, { status: 400 });
  }

  void recordAudit(session, {
    storeId: data.id, action: 'store.create',
    targetType: 'store', targetId: data.id, targetName: name, detail: { slug: finalSlug },
  });

  return NextResponse.json({ ok: true, id: data.id, slug: finalSlug });
}

export async function PATCH(request: Request) {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const { id, slug, name } = parseStorePayload(await request.json().catch(() => null));
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (!name) return NextResponse.json({ error: '店舗名を入力してください' }, { status: 400 });
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ error: SLUG_ERROR }, { status: 400 });

  const admin = createAdminClient();
  // .select()を付けずにupdateすると、対象idが1件も無くてもerrorはnullのまま返ってくる
  // （0件更新は失敗ではなく「該当なし」として扱われるため）。存在しないidを指定した場合に
  // 「保存はできたが実際には何も変わっていない」という無言の失敗になるのを防ぐため、
  // 更新できた行を明示的に受け取って件数を確認する。
  const { data, error } = await admin.from('stores').update({ slug, name }).eq('id', id).select('id');
  if (error) {
    const message = error.message.includes('unique') ? 'この店舗IDは既に使用されています' : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (!data?.length) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const { id } = parseStorePayload(await request.json().catch(() => null));
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const admin = createAdminClient();

  // その店舗にスタッフが1人でも残っている場合は削除を拒否する。
  // 誤って店舗を削除するとシフト等の配下データごと失われかねないため、
  // 「空の店舗だけ削除できる」という制約でうっかり削除を防ぐ。
  const { count, error: countError } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', id);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'この店舗にはスタッフが登録されているため削除できません' }, { status: 400 });
  }

  // 消える前に店舗名を控えてから削除する（記録に「どの店舗を消したか」を残すため）
  const { data: target } = await admin
    .from('stores').select('name, slug').eq('id', id).maybeSingle<{ name: string; slug: string }>();

  const { error } = await admin.from('stores').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  void recordAudit(session, {
    storeId: id, action: 'store.delete',
    targetType: 'store', targetId: id, targetName: target?.name ?? null,
    detail: target ? { slug: target.slug } : undefined,
  });

  return NextResponse.json({ ok: true });
}
