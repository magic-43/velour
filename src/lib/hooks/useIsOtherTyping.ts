import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { subscribeToTyping } from '../typingManager';

/**
 * Lightweight receive-only typing subscriber.
 * Used in conversation list rows — subscribes via shared typingManager.
 * Returns true when the other participant is actively typing.
 */
export function useIsOtherTyping(conversationId: string | null): boolean {
  const { user } = useAuth();
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!conversationId || !user?.id) {
      setIsTyping(false);
      return;
    }

    const unsubscribe = subscribeToTyping(conversationId, user.id, (typing) => {
      setIsTyping(typing);
    });

    return () => {
      unsubscribe();
    };
  }, [conversationId, user?.id]);

  return isTyping;
}
