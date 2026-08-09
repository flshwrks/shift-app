-- ============================================================
-- ログイン不要のシフト閲覧（店舗ログイン画面から1タップで見られる機能）
--
-- 2026-08-08c で店舗ごとのRLSを本格化して以降、匿名(anon)ユーザーには
-- app_role/store_idクレーム入りのJWTが無いため、shiftsテーブルへの
-- 直接SELECTは常に0件になる（＝未認証では何も見えない、が正しい状態）。
--
-- 「ログインせずシフト表だけ見られるようにしたい」という要望に対しては、
-- shiftsのRLSポリシー自体を緩めるのではなく、list_login_users/verify_login
-- と同じ「SECURITY DEFINERのRPC経由で、必要な範囲だけを匿名に公開する」
-- 既存パターンを踏襲する。これにより:
--   - 直接のテーブルアクセス（他店の行を含めた広い範囲の読み取り）は
--     引き続きRLSでブロックされたまま
--   - 公開されるのはこの関数が明示的に返す列だけ（コメント欄は含めない。
--     シフト提出時の私的なメモが不特定多数に見えるのを避けるため）
--   - どの店舗のシフトかは p_store_slug で絞り込み、他店のデータには
--     一切アクセスできない
--
-- 適用順序: マルチ店舗対応(2026-08-08系)適用後、いつでも追加可能（後方互換）。
-- ============================================================

create or replace function public.get_public_shifts(p_store_slug text, p_start date, p_end date)
returns table(
  id uuid,
  user_id uuid,
  date date,
  shift_type text,
  start_time text,
  end_time text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.user_id, s.date, s.shift_type, s.start_time, s.end_time, s.status
  from public.shifts s
  join public.stores st on st.id = s.store_id
  where st.slug = p_store_slug
    and s.date between p_start and p_end;
$$;

-- list_login_users / verify_login と同じ理由で、この関数はPUBLIC実行のままでよい
-- （anon/authenticatedに明示付与するだけで十分。revokeは不要）。
grant execute on function public.get_public_shifts(text, date, date) to anon, authenticated;
