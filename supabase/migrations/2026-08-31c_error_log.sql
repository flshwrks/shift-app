-- ============================================================================
-- エラーの記録 — 点検項目 F-4 への対応
--
-- これまで異常が起きても自動では気づけず、利用者からの申告で発覚していた。
-- 「画面が真っ白になった」と言われても、何が起きたのか調べる材料が無かった。
--
-- ★外部の監視サービス（Sentry等）ではなく自前にした理由★
--   ・委託先を増やさない。情シス向けの審査項目（保管地域・DPA）が増えるのを避ける
--   ・エラー本文には氏名やシフトの内容が混ざりうる。承認済みの保管先（このDB）に閉じる
--   ・契約・費用ゼロ
-- 引き換えに、**即時通知はできない**（管理者がログインしたときに気づく形）。
-- 本当に即時性が要るなら外部サービスの導入を別途検討する。docs/SECURITY.md 参照。
--
-- ★このファイルは Supabase SQL Editor で手で適用する★
--   アプリのコードはこのテーブルが無くても壊れない（記録の失敗で業務を止めない）。
--   適用前後どちらの順序でも安全。
-- ============================================================================

create table if not exists public.error_logs (
  id uuid default gen_random_uuid() primary key,

  source text not null check (source in ('client', 'server')),
  message text not null,
  stack text,
  path text,                        -- 発生した画面・APIのパス

  -- 同じエラーの繰り返しを1行にまとめるための鍵（message と path から作る）。
  -- 壊れた画面を10回開いて10行並ぶと、肝心の別のエラーが埋もれる。
  fingerprint text not null,
  count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- 誰の画面で起きたか。参照制約は付けない（退職しても記録は残す。audit_logs と同じ方針）
  actor_id uuid,
  actor_name text,
  store_id uuid,

  app_version text,
  user_agent text,

  -- 対応済みにすると一覧から外れ、次に同じエラーが起きたら新しい行として立つ
  status text not null default 'new' check (status in ('new', 'done'))
);

-- 一覧は「未対応を新しい順」で引く。まとめ先を探すのも同じ索引で足りる
create index if not exists error_logs_status_seen_idx
  on public.error_logs (status, last_seen_at desc);
create index if not exists error_logs_fingerprint_idx
  on public.error_logs (fingerprint, status);

alter table public.error_logs enable row level security;

-- 参照は本部権限だけ。エラー本文には他店の情報が混ざりうるため、店舗管理者には見せない
drop policy if exists "error_logs_select" on public.error_logs;
create policy "error_logs_select" on public.error_logs
  for select to anon, authenticated
  using (public.is_hq_admin());

-- 更新（対応済みにする）も本部権限だけ
drop policy if exists "error_logs_update" on public.error_logs;
create policy "error_logs_update" on public.error_logs
  for update to anon, authenticated
  using (public.is_hq_admin())
  with check (public.is_hq_admin());

-- 追加ポリシーは作らない。記録を作れるのは service_role を使うサーバー側だけ。
-- 利用者のブラウザから直接エラー記録を作れると、いくらでも埋め立てられる。
-- クライアントで起きたエラーは /api/error-log を経由して記録する（レート制限つき）。
