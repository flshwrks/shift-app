# シフト表 画像エクスポート機能の追加

## 対象
- `components/TableView.tsx`
- `app/admin/schedule/page.tsx`

## 変更内容
- `TableView` を `forwardRef` でラップし、外部から DOM 参照を受け取れるようにした
- `html2canvas` をインストール（動的 import でバンドルサイズへの影響を最小化）
- 管理画面の「表形式」ビュー時にのみ「画像保存」ボタンを表示
- エクスポート時は sticky 列を一時的に `position: relative` に変えて全幅キャプチャし、完了後に元に戻す
- キャプチャしたキャンバスの下部に「YYYY/MM/DD 版」の日付ラベルを追記
- ファイル名: `シフト表_YYYY年M月_YYYYMMDD.png`

## 理由
メンバー増加時も全列が収まり、いつの版かがひと目でわかる静止画像として共有・印刷できるようにするため
