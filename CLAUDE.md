@AGENTS.md

## バージョン管理・リリースノート

ユーザー向けに意味のある変更（新機能・仕様変更・重要な不具合修正）を行った際は、以下を両方更新すること。

- `package.json` の `version` を [Semantic Versioning](https://semver.org/lang/ja/) でインクリメント
- `CHANGELOG.md` の先頭に日本語でエントリを追記（`## [x.y.z] - YYYY-MM-DD` 形式）。詳細な技術的経緯は `improvement_list/` を作成し、CHANGELOGからは概要だけにする
  - **CHANGELOG.md はアプリ内の更新履歴ページ（`/release-notes`）にそのまま出て、スタッフ（アルバイトを含む）が読む。** 表示側は「インデントした入れ子の箇条書きは出さない」「バッククォートで囲んだ部分は消す」の2ルールで技術的な記述を落とすので、**トップレベルの箇条書きはスタッフが読んで分かる日本語だけにし、開発者向けの補足は入れ子の箇条書きに書く**（ファイル名・識別子は必ずバッククォートで囲む）
- **「店長」という言葉は使わない。** ロール名は「スタッフ」「店舗管理者（管理者）」「本部管理者」で統一する（UI・ドキュメント・コード内コメントすべて）
- `lib/help/content.ts`（`HELP_CONTENT`）を更新する。ここがアプリ内ヘルプ（`components/HelpModal.tsx`）と `docs/GUIDE.md` 共通の唯一の正データ。新しい画面・操作が増えた場合は追記、既存の挙動が変わった場合は書き換える
- `docs/GUIDE.md` の生成部分（「3. スタッフ向け機能」〜「5. 本部管理者向け機能」）は `npm run gen:guide` で再生成する。**手で編集しない**（CIの `npm run check:guide` がズレを検出する）。`docs/GUIDE.md` が**唯一の「全機能一覧」であること**を保つ（`docs/SPEC.md` 側に機能チェックリストを重複して書かない。SPEC.mdは技術資料に徹する）

軽微な修正（誤字・スタイル調整・コメントのみの変更等）は対象外。バージョン番号を上げるかどうか迷ったら、ユーザーに確認する。

## DBの同居はもう無い（2026-08-31 解消）

2026-08-10 から 2026-08-31 まで、`~/.claude/在庫管理アプリ/inventory-app` が
**同じSupabaseプロジェクト**に相乗りしていた（Supabase無料プランが1組織2プロジェクトまでのため）。
**在庫アプリは廃止し、`inv_*` を全削除したので、いまこのDBはシフト管理アプリ専用。**

- `users` / `stores` / `verify_login` / `list_login_users` / `jwt_*()` / `is_hq_admin()` を
  変更しても、もう他アプリを壊さない。`npm run check:contract` も不要（在庫アプリ側の仕組み）
- `SUPABASE_JWT_SECRET` の共有相手はいない。**単独でローテーションできる**
- ただし `grant ... on all tables in schema public` と `alter default privileges` は
  引き続き使わない（スキーマ全体に波及するため。理由は `supabase/schema.sql` 末尾）

経緯: `improvement_list/2026-08-31_inventory_teardown.md`。
再構築が必要になった場合、在庫アプリの実装は `inventory-app` リポジトリに残っている。
