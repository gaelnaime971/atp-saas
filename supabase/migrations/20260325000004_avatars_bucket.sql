-- Storage bucket for profile avatars
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

create policy "Auth users can upload avatars" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "Auth users can update own avatar" on storage.objects
  for update using (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "Public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');
