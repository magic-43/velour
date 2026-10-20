import React, { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { triggerHaptic } from '../../lib/haptics';

export interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<any> | void;
  className?: string;
  disabled?: boolean;
  pullThreshold?: number;
  maxPull?: number;
  indicatorOffsetTop?: number;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

/**
 * PullToRefresh
 * Luxury-styled pull-to-refresh component for mobile & touch views.
 *
 * Features:
 * - Zero-interference scroll check: only activates when scrollTop <= 0.
 * - Logarithmic drag resistance curve.
 * - Tactile native haptic pulse at threshold trigger.
 * - Obsidian and champagne gold floating badge with rotating arrow / spinner.
 * - Smooth spring-back transitions on release and completion.
 */
export const PullToRefresh = forwardRef<HTMLDivElement, PullToRefreshProps>(function PullToRefresh(
  {
    children,
    onRefresh,
    className = 'flex-1 overflow-y-auto',
    disabled = false,
    pullThreshold = 64,
    maxPull = 92,
    indicatorOffsetTop = 14,
    onScroll,
  },
  forwardedRef
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(forwardedRef, () => containerRef.current as HTMLDivElement);

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const startYRef = useRef<number | null>(null);
  const canPullRef = useRef<boolean>(false);
  const hasTriggeredHapticRef = useRef<boolean>(false);
  const isRefreshingRef = useRef<boolean>(false);
  isRefreshingRef.current = isRefreshing;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || isRefreshingRef.current) return;

    const el = containerRef.current;
    if (!el) return;

    // Only engage if container is scrolled all the way to the top
    if (el.scrollTop <= 0) {
      canPullRef.current = true;
      startYRef.current = e.touches[0].clientY;
      hasTriggeredHapticRef.current = false;
    } else {
      canPullRef.current = false;
      startYRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || !canPullRef.current || startYRef.current === null || isRefreshingRef.current) return;

    const el = containerRef.current;
    if (el && el.scrollTop > 0) {
      // User scrolled down into content, cancel pull-to-refresh
      canPullRef.current = false;
      setPullDistance(0);
      setIsDragging(false);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      // Damped curve for weighted, natural resistance
      const damped = Math.min(maxPull, Math.pow(diff, 0.82) * 1.5);
      setPullDistance(damped);
      setIsDragging(true);

      // Light haptic feedback exactly when crossing the trigger threshold
      if (damped >= pullThreshold && !hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = true;
        triggerHaptic('light');
      } else if (damped < pullThreshold && hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = false;
      }
    } else {
      setPullDistance(0);
      setIsDragging(false);
    }
  };

  const executeRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPullDistance(pullThreshold * 0.82); // Smooth holding position
    setIsDragging(false);

    try {
      await onRefresh();
      triggerHaptic('selection');
    } catch (err) {
      console.error('Pull-to-refresh failed:', err);
    } finally {
      // Retract indicator smoothly
      setTimeout(() => {
        setPullDistance(0);
        setIsRefreshing(false);
        hasTriggeredHapticRef.current = false;
        canPullRef.current = false;
        startYRef.current = null;
      }, 150);
    }
  }, [onRefresh, pullThreshold]);

  const handleTouchEnd = () => {
    if (disabled || isRefreshingRef.current || !canPullRef.current) {
      canPullRef.current = false;
      startYRef.current = null;
      return;
    }

    canPullRef.current = false;
    startYRef.current = null;

    if (pullDistance >= pullThreshold) {
      executeRefresh();
    } else {
      // Snap back to top
      setIsDragging(false);
      setPullDistance(0);
    }
  };

  const rotation = Math.min(180, (pullDistance / pullThreshold) * 180);
  const opacity = pullDistance > 6 ? Math.min(1, pullDistance / 28) : 0;

  return (
    <div className="relative flex-1 min-h-0 w-full h-full overflow-hidden flex flex-col">
      {/* Floating Luxury Pull Indicator */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none"
        style={{
          top: `${indicatorOffsetTop}px`,
          transform: `translate(-50%, ${pullDistance > 0 ? pullDistance - 48 : -60}px)`,
          transition: isDragging
            ? 'none'
            : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
          opacity: isRefreshing ? 1 : opacity,
        }}
        aria-hidden="true"
      >
        <div
          className={`w-10 h-10 rounded-full bg-[#121214]/95 backdrop-blur-md border flex items-center justify-center transition-all duration-200 shadow-xl ${
            pullDistance >= pullThreshold || isRefreshing
              ? 'border-gold text-gold shadow-gold/20 scale-105'
              : 'border-white/15 text-white/70'
          }`}
        >
          {isRefreshing ? (
            <div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg
              className="w-4 h-4 transition-transform duration-75"
              style={{ transform: `rotate(${rotation}deg)` }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`w-full flex-1 min-h-0 ${className || ''}`}
        style={{
          transform:
            pullDistance > 0
              ? `translateY(${Math.min(pullDistance * 0.38, 30)}px)`
              : 'none',
          transition: isDragging
            ? 'none'
            : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
});

export default PullToRefresh;
