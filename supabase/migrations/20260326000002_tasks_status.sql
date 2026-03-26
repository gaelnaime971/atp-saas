-- Add status column to admin_tasks (todo, in_progress, done)
alter table public.admin_tasks add column if not exists status text not null default 'todo';

-- Migrate existing data: done=true -> 'done', done=false -> 'todo'
update public.admin_tasks set status = 'done' where done = true;
update public.admin_tasks set status = 'todo' where done = false;
