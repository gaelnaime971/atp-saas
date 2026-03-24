-- Add payment method and invoice fields to revenues
alter table revenues add column payment_method text check (payment_method in ('virement', 'stripe_comptant', 'stripe_2x', 'stripe_3x', 'stripe_4x')) default 'virement';
alter table revenues add column is_ttc boolean default true;
alter table revenues add column amount_ht numeric(10,2);
alter table revenues add column tva_amount numeric(10,2);
alter table revenues add column invoice_number int;
alter table revenues add column invoice_url text;

-- Sequence for invoice numbering starting at 548
create sequence invoice_number_seq start with 548;

-- Storage bucket for invoices
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false);

-- Admin can manage invoices
create policy "admin can manage invoices" on storage.objects
  for all using (bucket_id = 'invoices' and public.is_admin());

-- Authenticated users can read their own invoices
create policy "users can read invoices" on storage.objects
  for select using (bucket_id = 'invoices' and auth.uid() is not null);
