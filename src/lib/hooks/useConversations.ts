import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';
import type { ConversationWithParticipants } from '../../types';

export function useConversations() {
  const { user, profile, isCreator } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithParticipants[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;

    try {
      // Find all creator persona IDs owned by user
      const { data: creatorProfiles } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('owner_id', user.id);

      const cpIds = (creatorProfiles ?? []).map(cp => cp.id);

      let query = supabase
        .from('conversations')
        .select(`
          *,
          fan:profiles!fan_id(id, username, display_name, avatar_url, last_seen_at),
          creator_profile:creator_profiles!creator_profile_id(
            id, owner_id, display_name, avatar_url,
            owner:profiles!owner_id(avatar_url, username, display_name)
          )
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (cpIds.length > 0) {
        query = query.or(`fan_id.eq.${user.id},creator_profile_id.in.(${cpIds.join(',')})`);
      } else {
        query = query.eq('fan_id', user.id);
      }

      const { data, error } = await query;
      if (!error && data) {
        setConversations(data as ConversationWithParticipants[]);
      }
    } catch (err) {
      console.error('Error in useConversations fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Realtime subscription — re-fetch on any conversation change
  useEffect(() => {
    if (!user?.id) return;

    const channelId = `conversations:${user.id}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => { fetch(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetch]);

  // Helper: safely returns the "other participant" in a conversation
  const getOtherParticipant = useCallback((conv: ConversationWithParticipants) => {
    // If the current logged-in user is the fan in this conversation, the other person is the creator
    const isFanInThisConv = conv.fan_id === user?.id;

    if (isFanInThisConv) {
      const cp = conv.creator_profile;
      const avatar = cp?.avatar_url || (cp as any)?.owner?.avatar_url || null;
      return {
        id: cp?.id ?? conv.creator_profile_id ?? '',
        name: cp?.display_name || 'Creator',
        username: cp?.display_name || 'creator',
        avatar_url: avatar,
        last_seen_at: null,
      };
    }

    // Otherwise the other person is the fan/client
    const f = conv.fan;
    return {
      id: f?.id ?? conv.fan_id ?? '',
      name: f?.display_name || f?.username || 'Client',
      username: f?.username || 'client',
      avatar_url: f?.avatar_url || null,
      last_seen_at: f?.last_seen_at || null,
    };
  }, [user?.id]);

  // Unread count for the current user
  const getUnread = useCallback((conv: ConversationWithParticipants) => {
    const isFanInThisConv = conv.fan_id === user?.id;
    return isFanInThisConv ? (conv.fan_unread ?? 0) : (conv.creator_unread ?? 0);
  }, [user?.id]);

  return { conversations, loading, refresh: fetch, getOtherParticipant, getUnread };
}
