# マルチ店舗対応（単一店舗 → 同一組織の複数店舗・本部管理）

## 対象

**DB（要手動適用）**
- `supabase/migrations/2026-08-08_multi_store_schema.sql`（新規）
- `supabase/migrations/2026-08-08b_multi_store_backfill.sql`（新規）
- `supabase/migrations/2026-08-08c_multi_store_rls.sql`（新規）
- `supabase/migrations/2026-08-08d_multi_store_not_null.sql`（新規）
- `supabase/schema.sql`（マルチ店舗対応後の最終形に更新）

**コア基盤**
- `lib/types.ts`, `lib/session.ts`, `lib/supabase.ts`, `lib/auth.tsx`
- `lib/supabaseJwt.ts`（新規）, `lib/store.tsx`（新規）
- `package.json`（`jose` 追加）, `.env.local.example`

**APIルート / ルーティング**
- `app/api/login/route.ts`, `app/api/dev-login/route.ts`, `app/api/admin/users/route.ts`, `app/api/admin/users/reorder/route.ts`
- `app/api/session/token/route.ts`, `app/api/hq-login/route.ts`, `app/api/hq/stores/route.ts`（いずれも新規）
- `proxy.ts`（新規）

**画面**
- `app/s/[storeSlug]/` 配下へ全面移設（`layout.tsx`, `login/`, `staff/{shifts,schedule,requests}`, `admin/{schedule,requests,staff,settings,survey,labor-cost}`）
- `app/admin/layout.tsx`（本部専用に書き換え）, `app/admin/login/`, `app/admin/stores/`（新規）
- `app/page.tsx`
- `components/NavBar.tsx`, `components/LoginNotificationModal.tsx`, `components/ShiftRequestModal.tsx`
- 旧 `app/login/`, `app/staff/`, `app/admin/{schedule,requests,staff,settings,survey,labor-cost}/` を削除

## 変更内容

### データモデル
- `stores` テーブル新設（`slug` / `name`）。`users` / `shifts` / `shift_requests` / `surveys` / `app_settings` に `store_id` を追加
- `users.role` に `hq_admin`（本部管理者、`store_id` は null）を追加。スタッフは1人1店舗（掛け持ちなし）
- `users.name` のグローバル unique を `(store_id, name)` に付け替え。`store_id is null` 群（hq_admin）は部分 unique index で担保
- `app_settings` の主キーを `key` → `(store_id, key)` の複合キーに変更。`org_name` キーは `stores.name` に一本化して廃止
- `shifts.store_id` は `user_id` から導出する `SECURITY DEFINER` トリガーで**常に上書き**。クライアントが送った値を握り潰すことで他店なりすましINSERTを構造的に防ぐ

### 認証とRLS
従来は独自のhttpOnly署名Cookieのみでセッション管理しており、SupabaseのRLSからは誰がアクセスしているか見えず、全テーブルが `using (true)` の全開放だった（`docs/SECURITY.md` に残存リスクとして記載済みだった状態）。多店舗化で「他店舗のスタッフ名・シフト・時給が見える」実害に直結するため、この機会にRLSを本来の境界に戻した。

- httpOnly Cookieは**信頼のアンカーとして維持**したまま、そこから派生する短命なSupabase JWT（`app_role` / `store_id` カスタムクレーム入り）を発行し、`supabase-js` の `accessToken` コールバックに渡す（Supabase公式のサードパーティ認証パターン）
- **JWTはlocalStorageに保存しない**。メモリ変数のみに保持し、`GET /api/session/token` から取得・45分ごとにリフレッシュ。XSS発生時の被害をTTL内に限定するため
- 全テーブルのRLSを `is_hq_admin() or store_id = jwt_store_id()` ベースの店舗スコープポリシーに差し替え。子テーブル（`shift_request_targets` / `survey_options` / `survey_responses`）は親経由の `exists()` でスコープ
- 未認証のログイン画面用に `list_login_users(p_store_slug)` / `list_hq_admin_users()` の SECURITY DEFINER RPC を追加（RLS適用後は `users` を直接読めないため）
- `verify_login` の戻り値に `store_id` を追加し、URL上のslugと一致しないログインを拒否

### ルーティング
- 全画面を `/s/[storeSlug]/...` 配下へ移設。店頭にQRコードを掲示する運用を想定
- 本部管理者は `/admin/login` からログインし、`/admin/stores` で店舗のCRUDと各店舗への遷移・ログインURLコピーができる
- `proxy.ts`（Next.js 16で `middleware.ts` から改称）でURL上のslugとセッションの店舗の整合性を検証。ただしこれはUI最適化であり認可の最終防衛線ではない旨をコメントで明記し、各Route Handler側の検証は一切外していない

### 店舗境界の実体
`lib/supabaseAdmin.ts` の service_role クライアントは**RLSを完全にバイパスする**ため、`app/api/admin/users/route.ts` 系の店舗境界はDBではなくコードにしか存在しない。POSTは非hq_adminならボディの `storeId` を無視して `session.storeId` を強制適用、PATCH/DELETEは対象行の `store_id` を先読みして照合、reorderは各UPDATEに `.eq('store_id', ...)` を追加、という形で明示的に守っている。

## 統括側で発見・修正した問題

並列実装後の統合レビューで、ビルドでは検出できない不具合を3件発見して修正した。

1. **`app_settings` の複合PK化タイミング**: 当初計画では最終フェーズ（`d`）に置いていたが、新コードが `onConflict: 'store_id,key'` を指定するため、この一意制約がコードデプロイ**前**に存在しないと設定保存（提出期間・メモ・時給）が一斉に失敗する。`2026-08-08b` に一意インデックスの先行作成を追加し、`d` で主キー化した際に重複分を削除するようにした

2. **旧Cookieによる無限リダイレクトループ**: `verifySessionCookie` が旧形式Cookie（`storeId`/`storeSlug` 無し）に null を補って通す後方互換シムになっていた。これにより店舗ユーザーが店舗コンテキスト不明のまま通過し、`proxy.ts` が `/s/null/...` へリダイレクトし続けるループと、`store_id` が null のスタッフ作成が起きうる状態だった。**旧Cookieは無効なセッションとして扱い一度だけ再ログインさせる**方針に変更（hq_admin/developer は本来 `store_id` を持たないロールなので判定から除外）。`proxy.ts` 側にも同じ不変条件の防御を追加

3. **共通コンポーネントの店舗フィルタ漏れ**: エージェント中断により `LoginNotificationModal` は import だけ追加された状態で、`shift_requests` への4クエリすべてに店舗フィルタが未適用だった（他店舗の調整依頼が通知に混入する）。`ShiftRequestModal` も INSERT への `store_id` 付与が未実施だった。いずれも修正

## /simplify での指摘・対応

並列実装の統合後にレビューを実施し、以下を適用した。

**適用**
- **PINテンキーUIの3重複を解消**: 店舗ログイン（通常・開発者モード）と本部ログインで同じドット表示・テンキー・入力ロジックが重複していたため `components/PinPad.tsx` に抽出（`applyPinKey` も含む）
- **ログイン後の遷移先ロジックの3重複を解消**: `app/page.tsx` / 店舗ログイン画面 / `proxy.ts` に同じ分岐が散在していたため `lib/routes.ts` の `homePathFor()` に集約。ルーティングを変えるたびに3箇所を直す必要がなくなった
- **`/api/admin/users` DELETE を1往復に統合**: 事前SELECT＋DELETEの2往復を、条件付きDELETE1回に変更（`reorder` と同じ方式）。他店の行を指定しても該当0件になるだけで存在の有無も漏れない

**見送り（理由あり）**
- **`/api/admin/users` PATCH の事前SELECT削除**: レビューでは「DELETEと同様に条件付きUPDATEで1往復にできる」と指摘されたが、**適用すると脆弱性を再導入するため見送った**。PATCHの事前SELECTは `update` だけでなく `setPin`（`admin_set_pin` RPC）のゲートも兼ねている。このRPCは `user_id` のみを受け取り店舗スコープを一切見ないため、条件付きUPDATEに置き換えると「UPDATEは0行だが他店スタッフのPINだけ書き換わる」状態を作れてしまう。`docs/SECURITY.md` に記録されている admin_set_pin のインシデントと同型。将来同じ「最適化」が再提案されないよう、理由をコード内コメントに残した
- **`/api/login` の `verify_login` と `stores` 引き当ての並列化**: `verify_login` は bcrypt（cost 10、約100ms）が支配的で、`stores` 引き当ての10-20msを並列化しても体感差がない。一方でPIN不一致時にも常に追加クエリを撃つことになるため見送り
- **`lib/auth.tsx` のマウント時トークン待ちを楽観的表示に変更**: これは意図的な設計。先に `isLoading=false` にすると、子コンポーネントがJWT未添付でSupabaseに問い合わせてRLSに弾かれ、空表示のちらつきが出る
- **`StoreProvider` の解決待ちによるログイン画面の直列化**: ログイン画面が店舗解決を待ってから `list_login_users` を呼ぶため往復が直列になっている、という指摘は妥当。ただし解消にはログイン画面をProviderのブロッキング外に出す構造変更が必要で、動作確認前の段階で入れる変更としてはリスクが見合わないため今回は見送り（今後の課題）

## 検証

- `npx tsc --noEmit` エラーなし、`npx next build` 成功（全22ルート生成、`Proxy (Middleware)` 認識を確認）
- **未実施**: DBマイグレーション適用と実機での動作確認。マイグレーションはユーザーがSupabase SQL Editorで手動適用する必要がある

## 残作業

### マイグレーション適用手順（順序厳守）

コードとDBの適用順序を誤るとログイン不能になる。

1. `2026-08-08_multi_store_schema.sql` → `2026-08-08b_multi_store_backfill.sql` を適用。**この時点ではRLSは開放のままなので、現行コードが無改修で従来通り動作する**（ロールバックは追加した列とテーブルのdropのみ）
2. `2026-08-08b` 末尾のコメントを参照し、既存adminの1名を `hq_admin` に昇格するSQLを手動実行（誰を本部管理者にするかは要判断）
3. Supabaseダッシュボードで **Legacy JWT Secret** を取得し、`SUPABASE_JWT_SECRET` としてVercelと `.env.local` に設定。もし非対称鍵に完全移行済みでLegacy Secretが無効化されていた場合は、Third-Party Auth（JWKS）方式への切り替えが必要
4. コード一式を本番デプロイ。RLSはまだ開放なので安全に検証できる（DevToolsで発行されたJWTをデコードし `app_role` / `store_id` が正しいか確認）
5. `2026-08-08c_multi_store_rls.sql` → `2026-08-08d_multi_store_not_null.sql` を**連続して**適用
6. 2店舗目を作るのは 5 の完了後にすること（それ以前は `app_settings` の主キーが `key` 単体のままなので、店舗間でキーが衝突しうる）

### 動作確認が必要な項目

- 店舗ログイン → シフト申請 → 管理画面での確定 → Realtime同期
- 本部管理者ログイン → 店舗切り替え → 各店舗の管理画面
- **店舗間遮断の直接確認**（最重要）: 店舗Aのセッションで取得したJWTを使い、`curl` 等から店舗Bの `shifts` / `users` をSELECTして0件または permission denied になること。anonキー単体（JWTなし）でも同様に空になること
- Realtime: 店舗Aの画面を開いた状態で店舗Bのシフトを変更し、店舗A側に通知が来ないこと
- 既存ユーザーが旧Cookieを持ったままアクセスした場合、ループせずログイン画面に戻ること

### 今後の課題

- `docs/SECURITY.md` に残っていた「`shifts` / `shift_requests` / `app_settings` も行レベルで全開放」という残存リスクは今回のRLS化で解消したが、「スタッフが他人の確定済みシフトを直接更新できる」という粒度の制限は未実施（`2026-08-08c` 内にコメントで方針を残してある）
- 店舗ごとのシフト種別（A〜G）のカスタマイズは未対応（現状は全店舗共通の固定値）
