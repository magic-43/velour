import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { globalPresenceManager } from '../presenceManager';
import { isUserOnline as checkIsUserOnline, formatLastSeen } from '../utils/presenceUtils';

export function usePresence() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(() =>
    globalPresenceManager.getOnlineUserIds()
  );

  useEffect(() => {
    if (!user?.id) return;
    globalPresenceManager.initialize(user.id);
    const unsubscribe = globalPresenceManager.subscribe((set) => {
      setOnlineUsers(new Set(set));
    });
    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  const isUserOnline = useCallback(
    (targetUserId?: string | null, lastSeenAt?: string | null) => {
      return checkIsUserOnline(targetUserId, lastSeenAt, onlineUsers, user?.id);
    },
    [onlineUsers, user?.id]
  );

  const formatUserLastSeen = useCallback(
    (lastSeenAt?: string | null, isOnline?: boolean) => {
      return formatLastSeen(lastSeenAt, isOnline, user?.id);
    },
    [user?.id]
  );

  return { onlineUsers, isUserOnline, formatUserLastSeen };
}
