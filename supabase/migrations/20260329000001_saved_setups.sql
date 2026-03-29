-- Saved trade setups (screenshot library)
create table if not exists public.saved_setups (
  id uuid default gen_random_uuid() primary key,
  trader_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  instrument text,
  description text,
  image_url text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

alter table public.saved_setups enable row level security;

create policy "saved_setups_select" on public.saved_setups
  for select using (auth.uid() = trader_id);

create policy "saved_setups_insert" on public.saved_setups
  for insert with check (auth.uid() = trader_id);

create policy "saved_setups_update" on public.saved_setups
  for update using (auth.uid() = trader_id);

create policy "saved_setups_delete" on public.saved_setups
  for delete using (auth.uid() = trader_id);
