-- シフト管理アプリ Supabase スキーマ
--
-- 注意: このファイルは「ゼロから新規構築する場合」のベースライン定義です。
-- 既存環境（このファイルより前に作成済みのプロジェクト）には
-- supabase/migrations/ 配下のファイルを日付順にすべて適用してください
-- （2026-07-25_security_hardening.sql 〜 2026-08-08d_multi_store_not_null.sql）。
-- 詳細な経緯・残存リスクは docs/SECURITY.md を参照。

-- pgcrypto（bcryptによるPINハッシュ化・gen_random_uuid()に使用）
create extension if not exists pgcrypto;

-- ============================================================
-- 店舗テーブル（マルチ店舗対応）
-- ============================================================
create table if not exists public.stores (
  id uuid default gen_random_uuid() primary key,
  -- slug は URL (/s/[storeSlug]/...) に現れる店舗識別子。英数字とハイフンのみ、
  -- 先頭・末尾は英数字、全体で3〜40文字に制限する
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  created_at timestamptz default now()
);

alter table public.stores enable row level security;

drop policy if exists "stores_select" on public.stores;
-- stores の SELECT は anon/authenticated 双方に全開放する。slug/name は
-- 各店舗のQRコード・URLに現れる時点で公開情報と同水準の非機微データであり、
-- かつ未認証のログイン画面（/s/[storeSlug]/login）がURLのslugから店舗名を
-- 表示する必要があるため、認証前でも読めることが要件そのもの。
create policy "stores_select" on public.stores for select using (true);

-- 書込み（作成・改名・削除）は /api/hq/stores（service_role・requireHqAdmin()）経由に限定する
revoke insert, update, delete on public.stores from anon, authenticated;

-- ユーザーテーブル
create table if not exists public.users (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  pin_hash text,
  role text not null default 'staff' check (role in ('hq_admin', 'admin', 'staff')),
  display_order int,
  failed_pin_attempts int not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz default now(),
  -- hq_admin（本部管理者）は全店舗を横断するため store_id = null。
  -- admin/staff は必ずいずれかの店舗に属する
  store_id uuid references public.stores(id),
  constraint users_store_id_name_key unique (store_id, name)
);
-- role='developer' はDBには保存されない、クライアント限定の合成ロール（app/api/dev-login 経由）。
-- JWTクレーム上は hq_admin と同格に扱う（lib/supabaseJwt.ts の appRoleFor 参照）

-- (store_id, name) の複合 unique では、store_id が null 同士は「別値」として
-- 扱われ重複を防げない（hq_adminはstore_id=null）ため、null専用の部分 unique index で補う
create unique index if not exists users_name_null_store_uidx on public.users(name) where store_id is null;

-- ============================================================
-- JWTクレーム読み取りヘルパー関数（RLSポリシーから使用）
--
-- いずれも auth.jwt()（Supabase標準・現在のリクエストのJWTクレームをjsonbで返す）を
-- 読むだけで、他ユーザーのデータや機微情報には一切アクセスしない。そのため
-- SECURITY DEFINER にはせず、デフォルトの SECURITY INVOKER のままにする。
--
-- 【重要】これらの関数は anon/authenticated から EXECUTE 権限を revoke しない。
-- RLSポリシーの using/with check 句は「クエリを発行したロール」の権限で評価されるため、
-- ここで revoke すると全ポリシー評価が「permission denied for function」で失敗し、
-- 行が一切見えなくなる（docs/SECURITY.md の「SECURITY DEFINER関数はPUBLICへの
-- 暗黙付与も含めてrevokeする」という教訓は機微データにアクセスする関数向けの指針であり、
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

-- sub が UUID 形式でない値が紛れ込んでも500エラーでRLS評価全体を巻き込んで
-- 壊さないよう、plpgsqlの例外捕捉で「不明ならnullを返す（＝どの行にも一致しない）」
-- という安全側に倒す
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

-- シフトテーブル
create table if not exists public.shifts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  shift_type text not null check (shift_type in ('A','B','C','D','E','F','G','custom','off')),
  start_time text not null,
  end_time text not null,
  comment text default '',
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  store_id uuid not null references public.stores(id),
  unique(user_id, date)
);

-- ============================================================
-- shifts.store_id を強制導出するトリガー
--
-- クライアント（画面）が shifts への INSERT/UPDATE 時に store_id を
-- 自分で指定できてしまうと、「自店のRLS check(store_id = jwt_store_id())は
-- 通しつつ、実際は他店のuser_idを指定してINSERTする」なりすましが可能になる。
-- そこで store_id は常に user_id から users.store_id を引いて上書きし、
-- クライアントが送った値を構造的に無視する。
--
-- users テーブルの行可視性はRLSで店舗ごとに絞られているため、呼び出し元の
-- 権限に関わらず users.store_id を正しく引けるよう SECURITY DEFINER にする。
-- トリガー関数は「トリガーとして発火する」以外の呼び出し方法がなく、発火自体も
-- この関数へのEXECUTE権限の有無とは無関係に行われるため、EXECUTE権限は
-- 誰にも与えない（docs/SECURITY.mdの「SECURITY DEFINER関数の権限は絞る」方針）。
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

revoke execute on function public.set_shift_store_id() from public, anon, authenticated;

drop trigger if exists shifts_set_store_id on public.shifts;
create trigger shifts_set_store_id
  before insert or update of user_id on public.shifts
  for each row execute function public.set_shift_store_id();

-- アプリ設定テーブル（提出期間・店舗名など。店舗ごとに独立して持つため主キーは複合）
create table if not exists public.app_settings (
  key text not null,
  value text not null,
  updated_at timestamptz default now(),
  store_id uuid not null references public.stores(id),
  primary key (store_id, key)
);
-- 店舗名は stores.name に一本化したため、旧来の org_name キーはここでは扱わない。
-- deadline 等の設定値は店舗作成後にアプリ側から upsert で作成される（事前シードは不要）

-- RLS を有効化
alter table public.users enable row level security;
alter table public.shifts enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "allow_all_users" on public.users;
drop policy if exists "allow_all_shifts" on public.shifts;
drop policy if exists "allow_all_settings" on public.app_settings;
drop policy if exists "users_select" on public.users;
drop policy if exists "shifts_select" on public.shifts;
drop policy if exists "shifts_insert" on public.shifts;
drop policy if exists "shifts_update" on public.shifts;
drop policy if exists "shifts_delete" on public.shifts;
drop policy if exists "app_settings_select" on public.app_settings;
drop policy if exists "app_settings_insert" on public.app_settings;
drop policy if exists "app_settings_update" on public.app_settings;
drop policy if exists "app_settings_delete" on public.app_settings;

-- users: SELECTのみ（INSERT/UPDATE/DELETEは列単位権限とservice role API経由に限定。
-- 詳細は下記の revoke と docs/SECURITY.md 参照）。hq_admin は全店舗、
-- それ以外は自店のみ行が見える
create policy "users_select" on public.users
  for select
  using (public.is_hq_admin() or store_id = public.jwt_store_id());

-- shifts: SELECT/INSERT/UPDATE/DELETE を個別に定義。店舗が一致するかhq_adminのみ許可
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

-- app_settings: SELECTは店舗スコープで全ロール、書込はhq_adminか自店admin限定
-- （staffが提出期間・店舗設定を書き換えられないようにする）
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

revoke select on public.users from anon, authenticated;
grant select (id, name, role, display_order, created_at, store_id) on public.users to anon, authenticated;

-- users への書込み(追加・編集・削除・並び替え)は、SESSION_SECRET/SUPABASE_SERVICE_ROLE_KEY
-- を使う app/api/admin/users 系のRoute Handler経由に限定する（詳細は docs/SECURITY.md）
revoke insert, update, delete on public.users from anon, authenticated;

-- PIN検証RPC（bcrypt比較 + 失敗ロックアウト。詳細は migrations/2026-07-25_security_hardening.sql）
-- 戻り値の store_id は、呼び出し側が「URLのstoreSlugと実際の所属店舗が一致するか」
-- 「hq_adminが一般ログイン入口を使っていないか」を判定するために使う
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
    update public.users u set failed_pin_attempts = 0, pin_locked_until = null where u.id = p_user_id;
    return query select v_user.id, v_user.name, v_user.role, v_user.store_id;
  else
    update public.users u
      set failed_pin_attempts = u.failed_pin_attempts + 1,
          pin_locked_until = case when u.failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes' else u.pin_locked_until end
      where u.id = p_user_id;
    return;
  end if;
end;
$$;

grant execute on function public.verify_login(uuid, text) to anon, authenticated;

-- 未認証ログイン画面用のRPC（SECURITY DEFINER。usersのRLSより広い範囲を
-- 読む必要があるため、意図的に公開する）
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

-- PIN設定RPC（スタッフ追加・編集・PINリセット時に使用）
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
    set pin_hash = crypt(p_new_pin, gen_salt('bf', 10)), failed_pin_attempts = 0, pin_locked_until = null
    where u.id = p_user_id;
end;
$$;

-- admin_set_pin は呼び出し元の権限チェックをしないため、anon/authenticated には
-- 実行権限を与えない（service_role クライアントは grant/revoke を無視して常に実行できる。
-- app/api/admin/users 系のRoute Handlerからのみ呼び出す設計）。
-- Postgresは関数作成時にEXECUTE権限をPUBLICへ自動付与するため、public も明示的にrevokeする
-- （2026-07-25d のインシデントの教訓。詳細は docs/SECURITY.md 参照）
revoke execute on function public.admin_set_pin(uuid, text) from anon, authenticated, public;

-- リアルタイム設定
alter publication supabase_realtime add table public.stores;
alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.app_settings;

-- updated_at を自動更新するトリガー
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger shifts_updated_at
  before update on public.shifts
  for each row execute function public.update_updated_at();

create trigger settings_updated_at
  before update on public.app_settings
  for each row execute function public.update_updated_at();

-- サンプルデータ（管理者アカウント）
-- PIN: 1234 のハッシュ（SHA-256 with salt "shift_app_salt"）
-- 実際のハッシュはアプリ側で生成してください
-- insert into public.users (name, pin_hash, role, store_id) values ('管理者', '<hash>', 'admin', '<store_id>');

-- シフト調整依頼テーブル
create table if not exists public.shift_requests (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  start_time text not null,
  end_time text not null,
  shift_type text check (shift_type in ('A','B','C','D','E','F','G','custom')),
  message text default '',
  request_type text not null default 'targeted' check (request_type in ('targeted', 'open')),
  created_by uuid references public.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'cancelled')),
  created_at timestamptz default now(),
  store_id uuid not null references public.stores(id)
);

-- 依頼宛先テーブル（指名型用。store_id は持たず、親 shift_requests 経由でスコープする）
create table if not exists public.shift_request_targets (
  id uuid default gen_random_uuid() primary key,
  request_id uuid not null references public.shift_requests(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  unique(request_id, user_id)
);

create index if not exists shift_requests_store_id_idx on public.shift_requests(store_id);

alter table public.shift_requests enable row level security;
alter table public.shift_request_targets enable row level security;

drop policy if exists "allow_all_shift_requests" on public.shift_requests;
drop policy if exists "allow_all_shift_request_targets" on public.shift_request_targets;
drop policy if exists "shift_requests_all" on public.shift_requests;
drop policy if exists "shift_request_targets_all" on public.shift_request_targets;

-- shift_requests: 店舗が一致すれば全操作を許可（for all）
create policy "shift_requests_all" on public.shift_requests
  for all
  using (public.is_hq_admin() or store_id = public.jwt_store_id())
  with check (public.is_hq_admin() or store_id = public.jwt_store_id());

-- shift_request_targets: 自身に store_id を持たないため、親 shift_requests 経由でスコープ
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

alter publication supabase_realtime add table public.shift_requests;
alter publication supabase_realtime add table public.shift_request_targets;

-- アンケートテーブル
create table if not exists public.surveys (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_at timestamptz default now(),
  store_id uuid not null references public.stores(id)
);

create index if not exists surveys_store_id_idx on public.surveys(store_id);

-- アンケート選択肢テーブル（store_id は持たず、親 surveys 経由でスコープする）
create table if not exists public.survey_options (
  id uuid default gen_random_uuid() primary key,
  survey_id uuid not null references public.surveys(id) on delete cascade,
  label text not null,
  display_order int not null default 0,
  is_other boolean not null default false
);

-- アンケート回答テーブル（store_id は持たず、親 surveys 経由でスコープする）
create table if not exists public.survey_responses (
  id uuid default gen_random_uuid() primary key,
  survey_id uuid not null references public.surveys(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  option_id uuid references public.survey_options(id) on delete set null,
  custom_text text default '',
  created_at timestamptz default now(),
  unique(survey_id, user_id)
);

alter table public.surveys enable row level security;
alter table public.survey_options enable row level security;
alter table public.survey_responses enable row level security;

drop policy if exists "allow_all_surveys" on public.surveys;
drop policy if exists "allow_all_survey_options" on public.survey_options;
drop policy if exists "allow_all_survey_responses" on public.survey_responses;
drop policy if exists "surveys_all" on public.surveys;
drop policy if exists "survey_options_all" on public.survey_options;
drop policy if exists "survey_responses_all" on public.survey_responses;

-- surveys: 店舗が一致すれば全操作を許可（for all）
create policy "surveys_all" on public.surveys
  for all
  using (public.is_hq_admin() or store_id = public.jwt_store_id())
  with check (public.is_hq_admin() or store_id = public.jwt_store_id());

-- survey_options / survey_responses: 親 surveys 経由でスコープ
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
