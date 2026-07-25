# 網羅的なセキュリティ・機能・UX・保守性監査と対応

## 対象

- `supabase/schema.sql`, `supabase/migrations/2026-07-25_security_hardening.sql`（新規）
- `app/login/page.tsx`, `app/api/dev-login/route.ts`（新規）
- `app/admin/staff/page.tsx`, `app/admin/requests/page.tsx`
- `app/staff/shifts/page.tsx`, `app/staff/requests/page.tsx`
- `lib/types.ts`, `lib/shifts.ts`
- `docs/SECURITY.md`（新規）, `docs/SPEC.md`

## 変更内容

詳細は `docs/SECURITY.md` を参照。要点:

1. **RLS全開放・平文PIN・開発者バックドアの修正**（Tier 1）
   - 全テーブルのRLSが `using(true) with check(true)` で完全開放されており、`users.pin`（平文）を含む全情報が anon キーだけで読み取り可能だった
   - bcrypt再ハッシュ化・平文PIN列削除・列単位権限によるpin_hash隠蔽・PIN検証/設定のRPC化（`verify_login`/`admin_set_pin`）・ログイン失敗ロックアウト・開発者ログインのサーバー移行（`DEV_LOGIN_PASSWORD`環境変数）を実施
   - **DB側の変更はSupabase側でのSQL手動適用が必要**（このセッションにはservice role権限がないため）。適用前提でコードは変更済みだが、**まだpushしていない**
2. **確定済みシフトが編集可能だったバグの修正**: `app/staff/shifts/page.tsx` で確定後も編集・コピー可能だった。確定後は変更不可にし、必要な場合は既存の「調整依頼」機能を使う設計に統一
3. **依頼取消時のデータ不整合修正**: `app/admin/requests/page.tsx` の取消処理が承諾済みシフトを放置していた。取消と同時に下書きシフトを削除し、確定済みの場合は取消をブロック
4. **二重承諾のレース条件修正**: `app/staff/requests/page.tsx` で複数人が同時に同じ依頼を承諾できた。`shift_requests.status` を `open→fulfilled` の原子的な条件付き更新にし、後続処理失敗時はロールバックするよう変更
5. **その他（サブエージェントに委譲・並行実施）**: Supabaseクエリのエラーハンドリング欠落（確定処理・シフト提出・依頼応答）、時刻入力の開始/終了逆転バリデーション欠如、破壊的操作（前月コピー上書き・アンケート削除）の確認モーダル追加、未使用依存 `@supabase/ssr` の削除

## 理由

ユーザーからの `/goal` 指示「システムの脆弱性や機能上の弱点を網羅的に点検し、より使いやすく持続可能なアプリにして」を受け、3つの並列監査エージェント（機能バグ、UX、保守性）と自身での重点調査（認証・DB権限）を実施。最も重大だったのは認証まわり（DB権限モデルが実質的に存在しなかった）で、他は業務ロジックの整合性・エラーハンドリング・UX一貫性の問題だった。

## 残作業

- **最優先**: `supabase/migrations/2026-07-25_security_hardening.sql` をSupabaseダッシュボードのSQL Editorで実行し、完了後にログイン動作を確認してから、このセッションの変更をpush・デプロイすること
- Tier 2（`users`テーブル書込みのサービスロールAPI移行）: `docs/SECURITY.md` に実装計画を記載。次のセッションでの対応を推奨
- テスト・CI整備、エラー監視（Sentry等）導入は未着手（`docs/SECURITY.md` 参照）

## 検証

- `npx tsc --noEmit` エラーなし
- `npx next build` 成功（`/api/dev-login` を含む全ルート生成）
