import { useState, useEffect } from 'react';

export type EffectiveConnectionType = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';

export interface NetworkQuality {
  isOnline: boolean;
  effectiveType: EffectiveConnectionType;
  saveData: boolean;
  isSlowConnection: boolean;
  rtt?: number;
  downlink?: number;
}

interface NetworkInformation extends EventTarget {
  effectiveType?: EffectiveConnectionType;
  saveData?: boolean;
  rtt?: number;
  downlink?: number;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

function getConnection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as NavigatorWithConnection;
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState<NetworkQuality>(() => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const conn = getConnection();
    const effectiveType = conn?.effectiveType || 'unknown';
    const saveData = Boolean(conn?.saveData);
    const isSlowConnection =
      saveData || effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';

    return {
      isOnline,
      effectiveType,
      saveData,
      isSlowConnection,
      rtt: conn?.rtt,
      downlink: conn?.downlink,
    };
  });

  useEffect(() => {
    const updateStatus = () => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const conn = getConnection();
      const effectiveType = conn?.effectiveType || 'unknown';
      const saveData = Boolean(conn?.saveData);
      const isSlowConnection =
        saveData || effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';

      setQuality({
        isOnline,
        effectiveType,
        saveData,
        isSlowConnection,
        rtt: conn?.rtt,
        downlink: conn?.downlink,
      });
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    const conn = getConnection();
    if (conn) {
      conn.addEventListener('change', updateStatus);
    }

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      if (conn) {
        conn.removeEventListener('change', updateStatus);
      }
    };
  }, []);

  return quality;
}
