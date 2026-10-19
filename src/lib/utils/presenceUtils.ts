import { supabase } from '../supabase';

/**
 * Utility functions for user online status and last-seen formatting
 */

export type LastSeenPrivacy = 'everyone' | 'nobody';

export function getMyLastSeenPrivacy(userId?: string | null): LastSeenPrivacy {
  if (!userId) return 'everyone';
  try {
    const val = localStorage.getItem(`velour_privacy_last_seen_${userId}`);
    return val === 'nobody' ? 'nobody' : 'everyone';
  } catch {
    return 'everyone';
  }
}

export function setMyLastSeenPrivacy(userId: string, privacy: LastSeenPrivacy) {
  try {
    localStorage.setItem(`velour_privacy_last_seen_${userId}`, privacy);
    window.dispatchEvent(new CustomEvent('velour:privacy_changed', { detail: { privacy } }));

    // Sync to Supabase auth metadata, profiles, and creator_profiles
    if (privacy === 'nobody') {
      Promise.resolve(
        supabase
          .from('profiles')
          .update({ last_seen_at: null })
          .eq('id', userId)
      ).catch(() => {});
      Promise.resolve(
        supabase.auth.updateUser({ data: { last_seen_privacy: 'nobody' } })
      ).catch(() => {});
      // Sync tag on creator profile
      Promise.resolve(
        supabase
          .from('creator_profiles')
          .select('id, tags')
          .eq('owner_id', userId)
          .maybeSingle()
      )
        .then(({ data: cp }: any) => {
          if (cp) {
            const currentTags = (cp.tags || []) as string[];
            const updatedTags = Array.from(new Set([...currentTags, 'hide_presence']));
            return supabase
              .from('creator_profiles')
              .update({ tags: updatedTags })
              .eq('id', cp.id);
          }
        })
        .catch(() => {});
    } else {
      Promise.resolve(
        supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', userId)
      ).catch(() => {});
      Promise.resolve(
        supabase.auth.updateUser({ data: { last_seen_privacy: 'everyone' } })
      ).catch(() => {});
      // Remove tag on creator profile
      Promise.resolve(
        supabase
          .from('creator_profiles')
          .select('id, tags')
          .eq('owner_id', userId)
          .maybeSingle()
      )
        .then(({ data: cp }: any) => {
          if (cp) {
            const currentTags = (cp.tags || []) as string[];
            const updatedTags = currentTags.filter((t) => t !== 'hide_presence');
            return supabase
              .from('creator_profiles')
              .update({ tags: updatedTags })
              .eq('id', cp.id);
          }
        })
        .catch(() => {});
    }
  } catch {}
}

/**
 * Returns true if the user is considered online based on presence set or recent lastSeen timestamp.
 */
export function isUserOnline(
  userId?: string | null,
  lastSeenAt?: string | null,
  onlineUserIds?: Set<string>,
  hiddenUserIds?: Set<string>,
  _viewerUserId?: string
): boolean {
  if (!userId) return false;

  // If target user is explicitly hidden in presence, they are NEVER online
  if (hiddenUserIds && hiddenUserIds.has(userId)) {
    return false;
  }

  // If target user's local privacy setting is nobody (e.g. current creator or same device test)
  if (getMyLastSeenPrivacy(userId) === 'nobody') {
    return false;
  }

  // 1. Direct real-time presence check
  if (onlineUserIds && onlineUserIds.has(userId)) {
    return true;
  }

  // 2. Fallback to last_seen_at within 5 minutes (300,000 ms) to avoid abrupt chat disconnects
  if (!lastSeenAt) return false;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  return diff >= 0 && diff < 5 * 60 * 1000;
}

/**
 * Formats a last_seen timestamp in WhatsApp / Telegram style:
 * - "online" if isOnline is true
 * - "last seen just now" (< 1 min)
 * - "last seen 5m ago" (< 60 min)
 * - "last seen today at 2:45 PM"
 * - "last seen yesterday at 11:30 AM"
 * - "last seen Oct 14 at 4:10 PM" (this year)
 * - "last seen Oct 14, 2024" (older years)
 * - "" (empty string if hidden, null, or private)
 */
export function formatLastSeen(
  lastSeenAt?: string | null,
  isOnline = false,
  _viewerUserId?: string,
  targetUserId?: string | null,
  hiddenUserIds?: Set<string>
): string {
  // If target user is explicitly hidden in presence or settings, NEVER show any timestamp
  if (targetUserId && hiddenUserIds && hiddenUserIds.has(targetUserId)) {
    return '';
  }
  if (targetUserId && getMyLastSeenPrivacy(targetUserId) === 'nobody') {
    return '';
  }

  if (isOnline) {
    return 'online';
  }

  if (!lastSeenAt) {
    return '';
  }

  const d = new Date(lastSeenAt);
  if (isNaN(d.getTime())) {
    return 'last seen recently';
  }

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  // If timestamp is slightly in the future due to clock skew, treat as online / just now
  if (diffMs < 0 && Math.abs(diffMs) < 60000) {
    return 'online';
  }

  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return 'last seen just now';
  }

  if (diffMins < 60) {
    return `last seen ${diffMins}m ago`;
  }

  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // Check if today
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return `last seen today at ${timeStr}`;
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `last seen yesterday at ${timeStr}`;
  }

  // Check if current year
  const isCurrentYear = d.getFullYear() === now.getFullYear();
  if (isCurrentYear) {
    const monthDay = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `last seen ${monthDay} at ${timeStr}`;
  }

  return `last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

