-- ============================================================
-- 公開シフト表（/s/[storeSlug]/public/schedule）に日付ごとのメモを表示する
--
-- ★要手動適用★（Supabase SQL Editorで実行すること）
--
-- 在庫管理アプリ(inventory-app)への影響: なし。
-- 新規関数(get_public_memos)の追加のみで、既存テーブル・既存関数・既存ポリシーは
-- 一切変更しない。inv_* オブジェクトにも触れない。
--
-- ★仕様変更の注意★
-- Ver.2.3.0 で公開ページを作った際は「コメント欄・メモは表示しない（不特定多数に
-- 見えるべきでない私的な内容のため）」という判断だった。運用側の要望により、
-- メモについてはこの判断を意図的に覆す。
-- これにより「URLを知っていれば誰でもメモを読める」状態になるため、
-- メモに個人的な内容を書かない運用が前提になる。
-- シフトの comment 列は従来どおり公開しない（こちらは方針を変えない）。
-- ============================================================

-- app_settings の memo_YYYY-MM-DD だけを、指定店舗・指定期間に限って匿名公開する。
-- 提出期間(period_open_*/period_close_*)や時給(wage_*)など他のキーは返さない。
--
-- ★key の日付部分を date にキャストしない★
-- 万一 'memo_不正な値' のような行が紛れ込むと、キャストが例外を投げて
-- クエリ全体が落ちる。WHERE句の評価順序は保証されないため「正規表現で弾いてから
-- キャストする」という書き方でも安全とは言い切れない。
-- 'YYYY-MM-DD' は辞書順と日付順が一致するので、文字列のまま範囲比較すれば
-- キャスト自体が不要になる。戻り値も text のままにする（呼び出し側は
-- 既存のメモ機能と同じく 'YYYY-MM-DD' 文字列をキーとして扱っている）。
create or replace function public.get_public_memos(p_store_slug text, p_start date, p_end date)
returns table(
  memo_date text,
  memo text
)
language sql
security definer
set search_path = public
as $$
  select substring(a.key from 6) as memo_date, a.value as memo
  from public.app_settings a
  join public.stores st on st.id = a.store_id
  where st.slug = p_store_slug
    and a.key ~ '^memo_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and a.value <> ''
    and substring(a.key from 6)
        between to_char(p_start, 'YYYY-MM-DD') and to_char(p_end, 'YYYY-MM-DD');
$$;

-- list_login_users / get_public_shifts と同じ理由で、この関数はPUBLIC実行のままでよい
-- （anon/authenticatedに明示付与するだけで十分。revokeは不要）。
grant execute on function public.get_public_memos(text, date, date) to anon, authenticated;
