-- Notebook pages for trader note-taking (Notion-like)
create table if not exists public.notebook_pages (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid references auth.users(id) on delete cascade not null,
  title text not null default '',
  icon text not null default '📝',
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.notebook_pages enable row level security;

create policy "Users can view own notebook pages"
  on public.notebook_pages for select
  using (auth.uid() = trader_id);

create policy "Users can insert own notebook pages"
  on public.notebook_pages for insert
  with check (auth.uid() = trader_id);

create policy "Users can update own notebook pages"
  on public.notebook_pages for update
  using (auth.uid() = trader_id);

create policy "Users can delete own notebook pages"
  on public.notebook_pages for delete
  using (auth.uid() = trader_id);

-- Indexes
create index idx_notebook_pages_trader_id on public.notebook_pages(trader_id);
create index idx_notebook_pages_updated_at on public.notebook_pages(updated_at);
