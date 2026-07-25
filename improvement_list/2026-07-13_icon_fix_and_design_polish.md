# アイコン修正・プロ品質デザイン刷新（第2弾）

## 対象

- `components/icons.tsx`（全パス差し替え＋Chevron/Download追加）
- `components/NavBar.tsx` / `components/BrandMark.tsx` / `app/login/page.tsx`
- `app/staff/shifts/page.tsx` / `app/staff/schedule/page.tsx` / `app/staff/requests/page.tsx`
- `app/admin/schedule/page.tsx` / `app/admin/requests/page.tsx` / `app/admin/staff/page.tsx` / `app/admin/settings/page.tsx`
- `components/TableView.tsx` / `components/TimelineView.tsx` / 各モーダル（ShiftDetail / ShiftRequest / Help / HelpSection / LoginNotification / Survey）

## 変更内容

### 不具合修正
- 歯車アイコンの乱れ: IconSettings のSVGパスデータが破損していたため、全アイコンを Lucide 本家のパスデータに差し替え（icons.tsx に「手書きせず Lucide からコピー」の方針コメントを明記）
- ヘルプ「?」の欠け: 疑問符の点が半径0.15pxのほぼ不可視な円だったのを Lucide 準拠の描画に修正

### デザイン統一仕様（「業務ツールとしての静かな上質さ」）
- 角丸3段階スケール: ボタン・入力欄 rounded-lg / カード rounded-xl / モーダル rounded-2xl
- 青の使用を主ボタン・アクティブ状態に限定。二次ボタンは白地＋slate-300境界。青グロー影（shadow-blue-200）廃止→shadow-sm
- デスクトップナビのアクティブを青ベタ塗りピル→下線インジケーターに。ヘッダーのアプリ名も青→ink
- ステータスバッジ統一: 申請中=amber-50/700、確定=emerald-50/700、未提出=blue-50/700 の境界付き小バッジ
- ◀▶テキスト矢印→IconChevronLeft/Right、画像保存等のベタ塗りボタン→二次ボタン様式＋IconDownload
- 数値・時刻に tabular-nums、極小ラベルの uppercase 廃止、週末色を rose/sky に微調整
- 残存絵文字（HelpModal/LoginNotificationModal/SurveyModal の 📝📅💡⚠️✅🎉等）を全てSVG化
- HelpModal/HelpSection に重複していた SectionIcon を HelpSection に一本化し icons.tsx を参照する形に統合

## 理由

- ユーザー指摘: 歯車の描画乱れ・?の欠け、および「絵文字排除だけでは足りない、プロが作るような洗練されたデザインに」
- 過剰な丸み・青の多用・グロー影・ピル型ボタンが「AIっぽさ」の残存要因と診断し、統一デザイン仕様を策定して全画面適用

## 検証

- `npm run build` 成功、`npx tsc --noEmit` エラーゼロ

## 残作業

- 本番デプロイ（ユーザー承認待ち）
