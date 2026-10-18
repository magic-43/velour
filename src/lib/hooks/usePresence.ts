import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { globalPresenceManager } from '../presenceManager';
import { isUserOnline as checkIsUserOnline, formatLastSeen } from '../utils/presenceUtils';

export function usePresence() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(() =>
    globalPresenceManager.getOnlineUserIds()
  );
  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(() =>
    globalPresenceManager.getHiddenUserIds()
  );

  useEffect(() => {
    if (!user?.id) return;
    globalPresenceManager.initialize(user.id);
    const unsubscribe = globalPresenceManager.subscribe((onlineSet, hiddenSet) => {
      setOnlineUsers(new Set(onlineSet));
      setHiddenUsers(new Set(hiddenSet));
    });
    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  const isUserOnline = useCallback(
    (targetUserId?: string | null, lastSeenAt?: string | null) => {
      return checkIsUserOnline(targetUserId, lastSeenAt, onlineUsers, hiddenUsers, user?.id);
    },
    [onlineUsers, hiddenUsers, user?.id]
  );

  const formatUserLastSeen = useCallback(
    (lastSeenAt?: string | null, isOnline?: boolean, targetUserId?: string | null) => {
      return formatLastSeen(lastSeenAt, isOnline, user?.id, targetUserId, hiddenUsers);
    },
    [user?.id, hiddenUsers]
  );

  return { onlineUsers, hiddenUsers, isUserOnline, formatUserLastSeen };
}

