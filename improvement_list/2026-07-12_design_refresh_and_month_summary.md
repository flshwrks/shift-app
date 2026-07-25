# デザイン刷新・月間サマリー追加（総点検カスタマイズ）

## 対象

- `app/globals.css`
- `components/icons.tsx`（新規）
- `components/BrandMark.tsx`（新規）
- `components/AuthLoadingScreen.tsx`（新規）
- `components/NavBar.tsx`
- `app/login/page.tsx`
- `app/staff/layout.tsx` / `app/admin/layout.tsx`
- `app/staff/shifts/page.tsx`

## 変更内容

### デザイン刷新
- Tailwind 4 の `@theme` で blue スケールを深みのあるコバルト（`--color-blue-600: #2452CC` 等）に再定義。既存の `bg-blue-600` 等のクラスを一括で新色に切り替え（データ色 `SHIFT_COLORS` は不変）
- 背景 `#F6F7F9` / 前景 `#16181D` に調整、`font-feature-settings: "palt"`、アンチエイリアス、`:focus-visible` リング、`::selection`、`prefers-reduced-motion` 対応を追加
- ナビの絵文字アイコン（📝📅📨👥⚙️）を Lucide 風の線画 SVG（`components/icons.tsx`）に置換
- ブランドマーク（青角丸＋カレンダーアイコン）を `BrandMark`（size: sm/md/lg）として共通化し、ヘッダー・ログイン・ローディング画面で使用
- ヘッダーを半透明＋backdrop-blur に、ログイン画面のカード・テンキーを洗練
- ボトムナビ・main に iOS セーフエリア対応（`env(safe-area-inset-bottom)`）

### 機能追加
- シフト申請画面に月間サマリーカード（出勤日数・休み・予定時間＝休憩控除後）を追加。未提出の下書きも含む現在の入力内容ベースで派生集計（SPEC の未実装候補「月次時間数サマリー」を実装）

### 品質・アクセシビリティ
- 月送り ◀▶・ヘルプボタンに aria-label 追加、時刻表示に `tabular-nums` 適用
- NavBar の staff 用未回答依頼カウントの2クエリを `Promise.all` で並列化
- レビュー指摘の適用: インラインSVG→共有アイコン化、バッジ判定ロジックの共通化、ログインのPIN入力処理の重複解消、未使用コード（IconLogout・.tnum ルール）削除

## 理由

- 絵文字アイコン・汎用 Tailwind ブルーによる「AIが作った感」を排し、プロダクト品質の見た目にするため
- スタッフが提出前に自分の月間予定時間を確認できるようにするため（SPEC 優先度:中の候補）

## 検証

- `npm run build` 成功（全12ルート生成、型チェック通過）

## 残作業

- 希望休フラグ（DB スキーマ変更が必要なため見送り）
- レビュー指摘のうち見送り: staff/shifts 初回マウント時の期間クエリ重複解消（既存ロジックの変更を伴うため）、staff/admin レイアウトシェル全体の共通化（ローディング画面のみ共通化済み）
