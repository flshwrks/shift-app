# 2026-05-21 休みシフト種別の追加

## 対象
- `lib/types.ts`
- `app/admin/schedule/page.tsx`（ShiftModal）
- `app/staff/shifts/page.tsx`
- `components/TableView.tsx`
- `components/TimelineView.tsx`

## 変更内容

### 1. ShiftType に 'off' を追加（lib/types.ts）
- `ShiftType` ユニオン型に `'off'` を追加
- `SHIFT_COLORS` に `off: '#94A3B8'` (slate-400) を追加
- `SHIFT_PRESETS` の型を `Exclude<ShiftType, 'custom' | 'off'>` に修正

### 2. 管理者シフトモーダルに「休み」ボタン追加（admin/schedule/page.tsx）
- カスタムボタンの隣に「休み」ボタンを配置（grid row 3 の右半分）
- 「休み」選択時は時刻入力を非表示
- 「休み」選択時は時刻バリデーションをスキップ
- 保存時: 'off' の場合 start_time/end_time を '00:00' で保存
- `selectPreset` / `Object.keys(SHIFT_PRESETS)` の型を `Exclude<..., 'custom' | 'off'>` に修正

### 3. スタッフシフトページの型修正（staff/shifts/page.tsx）
- `selectType` 関数で 'off' も SHIFT_PRESETS アクセスから除外

### 4. TableView で「休み」を正しく表示（TableView.tsx）
- `getShiftLabel`: shift_type === 'off' のとき '休み' を返す（時刻非表示）
- `calcTotalMinutes`: 'off' シフトは 0 分として集計

### 5. TimelineView で「休み」をタイムラインから除外（TimelineView.tsx）
- `getSlotCounts` と `dayShifts.map()` で 'off' シフトをフィルタ（時間軸に描画しない）

## 理由
管理者が「休み」を明示的に記録・管理できるようにするため。
