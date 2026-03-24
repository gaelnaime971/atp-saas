-- ATP Dashboard Coaching - Database Schema
-- Run this in your Supabase SQL editor

-- profiles (extends auth.users)
create table profiles (
  id uuid references auth.users primary key,
  role text check (role in ('admin', 'trader')) not null default 'trader',
  full_name text,
  email text,
  avatar_url text,
  plan_type text, -- '1:1', 'group'
  propfirm_name text,
  created_at timestamptz default now()
);

-- invitations
create table invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references profiles(id),
  full_name text,
  plan_type text,
  propfirm_name text,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz default now()
);

-- trading_sessions
create table trading_sessions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references profiles(id) on delete cascade,
  session_date date not null,
  pnl numeric(10,2) default 0,
  result text check (result in ('win', 'loss', 'breakeven')),
  trades_count int default 0,
  instrument text,
  setup text,
  notes text,
  created_at timestamptz default now()
);

-- coaching_sessions
create table coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes int default 60,
  notes text,
  status text check (status in ('planned', 'completed', 'cancelled')) default 'planned',
  created_at timestamptz default now()
);

-- revenues
create table revenues (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references profiles(id),
  amount numeric(10,2) not null,
  description text,
  payment_date date not null,
  created_at timestamptz default now()
);

-- resources
create table resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text check (type in ('video', 'pdf', 'doc')) not null,
  url text,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- journal_entries
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references profiles(id) on delete cascade,
  entry_date date not null,
  content text,
  mood text check (mood in ('great', 'good', 'neutral', 'bad')),
  created_at timestamptz default now()
);

-- objectives
create table objectives (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references profiles(id) on delete cascade,
  title text not null,
  progress int default 0 check (progress between 0 and 100),
  created_at timestamptz default now()
);

-- Enable RLS
alter table profiles enable row level security;
alter table invitations enable row level security;
alter table trading_sessions enable row level security;
alter table coaching_sessions enable row level security;
alter table revenues enable row level security;
alter table resources enable row level security;
alter table journal_entries enable row level security;
alter table objectives enable row level security;

-- RLS policies
create policy "users can view own profile" on profiles for select using (auth.uid() = id);
create policy "users can update own profile" on profiles for update using (auth.uid() = id);

create policy "admin can view all profiles" on profiles for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "traders can view own sessions" on trading_sessions for all using (trader_id = auth.uid());
create policy "admin can view all sessions" on trading_sessions for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "traders can manage own coaching sessions" on coaching_sessions for select using (trader_id = auth.uid());
create policy "admin can manage all coaching sessions" on coaching_sessions for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "admin can manage revenues" on revenues for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "traders can view own revenues" on revenues for select using (trader_id = auth.uid());

create policy "traders own journal" on journal_entries for all using (trader_id = auth.uid());

create policy "resources visible to all authenticated" on resources for select using (auth.uid() is not null);
create policy "admin manages resources" on resources for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "traders can view own objectives" on objectives for all using (trader_id = auth.uid());
create policy "admin can manage all objectives" on objectives for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "admin can manage invitations" on invitations for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Function to create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'trader')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
