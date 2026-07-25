# 月表示画面の年月をタブ切替後も維持

## 対象

- `lib/usePersistedMonth.ts`（新規）
- `app/staff/shifts/page.tsx`
- `app/staff/schedule/page.tsx`
- `app/admin/schedule/page.tsx`
- `app/admin/requests/page.tsx`

## 変更内容

- 年月state（`year`/`month`）を管理する共通フック `usePersistedMonth(storageKey)` を新設。`sessionStorage` に読み書きし、年月をまとめて更新する `setYearMonth`、前月/翌月/今月へ移動のヘルパー（`prevMonth`/`nextMonth`/`goToCurrentMonth`）と `isCurrentMonth`、初回に復元済みかを示す `wasRestored` を返す
- 上記4ページの年月stateとprevMonth/nextMonthの重複実装を、このフックに置き換え。ページごとに別々の `storageKey`（`month_staff_shifts` 等）を使い、互いの状態は独立
- `staff/shifts`（シフト申請画面）には「初回マウント時に提出期間がアクティブな月へ自動ジャンプ」する既存ロジックがあったため、`wasRestored` が true（＝このセッションで既に月を選んでいた）の場合はジャンプをスキップし、復元した月を優先するよう調整

## /simplify での指摘・修正

4観点（reuse/simplification/efficiency/altitude）の並列レビューで、simplificationとefficiencyの2エージェントが独立に同一の実バグを検出:
- 当初 `usePersistedMonth` は `setYear`/`setMonth` を個別に公開しており、`staff/shifts` の自動ジャンプ処理で `setYear(c.year); setMonth(c.month);` と連続呼び出していた。各セッターがレンダー時点の古い方の値を閉じ込めるクロージャだったため、2回目の呼び出しが古い `year` で上書きしてしまい、年をまたぐ月（例: 12月→翌年1月）へのジャンプで年の更新が消える不具合があった
- 修正: 個別セッターを廃止し、年月を1回の状態更新でまとめて設定する `setYearMonth(y, m)` に統合
- reuse観点で指摘された `admin/schedule` の `firstDateOfMonth` 手書き実装や `admin/requests` の月初/月末手書き実装（`monthStart`/`monthEnd` で代替可能）は、今回の差分より前から存在するコードのため対象外としてスキップ

## 理由

ユーザー報告: シフト申請／確認画面から別画面（依頼一覧など）に遷移して戻ると、選んでいた月が毎回リセットされて不便。Next.jsのルート遷移でページコンポーネントがアンマウントされ `useState` が失われるのが原因。`sessionStorage` に永続化し、タブを閉じるまでは選択月を保持するようにした（ブラウザを閉じた後まで残すと日をまたいで古い月に混乱する懸念があるため、永続対象は同一セッション内に限定）。

## 検証

- `npx tsc --noEmit` エラーなし
- `npx next build` 成功（14ルートすべて生成）
