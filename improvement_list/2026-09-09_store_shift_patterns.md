# シフト種別を店舗ごとに設定できるようにした

## 対象

- `lib/shiftPatterns.ts`（新規）
- `components/ShiftPatternEditor.tsx`（新規）
- `lib/store.tsx`（パターンの読み込みと `useShiftPatterns()`）
- `app/s/[storeSlug]/admin/settings/page.tsx`（編集UIに差し替え）
- `app/s/[storeSlug]/admin/schedule/page.tsx` / `staff/shifts/page.tsx` / `staff/requests/page.tsx`
- `components/ShiftRequestModal.tsx` / `components/HelpModal.tsx` / `components/TableView.tsx`
- `tests/shiftPatterns.test.ts`（新規・21件）
- `lib/help/content.ts` → `docs/GUIDE.md` 再生成

## 変更内容

A〜G の**枠は固定したまま、中身（表示名・開始・終了・使うかどうか）を店舗ごとに持たせた**。
設定画面の「シフト種別」から編集する。保存先は `app_settings` の `shift_patterns` キーにJSON。

- 未設定の店舗は従来のA〜Gが既定値。**移行作業もマイグレーションも不要**
- 「使う」を外した枠は入力の選択肢から消える（＝パターン数の調整）
- 表示名を付けると凡例やボタンに「A 早番」のように出る

## 設計判断

**枠（A〜G）を固定した理由。**
`shifts.shift_type` には `check (shift_type in ('A'..'G','custom','off'))` があり、
これを動的にはできない。枠を可変にすると制約の変更が要り、既存データの移行も発生する。
枠を固定して中身だけ差し替える方式なら、**DBに一切触らずに済む**。

**過去のシフトが書き換わらないこと。**
シフト行は自分で `start_time` / `end_time` を持っているため、パターン定義を後から変えても
入力済みのシフトの時刻は動かない。変わるのは「次にその枠を選んだときに入る既定値」と
「一覧の凡例表示」だけ。これは仕様として画面にも明記した。

**無効にした枠も `findPattern` では引けるようにした。**
過去のシフトがその枠を使っている場合、表示のために定義が必要になるため。
選択肢の絞り込みは `enabledPatterns()` 側だけで行う。

**壊れた設定値でも既定値で動き続ける。**
`parsePatterns()` はJSONが壊れていても、枠が欠けていても、時刻が不正でも、
その部分だけ既定値で補う。設定が読めないだけでシフト入力が止まると現場が困るため。
`StoreProvider` 側でも、パターンの取得に失敗したら既定値で店舗解決を続行する。

**上限は7枠のまま。**
増やすには `shifts` のCHECK制約と `SHIFT_COLORS` の追加が要る。
現時点で必要という話が出ていないため、YAGNIで見送った。必要になった時点で対応する。

## 理由

店舗ごとに営業時間もシフトの区切り方も違うのに、A〜Gが全店共通の固定値だった。
2店舗目以降に広げる前提だと、ここが合わないと使ってもらえない。

## 副次的に直したもの

- 設定画面に**パターン定義のハードコード複製**があった（`lib/types.ts` と別に時間帯の表が
  直接書かれていた）。編集UIに置き換えたことで、定義が1箇所に集約された
- `components/HelpModal.tsx` の `trimLeadingZero` が未使用になったため削除
  （`patternTimeRange()` が同じ処理を持つ）
- `components/TableView.tsx` の未使用インポート `SHIFT_PRESETS` を削除

## 確認したこと

- テスト91件すべて成功（`shiftPatterns` 21件を追加）
- `npm run check:guide` OK / `tsc --noEmit` OK / `next build` 成功
- 開発サーバーで公開シフト表を表示し、`StoreProvider` に追加したクエリで
  画面が壊れないこと、既存シフトが自分の時刻で表示されることを確認

## 残作業

- **編集UIそのものは未検証**（管理者ログインに暗証番号が要るため、画面での確認ができていない）。
  次にログインできるときに、保存・既定に戻す・無効化の3つを実際に触って確認すること
- 枠の追加（H以降）が必要になった場合は、CHECK制約と `SHIFT_COLORS` の拡張が要る
