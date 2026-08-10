# デザイン・仕様共通リファレンス

> このシフト管理アプリから抽出した、店舗向けアプリ共通の型。
> 他の店舗関係アプリを新規に作る際、これをそのまま出発点にして
> 見た目・アーキテクチャの一貫性を保つためのもの。
>
> 「なぜこうなっているか」の理由も書いてあるので、コピーする時は理由ごと
> 引き継ぐこと。理由を無視して数値だけ変えると、次第に別物になっていく。

---

## 1. 技術スタックのデフォルト選定

| 項目 | 選定 | 理由 |
|---|---|---|
| フレームワーク | Next.js（App Router） | 最新の安定版を都度確認（`~/.claude/tech-versions.md` 参照） |
| 言語 | TypeScript（strict） | `any` を使わない |
| スタイリング | Tailwind CSS 4 | `@theme` でトークンを直接上書きする（後述） |
| DB / BaaS | Supabase（PostgreSQL + Realtime） | RLSでテナント境界を強制できる、Realtimeが標準で使える |
| デプロイ | Vercel | GitHub連携でpush即デプロイ |
| フォント | システムフォント（Hiragino/Noto Sans JP） | Webフォント読み込みコストを避ける。店舗スタッフの低速回線・古い端末での利用を想定 |

---

## 2. デザイン原則

1. **「AIが作った感」を出さない**。絵文字アイコン・素のTailwind標準色（`blue-600`等）をそのまま使わない。これらは初期プロトタイプっぽく見える最大の要因。必ず以下の手当てをする:
   - アイコンは絵文字ではなく線画SVG（Lucideのパスをコピーして使う。手書きしない）
   - カラースケールは `@theme` で独自トークンに上書きする
2. **業務データの色と装飾色を分離する**。例えばシフト種別の色分け（`SHIFT_COLORS`）のような「意味を持つ色」は、テーマ変更の影響を受けない別の定数として管理する。ボタンやUIパーツの装飾色（`blue-600`等）とは絶対に混ぜない
3. **スマホ第一**。管理者もスタッフも現場でスマホから使う前提。ボトムナビ＋iOSセーフエリア対応、タップ領域は最低44px相当を確保する
4. **低頻度入力・高頻度閲覧に最適化**。PIN入力・シフト選択などはテンキー/ボトムシート型のモーダルにして、フォームの羅列にしない

---

## 3. カラーパレット

`app/globals.css` の `@theme` ブロックでTailwindの `blue` スケールを深みのあるコバルトに再定義する（標準の`blue-600`がそのままだと汎用SaaS感が強く出るため）。

```css
@theme {
  --color-blue-50: #EEF2FC;
  --color-blue-100: #DCE5F8;
  --color-blue-200: #B7C9F0;
  --color-blue-400: #5A7DDB;
  --color-blue-500: #3A63D6;
  --color-blue-600: #2452CC;
  --color-blue-700: #1E43A8;
}

:root {
  --background: #F6F7F9;
  --foreground: #16181D;
}
```

- `slate` はTailwind標準のまま使う（グレースケールUIの土台）
- `blue-600` = プライマリアクション（ボタン、リンク、アクティブ状態）
- 業務データの色分け（例: シフト種別、ステータス）は上記とは独立した定数テーブルで持つ。例:
  ```ts
  export const SHIFT_COLORS: Record<ShiftType, string> = {
    A: '#3B82F6', B: '#10B981', C: '#8B5CF6', D: '#F59E0B',
    E: '#EF4444', F: '#EC4899', G: '#0EA5E9', custom: '#6B7280', off: '#94A3B8',
  };
  ```
  これはTailwindのテーマを変えても影響を受けない、意味を固定した色（ヘルプ画面のシフト種別早見表と実データ表示を必ず一致させる）

### アクセシビリティ

```css
:focus-visible { outline: 2px solid var(--color-blue-500); outline-offset: 2px; border-radius: 4px; }
::selection { background: var(--color-blue-100); color: var(--color-blue-700); }
@media (prefers-reduced-motion: reduce) { /* アニメーション全停止 */ }
```

---

## 4. コンポーネントパターン

実際に使っているクラスの組み合わせをそのまま列挙する（迷ったらここからコピーする）。

**カード**
```
bg-white rounded-2xl border border-slate-200 shadow-[0_1px_2px_rgba(16,24,40,0.04)]
```

**モーダル（スマホはボトムシート、デスクトップは中央）**
```
fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4
→ 中身: bg-white rounded-t-3xl sm:rounded-2xl sm:max-w-lg shadow-2xl
```

**ボタン**
- プライマリ: `bg-blue-600 text-white rounded-lg hover:bg-blue-700`
- セカンダリ: `bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg`
- 破壊的操作: `bg-red-600 text-white hover:bg-red-700`（削除確認モーダルは必ず挟む。即実行しない）

**バッジ**
```
text-[10px] px-1.5 py-px rounded font-medium border
状態に応じて bg-{color}-50 text-{color}-700 border-{color}-200 を組み合わせる
（例: 確定=emerald、申請中=amber、ロック=slate）
```

**ヘッダー**
```
bg-white/85 backdrop-blur border-b border-slate-200/80 sticky top-0 z-40
```

**フォーム入力**
```
border border-slate-200 rounded-lg px-3 py-2 text-sm
focus:outline-none focus:ring-2 focus:ring-blue-400
```

**数値表示**（金額・時刻・件数など桁が揃うべき値）
```
tabular-nums を必ず付ける
```

---

## 5. アイコン

`components/icons.tsx` に集約し、Lucide（ISCライセンス）のパスをそのままコピーして使う。手書き・絵文字は使わない。

```tsx
const defaults = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
export function IconXxx(props: IconProps) {
  return <svg {...defaults} {...props}><path d="..." /></svg>;
}
```

ブランドマークは「角丸の色付きボックス＋アイコン」の組み合わせで統一する（`components/BrandMark.tsx`、sm/md/lgの3サイズ）。

---

## 6. ナビゲーション構造

- **スマホ**: 画面下部固定のボトムナビ（アイコン＋短いラベル、アクティブ時は上部にインジケーターバー）
- **デスクトップ (`sm:`以上)**: ヘッダー直下の横並びタブ
- ヘッダーは常時: ブランド＋アプリ名、（必要なら）現在のコンテキスト名（店舗名等）、ユーザー名、ヘルプボタン、ログアウトボタン
- 未対応件数・下書きありなどは小さな丸バッジで表現（数字は9+で省略）

---

## 7. 認証パターン（店舗スタッフ向けの簡易ログイン）

一般消費者向けSaaSのようなメール+パスワードは、現場のスタッフには不向き（メールアドレスを持たない/覚えていないスタッフがいる）。この系統のアプリでは以下を標準とする。

1. **名前選択 + 4桁PIN**。Supabase Authは使わず、独自のPIN認証にする
2. PINは **bcryptハッシュ化**して保存（固定ソルトのSHA-256等は絶対に使わない。過去に実際にインシデントを起こした手法）
3. ログイン失敗5回で一定時間ロックアウト
4. セッションは**httpOnly署名Cookie**（HMAC-SHA256、独自シークレット）。JSから読めない形で保持する
5. SupabaseのRLSでテナント境界を強制したい場合、Cookieセッションとは別に**短命なSupabase JWT**を発行し、`supabase-js`の`accessToken`コールバックに渡す（Supabase公式の「サードパーティ認証」パターン）。JWTは**localStorageに置かず、メモリ保持＋都度再取得**にする（XSS時の被害をTTL内に限定するため）

この構成の詳細な設計判断は `docs/SECURITY.md` を参照。

---

## 8. マルチテナント（複数店舗）パターン

「同一組織が複数店舗を運営し、本部が横断管理する」という業態のアプリで再利用できる型。

- 店舗テーブル（`stores`: id, slug, name）を用意し、あらゆる業務テーブルに `store_id` を持たせる
- ロールは3階層: 本部（全店舗、`store_id`はnull）／ 店舗管理者（自店のみ）／ スタッフ（自店のみ、掛け持ちなし）
- URLは `/s/[storeSlug]/...` の形で店舗を明示する（店頭QRコード運用と相性が良い）。本部は店舗に紐づかない別URL（例 `/admin/...`）
- 店舗間のデータ遮断は**RLSでDBレベルに強制**する。アプリ側のクエリ条件（`.eq('store_id', ...)`）だけに依存しない
- **service_roleクライアントはRLSを無視する**ため、管理者API（Route Handler）側でも必ず店舗スコープを検証すること。DBとアプリコードの二重チェックになる
- 詳細設計は `improvement_list/2026-08-08_multi_store_support.md` を参照（フェーズ分割の失敗例も記録してあるので、次回同種の移行をする際は必ず読むこと）

---

## 9. DB運用ルール

- マイグレーションはSupabase SQL Editorで**手動適用**するSQLファイルとして `supabase/migrations/YYYY-MM-DD_説明.sql` に置く（自動適用ツールは導入していない）
- `supabase/schema.sql` は「ゼロから新規構築する場合のベースライン」として、適用済みマイグレーションをすべて反映した最終形を常に保つ
- SECURITY DEFINER関数を新規作成する際は、**PostgresがデフォルトでPUBLICにEXECUTE権限を付与する**ことを必ず意識する。意図的に公開するRPC以外は `revoke ... from public, anon, authenticated` を忘れない（過去に実際にPINが書き換わるインシデントが発生している）

---

## 10. バージョン管理・ドキュメント運用

新しいアプリでも同じ4点セットを最初から用意する。

| ファイル | 役割 |
|---|---|
| `package.json` の `version` | Semantic Versioning。ユーザー向けの意味ある変更でインクリメント |
| `CHANGELOG.md` | バージョンごとの変更履歴（技術的な言い回しでよい） |
| `docs/GUIDE.md` | **全機能を集約した唯一の使い方マニュアル**。SPEC.md等に機能チェックリストを重複して書かない |
| `docs/SPEC.md` | 技術資料（データモデル・ルーティング）に専念。機能一覧はGUIDE.mdへ |
| `improvement_list/YYYY-MM-DD_説明.md` | 1プラン＝1ファイルで改修履歴を記録。対象・変更内容・理由を書く |

これらを更新するルールをプロジェクトの `CLAUDE.md` に明記しておくと、セッションが変わっても運用が続く（このアプリの `CLAUDE.md` を参照）。

---

## 11. コーディング規約

- コメントは「なぜ」を書く。「何をしているか」は書かない（コードを読めば分かる）
- UI文言はすべて日本語。ボタン・エラーメッセージ・空状態のトーンをこのアプリと揃える（丁寧だが硬すぎない）
- 破壊的操作（削除等）は必ず確認ダイアログを挟む
- 楽観的更新は「失敗時に元に戻す」処理とセットで実装する
- 型は明示的に。`any` を使わない
