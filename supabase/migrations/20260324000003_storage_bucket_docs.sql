-- Create private storage bucket for documents
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false);

-- Admin can upload/update/delete files
create policy "admin can manage docs" on storage.objects
  for all using (
    bucket_id = 'docs' and public.is_admin()
  );

-- Authenticated users can read files
create policy "authenticated users can read docs" on storage.objects
  for select using (
    bucket_id = 'docs' and auth.uid() is not null
  );
