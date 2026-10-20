import React, { useState } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import {
  requestNotificationPermission,
  markInitialNotificationPromptViewed,
  sendTestDesktopNotification,
} from '../../lib/notificationService';

interface NotificationPermissionModalProps {
  isOpen: boolean;
  onClose: (granted: boolean) => void;
}

export default function NotificationPermissionModal({
  isOpen,
  onClose,
}: NotificationPermissionModalProps) {
  const [requesting, setRequesting] = useState(false);

  if (!isOpen) return null;

  const handleEnable = async () => {
    setRequesting(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        await sendTestDesktopNotification();
      }
      onClose(granted);
    } finally {
      setRequesting(false);
    }
  };

  const handleDismiss = () => {
    markInitialNotificationPromptViewed();
    onClose(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      {/* Seductive Ambient Candlelight Glow */}
      <div className="absolute w-72 h-72 bg-gradient-to-tr from-amber-950/20 to-rose-950/25 rounded-full blur-3xl pointer-events-none" />

      {/* Velvet Luxury Modal Card */}
      <div className="relative w-full max-w-sm bg-[#0e0d0c]/95 border border-gold/30 rounded-3xl p-6 sm:p-8 shadow-2xl text-center z-10 overflow-hidden">
        {/* Subtle Gold Rim Highlight */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

        {/* Ambient Bell Icon with Pulsing Halo */}
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-b from-[#181614] to-[#0a0a09] border border-gold/30 flex items-center justify-center mx-auto mb-5 shadow-[0_0_35px_rgba(201,169,110,0.22)]">
          <Bell size={26} className="text-gold animate-pulse" />
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold/20 flex items-center justify-center">
            <Sparkles size={10} className="text-gold" />
          </div>
        </div>

        {/* Editorial Headline & Subtitle */}
        <p className="text-[10px] tracking-[0.28em] uppercase text-gold/80 font-medium mb-1.5">
          Velour Private Access
        </p>
        <h3 className="font-serif text-2xl font-light text-paper tracking-wide mb-2">
          House of Desire Alerts
        </h3>
        <p className="text-muted text-xs leading-relaxed max-w-xs mx-auto mb-6">
          Receive instant, discreet notifications for incoming private messages, tips, and exclusive creator drops.
        </p>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleEnable}
            disabled={requesting}
            className="w-full py-3.5 px-6 rounded-full bg-gradient-to-r from-[#faeed7] via-[#c9a96e] to-[#9e7638] text-ink font-semibold text-xs tracking-wider uppercase shadow-[0_4px_24px_rgba(201,169,110,0.25)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            {requesting ? 'Connecting...' : 'Enable Notifications'}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            disabled={requesting}
            className="w-full py-2 text-muted hover:text-paper text-[11px] tracking-wider uppercase transition-colors cursor-pointer"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
