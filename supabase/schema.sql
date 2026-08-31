-- シフト管理アプリ Supabase スキーマ
--
-- 注意: このファイルは「ゼロから新規構築する場合」のベースライン定義です。
-- 既存環境（このファイルより前に作成済みのプロジェクト）には
-- supabase/migrations/ 配下のファイルを日付順にすべて適用してください
-- （2026-07-25_security_hardening.sql 〜 2026-08-08d_multi_store_not_null.sql）。
-- 詳細な経緯・残存リスクは docs/SECURITY.md を参照。
--
-- ★このDBは在庫管理アプリ(inventory-app)と共有しています★（2026-08-10〜）
-- 実DBには本ファイルに載っていない `inv_*` のテーブル・ビュー・関数が存在します。
-- それらは inventory-app リポジトリ（~/.claude/在庫管理アプリ/inventory-app）の
-- supabase/schema.sql が所有しており、本ファイルには含めません。
-- このファイルだけでDBを再構築すると在庫データの入れ物が欠落するので、
-- 再構築時は inventory-app 側のマイグレーションもあわせて適用してください。
-- 在庫アプリは users / stores / jwt_*() / is_hq_admin() を参照するだけで、
-- 本ファイルが定義するオブジェクトを変更しません（依存の向きは一方向）。

-- pgcrypto（bcryptによるPINハッシュ化・gen_random_uuid()に使用）
create extension if not exists pgcrypto;

-- ============================================================
-- 店舗テーブル（マルチ店舗対応）
-- ============================================================
-- ★在庫管理アプリ(inventory-app)が依存しています★
-- 在庫アプリは stores(id, slug, name) を読みます。列を消す・改名すると全画面が出なくなります。
-- 変更したら inventory-app 側で npm run check:contract を回すこと。
-- 影響と手順: inventory-app/docs/RUNBOOK.md §5-1
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
-- ★在庫管理アプリ(inventory-app)が依存しています★
-- 在庫アプリは users(id, name, role, store_id) を読みます。列を消す・改名すると記録が一切できなくなります。
-- 変更したら inventory-app 側で npm run check:contract を回すこと。
-- 影響と手順: inventory-app/docs/RUNBOOK.md §5-1
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
-- ★在庫管理アプリ(inventory-app)が依存しています★
-- この直後のRLSヘルパー4関数は在庫アプリのポリシーでも使われます。★PUBLIC実行権限をrevokeすると両アプリの全ポリシー評価が落ちます★
-- 変更したら inventory-app 側で npm run check:contract を回すこと。
-- 影響と手順: inventory-app/docs/RUNBOOK.md §5-1
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
-- ★在庫管理アプリ(inventory-app)が依存しています★
-- 在庫アプリのログインもこの関数を呼びます。★戻り値の store_id を落とすと全員ログイン不可になります★
-- 変更したら inventory-app 側で npm run check:contract を回すこと。
-- 影響と手順: inventory-app/docs/RUNBOOK.md §5-1
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
-- ★在庫管理アプリ(inventory-app)が依存しています★
-- 在庫アプリのログイン画面もこの関数を呼びます。★消す・改名すると全員ログイン不可になります★
-- 変更したら inventory-app 側で npm run check:contract を回すこと。
-- 影響と手順: inventory-app/docs/RUNBOOK.md §5-1
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

-- 店舗ログイン画面から1タップで見られる、ログイン不要のシフト閲覧用RPC。
-- コメント欄は含めない（私的なメモが不特定多数に見えるのを避けるため）。
-- 直接のテーブルアクセスは引き続きRLSでブロックされたまま。
create or replace function public.get_public_shifts(p_store_slug text, p_start date, p_end date)
returns table(
  id uuid,
  user_id uuid,
  date date,
  shift_type text,
  start_time text,
  end_time text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.user_id, s.date, s.shift_type, s.start_time, s.end_time, s.status
  from public.shifts s
  join public.stores st on st.id = s.store_id
  where st.slug = p_store_slug
    and s.date between p_start and p_end;
$$;

grant execute on function public.get_public_shifts(text, date, date) to anon, authenticated;

-- 公開シフト表に表示する日付ごとのメモ。app_settings の memo_YYYY-MM-DD だけを
-- 指定店舗・指定期間に限って返す（提出期間・時給など他のキーは返さない）。
--
-- ★Ver.2.3.0 の「メモは公開しない」という判断を Ver.2.6.0 で意図的に覆している★
-- URLを知っていれば誰でもメモを読めるため、メモに個人的な内容を書かない運用が前提。
-- シフトの comment 列は従来どおり公開しない（こちらは方針を変えていない）。
--
-- key の日付部分は date にキャストしない。不正なキーが紛れ込むとキャスト例外で
-- クエリ全体が落ちるうえ、WHERE句の評価順序は保証されないため「正規表現で弾いてから
-- キャスト」も安全とは言い切れない。'YYYY-MM-DD' は辞書順と日付順が一致するので
-- 文字列のまま範囲比較する。
create or replace function public.get_public_memos(p_store_slug text, p_start date, p_end date)
returns table(
  memo_date text,
  memo text
)
language sql
security definer
set search_path = public
as $$
  select substring(a.key from 6) as memo_date, a.value as memo
  from public.app_settings a
  join public.stores st on st.id = a.store_id
  where st.slug = p_store_slug
    and a.key ~ '^memo_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and a.value <> ''
    and substring(a.key from 6)
        between to_char(p_start, 'YYYY-MM-DD') and to_char(p_end, 'YYYY-MM-DD');
$$;

grant execute on function public.get_public_memos(text, date, date) to anon, authenticated;

-- ============================================================
-- 要望の送信機能（feedback テーブル）
--
-- 「スタッフ→店舗管理者」「スタッフ→開発者（GitHub Issue）」の2つの宛先を1つの
-- テーブルでまかなう。store_id は本部管理者(hq_admin)が所属店舗を持たないため
-- nullable にする。「管理者へ」宛て(destination='store')は届け先の店舗が特定
-- できないと意味を成さないため、destination='dev' の場合のみ store_id を
-- null で許容するCHECK制約を付ける。
-- ============================================================
create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references public.stores(id),          -- 本部管理者は所属店舗が無いので nullable
  user_id uuid not null references public.users(id) on delete cascade,
  destination text not null check (destination in ('store', 'dev')),
  category text not null check (category in ('request', 'bug')),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'read', 'done')),
  app_version text default '',
  github_issue_number integer,
  created_at timestamptz default now(),
  -- 「管理者へ」宛ては届け先の店舗が無いと成立しないため、destinationが'dev'の
  -- ときだけstore_idのnullを許容する（'store'ならstore_idは必須）
  constraint feedback_store_id_required check (destination = 'dev' or store_id is not null)
);

-- 管理画面の「自店の未読件数」集計、ユーザー本人の投稿履歴表示・レート制限集計で使う
create index if not exists feedback_store_id_status_idx on public.feedback(store_id, status);
create index if not exists feedback_user_id_created_at_idx on public.feedback(user_id, created_at);

-- ============================================================
-- feedback.store_id を強制導出するトリガー
--
-- shifts.store_id と同じ考え方: クライアントがstore_idを自由に指定できると、
-- 「本来は自店宛てのつもりが他店のstore_idを指定して送る」なりすましが可能になる。
-- そこでstore_idは常にuser_idからusers.store_idを引いて上書きし、
-- クライアントが送った値を構造的に無視する。
--
-- users テーブルの行可視性はRLSで店舗ごとに絞られているため、呼び出し元の
-- 権限に関わらず users.store_id を正しく引けるよう SECURITY DEFINER にする。
-- トリガー関数は「トリガーとして発火する」以外の呼び出し方法がなく、発火自体も
-- この関数へのEXECUTE権限の有無とは無関係に行われるため、EXECUTE権限は
-- 誰にも与えない（docs/SECURITY.mdの「SECURITY DEFINER関数の権限は絞る」方針）。
-- ============================================================
create or replace function public.set_feedback_store_id()
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

revoke execute on function public.set_feedback_store_id() from public, anon, authenticated;

drop trigger if exists feedback_set_store_id on public.feedback;
create trigger feedback_set_store_id
  before insert on public.feedback
  for each row execute function public.set_feedback_store_id();

-- ============================================================
-- RLS: 書き込みは全て /api/feedback（service role）経由に限定する
-- （usersテーブルと同じ「書込みはAPIに寄せる」ハードニング方針）。
-- SELECTポリシーのみ定義する。
--
-- 可視性:
--   - 本人が出したもの: user_id = jwt_user_id()
--   - 本部管理者: is_hq_admin()
--   - 店舗管理者: 自店に届いた「管理者へ」宛てのみ
--     (jwt_app_role() = 'admin' and store_id = jwt_store_id() and destination = 'store')
-- ★スタッフが他のスタッフの要望を読めてはいけない★（個人的な内容を含みうるため）。
-- 上記の3条件はいずれも「本人」か「管理者」に限られており、一般スタッフが
-- 他人の行にマッチする条件は存在しない
-- ============================================================
alter table public.feedback enable row level security;

drop policy if exists "feedback_select" on public.feedback;

create policy "feedback_select" on public.feedback
  for select
  using (
    user_id = public.jwt_user_id()
    or public.is_hq_admin()
    or (public.jwt_app_role() = 'admin' and store_id = public.jwt_store_id() and destination = 'store')
  );

-- Supabaseプロジェクトのdefault privilegesにより、新規テーブルは既定でanon/authenticatedに
-- 広い権限が付く（stores/users等でも同様の理由で明示revokeしている）。
-- ★ここでは `grant ... on all tables in schema public` や `alter default privileges` は
-- 絶対に使わない（在庫管理アプリと共有のDBのため、両アプリの全テーブルに波及する）★
-- 個別テーブル指定のgrant/revokeのみで完結させる。
-- PUBLICへの暗黙付与も明示的にrevokeする（ロール個別のrevokeでは取り消せないため）。
-- 経緯は docs/SECURITY.md 参照
revoke all on public.feedback from public;
revoke all on public.feedback from anon;
revoke insert, update, delete on public.feedback from authenticated;
grant select on public.feedback to authenticated;

-- 未読バッジのリアルタイム更新用（shift_requestsと同じ扱い）
alter publication supabase_realtime add table public.feedback;

-- ============================================================================
-- 操作の記録（監査ログ）  2026-08-31 追加
-- 経緯と設計判断は docs/SECURITY.md「操作の記録（監査ログ）」を参照。
-- ★外部キー制約を意図的に付けていない（他のデータが消えても記録を残すため）
-- ★書込みポリシーを意図的に作っていない（追記専用にするため）
-- ============================================================================

create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  store_id uuid,                    -- 参照制約なし。店舗が消えても記録は残す
  actor_id uuid,                    -- 同上。実行者が削除されても記録は残す
  actor_name text not null,         -- 実行時点の氏名スナップショット
  actor_role text not null,
  action text not null,
  target_type text,
  target_id uuid,
  target_name text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_store_created_idx
  on public.audit_logs (store_id, created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select" on public.audit_logs
  for select to anon, authenticated
  using (
    public.is_hq_admin()
    or (public.jwt_app_role() = 'admin' and store_id = public.jwt_store_id())
  );

-- 書込みポリシーは作らない。RLS有効かつポリシー不在＝誰にも許可されない状態にして、
-- トリガー（security definer）と service_role だけが記録を作れるようにする。

-- シフトの確定・時刻変更・削除を記録するトリガー。
-- 定義本体は supabase/migrations/2026-08-31_audit_log.sql を参照
-- （log_shift_change() と shifts_audit トリガー）。
