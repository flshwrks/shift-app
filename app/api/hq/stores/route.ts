import { NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/sessionGuard';
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

  // このDBは在庫管理アプリ(inventory-app)と共有しており、inv_* テーブルも store_id で
  // この店舗を参照している。スタッフを先に消した空の店舗でも在庫データは残るため、
  // ここで止めないと外部キー違反の生のPostgresエラーが画面に出る。
  // 在庫の履歴を店舗削除で暗黙に消すのは許容できないので cascade にはせず、
  // 「在庫データが残っている店舗は消せない」という制約にしている。
  for (const [table, label] of [
    ['inv_items', '品目'],
    ['inv_stock_transactions', '在庫記録'],
  ] as const) {
    const { count: invCount, error: invError } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('store_id', id);
    // 在庫アプリのマイグレーション未適用の環境ではテーブル自体が無い。
    // その場合は在庫データも存在しないので、チェックを飛ばして削除を続行する
    if (invError) {
      if (!/does not exist|schema cache/i.test(invError.message)) {
        return NextResponse.json({ error: invError.message }, { status: 400 });
      }
    } else if ((invCount ?? 0) > 0) {
      return NextResponse.json(
        { error: `この店舗には在庫管理アプリの${label}が登録されているため削除できません` },
        { status: 400 },
      );
    }
  }

  const { error } = await admin.from('stores').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
