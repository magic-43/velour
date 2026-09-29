import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCw,
  ZoomIn,
  ZoomOut,
  CornerUpLeft,
  Trash2,
  Smile,
} from 'lucide-react';
import { getAppleEmojiUrl } from '../../data/iosEmojis';

export interface LightboxMediaItem {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnailUrl?: string | null;
  title?: string;
  caption?: string | null;
  senderName?: string;
  senderAvatar?: string | null;
  timestamp?: string;
}

interface MediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  items: LightboxMediaItem[];
  initialIndex?: number;
  senderName?: string;
  senderAvatar?: string | null;
  timestamp?: string;
  caption?: string | null;
  onReply?: (item: LightboxMediaItem, index: number) => void;
  onDelete?: (item: LightboxMediaItem, index: number, deleteAll?: boolean) => void;
  onReact?: (emoji: string) => void;
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const LIGHTBOX_REACTION_EMOJIS = [
  { char: '❤️', code: '2764-fe0f', name: 'Love' },
  { char: '😂', code: '1f602', name: 'Haha' },
  { char: '😮', code: '1f62e', name: 'Wow' },
  { char: '😢', code: '1f622', name: 'Sad' },
  { char: '🙏', code: '1f64f', name: 'Pray' },
  { char: '👍', code: '1f44d', name: 'Like' },
];

export default function MediaLightbox({
  isOpen,
  onClose,
  items,
  initialIndex = 0,
  senderName,
  senderAvatar,
  timestamp,
  caption,
  onReply,
  onDelete,
  onReact,
}: MediaLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomScale, setZoomScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Custom Video Player State — Top One-Line Bar
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  // Scrubber dragging
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const isDraggingProgress = useRef(false);

  // Swipe Carousel & Swipe-Down-To-Dismiss handling
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isTopSwipeDown = useRef<boolean>(false);
  const gestureDirection = useRef<'horizontal' | 'vertical' | null>(null);
  const isDraggingSwipe = useRef(false);
  const hasMoved = useRef(false);
  const [dragDismissY, setDragDismissY] = useState(0);
  const [dragDeltaX, setDragDeltaX] = useState(0);

  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const filmstripContainerRef = useRef<HTMLDivElement | null>(null);

  // Prevent background scrolling while lightbox is active
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomScale(1);
    setRotation(0);
    setIsPlaying(false);
    setDragDismissY(0);
    setDragDeltaX(0);
    isDraggingSwipe.current = false;
    setShowEmojiPicker(false);
    setShowDeleteConfirm(false);
  }, [initialIndex, isOpen]);

  // Reset video & controls when index changes
  useEffect(() => {
    setZoomScale(1);
    setRotation(0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsBuffering(false);
    setDragDismissY(0);
    setDragDeltaX(0);
    isDraggingSwipe.current = false;
    setShowEmojiPicker(false);
    setShowDeleteConfirm(false);

    // Scroll active thumbnail inside filmstrip container ONLY
    // Crucial: NEVER call native scrollIntoView on off-screen elements because it
    // scrolls window / parent containers and breaks viewport centering when controls are hidden!
    if (controlsVisible && filmstripContainerRef.current) {
      const activeEl = thumbnailRefs.current[currentIndex];
      const container = filmstripContainerRef.current;
      if (activeEl && container) {
        const left = activeEl.offsetLeft - container.offsetWidth / 2 + activeEl.offsetWidth / 2;
        container.scrollTo({ left, behavior: 'smooth' });
      }
    }
  }, [currentIndex, controlsVisible]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2000);
  };

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    if (currentIndex < items.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [items.length, currentIndex]);

  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [items.length, currentIndex]);

  // Video Play / Pause actions
  const handlePlayVideo = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().catch(() => {});
            setIsPlaying(true);
          }
        });
    }
  };

  const handlePauseVideo = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const cyclePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rates = [1, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (videoRef.current) {
      videoRef.current.playbackRate = next;
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === ' ') {
        e.preventDefault();
        if (isPlaying) {
          handlePauseVideo();
        } else {
          handlePlayVideo();
        }
      }
      if (e.key === '+' || e.key === '=') setZoomScale((z) => Math.min(z + 0.5, 3));
      if (e.key === '-') setZoomScale((z) => Math.max(z - 0.5, 1));
      if (e.key === 'r' || e.key === 'R') setRotation((r) => (r + 90) % 360);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose, isPlaying]);

  // Touch handlers: Swipe down from top area to dismiss & Interactive 1:1 Horizontal Carousel Swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      gestureDirection.current = null;
      hasMoved.current = false;
      isTopSwipeDown.current = touch.clientY < Math.max(window.innerHeight * 0.42, 260);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const dy = currentY - touchStartY.current;
    const dx = currentX - touchStartX.current;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      hasMoved.current = true;
    }

    // Lock gesture direction on first significant movement
    if (gestureDirection.current === null) {
      if (isTopSwipeDown.current && dy > 10 && dy > Math.abs(dx) * 1.2) {
        gestureDirection.current = 'vertical';
      } else if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        gestureDirection.current = 'horizontal';
      }
    }

    // If vertical dismissal gesture
    if (gestureDirection.current === 'vertical') {
      if (dy > 0) {
        setDragDismissY(dy);
      }
      return;
    }

    // If horizontal carousel swipe gesture
    if (gestureDirection.current === 'horizontal' && zoomScale === 1 && items.length > 1) {
      isDraggingSwipe.current = true;
      let effectiveDx = dx;
      if ((currentIndex === 0 && dx > 0) || (currentIndex === items.length - 1 && dx < 0)) {
        effectiveDx = dx * 0.35;
      }
      setDragDeltaX(effectiveDx);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartX.current;
    const deltaY = endY - touchStartY.current;

    // Check swipe down dismissal threshold
    if (
      gestureDirection.current === 'vertical' &&
      isTopSwipeDown.current &&
      (dragDismissY > 75 || (deltaY > 60 && deltaY > Math.abs(deltaX) * 1.4))
    ) {
      setDragDismissY(0);
      touchStartX.current = null;
      touchStartY.current = null;
      isTopSwipeDown.current = false;
      gestureDirection.current = null;
      onClose();
      return;
    }

    setDragDismissY(0);

    // Check horizontal swipe transition
    if (gestureDirection.current === 'horizontal' && isDraggingSwipe.current) {
      if (deltaX < -45 && currentIndex < items.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else if (deltaX > 45 && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
    }

    setDragDeltaX(0);
    isDraggingSwipe.current = false;

    touchStartX.current = null;
    touchStartY.current = null;
    isTopSwipeDown.current = false;
    gestureDirection.current = null;
    setTimeout(() => {
      hasMoved.current = false;
    }, 100);
  };

  // Mouse drag for desktop horizontal sliding
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || zoomScale > 1 || items.length <= 1) return;
    touchStartX.current = e.clientX;
    touchStartY.current = e.clientY;
    hasMoved.current = false;
    isDraggingSwipe.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (touchStartX.current === null) return;
      const dx = moveEvent.clientX - touchStartX.current;
      if (Math.abs(dx) > 6) hasMoved.current = true;
      let effectiveDx = dx;
      if ((currentIndex === 0 && dx > 0) || (currentIndex === items.length - 1 && dx < 0)) {
        effectiveDx = dx * 0.35;
      }
      setDragDeltaX(effectiveDx);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      isDraggingSwipe.current = false;
      if (touchStartX.current !== null) {
        const deltaX = upEvent.clientX - touchStartX.current;
        if (deltaX < -45 && currentIndex < items.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else if (deltaX > 45 && currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1);
        }
      }
      setDragDeltaX(0);
      touchStartX.current = null;
      touchStartY.current = null;
      setTimeout(() => {
        hasMoved.current = false;
      }, 100);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTogglePiP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current.requestPictureInPicture) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('Picture-in-Picture not available:', err);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || isDraggingProgress.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
  };

  const handleSeek = (clientX: number) => {
    if (!progressBarRef.current || !videoRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = pos * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isDraggingProgress.current = true;
    handleSeek(e.clientX);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingProgress.current) {
        handleSeek(moveEvent.clientX);
      }
    };

    const onMouseUp = () => {
      isDraggingProgress.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleProgressBarTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.touches.length > 0) {
      handleSeek(e.touches[0].clientX);
    }
  };

  const handleReplyClick = () => {
    const current = items[currentIndex];
    if (current) onReply?.(current, currentIndex);
    onClose();
  };

  const handleDeleteClick = () => {
    setShowEmojiPicker(false);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteSingle = () => {
    setShowDeleteConfirm(false);
    const current = items[currentIndex];
    if (current) onDelete?.(current, currentIndex, false);
    showToast(items.length > 1 ? 'Deleted 1 item' : 'Deleted message');
    if (items.length <= 1) {
      onClose();
    }
  };

  const handleConfirmDeleteAll = () => {
    setShowDeleteConfirm(false);
    const current = items[currentIndex];
    if (current) onDelete?.(current, currentIndex, true);
    showToast(`Deleted all ${items.length} items`);
    onClose();
  };

  const handleSelectEmoji = (emoji: string) => {
    setShowEmojiPicker(false);
    onReact?.(emoji);
    showToast(`Reacted ${emoji}`);
  };

  if (!isOpen || items.length === 0) return null;

  const current = items[currentIndex] || items[0];
  const isVideo = current.mediaType === 'video';

  const displaySender = current.senderName || senderName || 'You';
  const displayAvatar = current.senderAvatar || senderAvatar;

  // Format datetime like "08/09/2026, 20:08" as in reference image
  const rawTime = current.timestamp || timestamp;
  let formattedDisplayTime = '';
  if (rawTime) {
    if (rawTime.includes('/') && rawTime.includes(':')) {
      formattedDisplayTime = rawTime;
    } else {
      const d = new Date(rawTime);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        formattedDisplayTime = `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
      } else {
        formattedDisplayTime = rawTime;
      }
    }
  } else {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    formattedDisplayTime = `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
  }

  // Caption text (from item or message text)
  const displayCaption = current.caption || caption || current.title || null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remainingTime = Math.max(0, duration - currentTime);

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] select-none overflow-hidden text-paper flex items-center justify-center touch-none overscroll-none h-[100dvh]"
      style={{
        backgroundColor:
          dragDismissY > 0
            ? `rgba(0, 0, 0, ${Math.max(0.2, 1 - dragDismissY / 420)})`
            : 'rgb(0, 0, 0)',
        transition: dragDismissY > 0 ? 'none' : 'background-color 200ms ease-out',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-ink-light/95 border border-gold/30 backdrop-blur-md px-4 py-2 rounded-full text-xs font-medium text-gold shadow-2xl animate-in fade-in duration-150">
          {toastMessage}
        </div>
      )}

      {/* Swipe Down To Dismiss Motion Container */}
      <div
        className="w-full h-full relative flex items-center justify-center overflow-hidden"
        style={{
          transform:
            dragDismissY > 0
              ? `translateY(${dragDismissY}px) scale(${Math.max(0.85, 1 - dragDismissY / 900)})`
              : undefined,
          transition: dragDismissY > 0 ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* ─────────────────────────────────────────────────────────────
            1. FULLSCREEN MEDIA VIEWPORT (Background Layer)
            - Tapping outside the play button toggles floating overlays
            - Tapping a playing video DOES NOT pause it; it brings up overlays
            ───────────────────────────────────────────────────────────── */}
        {/* ─────────────────────────────────────────────────────────────
            1. FULLSCREEN SLIDING CAROUSEL VIEWPORT (Background Layer)
            - Horizontal strip of all items for real-time 1:1 sliding swipe
            - As you swipe, one image leaves and another shows (matching reference)
            - Tapping outside interactive buttons toggles floating overlays
            ───────────────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden z-10 flex items-center cursor-pointer"
          onMouseDown={handleMouseDown}
        >
          <div
            className="w-full h-full flex items-center will-change-transform"
            style={{
              transform: `translateX(calc(-${currentIndex * 100}% + ${dragDeltaX}px))`,
              transition: isDraggingSwipe.current
                ? 'none'
                : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {items.map((item, idx) => {
              const isItemVideo = item.mediaType === 'video';
              const isCurrent = idx === currentIndex;
              return (
                <div
                  key={idx}
                  className="w-full h-full shrink-0 flex items-center justify-center relative select-none px-1"
                  onClick={() => {
                    if (!hasMoved.current) {
                      setShowEmojiPicker(false);
                      setControlsVisible((prev) => !prev);
                    }
                  }}
                >
                  {isItemVideo ? (
                    <div
                      className="relative w-full h-full flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasMoved.current) {
                          setShowEmojiPicker(false);
                          setControlsVisible((prev) => !prev);
                        }
                      }}
                    >
                      <video
                        ref={(el) => {
                          if (isCurrent) {
                            videoRef.current = el;
                          }
                        }}
                        src={item.mediaUrl}
                        poster={item.thumbnailUrl || undefined}
                        playsInline
                        muted={isMuted}
                        onTimeUpdate={isCurrent ? handleTimeUpdate : undefined}
                        onLoadedMetadata={isCurrent ? handleLoadedMetadata : undefined}
                        onWaiting={() => isCurrent && setIsBuffering(true)}
                        onStalled={() => isCurrent && setIsBuffering(true)}
                        onPlaying={() => isCurrent && setIsBuffering(false)}
                        onEnded={() => isCurrent && setIsPlaying(false)}
                        className="w-full h-full max-h-full max-w-full object-contain select-none"
                      />

                      {/* Glowing Gold Buffering Indicator (current video only) */}
                      {isCurrent && isBuffering && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                          <div className="w-12 h-12 rounded-full border-[2.5px] border-white/20 border-t-gold animate-spin backdrop-blur-[2px] bg-black/40 shadow-xl" />
                        </div>
                      )}

                      {/* Center Big Play / Pause Button for current video */}
                      {isCurrent && !isBuffering && (
                        <>
                          {!isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                              <button
                                type="button"
                                onClick={handlePlayVideo}
                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/65 hover:bg-black/85 border border-gold/40 backdrop-blur-md flex items-center justify-center text-gold shadow-[0_0_24px_rgba(212,175,55,0.4)] pointer-events-auto cursor-pointer hover:scale-105 active:scale-95 transition-all"
                                title="Play Video"
                              >
                                <Play size={30} fill="currentColor" className="ml-1 text-gold" />
                              </button>
                            </div>
                          )}

                          {isPlaying && controlsVisible && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 animate-in fade-in duration-200">
                              <button
                                type="button"
                                onClick={handlePauseVideo}
                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/65 hover:bg-black/85 border border-gold/40 backdrop-blur-md flex items-center justify-center text-gold shadow-[0_0_24px_rgba(212,175,55,0.4)] pointer-events-auto cursor-pointer hover:scale-105 active:scale-95 transition-all"
                                title="Pause Video"
                              >
                                <Pause size={28} fill="currentColor" className="text-gold" />
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      {/* Preview Play Badge for adjacent video slides */}
                      {!isCurrent && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                          <div className="w-14 h-14 rounded-full bg-black/55 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-lg">
                            <Play size={22} fill="currentColor" className="ml-1 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Fullscreen Image with Zoom & Rotate (applied to current) */
                    <div
                      className="w-full h-full flex items-center justify-center overflow-hidden"
                      style={{
                        transform: isCurrent ? `scale(${zoomScale}) rotate(${rotation}deg)` : undefined,
                        transition: zoomScale === 1 && rotation === 0 ? 'none' : 'transform 200ms ease-out',
                      }}
                    >
                      <img
                        src={item.mediaUrl}
                        alt={item.title || 'Media preview'}
                        className="w-full h-full max-h-full max-w-full object-contain select-none"
                        draggable={false}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            2. TOP BAR & VIDEO CONTROLS OVERLAY (Unified Top Bar)
            Matches reference design: circular back button (<), sender + datetime,
            circular edit button (✏), and seamless video scrubber strip directly below.
            ───────────────────────────────────────────────────────────── */}
        <div
          className={`absolute top-0 inset-x-0 z-40 transition-all duration-300 ${
            controlsVisible
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Header Row (Back button, Sender Info, Action button) */}
          <div className="bg-[#14151a]/95 backdrop-blur-xl border-b border-white/5 px-4 py-3 sm:py-3.5 flex items-center justify-between">
            {/* Left: Round Light-Grey Back Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#d8d8d8] hover:bg-white text-black flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
              title="Back"
            >
              <ChevronLeft size={24} strokeWidth={2.8} className="-ml-0.5" />
            </button>

            {/* Center: Sender Name + Formatted Timestamp */}
            <div className="flex flex-col items-center text-center px-2">
              <span className="text-white text-sm sm:text-base font-semibold leading-tight tracking-tight">
                {displaySender}
              </span>
              <span className="text-neutral-300 text-xs sm:text-[13px] font-normal leading-tight mt-0.5">
                {formattedDisplayTime}
              </span>
            </div>

            {/* Right: Actions / Spacer */}
            <div className="flex items-center justify-end min-w-[40px] sm:min-w-[44px] shrink-0">
              {!isVideo && (
                <div className="hidden sm:flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setZoomScale((z) => (z >= 2.5 ? 1 : z + 0.5))}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn size={15} />
                  </button>
                  {zoomScale > 1 && (
                    <button
                      type="button"
                      onClick={() => setZoomScale(1)}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                      title="Reset Zoom"
                    >
                      <ZoomOut size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Rotate"
                  >
                    <RotateCw size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Video Scrubber Strip (Directly below Header, attached seamlessly) */}
          {isVideo && (
            <div className="w-full bg-[#2a2b30]/95 backdrop-blur-xl border-b border-white/10 px-4 py-2 sm:py-2.5 flex items-center gap-3 text-white shadow-lg">
              {/* Current Time */}
              <span className="text-white text-sm font-medium tracking-tight select-none shrink-0 min-w-[36px]">
                {formatDuration(currentTime)}
              </span>

              {/* Slider Track with White Knob */}
              <div
                ref={progressBarRef}
                onClick={handleProgressBarMouseDown}
                onTouchStart={handleProgressBarTouch}
                onTouchMove={handleProgressBarTouch}
                className="flex-1 relative flex items-center h-6 cursor-pointer group py-2"
              >
                {/* Black Track Line */}
                <div className="w-full h-1 bg-black/95 rounded-full relative">
                  {/* White Circle Knob */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.6)] -translate-x-1/2 pointer-events-none transition-transform group-hover:scale-110"
                    style={{ left: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Remaining Time with negative sign e.g. -0:26 */}
              <span className="text-white text-sm font-medium tracking-tight select-none shrink-0 min-w-[42px]">
                -{formatDuration(remainingTime)}
              </span>

              {/* Playback Rate (1x, 1.5x, 2x) */}
              <button
                type="button"
                onClick={cyclePlaybackRate}
                className="text-white text-sm sm:text-base font-bold select-none cursor-pointer hover:text-white/80 active:scale-95 transition-transform px-1"
                title="Playback Speed"
              >
                {playbackRate}x
              </button>

              {/* Picture-in-Picture Button */}
              <button
                type="button"
                onClick={handleTogglePiP}
                className="text-white hover:text-white/80 active:scale-95 transition-transform cursor-pointer p-1"
                title="Picture-in-Picture"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                  <polyline points="9 5 5 5 5 9" />
                  <line x1="5" y1="5" x2="10" y2="10" />
                  <rect x="12" y="12" width="10" height="8" rx="1.5" fill="white" stroke="none" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            4. DESKTOP NAVIGATION CHEVRONS (Side Chevrons)
            ───────────────────────────────────────────────────────────── */}
        {items.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                className={`hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 border border-white/15 text-paper items-center justify-center transition-all cursor-pointer shadow-2xl hover:scale-105 active:scale-95 z-30 ${
                  controlsVisible
                    ? 'opacity-100 scale-100 pointer-events-auto'
                    : 'opacity-0 scale-90 pointer-events-none'
                }`}
                title="Previous"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            {currentIndex < items.length - 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className={`hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 border border-white/15 text-paper items-center justify-center transition-all cursor-pointer shadow-2xl hover:scale-105 active:scale-95 z-30 ${
                  controlsVisible
                    ? 'opacity-100 scale-100 pointer-events-auto'
                    : 'opacity-0 scale-90 pointer-events-none'
                }`}
                title="Next"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────
            5. BOTTOM SECTION: CAPTION, FLOATING ACTIONS & FILMSTRIP CONTAINER
            In a unified container slightly lighter than app background
            ───────────────────────────────────────────────────────────── */}
        <div
          className={`absolute bottom-0 inset-x-0 z-40 transition-all duration-300 ${
            controlsVisible
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-full pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Area for Caption (above the filmstrip) */}
          {displayCaption && (
            <div className="bg-gradient-to-t from-black/85 to-transparent pt-6 pb-2.5 px-4">
              <p className="text-white text-sm font-medium drop-shadow-md select-text leading-relaxed max-w-2xl px-1">
                {displayCaption}
              </p>
            </div>
          )}

          {/* Filmstrip & Bottom Action Bar Container (Lighter background than app background) */}
          <div className="bg-[#15171f]/95 backdrop-blur-2xl border-t border-white/10 text-paper">
            {/* Horizontal Thumbnail Filmstrip */}
            {items.length > 1 && (
              <div
                ref={filmstripContainerRef}
                className="w-full overflow-x-auto py-2.5 px-4 flex items-center justify-start md:justify-center gap-2 no-scrollbar"
              >
                {items.map((item, idx) => {
                  const isSelected = idx === currentIndex;
                  return (
                    <button
                      key={idx}
                      ref={(el) => {
                        thumbnailRefs.current[idx] = el;
                      }}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative shrink-0 rounded-lg overflow-hidden transition-all cursor-pointer ${
                        isSelected
                          ? 'border-2 border-gold scale-105 z-10 shadow-[0_0_12px_rgba(212,175,55,0.5)]'
                          : 'border border-white/10 opacity-50 hover:opacity-90'
                      } w-11 h-11 md:w-14 md:h-14 bg-neutral-900`}
                    >
                      {item.mediaType === 'video' ? (
                        <div className="w-full h-full relative flex items-center justify-center bg-neutral-950">
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            /* Direct video frame preview if thumbnailUrl is missing */
                            <video
                              src={`${item.mediaUrl}#t=0.01`}
                              muted
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover pointer-events-none"
                            />
                          )}
                          {/* Video indicator badge */}
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                              <Play size={10} fill="white" className="text-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={item.thumbnailUrl || item.mediaUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom Action Bar (React, Reply, Delete icons) */}
            <div className="relative flex items-center justify-around py-3 px-6 border-t border-white/5 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-paper/85">
              {/* Quick Apple iOS Emoji Reaction Popover */}
              {showEmojiPicker && (
                <div className="absolute bottom-[calc(100%+10px)] left-3 sm:left-6 z-50 bg-[#1e2029]/95 border border-white/15 backdrop-blur-xl px-3 py-1.5 rounded-full flex items-center gap-2 sm:gap-2.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                  {LIGHTBOX_REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji.code}
                      type="button"
                      onClick={() => handleSelectEmoji(emoji.char)}
                      className="p-1 hover:scale-125 active:scale-95 transition-transform cursor-pointer rounded-full hover:bg-white/10 flex items-center justify-center"
                      title={emoji.name}
                    >
                      <img
                        src={getAppleEmojiUrl(emoji.code)}
                        alt={emoji.char}
                        className="w-7 h-7 sm:w-8 sm:h-8 object-contain pointer-events-none drop-shadow-sm select-none"
                        loading="eager"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* React */}
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className={`p-2 transition-transform cursor-pointer active:scale-90 ${
                  showEmojiPicker ? 'text-gold' : 'text-paper/80 hover:text-white'
                }`}
                title="React"
              >
                <Smile size={20} />
              </button>

              {/* Reply */}
              {onReply && (
                <button
                  type="button"
                  onClick={handleReplyClick}
                  className="p-2 text-paper/80 hover:text-gold active:scale-90 transition-transform cursor-pointer"
                  title="Reply"
                >
                  <CornerUpLeft size={20} />
                </button>
              )}

              {/* Delete */}
              {onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  className="p-2 text-paper/80 hover:text-red-400 active:scale-90 transition-transform cursor-pointer"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* iOS-Style Delete Confirmation Action Sheet Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex flex-col justify-end items-center px-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in fade-in duration-150"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-[360px] sm:max-w-[400px] flex flex-col gap-2 pb-1 animate-in slide-in-from-bottom-5 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Destructive Options Card */}
            <div className="rounded-2xl bg-[#242528]/95 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col divide-y divide-white/10">
              {items.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteSingle}
                    className="w-full py-4 px-4 text-center text-[#ff453a] hover:bg-white/[0.08] active:bg-white/[0.15] text-[17px] sm:text-[18px] font-normal transition-colors cursor-pointer select-none"
                  >
                    1 Item
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteAll}
                    className="w-full py-4 px-4 text-center text-[#ff453a] hover:bg-white/[0.08] active:bg-white/[0.15] text-[17px] sm:text-[18px] font-normal transition-colors cursor-pointer select-none"
                  >
                    All {items.length} Items
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmDeleteSingle}
                  className="w-full py-4 px-4 text-center text-[#ff453a] hover:bg-white/[0.08] active:bg-white/[0.15] text-[17px] sm:text-[18px] font-normal transition-colors cursor-pointer select-none"
                >
                  Delete Message
                </button>
              )}
            </div>

            {/* Cancel Card */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="w-full py-4 px-4 rounded-2xl bg-[#242528]/95 backdrop-blur-2xl border border-white/10 shadow-2xl text-center text-[#0a84ff] hover:bg-white/[0.08] active:bg-white/[0.15] text-[17px] sm:text-[18px] font-semibold transition-colors cursor-pointer select-none"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
