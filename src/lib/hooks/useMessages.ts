import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';
import type { Message, Profile } from '../../types';

export interface MessageWithSender extends Message {
  sender: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

const PAGE_SIZE = 50;

export function useMessages(conversationId: string | null) {
  const { user, isCreator } = useAuth();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const oldestCursorRef = useRef<string | null>(null);

  // ── Initial fetch ────────────────────────────────────────────────────────
  const fetchInitial = useCallback(async () => {
    if (!conversationId || !user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('messages')
      .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!error && data) {
      const sorted = [...data].reverse() as MessageWithSender[];
      setMessages(sorted);
      setHasMore(data.length === PAGE_SIZE);
      oldestCursorRef.current = sorted[0]?.created_at ?? null;
    }
    setLoading(false);
  }, [conversationId, user]);

  // ── Load older messages (pagination) ─────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!conversationId || !oldestCursorRef.current || loadingMore) return;
    setLoadingMore(true);

    const { data, error } = await supabase
      .from('messages')
      .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
      .eq('conversation_id', conversationId)
      .lt('created_at', oldestCursorRef.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!error && data && data.length > 0) {
      const sorted = [...data].reverse() as MessageWithSender[];
      setMessages(prev => [...sorted, ...prev]);
      setHasMore(data.length === PAGE_SIZE);
      oldestCursorRef.current = sorted[0].created_at;
    } else {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [conversationId, loadingMore]);

  // ── Mark read / delivered ─────────────────────────────────────────────────
  const markRead = useCallback(async () => {
    if (!conversationId || !user) return;
    await supabase.rpc('mark_read', {
      p_conversation_id: conversationId,
      p_reader_id: user.id,
    });
  }, [conversationId, user]);

  const markAllDelivered = useCallback(async () => {
    if (!conversationId) return;
    await supabase.rpc('mark_all_delivered', {
      p_conversation_id: conversationId,
    });
  }, [conversationId]);

  // ── Send a message ────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content: string, replyToId?: string) => {
    if (!conversationId || !user || !content.trim()) return null;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_type: isCreator ? 'creator' : 'fan',
        content: content.trim(),
        message_type: 'text',
        reply_to_id: replyToId ?? null,
      })
      .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
      .single();

    if (error) {
      console.error('Send message error:', error);
      return null;
    }
    return data as MessageWithSender;
  }, [conversationId, user, isCreator]);

  // ── Soft-delete a message ─────────────────────────────────────────────────
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    await supabase
      .from('messages')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_id', user.id); // only own messages
  }, [user]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !user) return;

    fetchInitial();
    markAllDelivered();

    const channelId = `messages:${conversationId}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch the full message with sender join
          const { data } = await supabase
            .from('messages')
            .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === data.id)) return prev;
              return [...prev, data as MessageWithSender];
            });
            // Mark as read if we're looking at the conversation
            markRead();
            // Mark sender's message as delivered
            if (data.sender_id !== user.id) {
              await supabase.rpc('mark_all_delivered', { p_conversation_id: conversationId });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages(prev =>
            prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Mark read when conversation opens
  useEffect(() => {
    if (conversationId && user && messages.length > 0) {
      markRead();
    }
  }, [conversationId]);  // eslint-disable-line react-hooks/exhaustive-deps

  return {
    messages,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    sendMessage,
    deleteMessage,
    markRead,
  };
}
