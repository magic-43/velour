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
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-top-2">
      {!isOnline ? (
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1c140a]/95 border border-amber-500/40 text-amber-300 shadow-xl backdrop-blur-md text-[11px] font-medium tracking-wide">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <WifiOff size={13} className="text-amber-400" />
          <span>Waiting for network · Showing offline data</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0a1c12]/95 border border-emerald-500/40 text-emerald-300 shadow-xl backdrop-blur-md text-[11px] font-medium tracking-wide">
          <Check size={13} className="text-emerald-400" />
          <span>Connected · Syncing messages</span>
        </div>
      )}
    </div>
  );
}
