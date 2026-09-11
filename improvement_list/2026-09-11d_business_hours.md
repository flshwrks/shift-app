# シフトの受付時間帯を店舗ごとに設定できるようにした（FN-9）

総点検の指摘 FN-9。「拡大の前に決めるべき」として着手を指示された2件のうちの1つ。

## 対象

- `lib/businessHours.ts`（新規・純粋ロジック）
- `tests/businessHours.test.ts`（新規・14件）
- `supabase/migrations/2026-09-11b_store_public_settings.sql`（新規RPC）
- `lib/store.tsx` — 新RPCへ切替、`businessHours` を配る
- `lib/shifts.ts` — `generateTimeSlots(startHour = 8, endHour = 22)`
- `components/TimelineView.tsx` — 固定値を props 化
- `app/s/[storeSlug]/{staff,admin,public}/schedule/page.tsx` — 時間帯を渡す
- `app/s/[storeSlug]/admin/shift-types/page.tsx` — 設定UI

## 何が問題だったか

シフトに入力できる時間帯が **8:00〜22:00 でコードに固定**されていた
（`lib/shifts.ts` の `generateTimeSlots`、`TimelineView` の `START_HOUR`/`END_HOUR`、
30分スロット数の `28`）。朝が早い店・夜が遅い店は実態と違う時刻に丸めるしかない。

## 設計判断

**深夜営業は扱わない**（利用者の判断、2026-09-11）。終了は最大 24:00。

将来必要になったら、`shifts.start_time`/`end_time` は**テキスト型**で
`timeToMinutes('26:00')` が正しく 1560 を返すため、**保存形式を変えずに**
26時表記へ広げられる。`lib/businessHours.ts` の冒頭にも同じことを書いた。

**新しいRPCを作り、`get_shift_patterns` は拡張しなかった。**
あちらは text を1つ返す形で、戻り値の意味を変えるとデプロイの前後で画面が壊れる。
新RPCは**キーを明示的な許可リスト**にしてある（`app_settings` には提出期間・時給・
日付ごとのメモなど出してはいけない値も入るため、「全部返す」にしない）。

**既定は 8:00〜22:00。** 既存店舗は設定を触らなければ完全に無変更。

## 統括側で見つけて直した2点

サブエージェントの成果物を検証した際に見つけたもの。

**1. 選択肢の食い違い（修正済み）**
時間帯を狭めると、既存のシフト種別の時刻（例: 07:00）が `TIME_SLOTS` から消える。
`<select>` は値に一致する option が無いと**先頭を表示する**ため、
「画面は 08:00 と出ているのに中身は 07:00」という食い違いが起きていた。
**いま使われている時刻は範囲外でも選択肢に残す**ようにした。

**2. `Number('')` は NaN ではなく 0（テストが検出）**
`countOutOfRange` の初版は `split(':').map(Number)` して `Number.isFinite` で
弾く書き方だった。空文字が **0:00 として通り**、壊れた時刻が「はみ出している」と
数えられていた。`HH:MM` の形を正規表現で確かめる実装に直した。

## 適用の順序（重要）

**マイグレーション → デプロイ。** 逆にすると新RPCが存在せず、
設定済みのシフト種別が一時的に既定値に戻って見える（壊れはしない）。

同日の `2026-09-11_hq_login_no_enumeration.sql` とは**順序が逆**なので注意。
安全な進め方は `docs/OPERATIONS.md` §11-2。

## 検証

- `npm test` 143件（+14）／`npx tsc --noEmit`／`npm run check:guide`／`next build`
- `TimelineView` から `8` / `22` / `28` の固定値が消えたことを grep で確認
- `public/schedule` が `StoreProvider` の内側にあることを確認（レイアウトで包まれている）。
  新RPCは匿名でも呼べるのでログイン不要のまま動く
- 旧RPC `get_shift_patterns` の呼び出しが0件になったことを確認（関数自体は残してある）

## 残作業

- 本番での動作確認（時間帯を変えて、シフト表の縦軸と種別の選択肢が追従すること）
- 旧RPC `get_shift_patterns` は当面残す。移行が確実になってから消す
