-- ============================================================
-- 要望の送信機能（feedback テーブル新設）
--
-- ★要手動適用★（Supabase SQL Editorで実行すること）
--
-- 目的: 「スタッフ→店長」「利用者→開発者（GitHub Issue）」の2つの宛先を
-- 1つのテーブルでまかなう、要望・不具合報告の送信機能を追加する。
--
-- 在庫管理アプリ(inventory-app)への影響: なし。
-- このマイグレーションは新規テーブル(feedback)・新規トリガー関数
-- (set_feedback_store_id)の追加のみで、既存テーブル・既存関数・既存ポリシーは
-- 一切変更しない（users/stores/shifts/app_settings/surveys、jwt_*()/is_hq_admin()等）。
-- inv_* オブジェクトにも触れない。適用順序の制約もなく、いつでも追加可能（後方互換）。
--
-- 適用前提: マルチ店舗対応(2026-08-08系)が適用済みで、jwt_app_role()/jwt_store_id()/
-- jwt_user_id()/is_hq_admin() が利用可能であること。
-- ============================================================

-- ============================================================
-- feedback テーブル
--
-- store_id は本部管理者(hq_admin)が所属店舗を持たないため nullable にする。
-- 「店長へ」宛て(destination='store')は届け先の店舗が特定できないと意味を成さないため、
-- destination='dev' の場合のみ store_id を null で許容するCHECK制約を付ける。
-- ============================================================
create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id),          -- 本部管理者は所属店舗が無いので nullable
  user_id uuid not null references public.users(id) on delete cascade,
  destination text not null check (destination in ('store', 'dev')),
  category text not null check (category in ('request', 'bug')),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'read', 'done')),
  app_version text default '',
  github_issue_number integer,
  created_at timestamptz default now(),
  -- 「店長へ」宛ては届け先の店舗が無いと成立しないため、destinationが'dev'の
  -- ときだけstore_idのnullを許容する（'store'ならstore_idは必須）
  constraint feedback_store_id_required check (destination = 'dev' or store_id is not null)
);

-- 管理画面の「自店の未読件数」集計、ユーザー本人の投稿履歴表示・レート制限集計で使う
create index if not exists feedback_store_id_status_idx on public.feedback(store_id, status);
create index if not exists feedback_user_id_created_at_idx on public.feedback(user_id, created_at);

-- ============================================================
-- feedback.store_id を強制導出するトリガー
--
-- shifts.store_id と同じ考え方: クライアントがstore_idを自由に指定できると、
-- 「本来は自店宛てのつもりが他店のstore_idを指定して送る」なりすましが可能になる。
-- そこでstore_idは常にuser_idからusers.store_idを引いて上書きし、
-- クライアントが送った値を構造的に無視する。
--
-- users テーブルの行可視性はRLSで店舗ごとに絞られているため、呼び出し元の
-- 権限に関わらず users.store_id を正しく引けるよう SECURITY DEFINER にする。
-- トリガー関数は「トリガーとして発火する」以外の呼び出し方法がなく、発火自体も
-- この関数へのEXECUTE権限の有無とは無関係に行われるため、EXECUTE権限は
-- 誰にも与えない（docs/SECURITY.mdの「SECURITY DEFINER関数の権限は絞る」方針）。
-- ============================================================
create or replace function public.set_feedback_store_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select u.store_id into new.store_id
  from public.users u
  where u.id = new.user_id;
  return new;
end;
$$;

revoke execute on function public.set_feedback_store_id() from public, anon, authenticated;

drop trigger if exists feedback_set_store_id on public.feedback;
create trigger feedback_set_store_id
  before insert on public.feedback
  for each row execute function public.set_feedback_store_id();

-- ============================================================
-- RLS: 書き込みは全て /api/feedback（service role）経由に限定する
-- （usersテーブルと同じ「書込みはAPIに寄せる」ハードニング方針）。
-- SELECTポリシーのみ定義する。
--
-- 可視性:
--   - 本人が出したもの: user_id = jwt_user_id()
--   - 本部管理者: is_hq_admin()
--   - 店舗管理者: 自店に届いた「店長へ」宛てのみ
--     (jwt_app_role() = 'admin' and store_id = jwt_store_id() and destination = 'store')
-- ★スタッフが他のスタッフの要望を読めてはいけない★（個人的な内容を含みうるため）。
-- 上記の3条件はいずれも「本人」か「管理者」に限られており、一般スタッフが
-- 他人の行にマッチする条件は存在しない
-- ============================================================
alter table public.feedback enable row level security;

drop policy if exists "feedback_select" on public.feedback;

create policy "feedback_select" on public.feedback
  for select
  using (
    user_id = public.jwt_user_id()
    or public.is_hq_admin()
    or (public.jwt_app_role() = 'admin' and store_id = public.jwt_store_id() and destination = 'store')
  );

-- Supabaseプロジェクトのdefault privilegesにより、新規テーブルは既定でanon/authenticatedに
-- 広い権限が付く（stores/users等でも同様の理由で明示revokeしている）。
-- ★ここでは `grant ... on all tables in schema public` や `alter default privileges` は
-- 絶対に使わない（在庫管理アプリと共有のDBのため、両アプリの全テーブルに波及する）★
-- 個別テーブル指定のgrant/revokeのみで完結させる。
--
-- PUBLICへの暗黙付与も明示的にrevokeする。過去に「anon/authenticatedからrevokeしたのに
-- PUBLIC経由で実行できたままだった」インシデントがあり、docs/SECURITY.md の教訓として
-- 残っている。ロール個別のrevokeはPUBLICへの付与を取り消さないため、両方書く必要がある
revoke all on public.feedback from public;
revoke all on public.feedback from anon;
revoke insert, update, delete on public.feedback from authenticated;
grant select on public.feedback to authenticated;

-- 未読バッジのリアルタイム更新用（shift_requestsと同じ扱い）。
-- このファイルは手動適用のため二度実行されうる。二重追加はエラーになるので、
-- 2026-08-08_multi_store_schema.sql の stores と同じく未登録の場合のみ実行する
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback'
  ) then
    alter publication supabase_realtime add table public.feedback;
  end if;
end $$;
