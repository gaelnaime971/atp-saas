-- Backtest entries table for ATP setup tracking
create table if not exists public.backtests (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  date date not null,
  instrument text not null,
  direction text not null check (direction in ('LONG', 'SHORT')),
  setup_types text[] not null default '{}',
  signals text[] not null default '{}',
  has_confluence boolean not null default false,
  points numeric not null default 0,
  sl_points numeric not null default 0,
  r_result numeric not null default 0,
  result text not null check (result in ('win', 'loss', 'be')),
  notes text,
  image_url text
);

-- RLS
alter table public.backtests enable row level security;

create policy "Users can view own backtests"
  on public.backtests for select
  using (auth.uid() = trader_id);

create policy "Users can insert own backtests"
  on public.backtests for insert
  with check (auth.uid() = trader_id);

create policy "Users can update own backtests"
  on public.backtests for update
  using (auth.uid() = trader_id);

create policy "Users can delete own backtests"
  on public.backtests for delete
  using (auth.uid() = trader_id);

-- Index for fast lookups
create index idx_backtests_trader_id on public.backtests(trader_id);
create index idx_backtests_date on public.backtests(date);
