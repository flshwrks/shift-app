# シフト種別が保存されない不具合の修正と、枠の12件への拡張

## 対象

- `supabase/migrations/2026-09-09_shift_type_slots.sql`（新規・CHECK制約を A〜L へ）
- `supabase/migrations/2026-09-09b_shift_patterns_rpc.sql`（新規・読み取り用RPC）
- `lib/store.tsx`（app_settings の直接SELECT → RPC）
- `lib/types.ts`（`ShiftType` に H〜L、`SHIFT_COLORS` に5色追加）
- `lib/shiftPatterns.ts`（`PATTERN_KEYS` を12件に、既定値は7件のまま）
- `tests/shiftPatterns.test.ts`（34件 → 38件）

## 不具合：表示名や時間帯を保存しても元に戻る

**保存は成功していた。読み戻しが失敗していた。**

`app_settings` のSELECTポリシーは JWT の店舗IDを要求する。

```sql
using (public.is_hq_admin() or store_id = public.jwt_store_id())
```

一方 `StoreProvider`（`/s/[storeSlug]/` 配下を包む）は、店舗解決と同時にシフト種別を読む。
この時点では `AuthProvider` が非同期に取得するSupabase用JWTがまだクライアントに
設定されていないため、**匿名として問い合わせることになり、RLSで0件**になって
既定値へフォールバックしていた。

保存ボタンを押す時点ではトークンがあるので、書き込みだけは成功する。
そのため「保存したのに戻る」という見え方になっていた。

**対応**は `get_shift_patterns(p_store_slug text)` を SECURITY DEFINER のRPCとして追加し、
`StoreProvider` からはこれを呼ぶようにした。`list_login_users` / `get_public_shifts` /
`get_public_memos` と同じ既存パターンで、**`app_settings` のポリシーは緩めていない**。
RPCが返すのは `shift_patterns` キーだけで、提出期間・時給・日付ごとのメモは返さない。

公開範囲としては、公開シフト表で各シフトの実際の時刻がすでに見えており、
店舗IDも推測できない値になっている（F-6対応）ため、追加の露出は実質ない。

## 枠を12件へ

`shifts` と `shift_requests` の両方のCHECK制約を A〜L に広げた。
**許可する値を増やすだけの後方互換な変更**で、既存行の書き換えは起きない。

12で止めたのはDBの都合ではなく、**記号ごとの色を見分けられる上限**のため。
これ以上増やすなら、記号ではなく表示名で区別する運用のほうがよい。

`SHIFT_PRESETS` は「初期状態の7件」という位置づけを明確にし、型を A〜G に限定した。
H以降は既定の時間帯を持たないので、`parsePatterns` では追加時と同じ 09:00〜18:00 で補う。

## 適用順序

**DBを先に、コードを後に。** 逆にすると、アプリが H 以降の種別でシフトを保存しようとして
CHECK違反になる。RPCのほうは先にコードが出ても既定値にフォールバックするだけなので実害はないが、
どちらも先にDBを当てるのが安全（docs/OPERATIONS.md §7）。

## 確認したこと

- テスト108件すべて成功
- `tsc --noEmit` OK / `next build` 成功

## 残作業

- **本番DBへの適用と、適用後の動作確認が未了。** 表示名を保存して開き直し、
  実際に残ることを確認すること
- 12件を超える必要が出た場合は、CHECK制約と `SHIFT_COLORS` の再拡張が要る
