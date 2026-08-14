# 要望の送信機能の追加と、ヘルプの単一ソース化（Ver.2.5.0）

「システムとデザインはOKなので、使い方・要望の送信まわりの裏側を整えたい」という要望から着手した。
調査したところ、周辺（ヘルプ・要望導線）に3つの構造的な問題があった。

## 背景 ─ 何が問題だったか

### 1. ヘルプが二重管理で、すでにズレていた

アプリ内ヘルプ（`components/HelpModal.tsx`）と使い方ガイド（`docs/GUIDE.md`）が
それぞれ別実装のハードコードで、実際に食い違っていた。

- 管理者ヘルプの「『組織名』を入力して保存」が、マルチ店舗化（Ver.2.3.0）後の実際の挙動と不一致。
  店舗名は設定画面では読み取り専用で、変更は本部管理者が `/admin/stores` から行う
- アンケート機能（`/admin/survey`）のヘルプが丸ごと無かった
- 人件費予測が「設定」の手順4に埋もれていた（独立画面なのに）
- `NavBar` が `role === 'staff' ? 'staff' : 'admin'` で分岐しており、
  本部管理者が店舗管理者向けヘルプを読まされていた
- 公開シフト表（`/public/schedule`）の説明が無かった
- `docs/GUIDE.md` の見出しが「Ver.2.3.0」のまま（`package.json` は 2.4.0）

根本原因は `CLAUDE.md` のルールが「GUIDE.md を更新する」としか書いておらず、
HelpModal の更新義務が仕組みに乗っていなかったこと。放置すればズレ続ける構造だった。

また `components/HelpSection.tsx` の `HelpSection` コンポーネントは
どこからも import されていない死んだコードだった（2026-05-15 のヘルプページの残骸）。

### 2. 要望を上げる導線が1つも無かった

スタッフ→管理者 も 利用者→開発者 も存在しなかった。
既存のアンケート（管理者→スタッフ・選択式・同時1件）と調整依頼（管理者→スタッフ・日付特定）は
どちらも「下から自由に上げる」用途には転用できない。

### 3. アプリにバージョンが表示されていなかった

CHANGELOG は整備されているのに画面のどこにも出ておらず、
更新されたことが利用者に伝わらず、不具合報告時に版を特定できなかった。

## 対象

### ヘルプの単一ソース化
- `lib/help/content.ts`（新規） — アプリ内ヘルプと GUIDE.md 共通の唯一の正データ
- `scripts/generate-guide.ts`（新規） — `content.ts` から GUIDE.md を生成。`--check` で差分検出
- `components/HelpModal.tsx` — ハードコードを廃し `HELP_CONTENT` から描画。role を3値に拡張
- `components/HelpSection.tsx` — 削除（型と `SectionIcon` は移設）
- `components/icons.tsx` — `SectionIcon` / `SECTION_ICONS` を移設
- `components/NavBar.tsx` — `isHqRole()` で hq_admin / admin / staff の3分岐に
- `docs/GUIDE.md` — 3〜5章を生成範囲（BEGIN/END マーカー）に。1・2・6章は手書きのまま
- `.github/workflows/ci.yml` — `npm run check:guide` を追加
- `CLAUDE.md` — 更新ルールを `content.ts` 起点に書き換え
- `package.json` — `gen:guide` / `check:guide`、devDependency に `tsx`

### 要望の送信
- `supabase/migrations/2026-08-14_feedback.sql`（新規・**要手動適用**）
- `supabase/schema.sql` — 同内容をベースラインにも反映
- `lib/types.ts` — `Feedback` / `FeedbackDestination` / `FeedbackCategory` / `FeedbackStatus`
- `app/api/feedback/route.ts`（新規） — POST（送信＋GitHub Issue化）/ PATCH（ステータス更新）
- `components/FeedbackModal.tsx`（新規） — 宛先・種別トグル、2000字
- `app/s/[storeSlug]/admin/feedback/page.tsx`（新規） — 管理者の受信箱
- `components/NavBar.tsx` — 「要望」ナビ項目と未読バッジ（Realtime購読）
- `components/icons.tsx` — `IconMessageSquare`（Lucide `message-square`）
- `.env.local.example` — `GITHUB_TOKEN` / `GITHUB_FEEDBACK_REPO`

### バージョン表示・更新のお知らせ
- `next.config.ts` — `package.json` の version と `CHANGELOG.md` の最新エントリをビルド時に読み込み
- `components/AppFooter.tsx`（新規） — バージョン表示＋「要望を送る」
- `components/UpdateNoticeModal.tsx`（新規） — 新バージョン初回のみ表示
- 3つのレイアウト（staff / store admin / hq）にフッターと更新のお知らせを設置

## 主要な設計判断とその理由

### 構造化データを正にし、Markdown を生成物にした（逆ではない）
アプリ内ヘルプは `steps` / `tips` / `color` / `icon` という構造を必要とする。
Markdown をパースして UI に流す方向は見出し構造への依存で壊れやすいので、
構造化データを正として Markdown を生成する向きにした。
GUIDE.md には共通ルール（シフト種別表・休憩控除・提出期間ロジック）など
ヘルプに無い手書き記述もあるため、BEGIN/END マーカーで生成範囲を限定している。

### 要望は1テーブルで2宛先をまかない、開発者宛ても先にDBへ保存する
`destination` 列で分岐する。開発者宛ても保存してから Issue 化することで、
レート制限がかけられ、`GITHUB_TOKEN` 未設定でも GitHub API 障害でも取りこぼさず、
送信履歴も残る。実装量はほぼ増えない。

### store_id は nullable ＋ CHECK 制約
本部管理者は所属店舗を持たないため `not null` にできない。
一方「店長へ」宛ては届け先が無いと成立しないので
`check (destination = 'dev' or store_id is not null)` で構造的に縛った。
UI でも本部管理者には「店長へ」を出さず、API でも 400 で弾く（DB制約は最後の砦）。

### スタッフが他人の要望を読めないRLS
要望には個人的な内容が含まれうる。可視性は「本人」「本部管理者」
「自店の `destination='store'` を見る店舗管理者」の3条件のみで、
一般スタッフ（`jwt_app_role() = 'staff'`）が他人の行に一致する条件を持たせていない。

### 書き込みは API（service role）に集約
`users` テーブルと同じハードニング方針。`authenticated` には SELECT のみ付与。
service role は RLS を迂回するため、PATCH ではサーバー側で
`store_id` と `destination` を条件に加えて他店の要望を触れないようにしている。

### GitHub Issue に個人・店舗情報を送らない
Issue は外部サービスに出る。送るのは本文・種別・バージョン・ロール・User-Agent・送信日時のみで、
店舗名・slug・store_id・氏名・user_id は含めない。

### 更新のお知らせは CHANGELOG.md をビルド時に直接読む
別ファイルに転記するとまたズレる。原本から読めばズレようがない。
初回ログインのユーザーには表示せず、既読バージョンを保存するだけにしている
（更新を知らせたいのであって、初見の人に沿革を見せたいわけではない）。

### 更新のお知らせは他のポップアップに常に場所を譲る
調整依頼・アンケートのポップアップはその日の仕事に直結するが、
更新のお知らせは読み飛ばしても支障が無いため優先度を下げた。
それらは表示可否を非同期のSupabase問い合わせ後に決めるため事前に知る方法がなく、
全画面ポップアップが例外なく `fixed inset-0` を持つことを利用して
MutationObserver で出現を検知している。表示後も監視を続け、
遅れて他のポップアップが現れた場合は引っ込める（既読フラグは保存しないため次回再判定される）。

## 在庫管理アプリ（DB共有）への影響

**なし。** 新規テーブル `feedback` と新規トリガー関数 `set_feedback_store_id()` の追加のみで、
`users` / `stores` / `verify_login` / `jwt_*()` / `is_hq_admin()` は一切変更していない。
`grant ... on all tables in schema public` と `alter default privileges` は使わず、
テーブル個別の grant/revoke のみで完結させている。
そのため `npm run check:contract` の実行は不要。

## 残作業（運用者が実施すること）

1. `supabase/migrations/2026-08-14_feedback.sql` を Supabase SQL Editor で適用する
   （適用順序の制約なし・後方互換。未適用のうちは要望の送信が失敗する）
2. GitHub の fine-grained personal access token を発行し（対象 `flshwrks/shift-app`、
   権限は Issues: Read and write のみ）、`GITHUB_TOKEN` を `.env.local` と Vercel に設定する
   （未設定でも要望の送信自体は動作し、Issue 化だけスキップされる）
3. 任意: GitHub 側に `feedback` ラベルを作成しておく

## 見送った項目

- 要望への返信機能（店長→スタッフ）。今回は「届く・整理できる」までで十分と判断した
- 新規セクション用アイコン（`💬` 以外の 📊 💰 🏢）の SVG 化。
  `icons.tsx` に「パスデータは Lucide 準拠。手書きせずここからコピー」とあり、
  発明を避けて絵文字フォールバックのままにした

---

## 追記（2026-08-15）: 更新のお知らせをトースト化し、更新履歴ページを追加

リリース前のレビューで2点の変更要望が出たため対応した。

### 更新のお知らせを全画面モーダルからトーストへ

**理由**: 変更内容は読み飛ばしても業務に支障が無いのに、モーダルはタップを強制する。
リリースのたびに全員の作業を1手止めることになる。

- `components/UpdateNoticeModal.tsx` を削除し、`components/UpdateToast.tsx` に置き換え
- 画面下部に約6秒表示して自動で消える。オーバーレイもスクロールロックも持たない
- 既読の保存タイミングを「閉じたとき」から「表示したとき」に変更
  （自動で消えるので「閉じた」タイミングが無い。見逃しても更新履歴で読める）
- **副次的な効果**: モーダル同士の衝突を避けるための `MutationObserver` による
  `.fixed.inset-0` 監視・猶予時間・自己検出用の目印属性を丸ごと削除できた。
  トーストは画面を占有しないため、調整依頼・アンケートのポップアップと共存できる。
  もともと「他モーダルのDOMを外から観測する」という脆い作りだったので、
  要望への対応がそのまま設計の単純化になった

### 更新履歴ページ（`/release-notes`）

- `next.config.ts` が CHANGELOG.md から**全エントリ**を構造化して
  `NEXT_PUBLIC_RELEASE_HISTORY`（JSON）として渡すよう拡張（従来は最新1件のみ）
- `components/ReleaseNotes.tsx` に簡易Markdownレンダラーとパーサーを共通化し、
  トーストと更新履歴ページの両方から使う
- `app/release-notes/page.tsx` は**ログイン不要**。`proxy.ts` の matcher が
  `['/s/:path*', '/admin/:path*', '/login', '/staff/:path*']` なのでルート直下は対象外。
  数秒で消えるトーストを見逃した人が、PINを入れ直さずに読めることを優先した。
  内容はアプリの変更履歴のみで店舗・スタッフの情報を含まないため公開して問題ない
- `components/AppFooter.tsx` のバージョン表示の隣に「更新履歴」リンクを追加

### 補足

`proxy.ts` は変更していない（matcher の対象外パスを選んだため）。
DBスキーマ・API・要望機能には一切影響しない。
