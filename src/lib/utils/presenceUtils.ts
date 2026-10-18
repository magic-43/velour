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
  } catch {}
}

/**
 * Returns true if the user is considered online based on presence set or recent lastSeen timestamp.
 */
export function isUserOnline(
  userId?: string | null,
  lastSeenAt?: string | null,
  onlineUserIds?: Set<string>,
  viewerUserId?: string
): boolean {
  if (!userId) return false;

  // If viewer has disabled their own last seen / online visibility, they cannot see others' (WhatsApp rule)
  if (viewerUserId && getMyLastSeenPrivacy(viewerUserId) === 'nobody') {
    return false;
  }

  // 1. Direct real-time presence check
  if (onlineUserIds && onlineUserIds.has(userId)) {
    return true;
  }

  // 2. Fallback to last_seen_at within 2 minutes (120,000 ms)
  if (!lastSeenAt) return false;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  return diff >= 0 && diff < 2 * 60 * 1000;
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
 * - "last seen recently" (if null, private, or unknown)
 */
export function formatLastSeen(
  lastSeenAt?: string | null,
  isOnline = false,
  viewerUserId?: string
): string {
  if (viewerUserId && getMyLastSeenPrivacy(viewerUserId) === 'nobody') {
    return 'last seen recently';
  }

  if (isOnline) {
    return 'online';
  }

  if (!lastSeenAt) {
    return 'last seen recently';
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
