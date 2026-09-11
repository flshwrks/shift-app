-- ============================================================
-- 本部ログインの氏名一覧の公開をやめる（点検項目 F-13）
--
-- 何が問題だったか:
--   本部ログイン画面は list_hq_admin_users() を**未認証のまま**呼び、
--   全本部管理者の氏名とユーザーIDを返していた。
--
--   店舗のログイン画面も同じように氏名一覧を返すが、あちらは F-6 で
--   **店舗IDにランダム6文字を付けてURLそのものを推測不能**にしてある。
--   一方 /admin/login は会社に1つの固定パスで、同等の前段防御が無い。
--
--   結果として「全店舗を横断できる最強の権限を持つアカウントの実名とIDだけが、
--   最も守りの薄い経路で公開されている」という非対称な状態になっていた。
--   取得したIDは PINの総当たり（F-10 の残課題＝4桁PIN）や、
--   標的型の働きかけの起点として使える。
--
-- 対応:
--   画面を「一覧から選ぶ」から「名前を入力する」に変え、この関数を呼ばなくした。
--   名前からIDへの解決はサーバー側（/api/hq-login）が service_role で行う。
--   存在しない名前と、PINの誤りは**同じ応答**にしてあるので、
--   入力欄から名前の存在を確かめることもできない。
--
-- なぜ drop ではなく revoke か:
--   関数自体は残しておけば、将来必要になったときに grant し直すだけで済む。
--   drop すると定義ごと失われる。取り返しのつく側を選ぶ。
--
-- 店舗のログイン画面（list_login_users）は**変更しない**。
-- あちらは「名前を選んで押すだけ」という現場の利便性が要件で、
-- URLの推測不能化という前段の守りも効いている。
-- ============================================================

-- ★PUBLIC も明示的に revoke すること★
--   Postgres は関数を作ると EXECUTE を **PUBLIC** に自動付与する（テーブルには無い挙動）。
--   anon / authenticated は PUBLIC の権限を暗黙に継承するため、
--   **この2ロールだけ revoke しても権限は残る**。
--   このプロジェクトは 2026-07-25 に admin_set_pin で同じ落とし穴を踏んでおり
--   （docs/SECURITY.md のインシデント記録）、その教訓がここに反映できていなかった。
--   2026-09-11、revoke 後の確認で両ロールとも true のままだったことで再発が判明した。

begin;

revoke execute on function public.list_hq_admin_users() from public, anon, authenticated;

-- PostgREST のスキーマキャッシュを更新する
notify pgrst, 'reload schema';

commit;

-- ★これが期待どおり返るまで「適用済み」とみなさないこと★
-- 確認:
--   select has_function_privilege('anon', 'public.list_hq_admin_users()', 'execute') as anon_exec,
--          has_function_privilege('authenticated', 'public.list_hq_admin_users()', 'execute') as auth_exec;
--   → 両方 false になること（片方でも true なら PUBLIC の権限が残っている）
