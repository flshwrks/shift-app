# シフト管理アプリ 仕様書（技術資料）

> 最終更新: 2026-08-09（Ver.2.3.0）
>
> **これは技術者向けの資料**（データモデル・ルーティング等）。
> **全機能の使い方は `docs/GUIDE.md`**、変更履歴は `CHANGELOG.md` を参照。

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
| shift_type | text | `A`/`B`/`C`/`D`/`E`/`F`/`G`/`custom`/`off` |
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

## ルーティング

```
/                              案内（未ログイン）/ ロールに応じた自動遷移
/s/[storeSlug]/login           店舗ログイン（店頭QRコードの遷移先）
/s/[storeSlug]/public/schedule ログイン不要のシフト閲覧（読み取り専用）
/s/[storeSlug]/staff/{shifts,schedule,requests}
/s/[storeSlug]/admin/{schedule,requests,staff,settings,survey,labor-cost}
/admin/login                   本部管理者ログイン
/admin/stores                  店舗一覧・CRUD（hq_adminのみ）
```

シフト種別・提出期間ロジック・各画面の機能一覧は `docs/GUIDE.md` を参照（実装状況の記述をこのファイルと二重管理しない）。

`proxy.ts`（Next.js 16で `middleware.ts` から改称）がURL上のslugとセッションの所属店舗を照合し、
不一致なら自店へ引き戻す。ただしこれはUI最適化であり、認可の実体は各Route Handler側の検証にある。

---

## 画面一覧・機能

各画面の機能・操作方法は `docs/GUIDE.md` を参照（実装状況の一覧をこのファイルと二重管理しない）。

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
