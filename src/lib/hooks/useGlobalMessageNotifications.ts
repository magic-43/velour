import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';
import { showNewMessageNotification } from '../notificationService';
import { getCleanMessagePreview } from '../messageUtils';
import { getCachedConversations } from '../offline/db';
import { isOnline } from '../offline/outboxSync';
import type { InAppToastData } from '../../components/chat/InAppMessageToast';

export function useGlobalMessageNotifications() {
  const { user } = useAuth();
  const location = useLocation();

  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [inAppToast, setInAppToast] = useState<InAppToastData | null>(null);

  // Active conversation ID from current route (e.g. /messages/:id)
  const activeConversationId = location.pathname.startsWith('/messages/')
    ? location.pathname.split('/messages/')[1]
    : null;

  const activeConvRef = useRef<string | null>(activeConversationId);
  useEffect(() => {
    activeConvRef.current = activeConversationId;
  }, [activeConversationId]);

  // Track conversation IDs marked as read locally within the last 6 seconds to prevent network race conditions
  const recentlyReadRef = useRef<Map<string, number>>(new Map());

  // ── Calculate Total Unread Conversations / Messages ─────────────────────────
  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setTotalUnreadCount(0);
      return;
    }

    const now = Date.now();
    for (const [id, ts] of recentlyReadRef.current.entries()) {
      if (now - ts > 6000) recentlyReadRef.current.delete(id);
    }

    // If offline, calculate from local IndexedDB cache immediately
    if (!isOnline()) {
      try {
        const cached = await getCachedConversations();
        let total = 0;
        for (const c of cached) {
          if (c.id === activeConvRef.current) continue;
          if (recentlyReadRef.current.has(c.id)) continue;
          if (c.last_message_sender_id === user.id) continue;
          const isFanInThisConv = c.fan_id === user.id;
          const unread = isFanInThisConv ? (c.fan_unread ?? 0) : (c.creator_unread ?? 0);
          if (unread > 0) total += 1;
        }
        setTotalUnreadCount(total);
      } catch (_) {}
      return;
    }

    try {
      // Find creator persona IDs owned by user
      const { data: creatorProfiles } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('owner_id', user.id);

      const cpIds = (creatorProfiles ?? []).map(cp => cp.id);

      let query = supabase
        .from('conversations')
        .select('id, fan_id, creator_profile_id, fan_unread, creator_unread, last_message_sender_id');

      if (cpIds.length > 0) {
        query = query.or(`fan_id.eq.${user.id},creator_profile_id.in.(${cpIds.join(',')})`);
      } else {
        query = query.eq('fan_id', user.id);
      }

      const { data, error } = await query;
      if (!error && data) {
        let total = 0;
        for (const c of data) {
          // If this conversation is active in foreground, recently read locally, or last message is from me, skip
          if (c.id === activeConvRef.current) continue;
          if (recentlyReadRef.current.has(c.id)) continue;
          if (c.last_message_sender_id === user.id) continue;

          const isFanInThisConv = c.fan_id === user.id;
          const unread = isFanInThisConv ? (c.fan_unread ?? 0) : (c.creator_unread ?? 0);
          if (unread > 0) {
            total += 1;
          }
        }
        setTotalUnreadCount(total);
      }
    } catch (err) {
      console.warn('Failed calculating total unread count:', err);
    }
  }, [user]);

  // Initial fetch and on active conversation change
  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount, activeConversationId]);

  // Synchronize immediately on global conversation read event
  useEffect(() => {
    const handleRead = (e: any) => {
      const { conversationId } = e.detail || {};
      if (conversationId) {
        recentlyReadRef.current.set(conversationId, Date.now());
        setTotalUnreadCount(prev => Math.max(0, prev - 1));
        setTimeout(() => {
          refreshUnreadCount();
        }, 1500);
      }
    };

    window.addEventListener('velour:conversation_read', handleRead);
    return () => window.removeEventListener('velour:conversation_read', handleRead);
  }, [refreshUnreadCount]);

  // ── Dynamic Browser Tab Title Manager ──────────────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (totalUnreadCount > 0) {
      document.title = `(${totalUnreadCount}) Velour`;
    } else {
      document.title = 'Velour';
    }

    return () => {
      document.title = 'Velour';
    };
  }, [totalUnreadCount]);

  // ── Unified Notification Dispatcher (Deduplicated) ────────────────────────
  const notifiedKeysRef = useRef<Set<string>>(new Set());

  const triggerIncomingAlert = useCallback(async ({
    conversationId,
    senderId,
    body,
    timestamp,
  }: {
    conversationId: string;
    senderId: string;
    body: string;
    timestamp: string;
  }) => {
    if (!user || senderId === user.id) return;

    // Suppress if user is currently looking at this exact chat thread in foreground
    if (
      conversationId === activeConvRef.current &&
      typeof document !== 'undefined' &&
      !document.hidden
    ) {
      return;
    }

    // Deduplicate within session
    const notifyKey = `${conversationId}:${timestamp}`;
    if (notifiedKeysRef.current.has(notifyKey)) return;
    notifiedKeysRef.current.add(notifyKey);

    // Keep memory cache constrained
    if (notifiedKeysRef.current.size > 200) {
      const arr = Array.from(notifiedKeysRef.current);
      notifiedKeysRef.current = new Set(arr.slice(arr.length - 100));
    }

    // Fetch sender profile details
    let senderName = 'New Message';
    let senderAvatarUrl: string | null = null;
    try {
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('display_name, username, avatar_url')
        .eq('id', senderId)
        .maybeSingle();

      if (senderProfile) {
        senderName = senderProfile.display_name || senderProfile.username || 'New Message';
        senderAvatarUrl = senderProfile.avatar_url || null;
      }
    } catch (_) {}

    // Trigger audio chime, native Android alert, and desktop OS notification
    showNewMessageNotification({
      conversationId,
      senderName,
      body,
      senderAvatarUrl,
      userId: user.id,
      isForegroundActive: false,
    }).catch(() => {});

    // Display in-app floating toast banner
    setInAppToast({
      id: notifyKey,
      conversationId,
      senderName,
      senderAvatarUrl,
      content: body,
      timestamp,
    });

    // Refresh unread counter
    refreshUnreadCount();
  }, [user, refreshUnreadCount]);

  // ── Realtime Global Listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    // 1. Subscribe to conversation updates (100% reliable trigger from DB handle_new_message)
    const convChannel = supabase
      .channel(`global_conv_unread:${user.id}:${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload: any) => {
          refreshUnreadCount();

          const updated = payload.new;
          if (!updated || !updated.last_message_sender_id || updated.last_message_sender_id === user.id) {
            return;
          }

          // Check if message timestamp is recent (within 45 seconds)
          if (updated.last_message_at) {
            const age = Date.now() - new Date(updated.last_message_at).getTime();
            if (age > 45000) return;
          }

          triggerIncomingAlert({
            conversationId: updated.id,
            senderId: updated.last_message_sender_id,
            body: updated.last_message_preview || 'Sent you a message',
            timestamp: updated.last_message_at || new Date().toISOString(),
          });
        }
      )
      .subscribe();

    // 2. Subscribe to incoming messages table
    const msgChannel = supabase
      .channel(`global_messages:${user.id}:${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: any) => {
          const newMsg = payload.new;
          if (!newMsg || !newMsg.sender_id || newMsg.sender_id === user.id) return;

          const clean = getCleanMessagePreview(newMsg.content, newMsg.message_type, newMsg.is_deleted);
          triggerIncomingAlert({
            conversationId: newMsg.conversation_id,
            senderId: newMsg.sender_id,
            body: clean.text || 'Sent you a message',
            timestamp: newMsg.created_at || new Date().toISOString(),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [user, refreshUnreadCount, triggerIncomingAlert]);

  const dismissToast = useCallback(() => {
    setInAppToast(null);
  }, []);

  return {
    totalUnreadCount,
    inAppToast,
    dismissToast,
    refreshUnreadCount,
  };
}
