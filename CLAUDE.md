@AGENTS.md

## バージョン管理・リリースノート

ユーザー向けに意味のある変更（新機能・仕様変更・重要な不具合修正）を行った際は、以下を両方更新すること。

- `package.json` の `version` を [Semantic Versioning](https://semver.org/lang/ja/) でインクリメント
- `CHANGELOG.md` の先頭に日本語でエントリを追記（`## [x.y.z] - YYYY-MM-DD` 形式）。詳細な技術的経緯は `improvement_list/` を作成し、CHANGELOGからは概要とリンクだけにする
- `docs/GUIDE.md`（全機能の使い方マニュアル）の該当セクションを更新する。新しい画面・操作が増えた場合は追記、既存の挙動が変わった場合は書き換える。**このファイルが唯一の「全機能一覧」であること**を保つ（`docs/SPEC.md` 側に機能チェックリストを重複して書かない。SPEC.mdは技術資料に徹する）

軽微な修正（誤字・スタイル調整・コメントのみの変更等）は対象外。バージョン番号を上げるかどうか迷ったら、ユーザーに確認する。

## ★このDBは在庫管理アプリと共有している★

2026-08-10 以降、`~/.claude/在庫管理アプリ/inventory-app` が**同じSupabaseプロジェクト**を使っている。
向こうは `users` / `stores` / `verify_login` / `list_login_users` / `jwt_*()` / `is_hq_admin()` を
**参照するだけ**だが、これらを変えると在庫アプリが静かに壊れる（多くは「全員ログインできない」）。

次のものを変更したら、**必ず** `cd ~/.claude/在庫管理アプリ/inventory-app && npm run check:contract` を回すこと。

- `users` の `id/name/role/store_id`、`stores` の `id/slug/name`
- `verify_login` / `list_login_users` の引数・戻り値
- `jwt_app_role()` / `jwt_store_id()` / `jwt_user_id()` / `is_hq_admin()`（**PUBLIC実行権限のrevokeは両アプリを殺す**）
- `SUPABASE_JWT_SECRET`（両アプリで同じ値。変えるなら両方の環境変数を同時に更新する）

また、`grant ... on all tables in schema public` と `alter default privileges` は
両アプリに波及するので使わない。実DBには本リポジトリに無い `inv_*` オブジェクトが存在する。

詳細と復旧手順: `inventory-app/docs/RUNBOOK.md`（特に §5-1「シフト管理アプリを触る人へ」）
