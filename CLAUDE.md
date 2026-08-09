@AGENTS.md

## バージョン管理・リリースノート

ユーザー向けに意味のある変更（新機能・仕様変更・重要な不具合修正）を行った際は、以下を両方更新すること。

- `package.json` の `version` を [Semantic Versioning](https://semver.org/lang/ja/) でインクリメント
- `CHANGELOG.md` の先頭に日本語でエントリを追記（`## [x.y.z] - YYYY-MM-DD` 形式）。詳細な技術的経緯は `improvement_list/` を作成し、CHANGELOGからは概要とリンクだけにする

軽微な修正（誤字・スタイル調整・コメントのみの変更等）は対象外。バージョン番号を上げるかどうか迷ったら、ユーザーに確認する。
