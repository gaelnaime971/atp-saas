-- Allow authenticated users to see admin profiles (needed for chat)
create policy "authenticated users can view admin profiles" on profiles
  for select using (role = 'admin' and auth.uid() is not null);
