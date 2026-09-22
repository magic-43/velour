-- =============================================================================
-- Velour v2 — Chat migration (run in Supabase SQL Editor)
-- Adds last message denormalization + get_or_create_conversation + mark_all_delivered
-- =============================================================================

-- Add denormalized last-message preview to conversations
alter table public.conversations
  add column if not exists last_message_preview    text,
  add column if not exists last_message_sender_id  uuid references public.profiles(id) on delete set null;

-- Update handle_new_message trigger to also cache preview + sender
create or replace function public.handle_new_message()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.conversations
  set
    last_message_at         = new.created_at,
    last_message_preview    = case
                                when new.is_deleted then 'Message deleted'
                                when new.message_type = 'voice_note' then '🎤 Voice note'
                                when new.message_type = 'attachment' then '📎 Attachment'
                                else left(new.content, 100)
                              end,
    last_message_sender_id  = new.sender_id
  where id = new.conversation_id;

  if new.sender_type = 'fan' then
    update public.conversations set creator_unread = creator_unread + 1 where id = new.conversation_id;
  else
    update public.conversations set fan_unread = fan_unread + 1 where id = new.conversation_id;
  end if;

  return new;
end;
$$;

-- get_or_create_conversation — called when fan taps "Message" on creator, or creator taps "Message" on client
create or replace function public.get_or_create_conversation(
  p_creator_profile_id uuid,
  p_fan_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_fan_id uuid;
  v_creator_owner_id uuid;
begin
  select owner_id into v_creator_owner_id
  from public.creator_profiles
  where id = p_creator_profile_id;

  if v_creator_owner_id is null then
    raise exception 'Creator profile not found';
  end if;

  if p_fan_id is not null then
    -- Creator initiating chat with client
    if auth.uid() != v_creator_owner_id and not public.is_admin() then
      raise exception 'Only the creator profile owner or admin can initiate chat with a client';
    end if;
    v_fan_id := p_fan_id;
  else
    -- Fan initiating chat with creator
    if auth.uid() = v_creator_owner_id then
      raise exception 'Cannot start a conversation with your own profile';
    end if;
    v_fan_id := auth.uid();
  end if;

  select id into v_id
  from public.conversations
  where fan_id = v_fan_id and creator_profile_id = p_creator_profile_id;

  if not found then
    insert into public.conversations (fan_id, creator_profile_id)
    values (v_fan_id, p_creator_profile_id)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- mark_all_delivered — bulk-mark all 'sent' messages in a convo as 'delivered'
-- Called when recipient opens the conversation list or a chat window
create or replace function public.mark_all_delivered(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.messages
  set status = 'delivered'
  where conversation_id = p_conversation_id
    and status = 'sent'
    and sender_id != auth.uid();
end;
$$;

-- Grant execute on new functions
grant execute on function public.get_or_create_conversation(uuid, uuid) to authenticated;
grant execute on function public.get_or_create_conversation(uuid, uuid) to anon;
grant execute on function public.mark_all_delivered(uuid) to authenticated;

-- Backfill creator_profiles avatar from profiles
update public.creator_profiles cp
set avatar_url = p.avatar_url
from public.profiles p
where cp.owner_id = p.id
  and p.avatar_url is not null
  and (cp.avatar_url is null or cp.avatar_url = '');

-- Auto-sync avatar updates from profiles to creator_profiles
create or replace function public.sync_profile_avatar_to_creator()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.avatar_url is distinct from old.avatar_url then
    update public.creator_profiles
    set avatar_url = new.avatar_url
    where owner_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_sync_profile_avatar on public.profiles;
create trigger tr_sync_profile_avatar
  after update of avatar_url on public.profiles
  for each row
  execute function public.sync_profile_avatar_to_creator();

