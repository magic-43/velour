import { supabase } from '../supabase';
import {
  getOutboxMessages,
  removeOutboxMessage,
  updateCachedMessage,
  type OutboxMessage,
} from './db';
import type { MessageWithSender } from '../hooks/useMessages';

let isFlushing = false;
let syncInterval: any = null;

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Flushes all pending outbox messages in chronological order to Supabase.
 */
export async function flushOutbox(): Promise<void> {
  if (isFlushing || !isOnline()) return;

  isFlushing = true;
  try {
    const queue = await getOutboxMessages();
    if (!queue || queue.length === 0) return;

    for (const msg of queue) {
      if (!isOnline()) break; // Abort if connectivity lost mid-queue

      try {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            conversation_id: msg.conversationId,
            sender_id: msg.senderId,
            sender_type: msg.senderType,
            content: msg.content,
            message_type: msg.messageType || 'text',
            reply_to_id: msg.replyToId || null,
          })
          .select(`*, sender:profiles!sender_id(id, username, display_name, avatar_url)`)
          .single();

        if (!error && data) {
          const confirmed = data as MessageWithSender;
          if (msg.replyTo && !confirmed.reply_to) {
            confirmed.reply_to = msg.replyTo;
          }

          // 1. Update cache with confirmed row and delete temp row
          await updateCachedMessage(msg.tempId, confirmed);

          // 2. Remove from outbox
          await removeOutboxMessage(msg.tempId);

          // 3. Notify in-memory chat components
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('velour:message_synced', {
                detail: {
                  tempId: msg.tempId,
                  confirmed,
                  conversationId: msg.conversationId,
                },
              })
            );
          }
        } else {
          console.warn('Failed syncing outbox message, will retry:', error?.message);
        }
      } catch (insertErr) {
        console.warn('Error during outbox message insertion:', insertErr);
        break; // Network error, retry next time
      }
    }
  } catch (err) {
    console.warn('Outbox flush error:', err);
  } finally {
    isFlushing = false;
  }
}

/**
 * Initializes automatic outbox synchronization on connectivity change and periodic timers.
 */
export function initOutboxSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    // Small delay to allow network socket to stabilize
    setTimeout(() => {
      flushOutbox();
    }, 1500);
  };

  window.addEventListener('online', handleOnline);

  // Periodic heartbeat every 15s to retry any unhandled outbox items
  syncInterval = setInterval(() => {
    if (isOnline()) {
      flushOutbox();
    }
  }, 15000);

  // Initial flush on startup
  if (isOnline()) {
    flushOutbox();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    if (syncInterval) clearInterval(syncInterval);
  };
}
