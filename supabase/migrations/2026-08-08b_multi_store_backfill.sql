-- ============================================================
-- マルチ店舗対応（2/4）: 既存データのバックフィル
--
-- 目的:
--   2026-08-08_multi_store_schema.sql で追加した store_id 列は nullable のまま
--   だったため、既存の単一店舗運用のデータを「デフォルト店舗（slug='main'）」に
--   紐付ける。あわせて users.name の一意制約を店舗単位に付け替える。
--
-- 適用順序: 4ファイル中の 2番目。08-08_multi_store_schema.sql の直後に適用すること。
-- 適用タイミング: いつでも適用可能（RLSはまだ全開放のままなので挙動は変わらない）。
-- ============================================================

begin;

-- ============================================================
-- デフォルト店舗（slug='main'）を作成
-- 店舗名は既存の app_settings.org_name を流用し、未設定・空文字なら「本店」とする
-- ============================================================
insert into public.stores (slug, name)
select 'main', coalesce(nullif((select value from public.app_settings where key = 'org_name'), ''), '本店')
where not exists (select 1 from public.stores where slug = 'main');

-- ============================================================
-- 既存行の store_id が null のものをすべてデフォルト店舗に紐付ける
-- ============================================================
do $$
declare
  v_store_id uuid;
begin
  select id into v_store_id from public.stores where slug = 'main';

  update public.users          set store_id = v_store_id where store_id is null;
  update public.shifts         set store_id = v_store_id where store_id is null;
  update public.shift_requests set store_id = v_store_id where store_id is null;
  update public.surveys        set store_id = v_store_id where store_id is null;
  update public.app_settings   set store_id = v_store_id where store_id is null;
end $$;

-- ============================================================
-- users.name の一意制約をグローバル → (store_id, name) に付け替える
-- 制約名は環境依存のため pg_constraint から動的に探して drop する
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
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) like '%(name)%';

  if v_constraint_name is not null then
    execute format('alter table public.users drop constraint %I', v_constraint_name);
  end if;

  alter table public.users add constraint users_store_id_name_key unique (store_id, name);
end $$;

-- (store_id, name) の複合 unique では、store_id が null の行同士は
-- Postgres の仕様上「別値」として扱われ重複を防げない（hq_admin は store_id=null のため）。
-- そのため store_id が null の場合に限定した部分 unique index で hq_admin 群の名前重複を防ぐ
create unique index if not exists users_name_null_store_uidx on public.users(name) where store_id is null;

-- ============================================================
-- app_settings の (store_id, key) 一意インデックス
--
-- 主キーの (store_id, key) への差し替え自体は 2026-08-08d で行うが、
-- 一意インデックスだけはこの段階で先に作っておく必要がある。
-- 新しいアプリコードは app_settings の upsert で
-- `onConflict: 'store_id,key'` を明示的に指定しており、PostgRESTは
-- 指定された列に一意制約が無いと ON CONFLICT 句を組み立てられずエラーになる。
-- つまりこのインデックスがコードのデプロイ前に存在しないと、
-- 設定保存（提出期間・メモ・時給）が一斉に失敗する。
--
-- 旧コード（store_idを送らない upsert）はこの時点でも主キー(key)側で
-- 衝突判定されるため、そのまま動き続ける＝後方互換。
-- ============================================================
create unique index if not exists app_settings_store_key_uidx on public.app_settings(store_id, key);

-- ============================================================
-- store_id を使った絞り込みが増えるため、検索性能のためのインデックスを追加
-- ============================================================
create index if not exists shifts_store_id_date_idx on public.shifts(store_id, date);
create index if not exists shift_requests_store_id_idx on public.shift_requests(store_id);
create index if not exists surveys_store_id_idx on public.surveys(store_id);

commit;

-- ============================================================
-- 【手動作業メモ】最初の hq_admin を作る手順（このマイグレーションには含まれない）
--
-- 上記までの適用では、既存ユーザーは全員デフォルト店舗(main)の admin/staff のまま。
-- 本部管理者を使い始めるには、既存の管理者アカウントのうち1名を hq_admin に昇格させる
-- 必要がある。Supabase SQL Editor で対象ユーザーの id を確認したうえで、次のSQLを
-- 手動で実行すること（このファイルの一部として自動実行はしない＝誤って全環境に
-- 同じ人物を昇格させてしまう事故を防ぐため）。
--
--   update public.users
--     set role = 'hq_admin', store_id = null
--     where id = '<既存admin/staffのid>';
--
-- 昇格後は /admin/login から本部管理者としてログインできる（要: APIエージェント側の
-- /api/hq-login 実装、店舗管理エージェント側の /admin/stores 画面デプロイ）。
-- ============================================================
