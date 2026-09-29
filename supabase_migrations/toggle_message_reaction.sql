-- =============================================================================
-- Migration: toggle_message_reaction.sql
-- Description: RPC to atomically add/remove/switch emoji reactions on messages,
-- AND update conversation last_message_preview, last_message_at, and unread counts.
-- =============================================================================

create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_emoji text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_reactions jsonb;
  v_user_id text;
  v_convo_id uuid;
  v_content text;
  v_msg_type text;
  v_preview text;
  v_fan_id uuid;
  v_creator_owner_id uuid;
  k text;
  v_already_has_this boolean := false;
begin
  v_user_id := auth.uid()::text;
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select conversation_id, content, message_type, coalesce(reactions, '{}'::jsonb)
  into v_convo_id, v_content, v_msg_type, v_reactions
  from public.messages
  where id = p_message_id;

  if not found then
    raise exception 'Message not found';
  end if;

  -- Ensure caller is a participant in this conversation
  select c.fan_id, cp.owner_id
  into v_fan_id, v_creator_owner_id
  from public.conversations c
  join public.creator_profiles cp on cp.id = c.creator_profile_id
  where c.id = v_convo_id;

  if auth.uid() != v_fan_id and auth.uid() != v_creator_owner_id and not public.is_admin() then
    raise exception 'Not authorized to react to this message';
  end if;

  -- Check if user already has this specific reaction
  if v_reactions ? p_emoji and (v_reactions -> p_emoji) @> to_jsonb(v_user_id) then
    v_already_has_this := true;
  end if;

  -- Remove this user from ALL reactions on this message (Telegram/iOS single reaction style)
  for k in select jsonb_object_keys(v_reactions) loop
    v_reactions := jsonb_set(
      v_reactions,
      array[k],
      (
        select coalesce(jsonb_agg(elem), '[]'::jsonb)
        from jsonb_array_elements_text(v_reactions -> k) as elem
        where elem != v_user_id
      )
    );
    if jsonb_array_length(v_reactions -> k) = 0 then
      v_reactions := v_reactions - k;
    end if;
  end loop;

  -- If user didn't already have this reaction, add it now
  if not v_already_has_this then
    if v_reactions ? p_emoji then
      v_reactions := jsonb_set(
        v_reactions,
        array[p_emoji],
        (v_reactions -> p_emoji) || to_jsonb(v_user_id)
      );
    else
      v_reactions := jsonb_set(
        v_reactions,
        array[p_emoji],
        to_jsonb(array[v_user_id])
      );
    end if;

    -- Build notification preview for conversation list
    if v_msg_type = 'voice_note' then
      v_preview := p_emoji || ' Reacted to: 🎤 Voice note';
    elsif v_msg_type = 'attachment' then
      v_preview := p_emoji || ' Reacted to: 📎 Attachment';
    elsif v_content is not null and length(trim(v_content)) > 0 then
      v_preview := p_emoji || ' Reacted to: "' || left(trim(v_content), 30) || '"';
    else
      v_preview := p_emoji || ' Reacted to a message';
    end if;

    -- Update conversation preview, time, and notify recipient
    if auth.uid() = v_fan_id then
      update public.conversations
      set
        creator_unread = creator_unread + 1,
        last_message_at = now(),
        last_message_preview = v_preview,
        last_message_sender_id = auth.uid()
      where id = v_convo_id;
    else
      update public.conversations
      set
        fan_unread = fan_unread + 1,
        last_message_at = now(),
        last_message_preview = v_preview,
        last_message_sender_id = auth.uid()
      where id = v_convo_id;
    end if;
  end if;

  -- Save back to messages table
  update public.messages
  set reactions = v_reactions
  where id = p_message_id;

  return v_reactions;
end;
$$;

grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;
