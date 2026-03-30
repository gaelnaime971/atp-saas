-- Add is_active flag to profiles
alter table public.profiles add column if not exists is_active boolean not null default true;
