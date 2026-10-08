import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';
import type { Message, Profile } from '../../types';
import { showNewMessageNotification } from '../notificationService';

export interface MessageWithSender extends Message {
  sender: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  reply_to?: {
    id: string;
    content: string | null;
    message_type?: string;
    sender_id: string;
    is_deleted?: boolean;
    sender?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
  } | null;
}

const PAGE_SIZE = 50;

export function useMessages(conversationId: string | null) {
  const { user, isCreator, profile } = useAuth();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const oldestCursorRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Reset loaded status only when switching to a different conversation
  useEffect(() => {
    hasLoadedRef.current = false;
    setLoading(true);
  }, [conversationId]);

  // ── Unlocked & Pending Attachment IDs (from DB + optimistic localStorage) ──
  const [unlockedAttachmentIds, setUnlockedAttachmentIds] = useState<Set<string>>(new Set());
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    const loadUnlocks = async () => {
      const unlocked = new Set<string>();
      const pending = new Set<string>();

      // 1. Read from localStorage optimistic storage
      try {
        const raw = localStorage.getItem(`velour_unlocked_media_${user.id}`);
        if (raw) {
          const stored = JSON.parse(raw);
          if (Array.isArray(stored)) {
            for (const item of stored) {
              if (item.status === 'verified') {
                if (item.id) unlocked.add(item.id);
                if (item.mediaUrl) unlocked.add(item.mediaUrl);
              } else if (item.status === 'pending') {
                if (item.id) pending.add(item.id);
                if (item.mediaUrl) pending.add(item.mediaUrl);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Error reading local unlocks:', err);
      }

      // 2. Query attachment_unlocks from Supabase
      try {
        const { data: dbUnlocks } = await supabase
          .from('attachment_unlocks')
          .select('attachment_id, status')
          .eq('fan_id', user.id);

        if (dbUnlocks) {
          for (const row of dbUnlocks) {
            if (row.attachment_id) {
              if (row.status === 'verified') {
                unlocked.add(row.attachment_id);
              } else if (row.status === 'pending') {
                pending.add(row.attachment_id);
              }
            }
          }
        }
      } catch (dbErr) {
        console.warn('Error fetching db attachment_unlocks:', dbErr);
      }

      setUnlockedAttachmentIds(unlocked);
      setPendingAttachmentIds(pending);
    };

    loadUnlocks();

    // 3. Realtime listener on attachment_unlocks
    const channel = supabase
      .channel(`fan_unlocks_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attachment_unlocks',
          filter: `fan_id=eq.${user.id}`,
        },
        (payload: any) => {
          const newRow = payload.new;
          if (newRow?.status === 'verified' && newRow?.attachment_id) {
            markAttachmentUnlocked(newRow.attachment_id);
          }
        }
      )
      .subscribe();

    // 4. Window event listener for cross-component / local approval sync
    const handleLocalUnlockVerified = (e: any) => {
      const { attachmentId, mediaUrl } = e.detail || {};
      if (attachmentId) markAttachmentUnlocked(attachmentId);
      if (mediaUrl) markAttachmentUnlocked(mediaUrl);
    };
    window.addEventListener('velour:unlock_verified', handleLocalUnlockVerified);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('velour:unlock_verified', handleLocalUnlockVerified);
    };
  }, [user?.id]);

  const markAttachmentPending = useCallback((id: string) => {
    setPendingAttachmentIds(prev => new Set([...prev, id]));
  }, []);

  const markAttachmentUnlocked = useCallback((id: string) => {
    setPendingAttachmentIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setUnlockedAttachmentIds(prev => new Set([...prev, id]));

    // Also update local storage cache to verified
    if (user?.id) {
      try {
        const key = `velour_unlocked_media_${user.id}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw);
          const updated = list.map((item: any) => {
            if (item.id === id || item.mediaUrl === id) {
              return { ...item, status: 'verified' };
            }
            return item;
          });
          localStorage.setItem(key, JSON.stringify(updated));
        }
      } catch {}
    }
  }, [user?.id]);

  // ── Initial fetch ────────────────────────────────────────────────────────
  const fetchInitial = useCallback(async (isSilent = false) => {
    if (!conversationId || !user?.id) return;
    if (!isSilent && !hasLoadedRef.current) {
      setLoading(true);
    }

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
      hasLoadedRef.current = true;
    }
    setLoading(false);
  }, [conversationId, user?.id]);

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

  // ── Send a message (true optimistic UI with reply support) ────────────────
  const sendMessage = useCallback(async (content: string, replyTo?: MessageWithSender | null) => {
    if (!conversationId || !user || !content.trim()) return null;

    // 1. Build a temp placeholder message shown instantly in the chat
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempMessage: MessageWithSender = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      sender_type: isCreator ? 'creator' : 'fan',
      content: content.trim(),
      message_type: 'text',
      reply_to_id: replyTo ? replyTo.id : null,
      reply_to: replyTo ? {
        id: replyTo.id,
        content: replyTo.content,
        message_type: replyTo.message_type,
        sender_id: replyTo.sender_id,
        is_deleted: replyTo.is_deleted,
        sender: replyTo.sender,
      } : null,
      reactions: {},
      is_deleted: false,
      deleted_at: null,
      edited_at: null,
      status: 'sending',          // frontend-only state — shows clock icon
      read_at: null,
      created_at: new Date().toISOString(),
      sender: {
        id: user.id,
        username: profile?.username || '',
        display_name: profile?.display_name || null,
        avatar_url: profile?.avatar_url || null,
      },
    };

    // 2. Show instantly — user sees their message with quote banner the moment they hit send
    setMessages(prev => [...prev, tempMessage]);

    // 3. Persist to DB in the background
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_type: isCreator ? 'creator' : 'fan',
        content: content.trim(),
        message_type: 'text',
        reply_to_id: replyTo ? replyTo.id : null,
      })
      .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
      .single();

    if (error) {
      console.error('Send message error:', error);
      // Remove the failed temp message from the list
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return null;
    }

    // 4. Swap the temp message for the real confirmed message, retaining reply_to
    const confirmed = data as MessageWithSender;
    if (replyTo && !confirmed.reply_to) {
      confirmed.reply_to = {
        id: replyTo.id,
        content: replyTo.content,
        message_type: replyTo.message_type,
        sender_id: replyTo.sender_id,
        is_deleted: replyTo.is_deleted,
        sender: replyTo.sender,
      };
    }

    setMessages(prev =>
      prev.map(m => m.id === tempId ? confirmed : m)
    );

    return confirmed;
  }, [conversationId, user?.id, isCreator, profile?.username, profile?.display_name, profile?.avatar_url]);

  // ── Send media message with instant optimistic bubble + background upload ─
  const sendMediaMessage = useCallback(async (
    optimisticContent: string,
    uploadFn: () => Promise<string | null>,
    replyTo?: MessageWithSender | null
  ) => {
    if (!conversationId || !user || !optimisticContent) return null;

    // 1. Build an optimistic media placeholder with real preview URLs & status: 'sending'
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempMessage: MessageWithSender = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      sender_type: isCreator ? 'creator' : 'fan',
      content: optimisticContent,
      message_type: 'text',
      reply_to_id: replyTo ? replyTo.id : null,
      reply_to: replyTo ? {
        id: replyTo.id,
        content: replyTo.content,
        message_type: replyTo.message_type,
        sender_id: replyTo.sender_id,
        is_deleted: replyTo.is_deleted,
        sender: replyTo.sender,
      } : null,
      reactions: {},
      is_deleted: false,
      deleted_at: null,
      edited_at: null,
      status: 'sending',
      read_at: null,
      created_at: new Date().toISOString(),
      sender: {
        id: user.id,
        username: profile?.username || '',
        display_name: profile?.display_name || null,
        avatar_url: profile?.avatar_url || null,
      },
    };

    // Show media card right away in chat
    setMessages(prev => [...prev, tempMessage]);

    try {
      // 2. Perform background upload
      const finalContent = await uploadFn();
      if (!finalContent) {
        // Upload failed
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return null;
      }

      // 3. Persist confirmed message to DB
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          sender_type: isCreator ? 'creator' : 'fan',
          content: finalContent,
          message_type: 'text',
          reply_to_id: replyTo ? replyTo.id : null,
        })
        .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
        .single();

      if (error || !data) {
        console.error('Send media message error:', error);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return null;
      }

      // 4. Swap temp message with real confirmed message
      const confirmed = data as MessageWithSender;
      if (replyTo && !confirmed.reply_to) {
        confirmed.reply_to = {
          id: replyTo.id,
          content: replyTo.content,
          message_type: replyTo.message_type,
          sender_id: replyTo.sender_id,
          is_deleted: replyTo.is_deleted,
          sender: replyTo.sender,
        };
      }

      setMessages(prev =>
        prev.map(m => m.id === tempId ? confirmed : m)
      );

      return confirmed;
    } catch (err) {
      console.error('sendMediaMessage error:', err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return null;
    }
  }, [conversationId, user?.id, isCreator, profile?.username, profile?.display_name, profile?.avatar_url]);

  // ── Toggle reaction on a message ──────────────────────────────────────────
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user?.id) return;
    const userId = user.id;

    // 1. Optimistic update
    setMessages(prev =>
      prev.map(m => {
        if (m.id !== messageId) return m;
        const currentReactions: Record<string, string[]> = { ...(m.reactions || {}) };
        const hasReaction = currentReactions[emoji]?.includes(userId);

        // Remove userId from all emojis (Telegram/iOS single reaction style)
        for (const [key, users] of Object.entries(currentReactions)) {
          const filtered = users.filter(uid => uid !== userId);
          if (filtered.length > 0) {
            currentReactions[key] = filtered;
          } else {
            delete currentReactions[key];
          }
        }

        // If didn't have it before, add it
        if (!hasReaction) {
          currentReactions[emoji] = [...(currentReactions[emoji] || []), userId];
        }

        return { ...m, reactions: currentReactions };
      })
    );

    // 2. Call Supabase RPC
    try {
      const { data, error } = await supabase.rpc('toggle_message_reaction', {
        p_message_id: messageId,
        p_emoji: emoji,
      });

      if (error) {
        console.warn('toggle_message_reaction RPC error, fallback to direct update:', error);
        // Fallback: if RPC not installed yet in remote db, try direct update
        const targetMsg = messages.find(m => m.id === messageId);
        if (targetMsg) {
          const currentReactions: Record<string, string[]> = { ...(targetMsg.reactions || {}) };
          const hasReaction = currentReactions[emoji]?.includes(userId);
          for (const [key, users] of Object.entries(currentReactions)) {
            const filtered = users.filter(uid => uid !== userId);
            if (filtered.length > 0) currentReactions[key] = filtered;
            else delete currentReactions[key];
          }
          if (!hasReaction) {
            currentReactions[emoji] = [...(currentReactions[emoji] || []), userId];
          }
          await supabase
            .from('messages')
            .update({ reactions: currentReactions })
            .eq('id', messageId);
        }
      } else if (data) {
        // Sync confirmed reactions
        setMessages(prev =>
          prev.map(m => m.id === messageId ? { ...m, reactions: data as Record<string, string[]> } : m)
        );
      }
    } catch (err) {
      console.error('Failed to toggle message reaction:', err);
    }
  }, [user?.id, messages]);

  // ── Soft-delete a message ─────────────────────────────────────────────────
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user?.id) return;
    await supabase
      .from('messages')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_id', user.id); // only own messages
  }, [user?.id]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !user?.id) return;

    fetchInitial(hasLoadedRef.current);
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
          const incoming = payload.new as Message;

          // Own messages are handled optimistically in sendMessage — skip.
          // (The confirmed swap already replaced the temp with the real row.)
          if (incoming.sender_id === user.id) return;

          // Fetch with sender join for messages from the other participant.
          const { data } = await supabase
            .from('messages')
            .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
            .eq('id', incoming.id)
            .single();

          if (data) {
            setMessages(prev => {
              if (prev.some(m => m.id === data.id)) return prev;
              return [...prev, data as MessageWithSender];
            });
            markRead();
            await supabase.rpc('mark_all_delivered', { p_conversation_id: conversationId });

            // Trigger notification & audio feedback
            showNewMessageNotification({
              conversationId,
              senderName: data.sender?.display_name || data.sender?.username || 'New message',
              body: data.content || (data.message_type === 'image' ? 'Sent an photo' : data.message_type === 'video' ? 'Sent a video' : 'Sent an attachment'),
              userId: user.id,
              isForegroundActive: typeof document !== 'undefined' && document.visibilityState === 'visible',
            }).catch(() => {});
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
          // Skip temp messages (they won't match any DB id)
          if (!payload.new.id) return;
          setMessages(prev =>
            prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Mark read when conversation opens
  useEffect(() => {
    if (conversationId && user?.id && messages.length > 0) {
      markRead();
    }
  }, [conversationId, user?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  return {
    messages,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    sendMessage,
    sendMediaMessage,
    deleteMessage,
    toggleReaction,
    markRead,
    unlockedAttachmentIds,
    pendingAttachmentIds,
    markAttachmentPending,
    markAttachmentUnlocked,
  };
}
