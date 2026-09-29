import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '../AuthContext';
import { subscribeToTyping, sendTypingBroadcast } from '../typingManager';

/**
 * Provides:
 *  - `otherIsTyping` — true when the other participant is currently typing
 *  - `sendTyping(isTyping)` — call with true while typing, false when stopped/sent
 *
 * Uses the reference-counted typingManager to ensure no channel teardown conflicts.
 */
export function useTypingIndicator(conversationId: string | null) {
  const { user } = useAuth();
  const [otherIsTyping, setOtherIsTyping] = useState(false);

  useEffect(() => {
    if (!conversationId || !user?.id) {
      setOtherIsTyping(false);
      return;
    }

    const unsubscribe = subscribeToTyping(conversationId, user.id, (isTyping) => {
      setOtherIsTyping(isTyping);
    });

    return () => {
      unsubscribe();
    };
  }, [conversationId, user?.id]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!conversationId || !user?.id) return;
    sendTypingBroadcast(conversationId, user.id, isTyping);
  }, [conversationId, user?.id]);

  return { otherIsTyping, sendTyping };
}
