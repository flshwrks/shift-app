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
- **2026-08-09 実機検証完了**。マイグレーション①〜④すべて本番Supabaseに適用し、以下を確認済み:
  - スキーマ+バックフィル後、既存データが `store_id` 付きで正しく引き継がれていること（`users` 10件中 null 1件＝新規作成したhq_admin、`shifts` 392件 null 0件）
  - RLS本格化後、店舗ログイン・本部管理者ログインとも正常動作
  - スタッフのシフト申請・提出、管理者のシフト確定、スタッフ新規追加（PIN設定含む）、提出期間の保存、いずれも正常動作
  - 旧URL（`/login`, `/staff/*`, `/admin/旧配下`）からの自動転送が正常動作

## 適用時に発生した問題（本番で実際に踏んだトラブルと対処）

計画時点では気づけなかった、フェーズ分割そのものの不備が2件あった。いずれも実機での適用中に発覚し、その場で対処した。

1. **フェーズ2でコードをデプロイした直後、ログイン画面が「スタッフが登録されていません」になった**。原因はフェーズ分割の設計ミス: デプロイ済みのログイン画面は `list_login_users` RPCを呼ぶが、この関数は③（`2026-08-08c_multi_store_rls.sql`、RLS本格化のファイル）の中で作られる設計になっており、②止まりの段階ではDBに存在しなかった。`verify_login` の戻り値拡張（`store_id`追加）も同じファイルに同居しており、同じ理由で②の時点では未反映。**教訓**: RPC定義は「後方互換な追加」に分類されるべきで、RLSを絞る破壊的変更と同じファイルに同居させるべきではなかった。次に同種の移行を計画する際は、フェーズ分けの単位を「DBスキーマの破壊性」だけでなく「コードが依存する関数の存在」でも検証すること
2. **rmとshiftsのstore_id自動導出はDBトリガー任せの設計だったため、コードデプロイ後・③適用前の間隙でスタッフが操作した場合 `store_id` がnullのまま残るリスクがあった**。実際には検証時点でnull件数0件だったため事なきを得たが、運用中のアプリでこの間隙が空くこと自体が設計上の弱点だった

## 完了した適用手順（実績）

1. `2026-08-08_multi_store_schema.sql` → `2026-08-08b_multi_store_backfill.sql` を適用
2. 新規に本部管理者アカウントを1人作成（既存adminを昇格ではなく、SQL Editorで `insert ... values (..., 'hq_admin', null)` → `admin_set_pin` RPC呼び出しの形で追加）
3. Supabase Legacy JWT Secret を `SUPABASE_JWT_SECRET` としてVercel・`.env.local` に設定
4. コード一式を本番デプロイ（`git push origin master` → Vercel自動デプロイ）
5. ログイン画面でスタッフ一覧が取得できず不具合発覚 → 原因究明 → `2026-08-08c_multi_store_rls.sql` を前倒しで適用（本来は動作確認後の想定だったが、コードが依存する以上ここで適用するしかなかった）
6. 旧URL（`/login`等）が404になる問題が別途発覚 → `proxy.ts` に旧URL→新URLの自動転送を追加してデプロイ
7. 一通りの機能（シフト申請・確定・スタッフ追加・設定保存）を実機で確認
8. `2026-08-08d_multi_store_not_null.sql` を適用して完了

## 今後の課題

- 2店舗目を作る際は `/admin/stores` から作成し、店舗URL（`/s/[新slug]/login`）をQRコード化して店頭に掲示する運用を想定している
- **店舗間遮断の直接確認は未実施**（現状まだ1店舗のみのため検証しようがない）。2店舗目を作った際に、店舗Aのセッションで店舗Bのデータが見えないことを確認すること
- shiftsのstore_id自動導出をDBトリガー任せにしている設計は、今回のような「コード先行デプロイ」運用と相性が悪いことが分かった。今後同様の列追加をする場合は、アプリ側で明示送信する設計も検討する

### 今後の課題

- `docs/SECURITY.md` に残っていた「`shifts` / `shift_requests` / `app_settings` も行レベルで全開放」という残存リスクは今回のRLS化で解消したが、「スタッフが他人の確定済みシフトを直接更新できる」という粒度の制限は未実施（`2026-08-08c` 内にコメントで方針を残してある）
- 店舗ごとのシフト種別（A〜G）のカスタマイズは未対応（現状は全店舗共通の固定値）
