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

**⚠️ 追加で適用が必要な作業**: `supabase/migrations/2026-07-25c_lock_users_writes.sql` を、新しいAPIルートのデプロイ後に（=このコードが本番で動作することを確認してから）Supabase SQL Editorで実行してください。この最後の一手が完了して初めて、usersテーブルへの直接書込みが完全に閉じます。

**残存リスク（今後の課題）**: 同様のパターンを `shifts`（確定操作）・`shift_requests`（取消・確定）・`app_settings`（提出期間・組織名）にも拡大することが望ましい（現状はこれらも行レベルで全開放だが、`users` ほど致命的ではないため優先度を下げている）。

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
