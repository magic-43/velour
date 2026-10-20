import { useState, useEffect, useRef } from 'react';
import { WifiOff, Check } from 'lucide-react';

export default function NetworkStatusBar() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  const [showReconnected, setShowReconnected] = useState(false);
  const offlineTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOffline = () => {
      // Debounce offline notification to avoid false positives on mobile WebView wake/switch
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = setTimeout(() => {
        if (!navigator.onLine) {
          setIsOnline(false);
          setShowReconnected(false);
        }
      }, 2500);
    };

    const handleOnline = () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 1500);
      return () => clearTimeout(timer);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (isOnline && !showReconnected) {
    return null;
  }

  return (
    <div className="fixed top-1.5 sm:top-2 left-1/2 -translate-x-1/2 z-[70] pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-top-1">
      {!isOnline ? (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#161618]/95 border border-white/10 text-neutral-300 shadow-xl backdrop-blur-md text-[11px] font-medium tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span>Waiting for network...</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#161618]/95 border border-emerald-500/30 text-emerald-300 shadow-xl backdrop-blur-md text-[11px] font-medium tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span>Connected</span>
        </div>
      )}
    </div>
  );
}
