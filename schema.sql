-- =============================================================================
-- Velour v2 — Database Schema
-- Run this in Supabase SQL Editor (Database → SQL Editor → New Query)
-- =============================================================================

-- Ensure public schema exists
create schema if not exists public;

-- Grant schema access to Supabase roles
-- (needed when creating the schema manually — Supabase doesn't auto-grant on manually created schemas)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to anon, authenticated;

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================================
-- TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- One row per auth.users user. Fans and creators both live here.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique not null,
  display_name    text,
  avatar_url      text,
  bio             text,
  email           text unique,          -- optional, attached later for recovery
  role            text not null default 'fan'
                  check (role in ('fan', 'creator', 'admin')),
  is_banned       boolean not null default false,
  last_seen_at    timestamptz,          -- updated on page focus; drives "last seen" in chat
  created_at      timestamptz not null default now()
);

comment on table public.profiles is 'Public user profiles — fans, creators, and admins.';
comment on column public.profiles.email is 'Optional. Attached later for account recovery. Never shown on signup.';
comment on column public.profiles.last_seen_at is 'Updated by client on page focus. Powers "last seen X ago" in chat headers.';

-- ---------------------------------------------------------------------------
-- creator_profiles
-- A creator account can have multiple creator profiles (personas/brands).
-- ---------------------------------------------------------------------------
create table public.creator_profiles (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  display_name    text not null,
  bio             text,
  avatar_url      text,
  cover_url       text,
  category        text,
  tags            text[] default '{}',
  is_verified     boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.creator_profiles is 'Creator personas. One owner (profiles row with role=creator) can have many.';

-- ---------------------------------------------------------------------------
-- stories
-- Only creators can create stories.
-- ---------------------------------------------------------------------------
create table public.stories (
  id              uuid primary key default uuid_generate_v4(),
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  media_url       text not null,
  thumbnail_url   text,
  media_type      text not null check (media_type in ('image', 'video')),
  caption         text,
  published_at    timestamptz not null default now(),
  expires_at      timestamptz,          -- null = never expires
  view_count      integer not null default 0
);

comment on table public.stories is 'Creator-only stories. Fans can view but not create.';

-- ---------------------------------------------------------------------------
-- story_reactions
-- Viewer reactions on stories. Strictly visible only to creator and reactor.
-- ---------------------------------------------------------------------------
create table public.story_reactions (
  id              uuid primary key default uuid_generate_v4(),
  story_id        uuid not null references public.stories(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reaction_type   text not null default 'love',
  created_at      timestamptz not null default now(),
  unique (story_id, user_id, reaction_type)
);

comment on table public.story_reactions is 'Viewer reactions on stories. Strictly visible only to the story creator and the reacting user.';

-- ---------------------------------------------------------------------------
-- conversations
-- 1-to-1 between a fan (profiles row) and a creator_profile.
-- Unique constraint ensures exactly one conversation per pair.
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                  uuid primary key default uuid_generate_v4(),
  fan_id              uuid not null references public.profiles(id) on delete cascade,
  creator_profile_id  uuid not null references public.creator_profiles(id) on delete cascade,
  fan_unread          integer not null default 0,
  creator_unread      integer not null default 0,
  last_message_at     timestamptz,
  created_at          timestamptz not null default now(),
  unique (fan_id, creator_profile_id)
);

comment on table public.conversations is '1-to-1 chat between a fan and a creator profile.';

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id                uuid primary key default uuid_generate_v4(),
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  sender_id         uuid not null references public.profiles(id) on delete cascade,
  sender_type       text not null check (sender_type in ('fan', 'creator')),
  content           text,               -- null for attachment-only messages
  message_type      text not null default 'text'
                    check (message_type in ('text', 'attachment', 'voice_note', 'system')),
  reply_to_id       uuid references public.messages(id) on delete set null,
  reactions         jsonb not null default '{}', -- {"emoji": ["userId1", "userId2"]}
  is_deleted        boolean not null default false,
  deleted_at        timestamptz,
  edited_at         timestamptz,
  status            text not null default 'sent'
                    check (status in ('sent', 'delivered', 'read')),
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);

comment on table public.messages is 'Chat messages within a conversation.';
comment on column public.messages.reactions is 'JSONB map of emoji to array of user IDs who reacted.';
comment on column public.messages.status is 'sent=stored, delivered=received by client, read=opened by recipient.';

-- ---------------------------------------------------------------------------
-- message_attachments
-- One message can have multiple attachments (for batch sends).
-- ---------------------------------------------------------------------------
create table public.message_attachments (
  id              uuid primary key default uuid_generate_v4(),
  message_id      uuid not null references public.messages(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  storage_path    text not null,        -- Supabase Storage path
  public_url      text,                 -- for non-locked files
  thumbnail_url   text,
  mime_type       text not null,
  file_name       text,
  file_size       bigint,
  duration_secs   numeric,              -- for audio/video
  is_locked       boolean not null default false,
  unlock_price_usd integer,             -- whole-dollar price; null if not locked
  batch_id        uuid,                 -- groups files locked together as a set
  created_at      timestamptz not null default now()
);

comment on table public.message_attachments is 'Files attached to messages. Locked files require payment to view.';
comment on column public.message_attachments.unlock_price_usd is 'Price in whole USD dollars. Null if free.';
comment on column public.message_attachments.batch_id is 'UUID shared by attachments sold as a batch. All-or-nothing unlock.';

-- ---------------------------------------------------------------------------
-- attachment_unlocks
-- Records fan payments to unlock locked content.
-- ---------------------------------------------------------------------------
create table public.attachment_unlocks (
  id              uuid primary key default uuid_generate_v4(),
  attachment_id   uuid not null references public.message_attachments(id) on delete cascade,
  fan_id          uuid not null references public.profiles(id) on delete cascade,
  amount_usd      integer not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'verified', 'rejected')),
  unlocked_at     timestamptz not null default now(),
  unique (attachment_id, fan_id)
);

comment on table public.attachment_unlocks is 'Tracks fan payments to unlock locked attachments. Verified by admin.';

-- ---------------------------------------------------------------------------
-- user_balances
-- Creator-only. Tracks total USD earned from verified unlocks.
-- Fans do not have rows here — they pay on-demand.
-- ---------------------------------------------------------------------------
create table public.user_balances (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  total_earned    integer not null default 0,
  updated_at      timestamptz not null default now()
);

comment on table public.user_balances is 'Creator earnings ledger. Fans do not have a row here.';

-- ---------------------------------------------------------------------------
-- transactions_ledger
-- Immutable audit log of all financial activity.
-- ---------------------------------------------------------------------------
create table public.transactions_ledger (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  type            text not null
                  check (type in ('attachment_unlock', 'stars_earned', 'withdrawal_request')),
  amount_usd      integer not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'verified', 'rejected')),
  attachment_id   uuid references public.message_attachments(id) on delete set null,
  reference       text,                 -- gift card PIN or crypto txn hash
  description     text,
  created_at      timestamptz not null default now()
);

comment on table public.transactions_ledger is 'Audit log of all financial activity. Never update rows, only insert.';

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ai_sidebar_sessions
-- ---------------------------------------------------------------------------
create table public.ai_sidebar_sessions (
  id                  uuid primary key default uuid_generate_v4(),
  creator_profile_id  uuid not null references public.creator_profiles(id) on delete cascade,
  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  messages            jsonb not null default '[]',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (creator_profile_id, conversation_id)
);

comment on table public.ai_sidebar_sessions is 'Persists AI sidebar chat history per conversation.';

-- =============================================================================
-- INDEXES
-- =============================================================================

create index idx_messages_conversation_id         on public.messages(conversation_id, created_at desc);
create index idx_messages_sender_id               on public.messages(sender_id);
create index idx_messages_status                  on public.messages(status) where status != 'read';
create index idx_message_attachments_message_id   on public.message_attachments(message_id);
create index idx_message_attachments_batch_id     on public.message_attachments(batch_id) where batch_id is not null;
create index idx_attachment_unlocks_fan_id        on public.attachment_unlocks(fan_id);
create index idx_attachment_unlocks_attachment_id on public.attachment_unlocks(attachment_id);
create index idx_conversations_fan_id             on public.conversations(fan_id);
create index idx_conversations_creator_profile_id on public.conversations(creator_profile_id);
create index idx_conversations_last_message_at    on public.conversations(last_message_at desc);
create index idx_creator_profiles_owner_id        on public.creator_profiles(owner_id);
create index idx_stories_creator_profile_id       on public.stories(creator_profile_id, published_at desc);
create index idx_story_reactions_story_id         on public.story_reactions(story_id);
create index idx_story_reactions_user_story        on public.story_reactions(user_id, story_id);
create index idx_transactions_user_id             on public.transactions_ledger(user_id, created_at desc);
create index idx_push_subscriptions_user_id       on public.push_subscriptions(user_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles               enable row level security;
alter table public.creator_profiles       enable row level security;
alter table public.stories                enable row level security;
alter table public.story_reactions        enable row level security;
alter table public.conversations          enable row level security;
alter table public.messages               enable row level security;
alter table public.message_attachments    enable row level security;
alter table public.attachment_unlocks     enable row level security;
alter table public.user_balances          enable row level security;
alter table public.transactions_ledger    enable row level security;
alter table public.push_subscriptions     enable row level security;
alter table public.ai_sidebar_sessions    enable row level security;

-- Helpers
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---- profiles ----
create policy "Anyone can read profiles"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "Users can update their own profile"
  on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Admin can update any profile"
  on public.profiles for update using (public.is_admin());

-- ---- creator_profiles ----
create policy "Anyone can read active creator profiles"
  on public.creator_profiles for select using (is_active = true);

create policy "Creator can read all their own profiles"
  on public.creator_profiles for select using (owner_id = auth.uid());

create policy "Creator can insert their own profiles"
  on public.creator_profiles for insert
  with check (owner_id = auth.uid() and public.get_my_role() = 'creator');

create policy "Creator can update their own profiles"
  on public.creator_profiles for update using (owner_id = auth.uid());

create policy "Admin can do anything on creator_profiles"
  on public.creator_profiles for all using (public.is_admin());

-- ---- stories ----
create policy "Anyone can read stories"
  on public.stories for select using (true);

create policy "Creator can insert stories for their own profiles"
  on public.stories for insert
  with check (
    exists (select 1 from public.creator_profiles cp where cp.id = creator_profile_id and cp.owner_id = auth.uid())
    and public.get_my_role() = 'creator'
  );

create policy "Creator can update their own stories"
  on public.stories for update
  using (exists (select 1 from public.creator_profiles cp where cp.id = creator_profile_id and cp.owner_id = auth.uid()));

create policy "Creator can delete their own stories"
  on public.stories for delete
  using (exists (select 1 from public.creator_profiles cp where cp.id = creator_profile_id and cp.owner_id = auth.uid()));

-- ---- story_reactions ----
-- Story reactions are strictly visible ONLY to the creator of the story and the user who reacted
create policy "Story creator and reacting user only can view reactions"
  on public.story_reactions for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.stories s
      join public.creator_profiles cp on cp.id = s.creator_profile_id
      where s.id = story_reactions.story_id
        and cp.owner_id = auth.uid()
    )
  );

create policy "Users can insert their own story reactions"
  on public.story_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own story reactions"
  on public.story_reactions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own story reactions"
  on public.story_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---- conversations ----
create policy "Fan can see their conversations"
  on public.conversations for select using (fan_id = auth.uid());

create policy "Creator can see conversations for their profiles"
  on public.conversations for select
  using (exists (select 1 from public.creator_profiles cp where cp.id = creator_profile_id and cp.owner_id = auth.uid()));

create policy "Fan can create a conversation"
  on public.conversations for insert with check (fan_id = auth.uid());

create policy "Admin can read all conversations"
  on public.conversations for select using (public.is_admin());

-- ---- messages ----
create policy "Participants can read messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and (
        c.fan_id = auth.uid()
        or exists (select 1 from public.creator_profiles cp where cp.id = c.creator_profile_id and cp.owner_id = auth.uid())
      )
    )
  );

create policy "Participants can insert messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and (
        c.fan_id = auth.uid()
        or exists (select 1 from public.creator_profiles cp where cp.id = c.creator_profile_id and cp.owner_id = auth.uid())
      )
    )
  );

create policy "Sender can update own messages"
  on public.messages for update using (sender_id = auth.uid());

create policy "Admin can read all messages"
  on public.messages for select using (public.is_admin());

-- ---- message_attachments ----
create policy "Participants can read attachments"
  on public.message_attachments for select
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and (
        c.fan_id = auth.uid()
        or exists (select 1 from public.creator_profiles cp where cp.id = c.creator_profile_id and cp.owner_id = auth.uid())
      )
    )
  );

create policy "Creator can insert attachments"
  on public.message_attachments for insert with check (sender_id = auth.uid());

-- ---- attachment_unlocks ----
create policy "Fan can read their own unlocks"
  on public.attachment_unlocks for select using (fan_id = auth.uid());

create policy "Creator can see unlocks for their content"
  on public.attachment_unlocks for select
  using (
    exists (
      select 1 from public.message_attachments ma
      join public.conversations c on c.id = ma.conversation_id
      join public.creator_profiles cp on cp.id = c.creator_profile_id
      where ma.id = attachment_id and cp.owner_id = auth.uid()
    )
  );

create policy "Fan can insert unlock"
  on public.attachment_unlocks for insert with check (fan_id = auth.uid());

create policy "Admin can manage all unlocks"
  on public.attachment_unlocks for all using (public.is_admin());

-- ---- user_balances ----
create policy "Creator can read own balance"
  on public.user_balances for select using (user_id = auth.uid());

create policy "Admin can read all balances"
  on public.user_balances for select using (public.is_admin());

-- ---- transactions_ledger ----
create policy "User can read own transactions"
  on public.transactions_ledger for select using (user_id = auth.uid());

create policy "User can insert own transactions"
  on public.transactions_ledger for insert with check (user_id = auth.uid());

create policy "Admin can manage all transactions"
  on public.transactions_ledger for all using (public.is_admin());

-- ---- push_subscriptions ----
create policy "User manages own push subscriptions"
  on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- ai_sidebar_sessions ----
create policy "Creator can manage their AI sessions"
  on public.ai_sidebar_sessions for all
  using (
    exists (select 1 from public.creator_profiles cp where cp.id = creator_profile_id and cp.owner_id = auth.uid())
  );

-- =============================================================================
-- TRIGGERS & RPCs
-- =============================================================================

-- Auto-create profiles row on auth signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'username'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- submit_unlock_payment
create or replace function public.submit_unlock_payment(
  p_fan_id        uuid,
  p_attachment_id uuid,
  p_amount_usd    integer,
  p_method        text,
  p_reference     text
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_batch_id       uuid;
  v_attachment     record;
begin
  if p_fan_id != auth.uid() then raise exception 'Unauthorized'; end if;

  select * into v_attachment from public.message_attachments where id = p_attachment_id;
  if not found then raise exception 'Attachment not found'; end if;
  if not v_attachment.is_locked then raise exception 'Attachment is not locked'; end if;

  if exists (
    select 1 from public.attachment_unlocks
    where attachment_id = p_attachment_id and fan_id = p_fan_id and status = 'verified'
  ) then raise exception 'Already unlocked'; end if;

  insert into public.transactions_ledger (user_id, type, amount_usd, status, attachment_id, reference, description)
  values (p_fan_id, 'attachment_unlock', p_amount_usd, 'pending', p_attachment_id,
          p_reference, 'Unlock payment via ' || p_method)
  returning id into v_transaction_id;

  v_batch_id := v_attachment.batch_id;

  if v_batch_id is not null then
    insert into public.attachment_unlocks (attachment_id, fan_id, amount_usd, status)
    select id, p_fan_id, 0, 'pending'
    from public.message_attachments where batch_id = v_batch_id
    on conflict (attachment_id, fan_id) do nothing;
    update public.attachment_unlocks
    set amount_usd = p_amount_usd
    where attachment_id = p_attachment_id and fan_id = p_fan_id;
  else
    insert into public.attachment_unlocks (attachment_id, fan_id, amount_usd, status)
    values (p_attachment_id, p_fan_id, p_amount_usd, 'pending')
    on conflict (attachment_id, fan_id) do update set status = 'pending';
  end if;

  return v_transaction_id;
end;
$$;

-- verify_unlock
create or replace function public.verify_unlock(
  p_transaction_id uuid,
  p_admin_id       uuid
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_tx         record;
  v_batch_id   uuid;
  v_creator_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'Unauthorized';
  end if;

  select * into v_tx from public.transactions_ledger where id = p_transaction_id and status = 'pending';
  if not found then raise exception 'Transaction not found or already processed'; end if;

  update public.transactions_ledger set status = 'verified' where id = p_transaction_id;

  select batch_id into v_batch_id from public.message_attachments where id = v_tx.attachment_id;

  if v_batch_id is not null then
    update public.attachment_unlocks set status = 'verified'
    where fan_id = v_tx.user_id
    and attachment_id in (select id from public.message_attachments where batch_id = v_batch_id);
  else
    update public.attachment_unlocks set status = 'verified'
    where attachment_id = v_tx.attachment_id and fan_id = v_tx.user_id;
  end if;

  select cp.owner_id into v_creator_id
  from public.message_attachments ma
  join public.conversations c on c.id = ma.conversation_id
  join public.creator_profiles cp on cp.id = c.creator_profile_id
  where ma.id = v_tx.attachment_id;

  if v_creator_id is not null then
    insert into public.user_balances (user_id, total_earned)
    values (v_creator_id, v_tx.amount_usd)
    on conflict (user_id)
    do update set total_earned = public.user_balances.total_earned + v_tx.amount_usd, updated_at = now();

    insert into public.transactions_ledger (user_id, type, amount_usd, status, attachment_id, description)
    values (v_creator_id, 'stars_earned', v_tx.amount_usd, 'verified', v_tx.attachment_id, 'Earned from locked content unlock');
  end if;
end;
$$;

-- promote_to_creator
create or replace function public.promote_to_creator(p_user_id uuid, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_username text;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'Unauthorized';
  end if;
  select username into v_username from public.profiles where id = p_user_id;
  update public.profiles set role = 'creator' where id = p_user_id;
  if not exists (select 1 from public.creator_profiles where owner_id = p_user_id) then
    insert into public.creator_profiles (owner_id, display_name) values (p_user_id, v_username);
    insert into public.user_balances (user_id) values (p_user_id) on conflict do nothing;
  end if;
end;
$$;

-- demote_from_creator
create or replace function public.demote_from_creator(p_user_id uuid, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'Unauthorized';
  end if;
  update public.profiles set role = 'fan' where id = p_user_id;
  update public.creator_profiles set is_active = false where owner_id = p_user_id;
end;
$$;

-- mark_delivered
create or replace function public.mark_delivered(p_message_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.messages set status = 'delivered' where id = p_message_id and status = 'sent';
end;
$$;

-- mark_read
create or replace function public.mark_read(p_conversation_id uuid, p_reader_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_is_fan boolean;
begin
  select (fan_id = p_reader_id) into v_is_fan from public.conversations where id = p_conversation_id;
  if not found then return; end if;

  update public.messages
  set status = 'read', read_at = now()
  where conversation_id = p_conversation_id and status != 'read' and sender_id != p_reader_id;

  if v_is_fan then
    update public.conversations set fan_unread = 0 where id = p_conversation_id;
  else
    update public.conversations set creator_unread = 0 where id = p_conversation_id;
  end if;
end;
$$;

-- handle_new_message trigger
create or replace function public.handle_new_message()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  if new.sender_type = 'fan' then
    update public.conversations set creator_unread = creator_unread + 1 where id = new.conversation_id;
  else
    update public.conversations set fan_unread = fan_unread + 1 where id = new.conversation_id;
  end if;
  return new;
end;
$$;

create trigger on_new_message
  after insert on public.messages
  for each row execute procedure public.handle_new_message();

-- -----------------------------------------------------------------------------
-- increment_story_view
-- Atomically increments story view count across viewers, bypassing RLS
-- -----------------------------------------------------------------------------
create or replace function public.increment_story_view(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stories
  set view_count = coalesce(view_count, 0) + 1
  where id = p_story_id;
end;
$$;

grant execute on function public.increment_story_view(uuid) to anon, authenticated;

-- =============================================================================
-- STORAGE BUCKETS
-- Creates buckets by inserting into storage.buckets (Supabase internal table).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',      'avatars',      true,  5242880,   array['image/jpeg','image/png','image/webp','image/gif']),
  ('covers',       'covers',       true,  10485760,  array['image/jpeg','image/png','image/webp']),
  ('story-media',  'story-media',  true,  52428800,  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime']),
  ('attachments',  'attachments',  false, 104857600, null)
on conflict (id) do nothing;

-- Storage RLS policies

-- avatars: anyone can read, owner can upload/update/delete
create policy "Anyone can view avatars"
  on storage.objects for select using (bucket_id = 'avatars');

create policy "Authenticated users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Owner can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Owner can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- covers: same as avatars
create policy "Anyone can view covers"
  on storage.objects for select using (bucket_id = 'covers');

create policy "Authenticated users can upload covers"
  on storage.objects for insert
  with check (bucket_id = 'covers' and auth.role() = 'authenticated');

create policy "Owner can manage covers"
  on storage.objects for all
  using (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

-- story-media: public read, creators can upload
create policy "Anyone can view story media"
  on storage.objects for select using (bucket_id = 'story-media');

create policy "Creators can upload story media"
  on storage.objects for insert
  with check (bucket_id = 'story-media' and auth.role() = 'authenticated');

create policy "Creator can delete own story media"
  on storage.objects for delete
  using (bucket_id = 'story-media' and auth.uid()::text = (storage.foldername(name))[1]);

-- attachments: private — only conversation participants can access via signed URLs
create policy "Authenticated users can upload attachments"
  on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

create policy "Uploader can read their own attachments"
  on storage.objects for select
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Uploader can delete their own attachments"
  on storage.objects for delete
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
