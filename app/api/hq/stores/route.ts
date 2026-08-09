import { NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/session';
import { createAdminClient } from '@/lib/supabaseAdmin';
import type { Store } from '@/lib/types';

// 店舗ID(slug)の形式: 半角英小文字・数字・ハイフンで3〜40文字、先頭末尾はハイフン不可。
// URLの一部（/s/[storeSlug]/...）に使うため記号は最小限にしている。
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const SLUG_ERROR = '店舗IDは英小文字・数字・ハイフンで3文字以上40文字以下で入力してください';

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
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ error: SLUG_ERROR }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from('stores').insert({ slug, name }).select('id').single();
  if (error || !data) {
    const message = error?.message.includes('unique') ? 'この店舗IDは既に使用されています' : (error?.message ?? '店舗の作成に失敗しました');
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const session = await requireHqAdmin();
  if (session instanceof NextResponse) return session;

  const { id, slug, name } = parseStorePayload(await request.json().catch(() => null));
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (!name) return NextResponse.json({ error: '店舗名を入力してください' }, { status: 400 });
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ error: SLUG_ERROR }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('stores').update({ slug, name }).eq('id', id);
  if (error) {
    const message = error.message.includes('unique') ? 'この店舗IDは既に使用されています' : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

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

  const { error } = await admin.from('stores').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
