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

## ⚠️ 適用が必要な作業（あなたご自身での対応が必須）

このセッションには本番Supabaseの管理者権限（service_role キーやCLI連携）がないため、以下はコードの用意はできてもDBへの適用ができません。

1. **Supabaseダッシュボード → SQL Editor** で `supabase/migrations/2026-07-25_security_hardening.sql` の内容を実行してください。
2. **適用順序が重要**: このSQLを実行してから、対応するアプリケーションコードをデプロイしてください。逆順（コード先・SQL後）だとログイン自体が機能しなくなります。今回はこのコード変更をローカルにコミットのみ行い、**pushはまだしていません**。SQL適用後に教えてください。
3. SQL適用後、ログイン画面（通常ログイン・開発者ログイン両方）が正常に動作するか、テストアカウントで確認してください。

## 残存リスク（Tier 2・未対応。今後の推奨事項）

`users` テーブルへの **INSERT/UPDATE/DELETE は今回も anon に開放されたまま**です。スタッフ管理画面（追加・編集・削除・権限変更・PINリセット）がこの権限に依存しており、これを塞ぐには「誰が管理者としてリクエストしているか」をサーバー側で検証する仕組み（Supabase Authや署名付きセッションCookieなど）が必要ですが、今回のセッションにはSupabaseの認証基盤を導入する時間的余裕・DB権限がありませんでした。

現状でも起こりうる攻撃（要: `public_users` 相当の一覧から取得できるUUID）:
- 既存ユーザーの `role` を直接 `admin` に書き換える
- bcryptハッシュを自分で用意した新規ユーザー行を `role='admin'` で直接INSERTする

**推奨する次のステップ（Tier 2）**:
1. `SUPABASE_SERVICE_ROLE_KEY` を取得し、Vercelのサーバー専用環境変数として設定
2. ログインAPI（`/api/login` 等）でPIN検証成功時にhttpOnly署名付きセッションCookieを発行
3. `users` テーブルへの書込み（追加・編集・削除・PINリセット・権限変更）を `/api/admin/users` のようなNext.js Route Handlerに移し、Cookieのroleを検証した上でservice roleクライアントを使う
4. その後 `revoke insert, update, delete on public.users from anon, authenticated;` を適用し、書込みをAPI経由のみに限定する
5. 同様のパターンを `shifts`（確定操作）・`shift_requests`（取消・確定）・`app_settings`（提出期間・組織名）にも順次拡大することが望ましい（現状はこれらも行レベルで全開放だが、`users` ほど致命的ではないため今回は優先度を下げた）

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
