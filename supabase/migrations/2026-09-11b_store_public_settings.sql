-- ============================================================
-- 店舗ごとの「受付時間帯」を、認証前でも読めるようにする（点検項目 FN-9）
--
-- 何が問題だったか:
--   シフトに入力できる時間帯が 8:00〜22:00 でコードに固定されていた
--   （`lib/shifts.ts` の generateTimeSlots と `components/TimelineView.tsx` の
--     START_HOUR / END_HOUR）。
--   朝が早い店・夜が遅い店は、実態と違う時刻に丸めて入力するしかなかった。
--
-- 対応:
--   `app_settings` に店舗ごとの `business_hours` を持たせる。
--   既定は 8:00〜22:00 なので、**既存の店舗は何も変わらない**。
--
-- なぜ get_shift_patterns を拡張せず、新しい関数にするか:
--   あちらは text を1つ返す形で、戻り値の意味を変えると
--   デプロイの前後で画面が壊れる。公開してよい設定をまとめて返す関数を別に作り、
--   アプリ側をそちらへ移す。get_shift_patterns は当面そのまま残す
--   （移行が完全に済んでから消す。消しても戻せるよう revoke ではなく放置でよい）。
--
-- ★キーは明示的な許可リストにする★
--   app_settings には提出期間・時給・日付ごとのメモなど**出してはいけない値**も入る。
--   「この店舗の設定を全部返す」にすると、キーが増えるたびに漏洩の危険が増える。
--   返すキーをここに書き並べ、**足すときに必ず考える**形にしておく。
-- ============================================================

begin;

create or replace function public.get_store_public_settings(p_store_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb)
  from public.app_settings a
  join public.stores st on st.id = a.store_id
  where st.slug = p_store_slug
    -- ★ここに足すキーは、匿名に見せてよいものだけ★
    --   shift_patterns … この店舗で使うシフトの記号・表示名・時間帯
    --   business_hours … シフトを入力できる時間帯（開始・終了の「時」）
    -- 提出期間(deadline)・時給(wage_*)・日付ごとのメモ(memo_*)は**返さない**
    and a.key in ('shift_patterns', 'business_hours');
$$;

-- list_login_users / get_public_shifts / get_shift_patterns と同じ理由で
-- 匿名実行を許可する（店舗IDは推測不能化済み＝F-6）
grant execute on function public.get_store_public_settings(text) to anon, authenticated;

commit;

-- 確認:
--   select public.get_store_public_settings('店舗ID');
--     → 未設定の店舗は {} 、設定済みなら {"shift_patterns": "...", "business_hours": "..."}
--   出してはいけないキーが混じっていないこと（deadline / wage_ / memo_ が無いこと）を目で見る
