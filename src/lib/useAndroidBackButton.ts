import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { executeBackHandlers } from './backButtonRegistry';

let lastBackPressTime = 0;

function showExitToast(message = 'Press back again to exit') {
  const existing = document.getElementById('velour-exit-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'velour-exit-toast';
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '84px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.backgroundColor = '#18181c';
  toast.style.color = '#F5F5F7';
  toast.style.border = '1px solid rgba(198, 168, 94, 0.4)';
  toast.style.padding = '8px 18px';
  toast.style.borderRadius = '9999px';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '500';
  toast.style.letterSpacing = '0.02em';
  toast.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.6)';
  toast.style.zIndex = '99999';
  toast.style.pointerEvents = 'none';
  toast.style.transition = 'opacity 0.25s ease-out';
  toast.style.opacity = '1';

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 1800);
}

/**
 * Hook to manage native Android hardware back button and status bar styling.
 * Safely no-ops in desktop/mobile web browsers.
 */
export function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

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
      // 1. Check registered React component handlers (highest priority)
      if (executeBackHandlers()) {
        return;
      }

      // 2. Check if any generic modal, lightbox, sheet, or context menu is open in DOM
      const openModal = document.querySelector(
        '[data-backdrop="true"], [role="dialog"], [data-modal="true"], .fixed.inset-0.z-\\[100\\], .fixed.inset-0.z-\\[120\\], .fixed.inset-0.z-\\[140\\], .fixed.inset-0.z-\\[150\\]'
      );

      if (openModal) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }

      const pathname = locationRef.current.pathname;

      // 3. Sub-route navigation rules
      // If inside a chat conversation (/messages/:id), go back to previous route or /messages
      if (pathname.startsWith('/messages/') && pathname !== '/messages') {
        if (window.history.state && window.history.state.idx > 0) {
          navigate(-1);
        } else {
          navigate('/messages');
        }
        return;
      }

      // If inside settings sub-section (/settings/:section), go back to /settings
      if (pathname.startsWith('/settings/') && pathname !== '/settings') {
        navigate('/settings');
        return;
      }

      // If on settings root (/settings) or wallet (/wallet), return to previous route (e.g. /me) or /me
      if (pathname === '/settings' || pathname === '/wallet') {
        if (window.history.state && window.history.state.idx > 0) {
          navigate(-1);
        } else {
          navigate('/me');
        }
        return;
      }

      // If on creator/public profile, navigate back
      if (pathname.startsWith('/profile/') || pathname.startsWith('/creator/')) {
        navigate(-1);
        return;
      }

      // 4. Secondary top-level tabs -> return to Home Feed ('/')
      if (
        pathname === '/messages' ||
        pathname === '/explore' ||
        pathname === '/me'
      ) {
        navigate('/');
        return;
      }

      // 5. At Home ('/') or auth root: double-tap to exit
      const isHomeRoot = pathname === '/' || pathname === '/login' || pathname === '/signup';
      if (isHomeRoot) {
        const now = Date.now();
        if (now - lastBackPressTime < 2000) {
          CapApp.exitApp();
        } else {
          lastBackPressTime = now;
          showExitToast('Press back again to exit');
        }
      } else {
        // Fallback for any other route
        navigate(-1);
      }
    });

    return () => {
      backListenerPromise.then((handle) => handle.remove()).catch(() => {});
      keyboardListenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [navigate]);
}
