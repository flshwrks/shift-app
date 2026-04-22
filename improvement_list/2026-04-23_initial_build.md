# 初回ビルド: シフト管理Webアプリ

## 対象
- `app/` 以下全ページ
- `components/NavBar.tsx`, `TableView.tsx`, `TimelineView.tsx`
- `lib/types.ts`, `lib/supabase.ts`, `lib/auth.tsx`, `lib/shifts.ts`
- `supabase/schema.sql`

## 変更内容
Next.js 16 + Supabase + Tailwind CSS 4 でシフト管理アプリを新規構築。

### 実装機能
- ログイン: 名前選択 + 4桁PINコード（SHA-256ハッシュ, Web Crypto API）
- シフト申請: 月別リスト形式、種別A〜F＋カスタム（30分刻み 8:00〜22:00）、コメント付き
- シフト確認（表形式）: スタッフ×日付のグリッド表示
- シフト確認（タイムライン形式）: 時刻軸×日付、スタッフブロック表示、人数カラー表示（緑/黄/赤）
- 管理者: シフト確定（draft→confirmed）、一括確定
- スタッフ管理: 追加（名前・PIN・権限）、削除
- 締切設定: datetime-local で設定、期限後は申請不可
- リアルタイム更新: Supabase Realtime Subscriptions

## 理由
要件定義に基づく初期実装。

## 残作業
- Supabaseプロジェクト作成 → `.env.local` に接続情報を記入
- `supabase/schema.sql` をSupabaseのSQL Editorで実行
- 最初の管理者アカウントをSupabase管理画面またはアプリのスタッフ追加画面から作成
