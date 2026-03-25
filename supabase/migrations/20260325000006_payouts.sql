-- Payouts table for prop firm withdrawals
create table payouts (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references profiles(id) on delete cascade not null,
  amount numeric(10,2) not null,
  payout_date date not null,
  propfirm_name text,
  account_label text,
  notes text,
  created_at timestamptz default now()
);

create index idx_payouts_trader on payouts (trader_id, payout_date desc);

alter table payouts enable row level security;

create policy "traders can manage own payouts" on payouts
  for all using (trader_id = auth.uid());

create policy "admin can view all payouts" on payouts
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
