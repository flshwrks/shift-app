-- ============================================================
-- セキュリティ強化マイグレーション（2026-07-25）
--
-- 背景（監査で発見した重大な問題）:
--   1. public.users に PIN が平文（pin列）で保存され、管理画面で再表示できていた
--   2. 全テーブルの RLS が `using (true) with check (true)` の完全オープンポリシーで、
--      anon キー（クライアントに公開される公開鍵）さえあれば pin_hash を含む
--      全ユーザー情報を誰でも直接 SELECT できてしまう状態だった
--   3. ログインPINの検証をクライアント側で SHA-256(pin + 固定ソルト) と比較しており、
--      pin_hash が漏れると総当たり不要で即座に全PINを復元できる
--
-- このマイグレーションで対応する内容:
--   - pgcrypto (bcrypt) による再ハッシュ化 + 平文PIN列の削除
--   - ログイン失敗回数によるロックアウト（5回失敗で15分ロック）
--   - PIN検証・PIN設定を SECURITY DEFINER の RPC に集約
--   - users テーブルの列単位権限を絞り、anon/authenticated からは
--     id/name/role/display_order/created_at のみ SELECT 可能にする
--     （行単位の可視性(RLS)は変更しない = shift_request_targets 等からの
--     user:users(name) 埋め込みJOINはそのまま動作する。pin_hash 等の機微列だけを隠す）
--
-- 適用方法:
--   Supabase ダッシュボード → SQL Editor に本ファイルの内容を貼り付けて実行してください。
--   （このセッションには本番DBの認証情報がないため、必ずご自身で実行する必要があります）
--
-- 適用順序（重要）:
--   このマイグレーションを適用してから、対応するアプリケーションコードの変更を
--   デプロイしてください。逆の順序でデプロイすると、verify_login 等が存在しない間
--   ログインが機能しなくなります。
--
-- 残存リスク（このマイグレーションでは解決しない範囲。docs/SECURITY.md 参照）:
--   users テーブルへの INSERT/UPDATE/DELETE は引き続き anon に開放されたままです。
--   スタッフ管理画面（追加・編集・削除・権限変更）がこの権限に依存しているためで、
--   サービスロールキーを使ったサーバーサイドAPIへの移行（Tier 2）が完了するまでは、
--   理論上「本人のuser_idさえ分かれば権限を書き換えられる」リスクが残ります。
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- 新規スタッフ作成時はPIN未設定のまま行を作り、直後に admin_set_pin RPC で
-- ハッシュを設定する流れに変更するため、pin_hash の NOT NULL 制約を外す
-- （NULL の pin_hash は crypt() 比較が常に偽になるため、ログインは安全に失敗する）
alter table public.users alter column pin_hash drop not null;

-- ロックアウト用カラム（未追加なら追加）
alter table public.users add column if not exists failed_pin_attempts int not null default 0;
alter table public.users add column if not exists pin_locked_until timestamptz;

-- 既存の平文PIN(pin列)が残っていれば、bcryptで再ハッシュしてから削除する
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'pin'
  ) then
    update public.users
      set pin_hash = crypt(pin, gen_salt('bf', 10))
      where pin is not null and pin <> '';
    alter table public.users drop column pin;
  end if;
end $$;

-- ============================================================
-- PIN検証RPC（bcrypt比較 + 失敗ロックアウト）
-- ============================================================
create or replace function public.verify_login(p_user_id uuid, p_pin text)
returns table(id uuid, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  select * into v_user from public.users u where u.id = p_user_id;

  if not found then
    return;
  end if;

  if v_user.pin_locked_until is not null and v_user.pin_locked_until > now() then
    raise exception 'アカウントがロックされています。しばらくしてから再度お試しください。' using errcode = 'P0001';
  end if;

  if v_user.pin_hash = crypt(p_pin, v_user.pin_hash) then
    update public.users u
      set failed_pin_attempts = 0, pin_locked_until = null
      where u.id = p_user_id;
    return query select v_user.id, v_user.name, v_user.role;
  else
    update public.users u
      set failed_pin_attempts = u.failed_pin_attempts + 1,
          pin_locked_until = case
            when u.failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes'
            else u.pin_locked_until
          end
      where u.id = p_user_id;
    return;
  end if;
end;
$$;

grant execute on function public.verify_login(uuid, text) to anon, authenticated;

-- ============================================================
-- PIN設定RPC（スタッフ追加・編集・PINリセット時に使用。bcryptハッシュ化はDB側で実施）
-- ============================================================
create or replace function public.admin_set_pin(p_user_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_pin !~ '^\d{4}$' then
    raise exception 'PINは数字4桁で指定してください' using errcode = 'P0001';
  end if;

  update public.users u
    set pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
        failed_pin_attempts = 0,
        pin_locked_until = null
    where u.id = p_user_id;
end;
$$;

grant execute on function public.admin_set_pin(uuid, text) to anon, authenticated;

-- ============================================================
-- 列単位の権限制御（行の可視性=RLSはそのまま、列だけ絞る）
-- pin_hash / failed_pin_attempts / pin_locked_until は
-- SECURITY DEFINER の RPC（オーナー権限で実行）からのみアクセス可能になる
-- ============================================================
revoke select on public.users from anon, authenticated;
grant select (id, name, role, display_order, created_at) on public.users to anon, authenticated;

commit;
