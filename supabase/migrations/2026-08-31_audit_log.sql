-- ============================================================================
-- 操作の記録（監査ログ） — 点検項目 F-3 への対応
--
-- これまで「誰がいつシフトを確定したか」「誰が権限を変えたか」が一切残らず、
-- 「勝手にシフトを変えられた」という申し立てを検証する手段が無かった。
--
-- ★このファイルは Supabase SQL Editor で手で適用する★
--   アプリのコードは、このテーブルが無くても壊れないように書いてある
--   （記録に失敗しても業務は止めない）。適用前後どちらの順序でも安全。
-- ============================================================================

create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,

  -- 店舗スコープ。本部の操作（店舗の作成など）は対象店舗のIDを入れる
  --
  -- ★外部キー制約をあえて付けていない★
  -- 監査ログの価値は「他のデータが消えても残ること」にある。
  -- 参照制約を付けると、スタッフや店舗を削除した瞬間にその人の操作記録まで
  -- 消える（cascade）か、削除自体ができなくなる（restrict）。どちらも不可。
  -- 代わりに氏名・店舗名をスナップショットとして持つ。
  store_id uuid,

  actor_id uuid,                    -- 実行者。削除済みでも記録は残す
  actor_name text not null,         -- 実行時点の氏名（削除後に誰か分かるように）
  actor_role text not null,         -- 実行時点の権限

  action text not null,             -- 'shift.confirm' / 'user.role_change' など
  target_type text,                 -- 'shift' | 'user' | 'store'
  target_id uuid,
  target_name text,                 -- 対象の氏名・店舗名のスナップショット
  detail jsonb,                     -- 変更前後など、後から見て意味が分かる情報

  created_at timestamptz not null default now()
);

-- 一覧は「その店舗の新しい順」で引く
create index if not exists audit_logs_store_created_idx
  on public.audit_logs (store_id, created_at desc);

alter table public.audit_logs enable row level security;

-- 参照は管理者だけ。スタッフに他人の操作履歴を見せる必要はない
drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs
  for select to anon, authenticated
  using (
    public.is_hq_admin()
    or (public.jwt_app_role() = 'admin' and store_id = public.jwt_store_id())
  );

-- ★書き込みポリシーを作らない★
-- RLSが有効なテーブルにポリシーが無ければ、その操作は誰にも許可されない。
-- 記録を作れるのは
--   ・下のトリガー（security definer で動く）
--   ・service_role を使うサーバー側のAPI（RLSを迂回する）
-- の2つだけになり、利用者のブラウザからは追加も改ざんも削除もできない。
-- 追記専用（append-only）であることが監査ログの前提。

-- ============================================================================
-- シフトの確定・時刻変更・削除を記録するトリガー
--
-- シフトの確定は管理画面のブラウザから直接DBを更新している（APIを経由しない）ため、
-- アプリのコード側に記録を差し込む場所が無い。DB側で捕まえる。
-- 実行者は JWT の sub（= jwt_user_id()）から取る。
--
-- ★JWTが無い書き込み（= service_role を使うサーバー側の操作）は記録しない★
-- 理由が2つある。
--   1. 実行者が分からない。service_role にはJWTのクレームが無い
--   2. スタッフを削除すると shifts が cascade で消え、1人につき数百件のトリガーが走る。
--      その全てを「実行者不明のシフト削除」として記録すると、肝心の記録が埋もれる
-- サーバー側の操作は、アプリのコード（lib/audit.ts）が実行者付きで記録する。
-- これで二重記録も防げる。
--
-- 記録するのは「後から争いになりうる変更」だけに絞る:
--   ・status の変化（申請中 ⇄ 確定）
--   ・時刻の変化
--   ・削除
-- ★スタッフが自分の申請中（draft）のシフトを直す・取り消すのは記録しない★
-- 本人が自分の希望を出し直しているだけで、後から争いにならない。
-- 全件記録すると量が爆発して、肝心の「管理者が他人のシフトを触った」記録が埋もれる。
-- 逆に、確定済みのシフトへの変更と、他人のシフトへの変更は必ず記録する。
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
      'date', old.date, 'time', old.start_time || '〜' || old.end_time, 'status', old.status);
  else
    v_store_id := new.store_id; v_shift_id := new.id; v_user_id := new.user_id;
    if old.status is distinct from new.status then
      v_action := case when new.status = 'confirmed' then 'shift.confirm' else 'shift.unconfirm' end;
      v_detail := jsonb_build_object('date', new.date, 'from', old.status, 'to', new.status);
    elsif old.start_time is distinct from new.start_time
       or old.end_time is distinct from new.end_time then
      -- 本人が自分の申請中シフトを直しただけなら記録しない
      if new.status = 'draft' and v_actor_id = new.user_id then
        return null;
      end if;
      v_action := 'shift.time_change';
      v_detail := jsonb_build_object(
        'date', new.date,
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

drop trigger if exists shifts_audit on public.shifts;
create trigger shifts_audit
  after update or delete on public.shifts
  for each row execute function public.log_shift_change();

-- 関数は作成時に PUBLIC へ EXECUTE が自動付与される（docs/SECURITY.md のインシデント参照）。
-- トリガー関数は直接呼ばれる必要が無いので、明示的に剥がしておく。
revoke execute on function public.log_shift_change() from public, anon, authenticated;
