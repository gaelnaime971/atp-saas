-- Individual trader accounts (prop firm or personal)
create table if not exists public.trader_accounts (
  id uuid default gen_random_uuid() primary key,
  trader_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default '',
  propfirm_name text,
  capital numeric not null default 0,
  initial_balance numeric not null default 0,
  account_type text not null default 'challenge',
  created_at timestamptz default now()
);

alter table public.trader_accounts enable row level security;

-- Traders can manage their own accounts
create policy "trader_accounts_select" on public.trader_accounts
  for select using (auth.uid() = trader_id);

create policy "trader_accounts_insert" on public.trader_accounts
  for insert with check (auth.uid() = trader_id);

create policy "trader_accounts_update" on public.trader_accounts
  for update using (auth.uid() = trader_id);

create policy "trader_accounts_delete" on public.trader_accounts
  for delete using (auth.uid() = trader_id);

-- Admins can read all accounts
create policy "trader_accounts_admin_select" on public.trader_accounts
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
