# Tier 2: usersテーブル書込みのservice role API移行

## 対象

- `lib/session.ts`, `lib/supabaseAdmin.ts`（新規）
- `app/api/login/route.ts`, `app/api/logout/route.ts`（新規）
- `app/api/admin/users/route.ts`, `app/api/admin/users/reorder/route.ts`（新規）
- `app/api/dev-login/route.ts`, `app/login/page.tsx`, `app/admin/staff/page.tsx`, `components/NavBar.tsx`
- `supabase/schema.sql`, `supabase/migrations/2026-07-25c_lock_users_writes.sql`（新規、**要手動適用**）

## 変更内容

- httpOnly署名付きセッションCookie（HMAC-SHA256、`SESSION_SECRET`環境変数）を新設。ログイン成功時（`/api/login`, `/api/dev-login`）に発行、ログアウト時（`/api/logout`）に削除
- `SUPABASE_SERVICE_ROLE_KEY` を使いRLSをバイパスする管理者専用クライアント（`lib/supabaseAdmin.ts`）を新設。サーバー専用、クライアントからは絶対にimportしない
- スタッフの追加・編集・削除・並び替えを `app/api/admin/users/*` のRoute Handlerに集約し、`requireAdmin()` でセッションのrole(admin/developer)を検証してから実行する設計に変更。`app/admin/staff/page.tsx` は直接Supabase書込みをやめ、これらのAPIを`fetch`で呼ぶ
- 仕上げとして `users` への直接INSERT/UPDATE/DELETEと `admin_set_pin` RPCの実行権限をanon/authenticatedから剥奪するSQLを用意（`2026-07-25c_lock_users_writes.sql`）

## /simplify での指摘・修正

4観点の並列レビューで以下を適用:
- `lib/session.ts`に`constantTimeEqual`を集約し、`app/api/dev-login/route.ts`との重複を解消
- `requireAdmin()`が403レスポンスまで返すよう変更し、4箇所の管理者ガード用ボイラープレートを解消
- `app/api/admin/users/route.ts`のPOST/PATCHで重複していたバリデーション・PIN設定処理を`parseUserPayload`/`setPin`ヘルパーに集約
- POST時のdisplay_order計算を全件取得からトップ1件取得に変更
- PATCH時のname/role更新とPIN設定を`Promise.all`で並列化（同一行への更新だがDBが安全に直列化するため問題なし）
- reorderの並び替えを個別更新からupsertに変更しようとしたが、**`users.name`のNOT NULL制約によりPostgresがON CONFLICT DO UPDATE経路でも拒否することが実機検証で判明**したため個別更新方式に差し戻し、バリデーション強化（不正な要素が1件でもあれば全体を拒否）のみ採用
- **altitude観点のレビューで重大な見落としを発見**: `admin_set_pin` RPCが呼び出し元の権限チェックを一切行わず、anonに実行権限が付与されたままだった。usersテーブルの直接書込みを塞いでもこのRPC経由で同等の攻撃が可能なため、ロックダウンSQLに実行権限の剥奪を追加

## 検証

- `npx tsc --noEmit` / `npx next build` エラーなし
- ローカルでビルド済みアプリを起動し、本番Supabaseプロジェクトに対して実際に検証:
  - スタッフ作成→発行PINでログイン→編集（名前・権限・PIN変更）→新PINでログイン→削除の一連が正常動作
  - 未ログイン・スタッフ権限セッションからの管理者API呼び出しがいずれも403
  - 並び替え: 不正なリクエスト（一部要素が不正な形式）は全体を400で拒否、正常なリクエストは対象行の`display_order`のみ更新され他の列（name, role, pin_hash等）は無傷であることを確認
  - テスト用に作成したデータはすべて削除し、実データへの影響なし
- 途中、ローカルテストサーバーの旧プロセスがポートを掴んだまま残り、リファクタ後のコードではなく古いコードに対してテストしてしまっていたことに気づき、プロセスを確実に停止してから再検証した

## 残作業

- `supabase/migrations/2026-07-25c_lock_users_writes.sql` の適用（新しいAPIルートの本番動作確認後に実施すること）
- `shifts`・`shift_requests`・`app_settings` も同様のパターンで書込みを閉じることが望ましい（`docs/SECURITY.md`参照、優先度は`users`より低い）
