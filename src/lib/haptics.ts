import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export type HapticFeedbackType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

/**
 * Triggers native device haptics via Capacitor on Android/iOS,
 * with graceful fallback to navigator.vibrate on web.
 */
export async function triggerHaptic(type: HapticFeedbackType = 'light'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      switch (type) {
        case 'light':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'medium':
          await Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case 'heavy':
          await Haptics.impact({ style: ImpactStyle.Heavy });
          break;
        case 'selection':
          await Haptics.selectionChanged();
          break;
        case 'success':
          await Haptics.notification({ type: NotificationType.Success });
          break;
        case 'warning':
          await Haptics.notification({ type: NotificationType.Warning });
          break;
        case 'error':
          await Haptics.notification({ type: NotificationType.Error });
          break;
      }
      return;
    } catch {
      // Fall through to navigator.vibrate if native plugin fails
    }
  }

  // Web fallback
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      const duration = type === 'heavy' || type === 'error' ? 30 : type === 'medium' ? 20 : 10;
      navigator.vibrate(duration);
    } catch {
      // Ignore vibration errors
    }
  }
}
