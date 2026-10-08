import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { triggerNotificationFeedback } from './soundNotification';

export interface NotificationPreferences {
  directMessages: boolean;
  creatorStories: boolean;
  storyReactions: boolean;
  inAppSounds: boolean;
  emailDigest: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  directMessages: true,
  creatorStories: true,
  storyReactions: true,
  inAppSounds: true,
  emailDigest: false,
};

let navigationHandler: ((path: string) => void) | null = null;
let isChannelConfigured = false;
let isListenerConfigured = false;

/**
 * Retrieve saved notification preferences for a user, or defaults.
 */
export function getNotificationPreferences(userId?: string): NotificationPreferences {
  try {
    const key = userId ? `velour_notifications_${userId}` : 'velour_notifications_default';
    const raw = localStorage.getItem(key);
    if (raw) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('Failed reading notification preferences:', err);
  }
  return DEFAULT_PREFERENCES;
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
    localStorage.setItem(key, JSON.stringify(prefs));
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
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (err) {
      console.error('Failed requesting Web Notification permission:', err);
      return false;
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

export interface ShowNotificationOptions {
  conversationId: string;
  senderName: string;
  body: string;
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
  userId,
  isForegroundActive = false,
}: ShowNotificationOptions): Promise<void> {
  const prefs = getNotificationPreferences(userId);

  // 1. Play in-app sound & haptic feedback if enabled
  if (prefs.inAppSounds) {
    triggerNotificationFeedback().catch(() => {});
  }

  // 2. If Direct Messages notifications are disabled, stop here
  if (!prefs.directMessages) {
    return;
  }

  // 3. If user is actively reading this exact conversation in foreground, suppress system banner
  if (isForegroundActive && typeof document !== 'undefined' && !document.hidden) {
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

  // 5. Desktop / Web Browser Fallback
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(senderName || 'New Message', {
          body: body || 'You received a new message',
          icon: '/favicon.ico',
          tag: `velour-msg-${conversationId}`,
        });

        notif.onclick = () => {
          window.focus();
          if (navigationHandler) {
            navigationHandler(`/messages/${conversationId}`);
          } else {
            window.location.href = `/messages/${conversationId}`;
          }
          notif.close();
        };
      } catch (err) {
        console.warn('Web Notification display error:', err);
      }
    }
  }
}
