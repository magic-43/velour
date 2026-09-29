import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

/**
 * Hook to manage native Android hardware back button and status bar styling.
 * Safely no-ops in desktop/mobile web browsers.
 */
export function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Configure Status Bar on native Android
    try {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#0a0a0c' });
      StatusBar.setOverlaysWebView({ overlay: false });
    } catch (err) {
      console.warn('StatusBar initialization error:', err);
    }

    // Scroll chat bottom into view when virtual keyboard opens
    const keyboardListenerPromise = Keyboard.addListener('keyboardDidShow', () => {
      const bottomMarker = document.querySelector('[data-chat-bottom="true"]');
      bottomMarker?.scrollIntoView({ behavior: 'smooth' });
    });

    // Android Hardware Back Button listener
    const backListenerPromise = CapApp.addListener('backButton', () => {
      // 1. Check if any modal, lightbox, sheet, or context menu is open
      const openModal = document.querySelector(
        '[data-backdrop="true"], [role="dialog"], .fixed.inset-0.z-\\[120\\], .fixed.inset-0.z-\\[140\\], .fixed.inset-0.z-\\[150\\]'
      );

      if (openModal) {
        // Dispatch Escape key to dismiss top modal/menu
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }

      // 2. Navigate backwards if in a sub-route
      const pathname = window.location.pathname;
      const isRoot = pathname === '/' || pathname === '/login' || pathname === '/signup';

      if (!isRoot) {
        navigate(-1);
      } else {
        // If at root page, exit app
        CapApp.exitApp();
      }
    });

    return () => {
      backListenerPromise.then((handle) => handle.remove()).catch(() => {});
      keyboardListenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [navigate, location]);
}
