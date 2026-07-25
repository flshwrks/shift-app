## 対象
- `lib/useBodyScrollLock.ts`
- `app/admin/schedule/page.tsx`

## 変更内容

### 1. useBodyScrollLock — iOS Safari 対応
- `overflow: hidden` のみだった実装を `position: fixed + top: -scrollY + width: 100%` 方式に変更
- アンマウント時にスクロール位置を `window.scrollTo(0, scrollY)` で復元

### 2. ShiftModal — onChange ガードの削除
- 時刻 input の onChange から `if (e.target.value)` 条件を除去
- 値が空になったときも state が更新されるよう修正

## 理由
特定端末（iOS Safari）で管理者シフトモーダルの `type="time"` 入力がタップ不能になるバグ。
iOS Safari は `body { overflow: hidden }` のみでは `position: fixed` 内フォームのタッチイベントをブロックする既知の挙動があり、`position: fixed` 固定方式に切り替えることで解消。
他の端末（Android Chrome・デスクトップ Chrome/Firefox）では発生しないため端末固有の問題として報告されていた。
