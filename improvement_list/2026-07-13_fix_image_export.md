# 画像保存の不具合修正（縦書き化・今日マーカー混入）

## 対象

- `components/TableView.tsx`
- `lib/useTableExport.ts`
- `app/staff/schedule/page.tsx` / `app/admin/schedule/page.tsx`

## 変更内容

- 「確定」「申請中」「確定する」バッジと シフトバッジに `whitespace-nowrap` を追加（html-to-image が幅を誤計算して1文字ずつ縦に折り返す問題の修正）
- TableView に `exportMode` prop を新設。画像出力時は以下を非表示/無効化:
  - 今日の列ハイライト（閲覧者の文脈情報のため共有画像には不要)
  - 自分の行ハイライト（同上）
  - 「確定する」操作ボタン
  - 空メモ欄の「メモ」プレースホルダ
- useTableExport: `setExporting(true)` 後に 50ms 待機し、exportMode の再レンダーが DOM に反映されてから撮影するように変更
- 両 schedule ページから `exportMode={exporting}` を渡すよう修正

## 理由

ユーザー報告: 画像保存で「確定」の文字が縦になる、今日マーカーが画像に残る。ハイライトや操作ボタンは画面上の一時的な文脈・操作要素であり、共有用のシフト表画像には含めるべきでないため、撮影時のみ除外する設計にした。

## 検証

- `npm run build` 成功
