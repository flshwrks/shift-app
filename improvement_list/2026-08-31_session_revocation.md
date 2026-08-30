# 退職者・権限変更をセッションに即時反映する（F-2）

## 対象

- `lib/sessionGuard.ts`（新規）— DBと突き合わせる認可層
- `lib/session.ts` — 認可ガードを移し、Cookieの署名検証だけの層に戻した
- `app/api/session/token/route.ts` — 発行前にDB照合。401時はCookieも削除
- `app/api/{admin/users,admin/users/reorder,admin/requests/cleanup,hq/stores,feedback}/route.ts` — 新しい層に載せ替え
- `lib/auth.tsx` — 401とサーバー不調を区別。401なら理由付きでログイン画面へ
- `components/SessionEndedNotice.tsx`（新規）/ 両ログイン画面 — 理由の表示
- `tests/sessionGuard.test.ts`（新規10件）
- `docs/SECURITY.md` / `docs/OPERATIONS.md` / `CHANGELOG.md` / `package.json`

## 背景

診断（`2026-08-29_zensha_tenkai_assessment.md`）で挙げた重大2件の残り1件。

セッションは署名付きCookieに利用者情報を封入する方式で有効期限は30日。
APIルートは**Cookieの署名しか見ていなかった**ため、

- 退職者を削除しても、その端末は最大30日データを閲覧できる
- 管理者からスタッフに降格しても、その端末では管理操作ができ続ける
- 唯一の遮断手段が `SESSION_SECRET` 変更（＝全員強制ログアウト）しかない

という状態だった。**全社展開では退職・異動の頻度が上がるため、展開前の必須項目**としていた。

## 設計判断

### マイグレーションを使わない形に絞った

当初案は `users.session_version` を追加して個別失効も実現するものだったが、
**このリポジトリは master への push で本番へ自動デプロイされる**。
列が無い状態でコードが先に出ると `select session_version` が失敗し、**全員がログイン不能**になる。
順序事故のリスクを取るだけの価値が今回はないと判断し、
**DB照合だけで完結する形**にした。F-2 の指摘内容（削除・降格の即時反映）はこれで解決する。
個別失効（端末紛失・PIN漏洩）は残作業として `docs/SECURITY.md` に方針ごと記録した。

### 層を分けた（lib/session.ts と lib/sessionGuard.ts）

`lib/session.ts` は **proxy.ts（全リクエストが通る）からも import される**。
ここに supabase-js を持ち込むと、認可の実体ではない層に重い依存が乗る。
DBに触るのは `lib/sessionGuard.ts` だけに閉じ込め、proxy.ts はCookieの形式検証を続ける。

### DB障害と「セッションが無効」を厳密に区別した

問い合わせ自体が失敗した場合は `SessionCheckUnavailable` を投げ、**401ではなく503**を返す。
401にすると**DBが落ちている間に全利用者が強制ログアウトされ、
しかもログインにもDBが要るため復旧まで誰も入れなくなる**。
クライアント側（`lib/auth.tsx`）も401のときだけログアウトし、
通信断や5xxでは何もせず次の周期に任せる。

### 判定部分を純粋関数に切り出した

`reconcileSession()` / `finalizeSession()` はI/Oを含まない。
**退職者の締め出しと権限降格は「壊れても気づけない」種類の判定**なので、
DBなしでテストできる形にしてある（10件）。

### 黙って落とさない

使用中に無効化された場合、`?reason=session_invalid` を付けてログイン画面へ送り、
「アカウントが削除されたか、権限が変更されました」と表示する。
黙ってデータが出なくなると、利用者にも管理者にも原因が分からない。

## 検証

ローカルの開発サーバーに対し、`SESSION_SECRET` で署名した検証用Cookieを作って確認した
（**確認後、Cookieの一時ファイルは削除済み**）。

| Cookieの内容 | `/api/session/token` | `PATCH /api/admin/users` |
|---|---|---|
| 実在しない利用者ID（＝退職者） | **401** ＋ Cookie削除 | **403** |
| 実在スタッフのIDに `role: admin` と偽装（＝降格前の古いCookie） | 200（**DBどおり `staff` で発行**） | **403** |
| 実在スタッフ（正常） | 200 | 403（元から権限なし） |
| developer | 200（**照合をスキップ**） | 400（認可は通り、ボディ検証で停止） |

`npm test` 54件、`npx tsc --noEmit`、`npm run build` いずれも通過。
PATCHは空ボディで送っており、ガードはバリデーションより前に動くためデータの書込みは発生していない。

## 残作業

1. **削除せずに特定の1人だけ失効させる機能**（端末の紛失、PINの漏洩）。
   `users` に世代番号を持たせ、Cookieに埋めた世代と突き合わせる。
   実施時は「マイグレーション適用 → 確認 → コードのデプロイ」の順序を必ず設計すること
2. 現状の緊急手段は `SESSION_SECRET` の変更（全員強制ログアウト）のまま
