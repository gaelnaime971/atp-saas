-- App-wide settings (key-value store)
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;

-- Everyone can read settings
create policy "app_settings_select" on public.app_settings
  for select using (true);

-- Only admins can write
create policy "app_settings_admin_insert" on public.app_settings
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "app_settings_admin_update" on public.app_settings
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Seed with default Calendly URL
insert into public.app_settings (key, value) values
  ('calendly_url', 'https://calendly.com/gael-n971/60min'),
  ('tva_rate', '20'),
  ('company_name', 'Omega Investment'),
  ('company_address', '316 route de Néron, 97160 Le Moule, Guadeloupe'),
  ('company_siren', '919495424')
on conflict (key) do nothing;
