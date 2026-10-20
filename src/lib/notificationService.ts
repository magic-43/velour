import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { triggerNotificationFeedback } from './soundNotification';

export interface NotificationPreferences {
  directMessages: boolean;
  soundAndHaptics: boolean;
  inAppSounds?: boolean; // alias for soundAndHaptics
  emailDigest: boolean;
  // Creator specific
  giftsAndTips?: boolean;
  unlockRequests?: boolean;
  storyReactions?: boolean;
  newFollowers?: boolean;
  // Fan specific
  creatorStories?: boolean;
  unlockConfirmations?: boolean;
}

export const DEFAULT_CREATOR_NOTIFICATIONS: NotificationPreferences = {
  directMessages: true,
  giftsAndTips: true,
  unlockRequests: true,
  storyReactions: true,
  newFollowers: true,
  soundAndHaptics: true,
  inAppSounds: true,
  emailDigest: true,
};

export const DEFAULT_FAN_NOTIFICATIONS: NotificationPreferences = {
  directMessages: true,
  creatorStories: true,
  unlockConfirmations: true,
  soundAndHaptics: true,
  inAppSounds: true,
  emailDigest: false,
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  directMessages: true,
  creatorStories: true,
  giftsAndTips: true,
  unlockRequests: true,
  storyReactions: true,
  newFollowers: true,
  unlockConfirmations: true,
  soundAndHaptics: true,
  inAppSounds: true,
  emailDigest: false,
};

let navigationHandler: ((path: string) => void) | null = null;
let isChannelConfigured = false;
let isListenerConfigured = false;

/**
 * Retrieve saved notification preferences for a user, or defaults based on role.
 */
export function getNotificationPreferences(userId?: string, isCreator?: boolean): NotificationPreferences {
  const baseDefaults = isCreator ? DEFAULT_CREATOR_NOTIFICATIONS : DEFAULT_FAN_NOTIFICATIONS;
  try {
    const key = userId ? `velour_notifications_${userId}` : 'velour_notifications_default';
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.soundAndHaptics !== undefined && parsed.inAppSounds === undefined) {
        parsed.inAppSounds = parsed.soundAndHaptics;
      } else if (parsed.inAppSounds !== undefined && parsed.soundAndHaptics === undefined) {
        parsed.soundAndHaptics = parsed.inAppSounds;
      }
      return { ...baseDefaults, ...parsed };
    }
  } catch (err) {
    console.warn('Failed reading notification preferences:', err);
  }
  return baseDefaults;
}

/**
 * Persist notification preferences for a user.
 */
export function saveNotificationPreferences(
  prefs: NotificationPreferences,
  userId?: string
): void {
  try {
    const key = userId ? `velour_notifications_${userId}` : 'velour_notifications_default';
    const toSave = {
      ...prefs,
      inAppSounds: prefs.soundAndHaptics ?? prefs.inAppSounds ?? true,
      soundAndHaptics: prefs.soundAndHaptics ?? prefs.inAppSounds ?? true,
    };
    localStorage.setItem(key, JSON.stringify(toSave));
  } catch (err) {
    console.error('Failed saving notification preferences:', err);
  }
}

/**
 * Configure Android notification channels if on native Capacitor platform.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (!isChannelConfigured && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await LocalNotifications.createChannel({
        id: 'velour_messages',
        name: 'Direct Messages',
        description: 'Instant alerts for incoming chat messages',
        importance: 4, // High importance (heads-up notification)
        visibility: 1, // Public on lockscreen
        vibration: true,
      });
      isChannelConfigured = true;
    } catch (err) {
      console.warn('Could not create Android notification channel:', err);
    }
  }
}

/**
 * Request OS or browser permissions for push/local notifications.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.requestPermissions();
      const granted = status.display === 'granted';
      try {
        localStorage.setItem('velour_notif_status', granted ? 'granted' : 'denied');
        localStorage.setItem('velour_notif_prompt_viewed', 'true');
      } catch (_) {}
      if (granted) {
        await ensureAndroidChannel();
      }
      return granted;
    } catch (err) {
      console.error('Failed requesting Capacitor local notifications permission:', err);
      return false;
    }
  }

  // Web Browser Notification API
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      let permission: NotificationPermission;
      const res = Notification.requestPermission();
      if (res && typeof (res as any).then === 'function') {
        permission = await res;
      } else {
        permission = await new Promise<NotificationPermission>((resolve) => {
          Notification.requestPermission(resolve);
        });
      }
      const granted = permission === 'granted';
      try {
        localStorage.setItem('velour_notif_status', granted ? 'granted' : 'denied');
        localStorage.setItem('velour_notif_prompt_viewed', 'true');
      } catch (_) {}
      return granted;
    } catch (err) {
      console.error('Failed requesting Web Notification permission:', err);
      return false;
    }
  }

  return false;
}

/**
 * Fires a test notification and sound to confirm notifications work.
 */
export async function sendTestDesktopNotification(): Promise<boolean> {
  triggerNotificationFeedback().catch(() => {});

  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification('Velour Messages', {
          body: 'Notifications are active! You will receive instant alerts for incoming messages.',
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'velour-test-alert',
        });
        notif.onclick = () => {
          try { window.focus(); } catch (_) {}
          notif.close();
        };
        setTimeout(() => notif.close(), 7000);
        return true;
      } catch (err) {
        console.warn('Failed displaying test notification:', err);
      }
    }
  }
  return false;
}

/**
 * Register global notification action listener for Capacitor and web.
 */
export function registerNotificationNavigation(onNavigate: (path: string) => void): () => void {
  navigationHandler = onNavigate;

  if (Capacitor.isNativePlatform() && !isListenerConfigured) {
    isListenerConfigured = true;
    LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
      const extra = notificationAction.notification.extra;
      if (extra?.conversationId && navigationHandler) {
        navigationHandler(`/messages/${extra.conversationId}`);
      }
    }).catch((err) => {
      console.warn('Error attaching LocalNotifications listener:', err);
    });
  }

  return () => {
    navigationHandler = null;
  };
}

/**
 * Check if the browser or OS supports notifications and what the current status is.
 */
export function getNotificationPermissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  if (Capacitor.isNativePlatform()) {
    try {
      const cached = localStorage.getItem('velour_notif_status');
      if (cached === 'granted') return 'granted';
      if (cached === 'denied') return 'denied';
    } catch (_) {}
    return 'default';
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Async query for real OS/browser notification permission.
 */
export async function checkNotificationPermission(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await LocalNotifications.checkPermissions();
      const state = res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'default';
      try {
        localStorage.setItem('velour_notif_status', state);
      } catch (_) {}
      return state;
    } catch {
      return 'unsupported';
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  const state = Notification.permission;
  try {
    localStorage.setItem('velour_notif_status', state);
  } catch (_) {}
  return state;
}

/**
 * Returns true if we should show the initial sign-in notification prompt (Option A).
 */
export function shouldShowInitialNotificationPrompt(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const viewed = localStorage.getItem('velour_notif_prompt_viewed');
    if (viewed) return false;
    const currentState = getNotificationPermissionState();
    return currentState === 'default';
  } catch {
    return false;
  }
}

/**
 * Mark that the initial notification prompt was answered or dismissed.
 */
export function markInitialNotificationPromptViewed(): void {
  try {
    localStorage.setItem('velour_notif_prompt_viewed', 'true');
  } catch (_) {}
}

/**
 * Returns true if we can prompt the user to allow notifications.
 */
export function canPromptDesktopNotifications(): boolean {
  return getNotificationPermissionState() === 'default';
}

export interface ShowNotificationOptions {
  conversationId: string;
  senderName: string;
  body: string;
  senderAvatarUrl?: string | null;
  userId?: string;
  isForegroundActive?: boolean;
}

/**
 * Dispatches a native or web notification and triggers sound/haptic feedback.
 */
export async function showNewMessageNotification({
  conversationId,
  senderName,
  body,
  senderAvatarUrl,
  userId,
  isForegroundActive = false,
}: ShowNotificationOptions): Promise<void> {
  const prefs = getNotificationPreferences(userId);

  // 1. Play in-app sound & haptic feedback if enabled
  if (prefs.inAppSounds || prefs.soundAndHaptics) {
    triggerNotificationFeedback().catch(() => {});
  }

  // 2. If Direct Messages notifications are disabled, stop here
  if (!prefs.directMessages) {
    return;
  }

  // 3. If user is actively reading this exact conversation in foreground with window focus, suppress system banner
  if (isForegroundActive && typeof document !== 'undefined' && !document.hidden && document.hasFocus()) {
    return;
  }

  // 4. Capacitor Native Platform (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      await ensureAndroidChannel();
      const notificationId = Math.floor(Math.random() * 899999) + 100000;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId,
            title: senderName || 'New Message',
            body: body || 'You received a new message',
            channelId: 'velour_messages',
            extra: {
              conversationId,
            },
            schedule: { at: new Date(Date.now() + 100) }, // Trigger immediately
          },
        ],
      });
      return;
    } catch (err) {
      console.warn('Capacitor LocalNotification schedule error:', err);
    }
  }

  // 5. Desktop / Web Browser Fallback (Windows Action Center, macOS Notifications)
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        const iconUrl = '/favicon.ico';
        let swShown = false;

        // 5a. Prefer ServiceWorker registration showNotification (100% reliable across all Chromium states)
        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && typeof reg.showNotification === 'function') {
              await reg.showNotification(senderName || 'New Message', {
                body: body || 'You received a new message',
                icon: iconUrl,
                badge: iconUrl,
                tag: `velour-msg-${conversationId}`,
                data: { conversationId },
                silent: true,
              });
              swShown = true;
            }
          } catch (swErr) {
            console.warn('ServiceWorker showNotification failed, trying window Notification:', swErr);
          }
        }

        // 5b. Fallback to classic window Notification constructor
        if (!swShown) {
          const notif = new Notification(senderName || 'New Message', {
            body: body || 'You received a new message',
            icon: iconUrl,
            badge: iconUrl,
            tag: `velour-msg-${conversationId}`,
          });

          notif.onclick = () => {
            try {
              window.focus();
            } catch (_) {}
            if (navigationHandler) {
              navigationHandler(`/messages/${conversationId}`);
            } else {
              window.location.href = `/messages/${conversationId}`;
            }
            notif.close();
          };
        }
      } catch (err) {
        console.warn('Web Notification display error:', err);
      }
    }
  }
}
