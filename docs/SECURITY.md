# セキュリティ監査と対応（2026-07-25）

「システムの脆弱性や機能上の弱点を網羅的に点検し、より使いやすく持続可能なアプリにする」という指示を受けて実施した監査の記録。発見した問題・対応済みの内容・**運用者（あなた）が実施しないと有効化されない手順**・今後の推奨事項をまとめる。

## 発見した重大な脆弱性（対応済み・コード側）

すべて `supabase/schema.sql` の RLS ポリシーが全テーブルで `using (true) with check (true)`（誰でも全行を読み書きできる）になっていたことに起因する。Supabaseの `anon` キーはクライアントのJSバンドルに公開される前提の鍵であり、本来の保護はRLS側で行う必要があった。

1. **PINが平文で保存・表示されていた**（`users.pin` 列 + 管理画面の再表示機能）。RLSが全開放だったため、この列は誰でも直接読み取り可能で、ハッシュ化の意味が失われていた。
2. **RLS全開放により、匿名の第三者が `pin_hash` を含む全ユーザー情報を直接SELECTできた**。ログイン画面を経由せず、ブラウザのネットワークタブから anon キーとURLを取得すれば、Supabaseクライアントで直接クエリを投げられる状態だった。
3. **PINハッシュが固定ソルトのSHA-256** (`pin + 'shift_app_salt_v1'`)。4桁PIN（1万通り）× 公開された固定ソルトのため、`pin_hash` が漏れれば総当たり不要で全PINを瞬時に復元できた。
4. **開発者ログインのパスワード（'0805'）がクライアントのソースコードに直書き**されており、ビルド後のJSバンドルを読めば誰でも取得できた。

## 対応した内容（Tier 1）

- `supabase/migrations/2026-07-25_security_hardening.sql`（**要手動適用**、後述）
  - pgcrypto (bcrypt) で再ハッシュ化 + 平文PIN列(`pin`)を削除
  - ログイン失敗5回で15分ロックアウト（`failed_pin_attempts` / `pin_locked_until`）
  - PIN検証・設定を `SECURITY DEFINER` のRPC（`verify_login` / `admin_set_pin`）に集約
  - `users` テーブルは列単位の権限で `id, name, role, display_order, created_at` のみ anon/authenticated から読める状態にし、`pin_hash` 等の機微列を隠す（行の可視性=RLSは変更していないので、`shift_request_targets` 等からの `user:users(name)` 埋め込みJOINは従来通り動作する）
- `app/login/page.tsx`: PIN検証を直接SELECTからRPC呼び出しに変更。開発者ログインをサーバー側API (`app/api/dev-login/route.ts`) 経由に変更し、パスワードは `DEV_LOGIN_PASSWORD` 環境変数（サーバー専用、クライアントに出力されない）に移動
- `app/admin/staff/page.tsx`: 平文PIN再表示機能（`PinCell`）を削除。PIN設定は `admin_set_pin` RPC経由に統一（bcryptハッシュ化はDB側で実施）
- `lib/types.ts` / `lib/shifts.ts`: 不要になった `pin` 型フィールドと `hashPin`（旧SHA-256実装）を削除
- Vercel本番環境に `DEV_LOGIN_PASSWORD` を設定済み（値は従来と同じ `0805`。開発者の操作フローは変わらない）

## ✅ Tier 1 の適用状況（完了）

`supabase/migrations/2026-07-25_security_hardening.sql` と、pgcryptoのsearch_path問題を修正した追加パッチ `2026-07-25b_fix_pgcrypto_search_path.sql` は、ユーザー自身がSupabase SQL Editorで実行済み。`verify_login` RPC・列単位権限をAPI経由で疎通確認済み。コード側もpush・本番デプロイ済み。

## 対応した内容（Tier 2 — usersテーブル書込みのAPI移行）

Tier 1適用直後は、`users` への INSERT/UPDATE/DELETE が anon に開放されたままで、「`role` を直接 `admin` に書き換える」「新規に `role='admin'` 行を直接INSERTする」といった攻撃が理論上可能な状態だった。以下でこれを塞いだ。

- `lib/session.ts`: httpOnly署名付きセッションCookie（HMAC-SHA256、`SESSION_SECRET`）を新設。`getSession()` / `requireAdmin()` で検証
- `app/api/login/route.ts`（新規）: PIN検証（`verify_login` RPC）に成功したらセッションCookieを発行
- `app/api/logout/route.ts`（新規）: Cookie削除
- `app/api/dev-login/route.ts`: 開発者ログイン成功時もセッションCookieを発行するよう変更
- `lib/supabaseAdmin.ts`（新規）: `SUPABASE_SERVICE_ROLE_KEY` を使いRLSを完全にバイパスする管理者専用クライアント（サーバー限定）
- `app/api/admin/users/route.ts`, `app/api/admin/users/reorder/route.ts`（新規）: スタッフの追加・編集・削除・並び替えをここに集約。`requireAdmin()` でrole=admin/developerのセッションを検証してからservice roleクライアントで書込む
- `app/admin/staff/page.tsx`: 直接Supabase書込みをやめ、上記APIを`fetch`で呼ぶように変更
- `supabase/migrations/2026-07-25c_lock_users_writes.sql`（**要手動適用**、後述）: `users` への INSERT/UPDATE/DELETE と `admin_set_pin` RPCの実行権限を anon/authenticated から剥奪する仕上げ

**重要な追加発見**: `/simplify` の並列レビュー（altitude観点）で、`admin_set_pin` RPCが呼び出し元の権限チェックを一切行わず、しかも `anon` に実行権限が付与されたままだったことが判明。usersテーブルの直接書込みだけ塞いでも、このRPCを直接叩けば「他人（管理者含む）のPINを書き換え→そのPINでログインしてセッション奪取」という同等の抜け道が残る状態だった。ロックダウン用マイグレーションに `revoke execute on function public.admin_set_pin(uuid, text) from anon, authenticated;` を追加して対応（service_roleクライアントはgrant/revokeを無視して常に実行できるため、新しいAPIルートには影響しない）。

ローカルで実際にビルド済みアプリを起動し、本番のSupabaseプロジェクトに対して以下を確認済み: スタッフ作成→発行PINでのログイン→編集（名前・権限・PIN変更の並列更新）→新PINでのログイン→削除、権限チェック（未ログイン・スタッフ権限それぞれ403）、並び替え（不正なリクエストは全体を拒否、正常なリクエストは対象行のみ更新され他の列は無傷）。テスト用に作成したデータはすべて削除し、実データへの影響なし。

**✅ 適用済み**: `2026-07-25c_lock_users_writes.sql` はユーザー自身がSupabase SQL Editorで実行済み。

### ⚠️ インシデント記録: admin_set_pin のPUBLIC権限の見落とし（2026-07-25、発生・対応済み）

`2026-07-25c` 適用後の動作確認で、`revoke execute on function public.admin_set_pin(uuid, text) from anon, authenticated;` だけでは不十分だったことが判明した。

**原因**: Postgresは関数を作成すると、デフォルトでEXECUTE権限を **PUBLIC** に自動付与する（テーブルには無い、関数特有の挙動）。`anon`/`authenticated` は暗黙にPUBLICの権限を継承するため、この2ロールから明示的にrevokeしても、PUBLICへの権限が残っていれば依然として誰でも呼び出せる。

**実際に起きたこと**: この抜け穴が塞がっているかを確認するテスト呼び出し（`curl`でanonキーから`admin_set_pin`を直接叩く検証）が実際に成功してしまい、**実在するスタッフ1名（佐藤さん）のPINが意図せず`0000`に書き換わった**。発見直後にservice role経由で新しいランダムなPIN（`2568`、ユーザーに口頭で共有済み）に再設定し、`revoke execute on function public.admin_set_pin(uuid, text) from public;`（`2026-07-25d_fix_admin_set_pin_public_grant.sql`）を追加適用して抜け穴を完全に閉じた。適用後、anonキーからの直接呼び出しが `permission denied for function admin_set_pin` で拒否されること、サービスロール経由の正規APIは引き続き動作することを確認済み。

**教訓**: Postgresの関数にはPUBLICへの暗黙付与があるため、`SECURITY DEFINER` 関数の権限を絞る際は `anon, authenticated` だけでなく **`public` も明示的にrevokeする**こと（`verify_login` はログイン用途で意図的に公開のままにしている＝問題なし）。今後同様のRPCを追加する際は、この点を最初のマイグレーションから含めること。

**残存リスク（今後の課題）**: 同様のパターンを `shifts`（確定操作）・`shift_requests`（取消・確定）・`app_settings`（提出期間・組織名）にも拡大することが望ましい（現状はこれらも行レベルで全開放だが、`users` ほど致命的ではないため優先度を下げている）。
→ **この残存リスクは 2026-08-08 のマルチ店舗対応（Tier 3）で解消した。後述。**

---

# Tier 3: マルチ店舗対応に伴うRLSの本格化（2026-08-08）

単一店舗から「同一組織の複数店舗＋本部管理」へ拡張するにあたり、Tier 1/2 で残していた「RLSは全テーブル `using (true)` の全開放で、実質的な保護はアプリ層とservice_role経由のAPIにしかない」という状態を解消した。多店舗化すると、この残存リスクが「他店舗のスタッフ名・シフト・時給が見える」という直接的な情報漏洩に変わるため、先送りできなくなった。

## 設計: httpOnly Cookieを維持したままRLSにアイデンティティを渡す

このアプリはSupabase Authを使わず独自のhttpOnly署名Cookieでセッションを管理しているため、RLSからは「誰がアクセスしているか」が全く見えなかった。これがRLSを全開放にせざるを得なかった根本原因。

- ログイン成功時に、Cookieから派生する**短命なSupabase JWT**（`app_role` / `store_id` カスタムクレーム入り）をサーバー側で署名して発行し、`supabase-js` の `accessToken` コールバックに渡す（Supabase公式のサードパーティ認証パターン）。これによりRLSポリシー内の `auth.jwt()` からクレームを読めるようになる
- **信頼のアンカーは引き続きhttpOnly Cookie**。JWTはそこから都度導出される派生クレデンシャルという位置づけ
- **JWTはlocalStorageに保存しない**。httpOnly CookieはXSSで読めないが、JWTをlocalStorageに置くと「XSSが一度発火すれば後からいつでも再利用できる」長命の漏洩になる。メモリ変数にのみ保持し、`GET /api/session/token` から取得・45分ごとにリフレッシュすることで、XSS時の被害をTTL内に限定した
- JWT署名は手書きHS256ではなく `jose` を使用。base64urlパディング・ヘッダーの厳密一致など自前実装が壊れやすい割に検証が難しい領域であり、このプロジェクトは既に認証まわりで2件の実インシデント（固定ソルトSHA-256、PUBLIC権限の見落とし）を起こしているため、3件目のリスクを取らない判断

## 対応した内容

- 全テーブルのRLSを `is_hq_admin() or store_id = jwt_store_id()` ベースの店舗スコープポリシーに差し替え。子テーブル（`shift_request_targets` / `survey_options` / `survey_responses`）は親経由の `exists()` でスコープ
- `shifts.store_id` は `user_id` から導出する `SECURITY DEFINER` トリガーで**常に上書き**する。クライアントが送った `store_id` を握り潰すことで、他店の `user_id` を推測してINSERTし WITH CHECK をすり抜ける攻撃を構造的に防ぐ（Postgresの仕様上、WITH CHECK は BEFORE ROW トリガー適用後の最終行に対して評価される）
- 未認証のログイン画面用に `list_login_users(p_store_slug)` / `list_hq_admin_users()` の SECURITY DEFINER RPC を追加。RLS適用後は JWT の無い匿名リクエストで `users` を読めなくなるため
- `verify_login` の戻り値に `store_id` を追加し、URL上のslugと所属店舗が一致しないログインを `/api/login` で拒否

## Tier 1 の教訓（PUBLICへの暗黙付与）の適用

新規追加した SECURITY DEFINER 関数のうち、意図的に公開するもの（`list_login_users` / `list_hq_admin_users` / `verify_login`）以外は `public, anon, authenticated` から明示的に revoke した。

ただし**RLSヘルパー関数（`jwt_app_role()` / `jwt_store_id()` / `jwt_user_id()` / `is_hq_admin()`）は意図的にPUBLIC実行のまま残している**。RLSの `using` / `with check` 句は問い合わせ元ロールの権限で評価されるため、これらからEXECUTEを剥奪すると全てのポリシー評価が "permission denied for function" で失敗し、行アクセスが完全に壊れる。これらは呼び出し元自身のJWTを読み返すだけで特権的な情報にアクセスしないため、公開実行で問題ない。この判断はマイグレーションSQL内にコメントで残してある。

## 店舗境界の実体はコードにある（重要）

`lib/supabaseAdmin.ts` の service_role クライアントは **RLSを完全にバイパスする**。したがって `app/api/admin/users/*` における「店舗管理者が他店のスタッフを操作できない」という保証は、DBのRLSではなく**アプリコードにしか存在しない**。

- POST: 非hq_adminならボディの `storeId` を完全に無視して `session.storeId` を強制適用
- PATCH / DELETE: 対象行の `store_id` を先読みし、非hq_adminなら `session.storeId` と一致しない限り403
- reorder: 各UPDATEに `.eq('store_id', ...)` を追加（対象外の行は0件更新となり安全側に倒れる）

## 統合レビューで発見した問題（修正済み）

並列実装後の統合レビューで、型チェック・ビルドでは検出できない不具合を3件発見して修正した。

1. **旧Cookieによる無限リダイレクトループ**: `verifySessionCookie` が多店舗対応前のCookie（`storeId`/`storeSlug` 無し）に null を補って通す後方互換シムになっていた。これにより店舗ユーザーが「所属店舗が不明なままログイン状態」で通過し、`proxy.ts` が `/s/null/...` へリダイレクトし続けるループと、`store_id` が null のスタッフ作成が起きうる状態だった。**店舗コンテキストの無い店舗ユーザーは正しくスコープしようがない**ため、旧Cookieは無効なセッションとして扱い一度だけ再ログインさせる方針に変更した（hq_admin/developer は本来 `store_id` を持たないロールなので判定から除外）
2. **`app_settings` の複合PK化タイミング**: 新コードが `onConflict: 'store_id,key'` を指定するため、この一意制約がコードデプロイ前に存在しないと設定保存が一斉に失敗する。バックフィル用マイグレーションに一意インデックスの先行作成を追加した
3. **共通コンポーネントの店舗フィルタ漏れ**: `LoginNotificationModal` の `shift_requests` への4クエリすべてに店舗フィルタが未適用で、他店舗の調整依頼が通知に混入する状態だった

## ⚠️ 適用手順（順序厳守）

コードとDBの適用順序を誤るとログイン不能になる。詳細は `improvement_list/2026-08-08_multi_store_support.md` を参照。

1. `2026-08-08_multi_store_schema.sql` → `2026-08-08b_multi_store_backfill.sql` を適用（RLSはまだ開放のままなので現行コードが無改修で動作）
2. 既存adminの1名を `hq_admin` に昇格（手動SQL）
3. `SUPABASE_JWT_SECRET`（SupabaseのLegacy JWT Secret）をVercel・`.env.local` に設定
4. コード一式をデプロイし、発行されるJWTのクレームを確認
5. `2026-08-08c_multi_store_rls.sql` → `2026-08-08d_multi_store_not_null.sql` を**連続して**適用
6. 2店舗目を作るのは 5 の完了後（それ以前は `app_settings` の主キーが `key` 単体のままで店舗間のキー衝突が起きうる）

**残存リスク（今後の課題）**: 「スタッフが他人の確定済みシフトを直接更新できる」という粒度の制限は今回も未実施（店舗スコープ内では従来通りの寛容な書込み権限）。`2026-08-08c_multi_store_rls.sql` 内に、WITH CHECK に `(jwt_app_role()='staff' and user_id=jwt_user_id() and status='draft')` の分岐を足す方針をコメントで残してある。

## その他の監査結果（機能・UX・保守性）

セキュリティ以外に、機能バグ・UX・保守性の観点でも監査エージェントを並列起動して洗い出した。対応した内容:

- **確定済みシフトが編集可能だった**（`app/staff/shifts/page.tsx`）→ 確定後は編集・コピー対象から除外し、変更が必要な場合は既存の「調整依頼」機能を使う設計に統一
- **依頼取消時にシフトの整合性が崩れる**（`app/admin/requests/page.tsx`）→ 取消と同時に承諾済みの下書きシフトを削除。確定済みシフトがある場合は取消をブロックし、シフト管理画面から直接対応するよう案内
- 各種Supabaseクエリの `error` 握りつぶし、時刻入力の開始/終了逆転バリデーション欠如、破壊的操作（前月コピー上書き・アンケート削除）の確認不足、未使用依存(`@supabase/ssr`)の削除など

- **二重承諾のレース条件**（`app/staff/requests/page.tsx`）→ `shift_requests.status` を `open→fulfilled` の原子的な条件付き更新にし、後続処理が失敗した場合はロールバックするよう修正
- **テスト・CI皆無** → `.github/workflows/ci.yml` を追加し、push/PR時に `tsc --noEmit` と `next build` を自動実行するようにした（Supabase資格情報なしでもビルド可能なことを確認済み）

対応しなかった項目（今後の課題として記録）:
- エラー監視（Sentry等）未導入。外部サービスとの契約・DSN発行が必要なため今回は見送り
- Realtimeチャンネルが画面ごとに増える設計、提出期間取得ロジックの重複: 小規模運用では実害が小さいため優先度は低い
- ユニットテスト・E2Eテストの追加（CIは型チェック・ビルドのみ）

---

# 在庫管理アプリとのDB共有（2026-08-10）

飲食店の在庫管理アプリ（`~/.claude/在庫管理アプリ/inventory-app`、別リポジトリ・別Vercelプロジェクト）が、**このSupabaseプロジェクトを共有**するようになった。スタッフとPINの管理点を1つに保つための判断で、在庫アプリは `users` / `stores` と `verify_login` / `list_login_users` / RLSヘルパー4関数を**参照するだけ**（依存の向きは一方向、シフトアプリ側のオブジェクトは変更されない）。

## 押さえておくべき点

- **在庫アプリのオブジェクトは全て `inv_` プレフィックス**。所有者は inventory-app リポジトリで、`supabase/schema.sql` には含まれない（同ファイル冒頭に注記済み）
- **`SUPABASE_JWT_SECRET` は両アプリで同じ値**。同一Supabaseプロジェクトである以上これは必須で、その結果**在庫アプリが発行したJWTはシフトアプリのPostgRESTでもそのまま有効**になる。実害は限定的（同一人物・同一店舗スコープであり権限昇格にはならない）が、片方のアプリのXSSがもう片方の読み取りに波及しうる点は認識しておくこと。将来分離したくなった場合に備え、在庫アプリのJWTには `app: 'inventory'` クレームが最初から載っている。分離が必要になったら各ポリシーに `and auth.jwt() ->> 'app' = 'inventory'` を足せば済む
- **セッションCookieは分離済み**（`shift_session` / `inventory_session`、`SESSION_SECRET` も別値）。片方のログアウト・失効がもう片方に波及することはない

## このリポジトリ側で行った変更

`app/api/hq/stores/route.ts` の `DELETE`：店舗削除の前提チェックに `inv_items` / `inv_stock_transactions` の件数確認を追加した。従来は「スタッフ0人」しか見ておらず、スタッフを削除した後の空店舗に在庫データが残っていると**外部キー違反の生のPostgresエラーが画面に出る**状態だった。在庫履歴を店舗削除で暗黙に消すのは許容できないため cascade にはせず、「在庫データが残っている店舗は消せない」という制約にしている。在庫アプリのマイグレーション未適用の環境（テーブルが存在しない）では、チェックを飛ばして従来通り動く。

## 在庫アプリ側で意識的に設計してあること（こちらを壊さないための配慮）

- 在庫台帳の `created_by` / `voided_by` / `confirmed_by` は全て **`on delete set null`**。`DELETE /api/admin/users` はスタッフを**物理削除**するため、`restrict` のままだと在庫記録を残したスタッフを削除した瞬間に**シフトアプリのスタッフ削除機能が壊れる**。監査証跡は氏名のスナップショット列で保全している
- 在庫アプリのビューは **`users` を JOIN していない**。将来こちらが `users` の列単位grantを絞っても在庫アプリが道連れで壊れない
- 在庫アプリのマイグレーションは**既存テーブルへの `ALTER` を1行も含まない**（追加のみ）。`alter default privileges` にも `alter publication supabase_realtime` にも触れない
- RLSヘルパー4関数は**再定義せず存在確認だけ**している（`create or replace` で上書きするとシフトアプリのRLS全体の挙動が変わるため）
