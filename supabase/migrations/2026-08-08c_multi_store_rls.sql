-- ============================================================
-- マルチ店舗対応（3/4）: RLS本格化（★破壊的変更★）
--
-- これまで users 以外の全テーブルは `using (true) with check (true)` の
-- 全開放ポリシー（docs/SECURITY.md の Tier1/Tier2 で対応しきれなかった残存リスク）
-- だった。ここで初めて、店舗境界を DB レベル（RLS）で強制する。
--
-- ★適用前提（順序を間違えると即座に全ユーザーがログイン不能・データ不可視になる）:
--   1. 2026-08-08_multi_store_schema.sql / 2026-08-08b_multi_store_backfill.sql を適用済み
--      （stores テーブルが存在し、既存データの store_id が埋まっていること）
--   2. lib/supabaseJwt.ts（jose署名の独自Supabase JWT発行）と、
--      その JWT を Authorization ヘッダに載せる lib/supabase.ts / lib/auth.tsx の実装が
--      デプロイ済みで、実際に app_role / store_id クレーム入りのJWTが発行されていること
--   3. 上記が確認できるまでは、このファイルを適用してはいけない。
--      適用してしまうと、旧トークン（app_role/store_id クレームを持たない、
--      または全く認証していないセッション）は is_hq_admin() も
--      store_id = jwt_store_id() も false になり、全テーブルが空に見える
--      （＝アプリが実質的に全滅する）。
--
-- 適用順序: 4ファイル中の 3番目。
-- ============================================================

begin;

-- ============================================================
-- JWTクレーム読み取りヘルパー関数
--
-- いずれも auth.jwt()（Supabase標準・現在のリクエストのJWTクレームをjsonbで返す）を
-- 読むだけで、他ユーザーのデータや機微情報には一切アクセスしない。そのため
-- SECURITY DEFINER にはせず、デフォルトの SECURITY INVOKER のままにする。
--
-- 【重要】これらの関数は anon/authenticated から EXECUTE 権限を revoke しない。
-- RLSポリシーの using/with check 句は「クエリを発行したロール（anon/authenticated）」
-- の権限で評価されるため、ここで revoke すると全ポリシー評価が
-- 「permission denied for function」で失敗し、行が一切見えなくなる
-- （docs/SECURITY.md にある「SECURITY DEFINER関数はPUBLICへの暗黙付与も含めて
-- revokeする」という教訓は、機微データにアクセスする関数向けの指針であり、
-- 自分自身のJWTを読むだけのこれらの関数には当てはまらない）。
-- ============================================================
create or replace function public.jwt_app_role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'app_role', '');
$$;

create or replace function public.jwt_store_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'store_id', '')::uuid;
$$;

-- sub が UUID 形式でない値（開発者ログインの旧クレーム等）が紛れ込んでも
-- 500エラーでRLS評価全体を巻き込んで壊さないよう、plpgsqlの例外捕捉で
-- 「不明ならnullを返す（＝どの行にも一致しない）」という安全側に倒す
create or replace function public.jwt_user_id()
returns uuid
language plpgsql
stable
as $$
begin
  return (auth.jwt() ->> 'sub')::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.is_hq_admin()
returns boolean
language sql
stable
as $$
  select public.jwt_app_role() = 'hq_admin';
$$;

-- ============================================================
-- shifts.store_id を強制導出するトリガー
--
-- クライアント（画面）が shifts への INSERT/UPDATE 時に store_id を
-- 自分で指定できてしまうと、「自店のRLS check(store_id = jwt_store_id())は
-- 通しつつ、実際は他店のuser_idを指定してINSERTする」なりすましが可能になる。
-- そこで store_id は常に user_id から users.store_id を引いて上書きし、
-- クライアントが送った値を構造的に無視する（RLSのcheck条件をすり抜けても
-- なりすましINSERTが成立しないようにするための設計）。
--
-- users テーブルの行可視性はRLSで店舗ごとに絞られているため、
-- 呼び出し元の権限に関わらず users.store_id を正しく引けるよう SECURITY DEFINER にする。
-- ============================================================
create or replace function public.set_shift_store_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select u.store_id into new.store_id
  from public.users u
  where u.id = new.user_id;
  return new;
end;
$$;

-- トリガー関数は「トリガーとして発火する」以外の呼び出し方法がなく
-- （トリガー関数を直接SELECT呼び出しすると「トリガーとしてのみ呼び出し可能」という
-- エラーになる）、トリガーの発火自体もこの関数へのEXECUTE権限の有無とは無関係に行われる
-- （CREATE TRIGGER時点の権限で確定する）。そのため revoke してもトリガーは機能し続け、
-- SECURITY DEFINER関数の権限は絞るという方針（docs/SECURITY.md）にも合わせられる。
revoke execute on function public.set_shift_store_id() from public, anon, authenticated;

drop trigger if exists shifts_set_store_id on public.shifts;
create trigger shifts_set_store_id
  before insert or update of user_id on public.shifts
  for each row execute function public.set_shift_store_id();

-- ============================================================
-- 既存の全開放ポリシー（allow_all_*）をすべて撤去する
-- ============================================================
drop policy if exists "allow_all_users" on public.users;
drop policy if exists "allow_all_shifts" on public.shifts;
drop policy if exists "allow_all_settings" on public.app_settings;
drop policy if exists "allow_all_shift_requests" on public.shift_requests;
drop policy if exists "allow_all_shift_request_targets" on public.shift_request_targets;
drop policy if exists "allow_all_surveys" on public.surveys;
drop policy if exists "allow_all_survey_options" on public.survey_options;
drop policy if exists "allow_all_survey_responses" on public.survey_responses;

-- ============================================================
-- users: SELECTのみ（INSERT/UPDATE/DELETEは2026-07-25cで既にanon/authenticatedから
-- 剥奪済みのため触らない）。hq_admin は全店舗、それ以外は自店のみ行が見える
-- ============================================================
create policy "users_select" on public.users
  for select
  using (public.is_hq_admin() or store_id = public.jwt_store_id());

-- 列単位権限（pin_hash等の機微列を隠す）を維持しつつ、公開列に store_id を追加する
grant select (id, name, role, display_order, created_at, store_id) on public.users to anon, authenticated;

-- ============================================================
-- shifts: SELECT/INSERT/UPDATE/DELETE を個別に定義
-- ============================================================
create policy "shifts_select" on public.shifts
  for select
  using (public.is_hq_admin() or store_id = public.jwt_store_id());

create policy "shifts_insert" on public.shifts
  for insert
  with check (public.is_hq_admin() or store_id = public.jwt_store_id());

create policy "shifts_update" on public.shifts
  for update
  using (public.is_hq_admin() or store_id = public.jwt_store_id())
  with check (public.is_hq_admin() or store_id = public.jwt_store_id());

create policy "shifts_delete" on public.shifts
  for delete
  using (public.is_hq_admin() or store_id = public.jwt_store_id());

-- ============================================================
-- app_settings: SELECTは店舗スコープで全ロール、書込はhq_adminか自店admin限定
-- （staffが提出期間・組織名を書き換えられないようにする）
-- ============================================================
create policy "app_settings_select" on public.app_settings
  for select
  using (public.is_hq_admin() or store_id = public.jwt_store_id());

create policy "app_settings_insert" on public.app_settings
  for insert
  with check (public.is_hq_admin() or (public.jwt_app_role() = 'admin' and store_id = public.jwt_store_id()));

create policy "app_settings_update" on public.app_settings
  for update
  using (public.is_hq_admin() or (public.jwt_app_role() = 'admin' and store_id = public.jwt_store_id()))
  with check (public.is_hq_admin() or (public.jwt_app_role() = 'admin' and store_id = public.jwt_store_id()));

create policy "app_settings_delete" on public.app_settings
  for delete
  using (public.is_hq_admin() or (public.jwt_app_role() = 'admin' and store_id = public.jwt_store_id()));

-- ============================================================
-- shift_requests / surveys: 店舗が一致すれば全操作を許可（for all）
-- ============================================================
create policy "shift_requests_all" on public.shift_requests
  for all
  using (public.is_hq_admin() or store_id = public.jwt_store_id())
  with check (public.is_hq_admin() or store_id = public.jwt_store_id());

create policy "surveys_all" on public.surveys
  for all
  using (public.is_hq_admin() or store_id = public.jwt_store_id())
  with check (public.is_hq_admin() or store_id = public.jwt_store_id());

-- ============================================================
-- shift_request_targets: 自身に store_id を持たないため、親 shift_requests 経由でスコープ
-- ============================================================
create policy "shift_request_targets_all" on public.shift_request_targets
  for all
  using (
    exists (
      select 1 from public.shift_requests sr
      where sr.id = shift_request_targets.request_id
        and (public.is_hq_admin() or sr.store_id = public.jwt_store_id())
    )
  )
  with check (
    exists (
      select 1 from public.shift_requests sr
      where sr.id = shift_request_targets.request_id
        and (public.is_hq_admin() or sr.store_id = public.jwt_store_id())
    )
  );

-- ============================================================
-- survey_options / survey_responses: 親 surveys 経由でスコープ
-- ============================================================
create policy "survey_options_all" on public.survey_options
  for all
  using (
    exists (
      select 1 from public.surveys s
      where s.id = survey_options.survey_id
        and (public.is_hq_admin() or s.store_id = public.jwt_store_id())
    )
  )
  with check (
    exists (
      select 1 from public.surveys s
      where s.id = survey_options.survey_id
        and (public.is_hq_admin() or s.store_id = public.jwt_store_id())
    )
  );

create policy "survey_responses_all" on public.survey_responses
  for all
  using (
    exists (
      select 1 from public.surveys s
      where s.id = survey_responses.survey_id
        and (public.is_hq_admin() or s.store_id = public.jwt_store_id())
    )
  )
  with check (
    exists (
      select 1 from public.surveys s
      where s.id = survey_responses.survey_id
        and (public.is_hq_admin() or s.store_id = public.jwt_store_id())
    )
  );

-- ============================================================
-- 未認証ログイン画面用のRPC（SECURITY DEFINER。usersのRLSより広い範囲を
-- 読む必要があるため、意図的に公開する）
-- ============================================================

-- /s/[storeSlug]/login が、指定店舗の admin/staff 一覧をログイン前に表示するために使う
create or replace function public.list_login_users(p_store_slug text)
returns table(id uuid, name text, role text, display_order int)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, u.role, u.display_order
  from public.users u
  join public.stores s on s.id = u.store_id
  where s.slug = p_store_slug
    and u.role in ('admin', 'staff')
  order by u.display_order, u.name;
$$;

grant execute on function public.list_login_users(text) to anon, authenticated;

-- /admin/login が、本部管理者一覧をログイン前に表示するために使う
create or replace function public.list_hq_admin_users()
returns table(id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name
  from public.users u
  where u.role = 'hq_admin'
  order by u.name;
$$;

grant execute on function public.list_hq_admin_users() to anon, authenticated;

-- ============================================================
-- verify_login: 戻り値に store_id を追加する（呼び出し側が「URLのstoreSlugと
-- 実際の所属店舗が一致するか」「hq_adminが一般ログイン入口を使っていないか」を
-- 判定するために必要）。戻り値の型が変わるため create or replace ではなく
-- 一度 drop してから作り直す。bcrypt照合・5回失敗ロックアウトのロジックは
-- 2026-07-25b（pgcryptoのsearch_path修正版）から一切変更しない
-- ============================================================
drop function if exists public.verify_login(uuid, text);

create or replace function public.verify_login(p_user_id uuid, p_pin text)
returns table(id uuid, name text, role text, store_id uuid)
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
    return query select v_user.id, v_user.name, v_user.role, v_user.store_id;
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

commit;
