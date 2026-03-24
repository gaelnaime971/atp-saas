-- Fix recursive RLS policy on profiles
-- The original "admin can view all profiles" policy caused infinite recursion
-- because it queried profiles table while evaluating profiles RLS

-- Drop the recursive policy
drop policy if exists "admin can view all profiles" on profiles;

-- Create a security definer function that bypasses RLS to check admin role
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Recreate admin policy using the non-recursive function
create policy "admin can view all profiles" on profiles
  for all using (public.is_admin());

-- Also fix other tables that have the same recursive pattern
drop policy if exists "admin can view all sessions" on trading_sessions;
create policy "admin can view all sessions" on trading_sessions
  for all using (public.is_admin());

drop policy if exists "admin can manage all coaching sessions" on coaching_sessions;
create policy "admin can manage all coaching sessions" on coaching_sessions
  for all using (public.is_admin());

drop policy if exists "admin can manage revenues" on revenues;
create policy "admin can manage revenues" on revenues
  for all using (public.is_admin());

drop policy if exists "admin manages resources" on resources;
create policy "admin manages resources" on resources
  for all using (public.is_admin());

drop policy if exists "admin can manage all objectives" on objectives;
create policy "admin can manage all objectives" on objectives
  for all using (public.is_admin());

drop policy if exists "admin can manage invitations" on invitations;
create policy "admin can manage invitations" on invitations
  for all using (public.is_admin());
