## 対象
- `components/HelpSection.tsx`（新規）
- `app/admin/help/page.tsx`（新規）
- `app/staff/help/page.tsx`（新規）
- `components/NavBar.tsx`（修正）

## 変更内容
- 管理者・スタッフそれぞれの使い方ガイドページを追加（`/admin/help`, `/staff/help`）
- NavBar にロール別「使い方」リンクを追加（モバイルボトムナビ・デスクトップ横ナビ両対応）
- アコーディオン形式のカードUI：セクションごとに折りたたみ可能
- 共有コンポーネント `HelpSection` を抽出（型定義・colorMap・Section コンポーネントを一元管理）
- `colorMap` の `step` キーは `bg` と常に同値だったため削除し `bg` に統一
- `color` フィールドを `string` から `'blue' | 'green' | 'purple' | 'slate'` の union 型に変更
- シフト種別早見表データを module-level 定数に移動（レンダリングごとの再生成を回避）

## 理由
- ユーザーが操作手順を参照できる使い方画面が未実装だったため追加
- 管理者・スタッフで対象機能が異なるため画面を分離
