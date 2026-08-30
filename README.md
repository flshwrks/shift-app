# シフト管理アプリ

飲食店のシフト提出・確定・共有を1か所で回すためのWebアプリ。スタッフはスマートフォンから
希望シフトを提出し、店舗管理者が確定して、確定したシフト表を全員が見る。複数店舗と本部管理に対応している。

本番: Vercel（`master` への push で自動デプロイ）/ データ: Supabase（PostgreSQL）

## ドキュメント

**最初に読むもの**

| 資料 | 内容 | 読む人 |
|---|---|---|
| [`docs/GUIDE.md`](docs/GUIDE.md) | 全機能の使い方（自動生成） | 全員 |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | **運用ハンドブック**。アカウント・鍵・リリース・障害対応・引き継ぎ | 運用・引き継ぎ担当 |
| [`docs/SECURITY.md`](docs/SECURITY.md) | 監査の記録と、なぜこの作りなのか（脅威モデル） | 開発・セキュリティ確認 |
| [`docs/SPEC.md`](docs/SPEC.md) | データモデル・ルーティング（技術資料） | 開発 |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | 配色・コンポーネントの約束 | 開発 |
| [`CHANGELOG.md`](CHANGELOG.md) | 変更履歴（アプリ内の更新履歴ページにそのまま出る） | 全員 |
| `improvement_list/` | 1計画1ファイルの改修記録。「なぜそうしたか」が残っている | 開発 |
| [`CLAUDE.md`](CLAUDE.md) | 開発時の約束事（**DBを在庫管理アプリと共有している点に注意**） | 開発 |

## 開発をはじめる

```bash
cp .env.local.example .env.local   # 値は運用担当者から受け取る（docs/OPERATIONS.md §3）
npm install
npm run dev                        # http://localhost:3000
```

| コマンド | 用途 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm test` | 自動テスト（実働時間の計算・認可まわり・セッション） |
| `npm run check:env` | 必要な環境変数が揃っているかの確認 |
| `npm run backup` | 本番データを手元にJSONで書き出す（月1回・`docs/OPERATIONS.md` §9-3） |
| `npm run build` | 本番ビルド |
| `npm run gen:guide` | ヘルプ（`lib/help/content.ts`）から `docs/GUIDE.md` を再生成 |
| `npm run check:guide` | 上のズレを検出（CIと同じ） |

CI（`.github/workflows/ci.yml`）は push / PR ごとに
`npm audit` → `check:guide` → `npm test` → `tsc --noEmit` → `next build` を実行する。

## 変更を出すときの約束

- `master` に直接コミットしない。ブランチ → プレビューで確認 → PR
- 利用者に意味のある変更は `package.json` の版を上げ、`CHANGELOG.md` に日本語で書く
- DBを変えるときは `supabase/migrations/` に追加し、**在庫管理アプリへの影響を確認する**
  （`docs/OPERATIONS.md` §7）

詳細は [`docs/OPERATIONS.md`](docs/OPERATIONS.md) を参照。
