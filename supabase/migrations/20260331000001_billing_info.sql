-- Billing info on trader profiles
alter table public.profiles add column if not exists billing_company text;
alter table public.profiles add column if not exists billing_address text;
alter table public.profiles add column if not exists billing_siren text;
alter table public.profiles add column if not exists billing_vat text;
