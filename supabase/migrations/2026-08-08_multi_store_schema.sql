-- ============================================================
-- マルチ店舗対応（1/4）: スキーマ追加（後方互換・追加のみ）
--
-- 背景:
--   単一店舗前提だったスキーマを複数店舗対応にする。このファイルは
--   「テーブル・列を追加するだけ」で、既存の行・既存のRLSポリシー
--   （allow_all_*）・既存のアプリケーションコードの挙動を一切壊さない。
--   store_id は全テーブルで nullable のまま追加するため、このファイルを
--   適用しただけではアプリは今まで通り動作し続ける（安全に単独適用できる）。
--
-- 適用順序: 4ファイル中の 1番目。
--   2026-08-08_multi_store_schema.sql        ← このファイル
--   2026-08-08b_multi_store_backfill.sql
--   2026-08-08c_multi_store_rls.sql          （破壊的。新アプリコードのデプロイ後に適用）
--   2026-08-08d_multi_store_not_null.sql     （破壊的。ルーティング移行後に適用）
--
-- 適用タイミング: いつでも適用可能（既存の単一店舗運用に影響を与えない）。
-- ============================================================

begin;

-- ============================================================
-- stores テーブル（店舗マスタ）
-- ============================================================
create table if not exists public.stores (
  id uuid default gen_random_uuid() primary key,
  -- slug は URL (/s/[storeSlug]/...) に現れる店舗識別子。英数字とハイフンのみ、
  -- 先頭・末尾は英数字、全体で3〜40文字に制限する
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  created_at timestamptz default now()
);

alter table public.stores enable row level security;

drop policy if exists "stores_select" on public.stores;
-- stores の SELECT は anon/authenticated 双方に全開放する。slug/name は
-- 各店舗のQRコード・URLに現れる時点で公開情報と同水準の非機微データであり、
-- かつ未認証のログイン画面（/s/[storeSlug]/login）がURLのslugから店舗名を
-- 表示する必要があるため、認証前でも読めることが要件そのもの。
-- （docs/SECURITY.md の教訓通り、機微情報を含むテーブルではこの判断はしない）
create policy "stores_select" on public.stores for select using (true);

-- 書込み（作成・改名・削除）は /api/hq/stores（service_role・requireHqAdmin()）経由に限定する
revoke insert, update, delete on public.stores from anon, authenticated;

-- ============================================================
-- 各テーブルに store_id を追加（nullable。バックフィルは 08-08b で実施）
-- ============================================================
alter table public.users          add column if not exists store_id uuid references public.stores(id);
alter table public.shifts         add column if not exists store_id uuid references public.stores(id);
alter table public.shift_requests add column if not exists store_id uuid references public.stores(id);
alter table public.surveys        add column if not exists store_id uuid references public.stores(id);
alter table public.app_settings   add column if not exists store_id uuid references public.stores(id);

-- ============================================================
-- users.role の CHECK 制約を hq_admin 込みに拡張
-- 制約名は環境（適用履歴）によって変わりうるため、pg_constraint から
-- role 列を参照する CHECK 制約を動的に探して drop してから付け替える
-- ============================================================
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'users'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%role%';

  if v_constraint_name is not null then
    execute format('alter table public.users drop constraint %I', v_constraint_name);
  end if;

  alter table public.users add constraint users_role_check check (role in ('hq_admin', 'admin', 'staff'));
end $$;

-- ============================================================
-- リアルタイム配信対象に stores を追加（/admin/stores の一覧をリアルタイム反映するため）
-- 二重追加はエラーになるため、未登録の場合のみ実行する
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stores'
  ) then
    alter publication supabase_realtime add table public.stores;
  end if;
end $$;

commit;
