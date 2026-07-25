-- ============================================================
-- 修正パッチ（2026-07-25b）: pgcrypto の search_path 問題
--
-- 2026-07-25_security_hardening.sql 適用後、verify_login / admin_set_pin
-- 呼び出し時に "function crypt(text, text) does not exist" エラーが発生した。
-- Supabaseプロジェクトはデフォルトで拡張機能を public ではなく extensions
-- スキーマにインストールするため、関数側で `set search_path = public` と
-- 限定していると crypt()/gen_salt() が解決できない。
-- search_path に extensions を追加して解決する。
-- ============================================================

create or replace function public.verify_login(p_user_id uuid, p_pin text)
returns table(id uuid, name text, role text)
language plpgsql
security definer
set search_path = public, extensions
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

create or replace function public.admin_set_pin(p_user_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
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
