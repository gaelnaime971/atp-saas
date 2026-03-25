-- Bilan de compétences: skill items (admin-managed) + trader progress

create table if not exists public.skill_items (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

alter table public.skill_items enable row level security;

-- Everyone can read skill items
create policy "skill_items_select" on public.skill_items
  for select using (true);

-- Only admins can insert/update/delete
create policy "skill_items_admin_insert" on public.skill_items
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "skill_items_admin_update" on public.skill_items
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "skill_items_admin_delete" on public.skill_items
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Trader progress on skill items
create table if not exists public.skill_progress (
  id uuid default gen_random_uuid() primary key,
  trader_id uuid not null references public.profiles(id) on delete cascade,
  skill_item_id uuid not null references public.skill_items(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  unique (trader_id, skill_item_id)
);

alter table public.skill_progress enable row level security;

-- Traders can read/write their own progress
create policy "skill_progress_select" on public.skill_progress
  for select using (auth.uid() = trader_id);

create policy "skill_progress_insert" on public.skill_progress
  for insert with check (auth.uid() = trader_id);

create policy "skill_progress_update" on public.skill_progress
  for update using (auth.uid() = trader_id);
