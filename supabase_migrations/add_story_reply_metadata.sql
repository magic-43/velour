-- Migration: add_story_reply_metadata.sql
-- Description: Adds metadata jsonb column to public.messages and updates
-- handle_new_message trigger to support rich story replies and media references.

-- 1. Add metadata jsonb column if it does not already exist
alter table public.messages
  add column if not exists metadata jsonb default '{}'::jsonb;

comment on column public.messages.metadata is 'Rich structured metadata such as story reply context, stickers, media attachments, or reactions.';

-- 2. Update handle_new_message() trigger to handle story replies cleanly in conversation preview
create or replace function public.handle_new_message()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_preview text;
begin
  if new.is_deleted then
    v_preview := 'Message deleted';
  elsif new.message_type = 'voice_note' then
    v_preview := '🎤 Voice note';
  elsif new.message_type = 'attachment' then
    v_preview := '📎 Attachment';
  elsif new.metadata is not null and new.metadata->>'type' = 'story_reply' then
    v_preview := '🔘 ' || coalesce(new.metadata->>'text', 'Story reply');
  else
    v_preview := left(new.content, 100);
  end if;

  update public.conversations
  set
    last_message_at         = new.created_at,
    last_message_preview    = v_preview,
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
