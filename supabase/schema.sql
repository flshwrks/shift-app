-- シフト管理アプリ Supabase スキーマ

-- ユーザーテーブル
create table if not exists public.users (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  pin_hash text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz default now()
);

-- シフトテーブル
create table if not exists public.shifts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  shift_type text not null check (shift_type in ('A','B','C','D','E','F','custom')),
  start_time text not null,
  end_time text not null,
  comment text default '',
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

-- アプリ設定テーブル
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- デフォルト設定を挿入
insert into public.app_settings (key, value)
values ('deadline', '')
on conflict (key) do nothing;

-- RLS を有効化（オープンポリシー: アプリ側で認証を管理）
alter table public.users enable row level security;
alter table public.shifts enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "allow_all_users" on public.users;
drop policy if exists "allow_all_shifts" on public.shifts;
drop policy if exists "allow_all_settings" on public.app_settings;

create policy "allow_all_users" on public.users for all using (true) with check (true);
create policy "allow_all_shifts" on public.shifts for all using (true) with check (true);
create policy "allow_all_settings" on public.app_settings for all using (true) with check (true);

-- リアルタイム設定
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
-- insert into public.users (name, pin_hash, role) values ('管理者', '<hash>', 'admin');
