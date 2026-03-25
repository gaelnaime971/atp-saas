-- ============================================
-- Chat system: messages table + RLS + Storage
-- Run this in the Supabase SQL Editor
-- ============================================

-- Messages table
create table messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id) on delete cascade not null,
  receiver_id uuid references profiles(id) on delete cascade not null,
  content text,
  image_url text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Index for fetching conversation between two users
create index idx_messages_conversation on messages (
  least(sender_id, receiver_id),
  greatest(sender_id, receiver_id),
  created_at desc
);

-- Index for unread count
create index idx_messages_unread on messages (receiver_id, is_read) where is_read = false;

-- RLS
alter table messages enable row level security;

create policy "Users can read own messages" on messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages" on messages
  for insert with check (auth.uid() = sender_id);

create policy "Users can mark received messages read" on messages
  for update using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- Enable realtime
alter publication supabase_realtime add table messages;

-- Storage bucket for chat images
insert into storage.buckets (id, name, public) values ('chat-images', 'chat-images', true);

create policy "Auth users can upload chat images" on storage.objects
  for insert with check (bucket_id = 'chat-images' and auth.role() = 'authenticated');

create policy "Public read chat images" on storage.objects
  for select using (bucket_id = 'chat-images');
