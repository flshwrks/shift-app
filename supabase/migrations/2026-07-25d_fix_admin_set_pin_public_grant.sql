-- ============================================================
-- 緊急修正パッチ（2026-07-25d）
--
-- 2026-07-25c で admin_set_pin の実行権限を anon/authenticated から
-- revoke したが、これだけでは不十分だった。
--
-- Postgres は関数を作成すると、デフォルトで EXECUTE 権限を PUBLIC に
-- 自動付与する（テーブルには無い、関数特有の挙動）。anon/authenticated
-- ロールは PUBLIC のメンバーとして暗黙にこの権限を継承するため、
-- 「anon/authenticated から revoke」しても PUBLIC への権限が残っていれば
-- 依然として誰でも呼び出せてしまう。
--
-- 実際にこの抜け穴を通じて、動作確認のテスト呼び出しで実在するスタッフ
-- 1名のPINが意図せず書き換わった（直後に service_role 経由で新しいPINに
-- 再設定し、対象スタッフへの周知が必要）。
--
-- 適用方法: Supabase ダッシュボード → SQL Editor で実行してください。
-- ============================================================

revoke execute on function public.admin_set_pin(uuid, text) from public;
