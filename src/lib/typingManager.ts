import { supabase } from './supabase';

interface TypingPayload {
  userId: string;
  typing: boolean;
}

type TypingListener = (isTyping: boolean) => void;

interface ChannelEntry {
  channel: ReturnType<typeof supabase.channel>;
  refCount: number;
  listeners: Map<string, { currentUserId: string; callback: TypingListener }>;
  clearTimers: Map<string, ReturnType<typeof setTimeout>>;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}

const TYPING_TIMEOUT_MS = 3000;
const TEARDOWN_DELAY_MS = 1500; // Debounce channel teardown to avoid reconnect thrashing on route changes
const channelRegistry = new Map<string, ChannelEntry>();
const stopTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Unified, reference-counted subscription manager for conversation typing indicators.
 * Prevents multiple components (e.g. ConversationList and ChatWindow) from tearing down
 * each other's Supabase Realtime channels.
 */
export function subscribeToTyping(
  conversationId: string,
  currentUserId: string,
  onTypingChange: TypingListener
): () => void {
  const listenerKey = `${currentUserId}_${Math.random().toString(36).slice(2, 9)}`;
  let entry = channelRegistry.get(conversationId);

  // If a teardown was scheduled for this conversation, cancel it
  if (entry?.teardownTimer) {
    clearTimeout(entry.teardownTimer);
    entry.teardownTimer = null;
  }

  if (!entry) {
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    entry = {
      channel,
      refCount: 0,
      listeners: new Map(),
      clearTimers: new Map(),
      teardownTimer: null,
    };
    channelRegistry.set(conversationId, entry);

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingPayload }) => {
        if (!payload || typeof payload.typing !== 'boolean') return;
        const currentEntry = channelRegistry.get(conversationId);
        if (!currentEntry) return;

        currentEntry.listeners.forEach((listenerInfo, lKey) => {
          // Ignore own broadcasts
          if (payload.userId === listenerInfo.currentUserId) return;

          if (payload.typing) {
            listenerInfo.callback(true);

            // Auto-clear indicator if no further "typing" or "stop" event arrives within timeout
            const existingTimer = currentEntry.clearTimers.get(lKey);
            if (existingTimer) clearTimeout(existingTimer);

            const timer = setTimeout(() => {
              listenerInfo.callback(false);
              currentEntry.clearTimers.delete(lKey);
            }, TYPING_TIMEOUT_MS);

            currentEntry.clearTimers.set(lKey, timer);
          } else {
            // Explicit stop received
            const existingTimer = currentEntry.clearTimers.get(lKey);
            if (existingTimer) {
              clearTimeout(existingTimer);
              currentEntry.clearTimers.delete(lKey);
            }
            listenerInfo.callback(false);
          }
        });
      })
      .subscribe();
  }

  entry.refCount++;
  entry.listeners.set(listenerKey, { currentUserId, callback: onTypingChange });

  // Return unsubscription function
  return () => {
    const activeEntry = channelRegistry.get(conversationId);
    if (!activeEntry) return;

    // Clear any pending timeout for this listener
    const timer = activeEntry.clearTimers.get(listenerKey);
    if (timer) {
      clearTimeout(timer);
      activeEntry.clearTimers.delete(listenerKey);
    }

    activeEntry.listeners.delete(listenerKey);
    activeEntry.refCount--;

    if (activeEntry.refCount <= 0) {
      // Schedule channel removal with debounce to preserve socket if re-mounted immediately
      activeEntry.teardownTimer = setTimeout(() => {
        const checkEntry = channelRegistry.get(conversationId);
        if (checkEntry && checkEntry.refCount <= 0) {
          channelRegistry.delete(conversationId);
          supabase.removeChannel(checkEntry.channel);
        }
      }, TEARDOWN_DELAY_MS);
    }
  };
}

/**
 * Broadcasts the current user's typing state to the other participant.
 */
export function sendTypingBroadcast(conversationId: string, currentUserId: string, isTyping: boolean): void {
  const entry = channelRegistry.get(conversationId);
  if (!entry) return;

  entry.channel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { userId: currentUserId, typing: isTyping } satisfies TypingPayload,
  });

  const stopTimerKey = `${conversationId}_${currentUserId}`;
  const existingStopTimer = stopTimers.get(stopTimerKey);
  if (existingStopTimer) {
    clearTimeout(existingStopTimer);
    stopTimers.delete(stopTimerKey);
  }

  if (isTyping) {
    // Auto-broadcast "stopped" after timeout if no further typing calls happen
    const timer = setTimeout(() => {
      entry.channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, typing: false } satisfies TypingPayload,
      });
      stopTimers.delete(stopTimerKey);
    }, TYPING_TIMEOUT_MS);

    stopTimers.set(stopTimerKey, timer);
  }
}
