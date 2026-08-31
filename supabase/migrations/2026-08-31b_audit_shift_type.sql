-- ============================================================================
-- 記録に「シフト種別」を含める（2026-08-31 の audit_log 適用後の追補）
--
-- 適用直後の実データで、休みのシフトを削除した記録が
--   「2026-09-13 00:00〜00:00」
-- と表示され、何が消されたのか読み取れなかった。
-- 休み（off）は時刻を持たないため、時刻だけでは意味を成さない。
-- detail に shift_type を含めて、画面側で「休み」と出せるようにする。
--
-- 関数の差し替えだけなので、テーブル・トリガー・ポリシーには影響しない。
-- 2026-08-31_audit_log.sql を適用済みの環境にそのまま流せる。
-- ============================================================================

create or replace function public.log_shift_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_name  text;
  v_actor_role  text;
  v_target_name text;
  v_store_id    uuid;
  v_shift_id    uuid;
  v_user_id     uuid;
  v_action      text;
  v_detail      jsonb;
begin
  v_actor_id := public.jwt_user_id();
  -- JWTが無い＝サーバー側(service_role)の操作。アプリ側が記録するのでここでは何もしない
  if v_actor_id is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- 本人が自分の申請中シフトを取り消しただけなら記録しない
    if old.status = 'draft' and v_actor_id = old.user_id then
      return null;
    end if;
    v_store_id := old.store_id; v_shift_id := old.id; v_user_id := old.user_id;
    v_action := 'shift.delete';
    v_detail := jsonb_build_object(
      'date', old.date, 'shift_type', old.shift_type,
      'time', old.start_time || '〜' || old.end_time, 'status', old.status);
  else
    v_store_id := new.store_id; v_shift_id := new.id; v_user_id := new.user_id;
    if old.status is distinct from new.status then
      v_action := case when new.status = 'confirmed' then 'shift.confirm' else 'shift.unconfirm' end;
      v_detail := jsonb_build_object(
        'date', new.date, 'shift_type', new.shift_type, 'from', old.status, 'to', new.status);
    elsif old.start_time is distinct from new.start_time
       or old.end_time is distinct from new.end_time then
      -- 本人が自分の申請中シフトを直しただけなら記録しない
      if new.status = 'draft' and v_actor_id = new.user_id then
        return null;
      end if;
      v_action := 'shift.time_change';
      v_detail := jsonb_build_object(
        'date', new.date, 'shift_type', new.shift_type,
        'from', old.start_time || '〜' || old.end_time,
        'to',   new.start_time || '〜' || new.end_time);
    else
      return null; -- 記録に値しない変更（コメントの微修正など）
    end if;
  end if;

  select u.name, u.role into v_actor_name, v_actor_role
  from public.users u where u.id = v_actor_id;

  select u.name into v_target_name
  from public.users u where u.id = v_user_id;

  insert into public.audit_logs
    (store_id, actor_id, actor_name, actor_role, action, target_type, target_id, target_name, detail)
  values
    (v_store_id, v_actor_id,
     coalesce(v_actor_name, '不明'), coalesce(v_actor_role, 'unknown'),
     v_action, 'shift', v_shift_id, coalesce(v_target_name, '不明'), v_detail);

  return null; -- AFTERトリガーのため戻り値は使われない
end;
$$;

revoke execute on function public.log_shift_change() from public, anon, authenticated;
