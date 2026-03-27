-- Live trades shared by admin (tracked in R, not $)
create table if not exists public.live_trades (
  id uuid default gen_random_uuid() primary key,
  trade_date date not null default current_date,
  instrument text not null default 'ES',
  direction text not null default 'long',
  entry_price numeric,
  exit_price numeric,
  stop_loss numeric,
  r_result numeric not null default 0,
  points numeric,
  result text not null default 'win',
  setup_type text,
  notes text,
  created_at timestamptz default now()
);

alter table public.live_trades enable row level security;

-- Everyone can read (traders see shared trades)
create policy "live_trades_select" on public.live_trades
  for select using (true);

-- Only admins can write
create policy "live_trades_admin_insert" on public.live_trades
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "live_trades_admin_update" on public.live_trades
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "live_trades_admin_delete" on public.live_trades
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
