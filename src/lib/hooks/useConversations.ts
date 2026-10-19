import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';
import type { ConversationWithParticipants } from '../../types';
import { getCachedConversations, saveCachedConversations, markConversationCachedAsRead } from '../offline/db';
import { isOnline } from '../offline/outboxSync';
import { getCleanMessagePreview, parseConversationPreview } from '../messageUtils';

export function useConversations() {
  const { user, profile, isCreator } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithParticipants[]>([]);
  const [loading, setLoading] = useState(true);

  // Fast path: load cached conversations from IndexedDB immediately for 0ms offline display
  useEffect(() => {
    if (!user?.id) return;
    getCachedConversations(user.id).then((cached) => {
      if (cached && cached.length > 0) {
        // Deduplicate cached records by id
        const unique = Array.from(new Map(cached.map((c) => [c.id, c])).values());
        setConversations((prev) => {
          // If fresh conversations already arrived from network, do not overwrite with stale cache
          if (prev.length > 0) return prev;
          return unique;
        });
        setLoading(false);
      } else if (!isOnline()) {
        setLoading(false);
      }
    });
  }, [user?.id]);

  // Synchronize read events across all component instances
  useEffect(() => {
    if (!user?.id) return;

    const handleRead = (e: any) => {
      const { conversationId } = e.detail || {};
      if (!conversationId) return;

      setConversations(prev => prev.map(c => {
        if (c.id !== conversationId) return c;
        const isFanInThisConv = c.fan_id === user.id;
        return {
          ...c,
          fan_unread: isFanInThisConv ? 0 : c.fan_unread,
          creator_unread: !isFanInThisConv ? 0 : c.creator_unread,
        };
      }));
    };

    window.addEventListener('velour:conversation_read', handleRead);
    return () => window.removeEventListener('velour:conversation_read', handleRead);
  }, [user?.id]);

  const fetch = useCallback(async () => {
    if (!user) return;

    // If offline, resolve loading immediately from cache without hanging on network
    if (!isOnline()) {
      setLoading(false);
      return;
    }

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
            id, owner_id, display_name, avatar_url, tags,
            owner:profiles!owner_id(id, avatar_url, username, display_name, last_seen_at)
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
        const convs = await Promise.all(
          (data as ConversationWithParticipants[]).map(async (c) => {
            const isCorrupted =
              c.last_message_preview &&
              (c.last_message_preview.includes('unlock_confirmed') ||
                c.last_message_preview.includes('unlock-confirmed') ||
                c.last_message_preview.includes('Content unlocked') ||
                c.last_message_preview.startsWith('{"version":1'));

            if (isCorrupted) {
              // Find the latest genuine message in this conversation for display
              const { data: realMsg } = await supabase
                .from('messages')
                .select('content, created_at, sender_id, message_type')
                .eq('conversation_id', c.id)
                .not('content', 'like', '%unlock_confirmed%')
                .not('content', 'like', '%unlock-confirmed%')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              let realPreview = '';
              let realTime = c.last_message_at;
              let realSenderId = c.last_message_sender_id;

              if (realMsg) {
                const parsed = getCleanMessagePreview(realMsg.content, realMsg.message_type);
                realPreview = parsed.text || '';
                realTime = realMsg.created_at;
                realSenderId = realMsg.sender_id;
              }

              // Update the database conversations record to restore the real message
              supabase
                .from('conversations')
                .update({
                  last_message_preview: realPreview,
                  last_message_at: realTime,
                  last_message_sender_id: realSenderId,
                })
                .eq('id', c.id)
                .then(() => {});

              return {
                ...c,
                last_message_preview: realPreview,
                last_message_at: realTime,
                last_message_sender_id: realSenderId,
              };
            }
            return c;
          })
        );
        const uniqueConvs = Array.from(new Map(convs.map((c) => [c.id, c])).values());
        setConversations(uniqueConvs);
        saveCachedConversations(uniqueConvs, user.id).catch(() => {});
      } else if (error) {
        console.warn('Network error fetching conversations (using cached if available):', error.message);
      }
    } catch (err) {
      console.warn('Error in useConversations fetch (offline mode active):', err);
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
      const owner = (cp as any)?.owner;
      const avatar = cp?.avatar_url || owner?.avatar_url || null;
      const tags = ((cp as any)?.tags || []) as string[];
      const isHidden = tags.includes('hide_presence');
      return {
        id: cp?.id ?? conv.creator_profile_id ?? '',
        userId: cp?.owner_id || owner?.id || '',
        name: cp?.display_name || owner?.display_name || 'Creator',
        username: cp?.display_name || owner?.username || 'creator',
        avatar_url: avatar,
        last_seen_at: isHidden ? null : (owner?.last_seen_at || null),
        hide_presence: isHidden,
      };
    }

    // Otherwise the other person is the fan/client
    const f = conv.fan;
    return {
      id: f?.id ?? conv.fan_id ?? '',
      userId: f?.id ?? conv.fan_id ?? '',
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

  // Optimistically mark a conversation as read in local state, IDB cache, and remote DB
  const markConversationViewed = useCallback((convId: string) => {
    if (!user?.id || !convId) return;

    // 1. Optimistic React state update
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const isFanInThisConv = c.fan_id === user.id;
      return {
        ...c,
        fan_unread: isFanInThisConv ? 0 : c.fan_unread,
        creator_unread: !isFanInThisConv ? 0 : c.creator_unread,
      };
    }));

    // 2. Persist to IndexedDB offline cache
    markConversationCachedAsRead(convId, !isCreator, user.id).catch(() => {});

    // 3. Dispatch global event so all instances & useGlobalMessageNotifications sync immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('velour:conversation_read', {
          detail: { conversationId: convId, userId: user.id },
        })
      );
    }

    // 4. Remote DB call
    if (isOnline()) {
      Promise.resolve(
        supabase.rpc('mark_read', {
          p_conversation_id: convId,
          p_reader_id: user.id,
        })
      ).catch((err: unknown) => {
        console.warn('mark_read RPC failed from markConversationViewed:', err);
      });
    }
  }, [user?.id, isCreator]);

  return { conversations, loading, refresh: fetch, getOtherParticipant, getUnread, markConversationViewed };
}
