# シフト管理アプリ 仕様書

> 最終更新: 2026-08-08（マルチ店舗対応）

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 16.2 (App Router) |
| 言語 | TypeScript 5 |
| スタイリング | Tailwind CSS 4 |
| DB / BaaS | Supabase (PostgreSQL + Realtime) |
| 認証 | 独自httpOnly署名Cookie + 派生Supabase JWT（`jose`） |
| デプロイ | Vercel |

---

## マルチ店舗モデル

同一組織が複数店舗を運営する前提のモデル。独立テナントのSaaSではない。

| ロール | 所属 | 権限範囲 |
|---|---|---|
| `hq_admin`（本部管理者） | 店舗に紐づかない（`store_id` は null） | 全店舗を横断管理。店舗のCRUD |
| `admin`（店舗管理者） | 必ず1店舗 | 自店のみ |
| `staff`（スタッフ） | 必ず1店舗（掛け持ちなし） | 自店のみ |
| `developer` | DB非保存の合成ロール | `hq_admin` と同格に扱う |

店舗間のデータ遮断は**RLSでDBレベルに強制**されている（アプリ層のクエリ条件だけに依存しない）。詳細は `docs/SECURITY.md`。

---

## データモデル

### `stores` テーブル
| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | PK |
| slug | text | URL識別子（ユニーク、`^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`） |
| name | text | 店舗名（旧 `app_settings.org_name` を統合） |
| created_at | timestamptz | 登録日時 |

> SELECTは意図的に匿名開放。slug/nameはQRコード・URLに現れる公開情報と同水準であり、
> 未認証のログイン画面が店舗名を表示する必要があるため。書込みは `/api/hq/stores` 経由に限定。

### `users` テーブル
| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | PK |
| store_id | uuid | FK → stores.id（`hq_admin` は null） |
| name | text | 表示名（`(store_id, name)` でユニーク） |
| role | text | `hq_admin` / `admin` / `staff` |
| pin_hash | text | bcryptハッシュ（2026-07-25以降。平文pin列は廃止済み） |
| failed_pin_attempts | integer | ログイン失敗回数（5回でロック） |
| pin_locked_until | timestamptz | ロック解除時刻 |
| display_order | integer | スタッフ一覧の表示順 |
| created_at | timestamptz | 登録日時 |

> anon/authenticated ロールは `id, name, role, display_order, created_at, store_id` のみSELECT可能（列単位権限）。
> 行の可視性はRLSで自店（または本部なら全店）に限定される。
> pin_hash等の検証・更新は `verify_login` / `admin_set_pin` のSECURITY DEFINER RPC経由に限定。詳細は `docs/SECURITY.md`。

### `shifts` テーブル
| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | PK |
| store_id | uuid | FK → stores.id（**トリガーが `user_id` から自動導出・常に上書き**） |
| user_id | uuid | FK → users.id |
| date | date | 対象日 (YYYY-MM-DD) |
| shift_type | text | `A`/`B`/`C`/`D`/`E`/`F`/`custom` |
| start_time | text | 開始時刻 (HH:mm) |
| end_time | text | 終了時刻 (HH:mm) |
| comment | text | 備考（任意） |
| status | text | `draft`（申請中）/ `confirmed`（確定） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

ユニーク制約: `(user_id, date)`

### `app_settings` テーブル
| カラム | 型 | 説明 |
|---|---|---|
| store_id | uuid | PK（複合）FK → stores.id |
| key | text | PK（複合） |
| value | text | 値 |

主キーは `(store_id, key)` の複合キー。同じキーを店舗ごとに独立して持てる。
アプリ側のupsertは `{ onConflict: 'store_id,key' }` を明示すること。

使用中のキー:
- `period_open_YYYYMM` — 月別提出開始日
- `period_close_YYYYMM` — 月別提出締切日
- `memo_YYYY-MM-DD` — 日付ごとのメモ（シフト確認画面に表示）
- `wage_<user_id>` — スタッフの時給（人件費画面）

> `org_name` は `stores.name` に統合されて廃止。

---

## シフト種別

| 種別 | 開始 | 終了 | 時間数 |
|---|---|---|---|
| A | 08:00 | 13:00 | 5h |
| B | 09:00 | 14:00 | 5h |
| C | 08:00 | 17:00 | 9h |
| D | 09:00 | 18:00 | 9h |
| E | 13:00 | 22:00 | 9h |
| F | 17:00 | 22:00 | 5h |
| カスタム | 任意 | 任意 | 30分刻み、08:00〜22:00 |

---

## ルーティング

```
/                              案内（未ログイン）/ ロールに応じた自動遷移
/s/[storeSlug]/login           店舗ログイン（店頭QRコードの遷移先）
/s/[storeSlug]/staff/{shifts,schedule,requests}
/s/[storeSlug]/admin/{schedule,requests,staff,settings,survey,labor-cost}
/admin/login                   本部管理者ログイン
/admin/stores                  店舗一覧・CRUD（hq_adminのみ）
```

`proxy.ts`（Next.js 16で `middleware.ts` から改称）がURL上のslugとセッションの所属店舗を照合し、
不一致なら自店へ引き戻す。ただしこれはUI最適化であり、認可の実体は各Route Handler側の検証にある。

---

## 画面一覧・実装済み機能

### 認証 `/s/[storeSlug]/login`
- [x] 店舗ごとの専用URL（店頭にQRコードを掲示する運用を想定）
- [x] 店舗名を表示 → 名前選択 → PIN（4桁）入力でログイン
- [x] スタッフ一覧は `list_login_users` RPC で取得（RLS適用後は未認証で `users` を直接読めないため）
- [x] URL上のslugと所属店舗が一致しないログインはサーバー側で拒否
- [x] ロールに応じてリダイレクト
- [x] ログアウトボタン（ヘッダー常時表示）

---

### 本部管理者：ログイン `/admin/login`
- [x] `list_hq_admin_users` RPC で本部管理者のみを一覧表示 → PIN入力
- [x] 成功時は `/admin/stores` へ遷移

---

### 本部管理者：店舗管理 `/admin/stores`
- [x] 店舗一覧・追加・編集（slug / 店舗名）
- [x] 店舗削除（スタッフが在籍する店舗はサーバー側が拒否）
- [x] 各店舗のログインURLをクリップボードにコピー（QRコード作成用）
- [x] 各店舗の管理画面へ遷移

---

### スタッフ：シフト申請 `/s/[storeSlug]/staff/shifts`
- [x] 月切り替え（◀▶）
- [x] シフト種別選択（A〜F / カスタム / 休み）— ボトムシートポップアップ
- [x] カスタム時間入力（30分刻み）
- [x] コメント入力（日付ごと）
- [x] 未提出の変更を localStorage に自動下書き保存
- [x] まとめて提出ボタン（変更件数を表示、upsert）
- [x] 提出完了フラッシュ（✓ 提出完了、3秒）
- [x] ブラウザ離脱時の警告（未提出変更がある場合）
- [x] 前月コピー（同曜日・同週番号マッピング）
- [x] 複数日コピー（コピーモード：対象日を選択して一括適用）
- [x] 確定済みバッジ表示（管理者が確定したシフト）
- [x] 提出期間バナー表示（設定時）
- [x] 提出期間外ロック（入力ボタン・提出フッター非表示、赤バナー）
- [x] 3ヶ月以上先はデフォルトロック（期間未設定時）
- [x] マウント時：提出期間アクティブな月へ自動ジャンプ

---

### スタッフ：シフト確認 `/s/[storeSlug]/staff/schedule`
- [x] 全スタッフのシフトを閲覧（自分以外も見える）
- [x] 表形式ビュー（日付×スタッフのグリッド）
- [x] タイムラインビュー（時間帯×日のガントチャート風）
- [x] 月切り替え
- [x] シフト詳細モーダル（読み取り専用）
- [x] Realtime同期（他者の変更が即時反映）
- [x] 日付ごとメモ表示（閲覧のみ）
  - 2行で折り返し・切り捨て、「メモ ▼/▲」で一括展開・閉じる

---

### 店舗管理者：シフト管理 `/s/[storeSlug]/admin/schedule`
- [x] 表形式ビュー（日付×スタッフ）
- [x] タイムラインビュー
- [x] 月切り替え
- [x] サマリーカード（申請数 / 未確定 / 確定済み）
- [x] シフト個別確定（draft → confirmed）
- [x] 全件一括確定ボタン（未確定件数バッジ付き）
- [x] 管理者によるシフト直接追加（スタッフ・日付・種別・時間・コメント）
- [x] シフト編集（種別・時間・コメント変更）
- [x] シフト削除（確認ダイアログ付き）
- [x] 未提出者一覧ボタン（赤バッジで件数表示）
- [x] リマインダー文章をクリップボードにコピー（LINE/メールに貼り付け用）
- [x] Realtime同期
- [x] 日付ごとメモ入力・保存（セルをクリックして編集、フォーカス外れで自動保存）
  - 2行で折り返し・切り捨て、「メモ ▼/▲」で一括展開・閉じる
  - メモは `app_settings.memo_YYYY-MM-DD` に保存

---

### 店舗管理者：スタッフ管理 `/s/[storeSlug]/admin/staff`
- [x] スタッフ一覧（名前・ロール・PIN・登録日）
- [x] スタッフ追加（名前・PIN・ロール）
- [x] スタッフ編集（名前・PIN変更・ロール変更）
- [x] スタッフ削除（確認ダイアログ、シフトデータも削除）
- [x] 表示順の並び替え（▲▼、楽観的更新）
- [x] PIN 表示/非表示トグル

---

### 店舗管理者：設定 `/s/[storeSlug]/admin/settings`
- [x] 店舗名の表示（読み取り専用。変更は本部管理者が `/admin/stores` で行う）
- [x] 月別シフト提出期間の設定（開始日〜終了日）
  - 表示対象: 翌月〜6ヶ月先
  - 保存ボタンは変更がない場合は無効（disabled）
  - 「解除」で期間クリア
- [x] シフト種別一覧（参照用、固定値）

---

### ナビゲーション（共通）
- [x] ヘッダー（店舗名表示、ログアウト）。リンクは `/s/[storeSlug]` プレフィックス付きで生成
- [x] ボトムナビ（スマホ）
- [x] 横ナビ（デスクトップ）
- [x] 未提出下書きバッジ（スタッフのシフト申請タブ）

---

## 提出期間ロジック

```
periodSet = openDate が設定 OR closeDate が設定
inPeriod  = (openDate が空 OR 今日 >= openDate)
          AND (closeDate が空 OR 今日 <= closeDate)
isFarFuture = 期間未設定 AND 表示月が現在から3ヶ月以上先
isLocked    = isFarFuture OR (periodSet AND !inPeriod)
```

ロック時の挙動:
- 入力ボタン非表示
- コピーボタン非表示
- 提出フッター非表示
- 赤バナー表示（理由に応じてメッセージ切り替え）

---

## 未実装（今後の候補）

| 機能 | 優先度 | 概要 |
|---|---|---|
| 希望休フラグ | 中 | 通常の「休み」と区別して強い希望を表明できる |
| 月次時間数サマリー | 中 | スタッフ自身が今月の合計予定時間を確認できる |
| 週次テンプレート | 低 | 「毎週火・木・土はA」のようなパターン登録 |
| プッシュ/メール通知 | 低 | 未提出リマインド・確定通知の自動送信 |
| 店舗ごとのシフト種別 | 低 | 現状 A〜G は全店舗共通の固定値。店舗ごとに定義できるようにする |
| 本部の横断ダッシュボード | 低 | 全店舗のシフト充足状況・人件費を1画面で俯瞰する |
