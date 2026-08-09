-- ============================================================
-- マルチ店舗対応（4/4）: クリーンアップ（★破壊的変更★）
--
-- ⚠️ 適用タイミングの警告 ⚠️
-- このファイルは、/s/[storeSlug]/... へのルーティング移行（画面エージェント・
-- 本部画面エージェントの担当分）が完了し、実際に本番相当の環境で
-- 「ログイン→各画面の表示→シフト調整依頼・アンケート・設定の作成/編集」まで
-- 一通り動作確認が取れてから適用すること。
-- 適用前提として、少なくとも 2026-08-08c_multi_store_rls.sql が適用済みで
-- あることに加え、そのRLSのもとで実際に store_id が正しく入る形で全テーブルへの
-- 書込みが行われていることを確認してから実行する（NOT NULL化後に nullな行が
-- 万一残っていると、以後そのテーブルの書込みが一切通らなくなる）。
--
-- 適用順序: 4ファイル中の 4番目（最後）。
-- ============================================================

begin;

-- ============================================================
-- store_id を必須化する（バックフィル済みである前提）
-- ============================================================
alter table public.shifts         alter column store_id set not null;
alter table public.shift_requests alter column store_id set not null;
alter table public.surveys        alter column store_id set not null;
alter table public.app_settings   alter column store_id set not null;

-- ============================================================
-- app_settings の主キーを key 単体 → (store_id, key) に変更する
-- （店舗ごとに同じキー、例えば 'deadline' や 'period_open_2026-08' を
-- 独立して持てるようにするため）。主キー制約名は環境依存の可能性があるため
-- pg_constraint から動的に探して drop する
-- ============================================================
do $$
declare
  v_pk_name text;
begin
  select con.conname into v_pk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'app_settings'
    and con.contype = 'p';

  if v_pk_name is not null then
    execute format('alter table public.app_settings drop constraint %I', v_pk_name);
  end if;

  alter table public.app_settings add primary key (store_id, key);
end $$;

-- 主キー化により (store_id, key) の一意性は主キー側のインデックスで担保されるため、
-- 2026-08-08b で先行して作った同じ列構成の一意インデックスは重複になる。削除する
-- （アプリコードの onConflict: 'store_id,key' は主キー側の制約で引き続き解決される）
drop index if exists public.app_settings_store_key_uidx;

-- ============================================================
-- org_name は stores.name に一本化されたため不要になった。削除する
-- （店舗名の表示・編集は今後 /admin/stores・useStore() 経由で行う）
-- ============================================================
delete from public.app_settings where key = 'org_name';

commit;
