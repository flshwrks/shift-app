-- ============================================================
-- 店舗のシフト種別を、認証前でも読めるようにする（不具合修正）
--
-- 症状:
--   シフト種別の表示名や時間帯を保存しても、画面を開き直すと既定値に戻る。
--
-- 原因:
--   `app_settings` のSELECTポリシーは JWT の店舗ID を要求する。
--     using (public.is_hq_admin() or store_id = public.jwt_store_id())
--   一方 `StoreProvider`（/s/[storeSlug]/ 配下を包む）は、店舗解決と同時に
--   シフト種別を読む。この時点では `AuthProvider` が非同期に取得する
--   Supabase用JWTがまだクライアントに設定されていないため、匿名として
--   問い合わせることになり、RLSで0件になって既定値へフォールバックしていた。
--   **保存は成功していた**（ボタン押下時にはトークンがある）。読み戻しだけが落ちていた。
--
-- 対応:
--   list_login_users / get_public_shifts / get_public_memos と同じ
--   「SECURITY DEFINERのRPCで、必要な範囲だけを匿名に公開する」既存パターンを踏襲する。
--   `app_settings` のポリシーは緩めない。公開するのはシフト種別の定義だけで、
--   提出期間・時給・日付ごとのメモなど他のキーは返さない。
--
-- 公開範囲の妥当性:
--   返すのは「この店舗で使うシフトの記号・表示名・時間帯」。
--   公開シフト表では各シフトの実際の時刻がすでに見えており、
--   店舗IDも推測できない値になっているため（F-6対応）、追加の露出は実質ない。
--
-- 適用順序: このRPCを先に作ってから、アプリを配信すること。
-- ============================================================

create or replace function public.get_shift_patterns(p_store_slug text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select a.value
  from public.app_settings a
  join public.stores st on st.id = a.store_id
  where st.slug = p_store_slug
    and a.key = 'shift_patterns'
  limit 1;
$$;

-- list_login_users / get_public_shifts と同じ理由で、この関数はPUBLIC実行のままでよい
-- （anon/authenticated に明示付与するだけで十分。revokeは不要）。
grant execute on function public.get_shift_patterns(text) to anon, authenticated;

-- 確認: 未設定の店舗は null、設定済みの店舗は JSON文字列 が返る
--   select public.get_shift_patterns('店舗ID');
