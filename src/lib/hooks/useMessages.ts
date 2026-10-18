import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';
import type { Message, Profile } from '../../types';
import { showNewMessageNotification } from '../notificationService';
import {
  getCachedMessages,
  saveCachedMessages,
  appendCachedMessage,
  updateCachedMessage,
  deleteCachedMessage,
  queueOutboxMessage,
  markConversationCachedAsRead,
} from '../offline/db';
import { isOnline } from '../offline/outboxSync';
import { mediaUploadManager } from '../mediaUploadManager';
import { parseUnlockRequestMessage, parseUnlockConfirmedMessage } from '../unlockRequests';

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
  // Ref to current messages — lets loadUnlocks read them without a circular dep
  const messagesRef = useRef<MessageWithSender[]>([]);
  // Ref to current loadUnlocks fn — lets fetchInitial trigger a re-scan after messages load
  const loadUnlocksRef = useRef<(() => void) | null>(null);

  // Fast path: load cached messages from IndexedDB immediately for 0ms offline display
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let isSubscribed = true;
    getCachedMessages(conversationId).then((cached) => {
      if (isSubscribed) {
        // Merge any in-flight active uploads from mediaUploadManager
        const activeUploads = mediaUploadManager.getActiveUploads(conversationId);
        const merged = [...(cached || [])];
        for (const up of activeUploads) {
          const idx = merged.findIndex(m => m.id === up.id);
          if (idx >= 0) {
            merged[idx] = up;
          } else {
            merged.push(up);
          }
        }
        if (merged.length > 0) {
          setMessages(merged);
          oldestCursorRef.current = merged[0]?.created_at ?? null;
          hasLoadedRef.current = true;
        }
        setLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [conversationId]);

  // Reset loaded status only when switching to a different conversation
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [conversationId]);

  // Keep messagesRef in sync so loadUnlocks can read the latest messages without a circular dep
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Listen for outbox synchronizer confirmation events and background upload events
  useEffect(() => {
    if (!conversationId) return;

    const handleSynced = (e: any) => {
      const { tempId, confirmed, conversationId: syncConvId } = e.detail || {};
      if (syncConvId === conversationId && tempId && confirmed) {
        setMessages(prev => prev.map(m => m.id === tempId ? confirmed : m));
      }
    };

    const handleUploadComplete = (e: any) => {
      const { tempId, confirmed, conversationId: uploadConvId } = e.detail || {};
      if (uploadConvId === conversationId && tempId && confirmed) {
        setMessages(prev => prev.map(m => m.id === tempId ? confirmed : m));
      }
    };

    const handleUploadFailed = (e: any) => {
      const { tempId, conversationId: uploadConvId } = e.detail || {};
      if (uploadConvId === conversationId && tempId) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      }
    };

    const handleUploadCancelled = (e: any) => {
      const { tempId } = e.detail || {};
      if (tempId) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    };

    window.addEventListener('velour:message_synced', handleSynced);
    window.addEventListener('velour:media_upload_complete', handleUploadComplete);
    window.addEventListener('velour:media_upload_failed', handleUploadFailed);
    window.addEventListener('velour:media_upload_cancelled', handleUploadCancelled);

    return () => {
      window.removeEventListener('velour:message_synced', handleSynced);
      window.removeEventListener('velour:media_upload_complete', handleUploadComplete);
      window.removeEventListener('velour:media_upload_failed', handleUploadFailed);
      window.removeEventListener('velour:media_upload_cancelled', handleUploadCancelled);
    };
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

      // 3. Scan in-chat unlock receipts using messagesRef (avoids circular dep on messages state)
      const currentMessages = messagesRef.current;
      if (currentMessages && currentMessages.length > 0) {
        for (const m of currentMessages) {
          if (m.content && (m.content.includes('unlock_confirmed') || m.content.includes('unlock-confirmed'))) {
            const parsedConf = parseUnlockConfirmedMessage(m.content);
            if (parsedConf.isUnlockConfirmed && parsedConf.payload) {
              const p = parsedConf.payload;
              if (p.batchId) { unlocked.add(p.batchId); pending.delete(p.batchId); }
              if (p.attachmentId) { unlocked.add(p.attachmentId); pending.delete(p.attachmentId); }
              for (const u of p.mediaUrls || []) { unlocked.add(u); pending.delete(u); }
              if (p.thumbnailUrl) { unlocked.add(p.thumbnailUrl); pending.delete(p.thumbnailUrl); }
            }
          }

          const parsed = parseUnlockRequestMessage(m.content);
          if (parsed.isUnlockRequest && parsed.request) {
            const req = parsed.request;
            if (req.status === 'verified') {
              // Verified in message content → always wins over pending
              if (req.attachmentId) { unlocked.add(req.attachmentId); pending.delete(req.attachmentId); }
              if (req.batchId) { unlocked.add(req.batchId); pending.delete(req.batchId); }
              if (req.thumbnailUrl) { unlocked.add(req.thumbnailUrl); pending.delete(req.thumbnailUrl); }
              for (const u of req.mediaUrls || []) { unlocked.add(u); pending.delete(u); }
            } else if (req.status === 'pending') {
              // Only mark pending if NOT already verified by DB or a later message
              if (req.attachmentId && !unlocked.has(req.attachmentId)) pending.add(req.attachmentId);
              if (req.batchId && !unlocked.has(req.batchId)) pending.add(req.batchId);
              if (req.thumbnailUrl && !unlocked.has(req.thumbnailUrl)) pending.add(req.thumbnailUrl);
              for (const u of req.mediaUrls || []) if (!unlocked.has(u)) pending.add(u);
            }
          }
        }
      }

      setUnlockedAttachmentIds(unlocked);
      setPendingAttachmentIds(pending);
    };

    // Store loadUnlocks in a ref so fetchInitial can trigger a re-scan after messages are ready
    loadUnlocksRef.current = loadUnlocks;

    loadUnlocks();

    // 4. Realtime listener on attachment_unlocks — fires when creator approves
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
            // Re-run full loadUnlocks to pick up any message-based unlocks too
            setTimeout(() => loadUnlocksRef.current?.(), 300);
          }
        }
      )
      .subscribe();

    // 5. Window event listener for cross-component / local approval sync
    const handleLocalUnlockVerified = (e: any) => {
      const { attachmentId, mediaUrl, batchId, mediaUrls } = e.detail || {};
      if (attachmentId) markAttachmentUnlocked(attachmentId);
      if (batchId) markAttachmentUnlocked(batchId);
      if (mediaUrl) markAttachmentUnlocked(mediaUrl);
      if (Array.isArray(mediaUrls)) {
        for (const u of mediaUrls) if (u) markAttachmentUnlocked(u);
      }
    };
    const handleLocalUnlockPending = (e: any) => {
      const { attachmentId, mediaUrl, batchId, mediaUrls } = e.detail || {};
      if (attachmentId) markAttachmentPending(attachmentId);
      if (batchId) markAttachmentPending(batchId);
      if (mediaUrl) markAttachmentPending(mediaUrl);
      if (Array.isArray(mediaUrls)) {
        for (const u of mediaUrls) if (u) markAttachmentPending(u);
      }
    };
    window.addEventListener('velour:unlock_verified', handleLocalUnlockVerified);
    window.addEventListener('velour:unlock_pending', handleLocalUnlockPending);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('velour:unlock_verified', handleLocalUnlockVerified);
      window.removeEventListener('velour:unlock_pending', handleLocalUnlockPending);
    };
  // Only re-run when user changes; messages are read via messagesRef to avoid circular reruns
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

    // If offline, rely purely on local IndexedDB cache without hanging
    if (!isOnline()) {
      setLoading(false);
      return;
    }

    if (!isSilent && !hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!error && data) {
        const sorted = [...data].reverse() as MessageWithSender[];
        const activeUploads = mediaUploadManager.getActiveUploads(conversationId);

        setMessages(prev => {
          const pendingFromState = prev.filter(m => m.status === 'sending' || m.status === 'failed');
          const combined = [...sorted];
          const seenIds = new Set(sorted.map(m => m.id));

          for (const item of [...activeUploads, ...pendingFromState]) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              combined.push(item);
            }
          }
          return combined;
        });

        saveCachedMessages(sorted).catch(() => {});
        setHasMore(data.length === PAGE_SIZE);
        oldestCursorRef.current = sorted[0]?.created_at ?? null;
        hasLoadedRef.current = true;
        // Re-scan unlock states now that messages are loaded — catches verified statuses on refresh
        setTimeout(() => loadUnlocksRef.current?.(), 100);
      } else if (error) {
        console.warn('Network error fetching messages (using offline cache):', error.message);
      }
    } catch (err) {
      console.warn('Error fetching messages (offline mode active):', err);
    } finally {
      setLoading(false);
    }
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
  const isMarkingReadRef = useRef(false);

  const markRead = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    // 1. Optimistic in-memory update: mark all incoming messages as 'read'
    setMessages(prev => {
      let changed = false;
      const updated = prev.map(m => {
        if (m.sender_id !== user.id && m.status !== 'read') {
          changed = true;
          return { ...m, status: 'read' as const, read_at: m.read_at || new Date().toISOString() };
        }
        return m;
      });
      return changed ? updated : prev;
    });

    // 2. Optimistic update to IndexedDB cache
    markConversationCachedAsRead(conversationId, !isCreator, user.id).catch(() => {});

    // 3. Dispatch global custom event so all components (ConversationList, AppShell, etc.) update instantly
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('velour:conversation_read', {
          detail: { conversationId, userId: user.id },
        })
      );
    }

    // 4. Remote DB call with concurrency throttling
    if (isMarkingReadRef.current) return;
    isMarkingReadRef.current = true;

    try {
      if (isOnline()) {
        const { error } = await supabase.rpc('mark_read', {
          p_conversation_id: conversationId,
          p_reader_id: user.id,
        });

        if (error) {
          console.warn('mark_read RPC warning:', error.message);
        }

        // Also bulk mark delivered
        await supabase.rpc('mark_all_delivered', {
          p_conversation_id: conversationId,
        });
      }
    } catch (err) {
      console.warn('Failed executing mark_read RPC (offline mode):', err);
    } finally {
      setTimeout(() => {
        isMarkingReadRef.current = false;
      }, 400);
    }
  }, [conversationId, user?.id, isCreator]);

  const markAllDelivered = useCallback(async () => {
    if (!conversationId) return;
    await supabase.rpc('mark_all_delivered', {
      p_conversation_id: conversationId,
    });
  }, [conversationId]);

  // ── Send a message (true optimistic UI with offline outbox queuing) ───────
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
    appendCachedMessage(tempMessage).catch(() => {});

    // If device is currently offline, queue directly into IndexedDB outbox
    if (!isOnline()) {
      await queueOutboxMessage({
        tempId,
        conversationId,
        senderId: user.id,
        senderType: isCreator ? 'creator' : 'fan',
        content: content.trim(),
        messageType: 'text',
        replyToId: replyTo ? replyTo.id : null,
        replyTo: tempMessage.reply_to,
        createdAt: tempMessage.created_at,
        retries: 0,
      });
      return tempMessage;
    }

    // 3. Persist to DB in the background
    try {
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
        console.warn('Network send failed, queuing to offline outbox:', error.message);
        await queueOutboxMessage({
          tempId,
          conversationId,
          senderId: user.id,
          senderType: isCreator ? 'creator' : 'fan',
          content: content.trim(),
          messageType: 'text',
          replyToId: replyTo ? replyTo.id : null,
          replyTo: tempMessage.reply_to,
          createdAt: tempMessage.created_at,
          retries: 0,
        });
        return tempMessage;
      }

      // 4. Swap the temp message for the real confirmed message, retaining reply_to
      const confirmed = data as MessageWithSender;
      if (replyTo && !confirmed.reply_to) {
        confirmed.reply_to = tempMessage.reply_to;
      }

      updateCachedMessage(tempId, confirmed).catch(() => {});

      setMessages(prev =>
        prev.map(m => m.id === tempId ? confirmed : m)
      );

      return confirmed;
    } catch (netErr) {
      console.warn('Network exception while sending, queuing to offline outbox:', netErr);
      await queueOutboxMessage({
        tempId,
        conversationId,
        senderId: user.id,
        senderType: isCreator ? 'creator' : 'fan',
        content: content.trim(),
        messageType: 'text',
        replyToId: replyTo ? replyTo.id : null,
        replyTo: tempMessage.reply_to,
        createdAt: tempMessage.created_at,
        retries: 0,
      });
      return tempMessage;
    }
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

    // 2. Delegate to the global background mediaUploadManager.
    // This runs completely independently of component lifecycles so navigating away
    // will NEVER kill or lose track of the upload!
    return mediaUploadManager.startUpload({
      tempId,
      conversationId,
      userId: user.id,
      tempMessage,
      uploadFn,
      replyToId: replyTo ? replyTo.id : null,
    });
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
    if (messageId.startsWith('temp_')) {
      mediaUploadManager.cancelOrRemove(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return;
    }
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

          // Fetch with sender join
          const { data } = await supabase
            .from('messages')
            .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
            .eq('id', incoming.id)
            .single();

          const confirmedMsg: MessageWithSender = (data as MessageWithSender) || {
            ...(incoming as Message),
            sender: {
              id: incoming.sender_id,
              username: '',
              display_name: null,
              avatar_url: null,
            },
          };

          if (confirmedMsg) {
            if (confirmedMsg.content && (confirmedMsg.content.includes('unlock_confirmed') || confirmedMsg.content.includes('unlock-confirmed'))) {
              const parsedConf = parseUnlockConfirmedMessage(confirmedMsg.content);
              if (parsedConf.isUnlockConfirmed && parsedConf.payload) {
                const p = parsedConf.payload;
                if (p.batchId) markAttachmentUnlocked(p.batchId);
                if (p.attachmentId) markAttachmentUnlocked(p.attachmentId);
                for (const u of p.mediaUrls || []) markAttachmentUnlocked(u);
                if (p.thumbnailUrl) markAttachmentUnlocked(p.thumbnailUrl);

                window.dispatchEvent(
                  new CustomEvent('velour:unlock_verified', {
                    detail: {
                      attachmentId: p.batchId || p.attachmentId,
                      batchId: p.batchId,
                      mediaUrls: p.mediaUrls,
                      mediaUrl: p.thumbnailUrl,
                    },
                  })
                );
              }
            } else if (confirmedMsg.content) {
              const parsed = parseUnlockRequestMessage(confirmedMsg.content);
              if (parsed.isUnlockRequest && parsed.request) {
                if (parsed.request.status === 'verified') {
                  if (parsed.request.attachmentId) markAttachmentUnlocked(parsed.request.attachmentId);
                  if (parsed.request.batchId) markAttachmentUnlocked(parsed.request.batchId);
                  if (parsed.request.thumbnailUrl) markAttachmentUnlocked(parsed.request.thumbnailUrl);
                  for (const u of parsed.request.mediaUrls || []) markAttachmentUnlocked(u);
                } else if (parsed.request.status === 'pending') {
                  if (parsed.request.attachmentId) markAttachmentPending(parsed.request.attachmentId);
                  if (parsed.request.batchId) markAttachmentPending(parsed.request.batchId);
                  if (parsed.request.thumbnailUrl) markAttachmentPending(parsed.request.thumbnailUrl);
                  for (const u of parsed.request.mediaUrls || []) markAttachmentPending(u);
                }
              }
            }
            setMessages(prev => {
              if (prev.some(m => m.id === confirmedMsg.id)) return prev;

              // If own message, swap pending sending placeholder if present
              if (confirmedMsg.sender_id === user.id) {
                const tempIndex = prev.findIndex(m => m.status === 'sending' && m.id.startsWith('temp_'));
                if (tempIndex !== -1) {
                  const updated = [...prev];
                  updated[tempIndex] = confirmedMsg;
                  return updated;
                }
              }

              return [...prev, confirmedMsg];
            });
            appendCachedMessage(confirmedMsg).catch(() => {});

            if (confirmedMsg.sender_id !== user.id) {
              markRead();
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
          // Skip temp messages (they won't match any DB id)
          if (!payload.new.id) return;
          const updatedRow = payload.new;
          if (updatedRow.content && (updatedRow.content.includes('unlock_confirmed') || updatedRow.content.includes('unlock-confirmed'))) {
            const parsedConf = parseUnlockConfirmedMessage(updatedRow.content);
            if (parsedConf.isUnlockConfirmed && parsedConf.payload) {
              const p = parsedConf.payload;
              if (p.batchId) markAttachmentUnlocked(p.batchId);
              if (p.attachmentId) markAttachmentUnlocked(p.attachmentId);
              for (const u of p.mediaUrls || []) markAttachmentUnlocked(u);
              if (p.thumbnailUrl) markAttachmentUnlocked(p.thumbnailUrl);
            }
          } else if (updatedRow.content) {
            const parsed = parseUnlockRequestMessage(updatedRow.content);
            if (parsed.isUnlockRequest && parsed.request?.status === 'verified') {
              if (parsed.request.attachmentId) markAttachmentUnlocked(parsed.request.attachmentId);
              if (parsed.request.batchId) markAttachmentUnlocked(parsed.request.batchId);
              if (parsed.request.thumbnailUrl) markAttachmentUnlocked(parsed.request.thumbnailUrl);
              for (const u of parsed.request.mediaUrls || []) markAttachmentUnlocked(u);

              window.dispatchEvent(
                new CustomEvent('velour:unlock_verified', {
                  detail: {
                    attachmentId: parsed.request.batchId || parsed.request.attachmentId,
                    batchId: parsed.request.batchId,
                    mediaUrls: parsed.request.mediaUrls,
                    mediaUrl: parsed.request.thumbnailUrl,
                  },
                })
              );
            }
          }
          setMessages(prev =>
            prev.map(m => {
              if (m.id === payload.new.id) {
                const updated = { ...m, ...payload.new };
                appendCachedMessage(updated).catch(() => {});
                return updated;
              }
              return m;
            })
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user?.id, markRead]);

  // 1. Mark read immediately when conversation opens
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    markRead();
  }, [conversationId, user?.id, markRead]);

  // 2. When messages load or change, if there are unread incoming messages, ensure marked read
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    const hasIncomingUnread = messages.some(
      m => m.sender_id !== user.id && m.status !== 'read'
    );
    if (hasIncomingUnread) {
      markRead();
    }
  }, [messages, conversationId, user?.id, markRead]);

  // 3. Mark read when browser tab / app regains focus or visibility
  useEffect(() => {
    if (!conversationId || !user?.id) return;

    const handleFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        markRead();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [conversationId, user?.id, markRead]);

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
