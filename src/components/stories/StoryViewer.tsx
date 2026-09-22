import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Loader2,
  Heart,
  Bookmark,
  Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useStoryPreloader } from '../../lib/hooks/useStoryPreloader';
import { useNetworkQuality } from '../../lib/hooks/useNetworkQuality';
import type { CreatorStorySession } from '../../types';

interface StoryViewerProps {
  sessions: CreatorStorySession[];
  initialSessionIndex: number;
  onClose: () => void;
  onDeleteStory?: (storyId: string) => Promise<void>;
  onMarkViewed?: (storyId: string) => void;
}

function timeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return 'Just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

const DEFAULT_IMAGE_DURATION = 5500; // 5.5 seconds per photo

export default function StoryViewer({
  sessions,
  initialSessionIndex,
  onClose,
  onDeleteStory,
  onMarkViewed,
}: StoryViewerProps) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [sessionIndex, setSessionIndex] = useState(initialSessionIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [startingChat, setStartingChat] = useState(false);

  // Network resilience & playback states
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { isSlowConnection } = useNetworkQuality();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedAtProgressRef = useRef<number>(0);

  const currentSession = sessions[sessionIndex] || null;
  const currentStories = currentSession?.stories || [];
  const currentStory = currentStories[storyIndex] || null;

  const isOwner =
    user && currentSession
      ? currentSession.creator.owner_id === user.id || isAdmin
      : false;

  // Background Preloader: Silently warm up next slides and adjacent creator
  useStoryPreloader({
    currentIndex: storyIndex,
    stories: currentStories,
    adjacentCreator:
      sessionIndex < sessions.length - 1
        ? {
            avatarUrl: sessions[sessionIndex + 1]?.creator.avatar_url,
            previewUrl: sessions[sessionIndex + 1]?.stories[0]?.media_url,
          }
        : null,
    isSlowConnection,
  });

  // Reset media states when moving to a new slide or session
  useEffect(() => {
    setImageLoaded(false);
    setIsVideoBuffering(currentStory?.media_type === 'video');
    setLoadError(false);
    setLoadTimeout(false);
  }, [storyIndex, sessionIndex, currentStory?.id, reloadKey]);

  // 12-Second Load Timeout: Show retry banner if media stalls on slow network
  useEffect(() => {
    const isReady = currentStory?.media_type === 'image' ? imageLoaded : !isVideoBuffering;
    if (isReady || loadError) {
      setLoadTimeout(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadTimeout(true);
    }, 12000);

    return () => clearTimeout(timer);
  }, [imageLoaded, isVideoBuffering, currentStory, loadError, reloadKey]);

  // Mark story as viewed when displayed
  useEffect(() => {
    if (currentStory && onMarkViewed) {
      onMarkViewed(currentStory.id);
    }
  }, [currentStory, onMarkViewed]);

  // Navigate to next story or next session
  const goToNext = useCallback(() => {
    if (storyIndex < currentStories.length - 1) {
      setStoryIndex(prev => prev + 1);
      setProgress(0);
      pausedAtProgressRef.current = 0;
    } else if (sessionIndex < sessions.length - 1) {
      setSessionIndex(prev => prev + 1);
      setStoryIndex(0);
      setProgress(0);
      pausedAtProgressRef.current = 0;
    } else {
      onClose();
    }
  }, [storyIndex, currentStories.length, sessionIndex, sessions.length, onClose]);

  // Navigate to previous story or previous session
  const goToPrevious = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex(prev => prev - 1);
      setProgress(0);
      pausedAtProgressRef.current = 0;
    } else if (sessionIndex > 0) {
      const prevSessionIndex = sessionIndex - 1;
      setSessionIndex(prevSessionIndex);
      const prevStories = sessions[prevSessionIndex]?.stories || [];
      setStoryIndex(Math.max(0, prevStories.length - 1));
      setProgress(0);
      pausedAtProgressRef.current = 0;
    }
  }, [storyIndex, sessionIndex, sessions]);

  // Progress timer loop (Timer Gating: Only ticks when media is ready)
  useEffect(() => {
    if (!currentStory || isPaused) return;

    // Timer Gating: Hold progress until photo has loaded or video has begun playing
    if (currentStory.media_type === 'image' && !imageLoaded) return;
    if (currentStory.media_type === 'video' && isVideoBuffering) return;

    startTimeRef.current = Date.now() - (pausedAtProgressRef.current * DEFAULT_IMAGE_DURATION) / 100;

    const interval = window.setInterval(() => {
      if (currentStory.media_type === 'video' && videoRef.current) {
        const v = videoRef.current;
        if (v.duration) {
          const currentPct = (v.currentTime / v.duration) * 100;
          setProgress(currentPct);
          if (v.ended || currentPct >= 100) {
            clearInterval(interval);
            goToNext();
          }
        }
      } else {
        const elapsed = Date.now() - startTimeRef.current;
        const pct = Math.min(100, (elapsed / DEFAULT_IMAGE_DURATION) * 100);
        setProgress(pct);
        if (pct >= 100) {
          clearInterval(interval);
          goToNext();
        }
      }
    }, 50);

    timerRef.current = interval;

    return () => {
      clearInterval(interval);
    };
  }, [currentStory, isPaused, imageLoaded, isVideoBuffering, goToNext]);

  // Keyboard navigation & Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === ' ') {
        e.preventDefault();
        setIsPaused(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToNext, goToPrevious]);

  // Start chat with creator via get_or_create_conversation RPC
  const handleStartChat = async () => {
    if (!user || !currentSession) return;
    setStartingChat(true);

    try {
      const { data: convId, error } = await supabase.rpc('get_or_create_conversation', {
        p_creator_profile_id: currentSession.creator.id,
      });

      if (error) throw error;
      if (convId) {
        onClose();
        navigate(`/messages/${convId}`);
      }
    } catch (err: unknown) {
      console.error('Failed to open chat from story:', err);
    } finally {
      setStartingChat(false);
    }
  };



  if (!currentSession || !currentStory) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center select-none backdrop-blur-md">
      {/* Session left arrow (desktop) */}
      {sessionIndex > 0 && (
        <button
          onClick={goToPrevious}
          className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-paper items-center justify-center backdrop-blur transition-colors z-20"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Main Story Container (9:16 portrait) */}
      <div className="relative w-full h-full max-w-[440px] max-h-[92vh] md:rounded-2xl overflow-hidden bg-ink shadow-2xl flex flex-col justify-between border border-border-subtle/40">
        {/* Top Progress Bars (Segmented) */}
        <div className="absolute top-0 inset-x-0 z-30 p-3 pt-3 flex gap-1.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {currentStories.map((story, idx) => {
            let width = '0%';
            if (idx < storyIndex) width = '100%';
            else if (idx === storyIndex) width = `${progress}%`;

            return (
              <div
                key={story.id}
                className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-gold transition-all duration-75 ease-linear rounded-full"
                  style={{ width }}
                />
              </div>
            );
          })}
        </div>

        {/* Header (Creator Info & Actions) */}
        <div className="absolute top-5 inset-x-0 z-30 px-4 pt-1 flex items-center justify-between text-paper">
          <div className="flex items-center gap-2.5">
            {/* Creator Avatar in Gold Ring */}
            <div className="relative">
              <div
                className={`w-10 h-10 rounded-full border ${
                  isOwner ? 'border-gold ring-2 ring-gold/30' : 'border-gold/60'
                } p-[2px] bg-black/40 shrink-0`}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-ink-light">
                  {currentSession.creator.avatar_url ? (
                    <img
                      src={currentSession.creator.avatar_url}
                      alt={isOwner ? 'You' : currentSession.creator.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center text-gold font-serif text-sm">
                      {currentSession.creator.display_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium leading-none drop-shadow flex items-center gap-1.5">
                  <span>{isOwner ? 'You' : currentSession.creator.display_name}</span>
                  {isOwner && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                  )}
                </p>
                {currentSession.creator.is_verified && !isOwner && (
                  <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-[0.68rem] text-muted drop-shadow">
                  {isOwner ? `Your story • ${timeAgo(currentStory.published_at)}` : timeAgo(currentStory.published_at)}
                </p>
                {currentStory.is_hd && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-white/20 border border-white/30 text-white shadow-sm leading-none drop-shadow">
                    HD
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Header Action Controls */}
          <div className="flex items-center gap-1.5">
            {/* Sound toggle for video */}
            {currentStory.media_type === 'video' && (
              <button
                onClick={() => setIsMuted(m => !m)}
                className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-paper backdrop-blur transition-colors"
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}

            {/* Pause / Play toggle */}
            <button
              onClick={() => setIsPaused(p => !p)}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-paper backdrop-blur transition-colors"
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-paper backdrop-blur transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Media Presentation Layer */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
          {currentStory.media_type === 'image' ? (
            <>
              {/* Blur-Up LQIP Placeholder (Instant visual gratification ~3-5KB) */}
              {currentStory.thumbnail_url && !imageLoaded && (
                <img
                  src={currentStory.thumbnail_url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover filter blur-2xl scale-110 opacity-70 transition-opacity pointer-events-none"
                />
              )}
              {/* Main High-Definition Image */}
              <img
                key={`${currentStory.id}-${reloadKey}`}
                src={currentStory.media_url}
                alt="Story"
                onLoad={() => {
                  setImageLoaded(true);
                  setLoadTimeout(false);
                }}
                onError={() => setLoadError(true)}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </>
          ) : (
            <video
              key={`${currentStory.id}-${reloadKey}`}
              ref={videoRef}
              src={currentStory.media_url}
              poster={currentStory.thumbnail_url || undefined}
              autoPlay
              playsInline
              muted={isMuted}
              onWaiting={() => setIsVideoBuffering(true)}
              onStalled={() => setIsVideoBuffering(true)}
              onPlaying={() => {
                setIsVideoBuffering(false);
                setLoadTimeout(false);
              }}
              onCanPlayThrough={() => {
                setIsVideoBuffering(false);
                setLoadTimeout(false);
              }}
              onError={() => setLoadError(true)}
              className="w-full h-full object-cover"
            />
          )}

          {/* Buffering Spinner: Subtle glowing gold ring */}
          {((currentStory.media_type === 'image' && !imageLoaded) || isVideoBuffering) && !loadTimeout && !loadError && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-12 h-12 rounded-full border-[2.5px] border-white/20 border-t-gold animate-spin backdrop-blur-[2px] bg-black/30 shadow-xl" />
            </div>
          )}

          {/* Timeout or Error: Poor Connection Retry UI */}
          {(loadTimeout || loadError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 z-25 p-6 text-center animate-fade-in">
              <p className="text-paper text-sm font-medium drop-shadow">
                {loadError ? 'Failed to load story' : 'Poor network connection'}
              </p>
              <p className="text-muted text-xs max-w-[240px] leading-relaxed">
                Check your network and tap below to retry loading.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLoadError(false);
                  setLoadTimeout(false);
                  setImageLoaded(false);
                  setIsVideoBuffering(true);
                  setReloadKey((k) => k + 1);
                  if (videoRef.current) {
                    videoRef.current.load();
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className="px-5 py-2.5 rounded-full bg-gold text-ink font-semibold text-xs tracking-wider uppercase shadow-lg hover:bg-gold-light active:scale-95 transition-all"
              >
                Tap to retry
              </button>
            </div>
          )}

          {/* Tap Zones: Left 35% prev, Right 65% next */}
          <div
            onClick={goToPrevious}
            className="absolute left-0 inset-y-0 w-[35%] z-20 cursor-pointer"
          />
          <div
            onClick={goToNext}
            className="absolute right-0 inset-y-0 w-[65%] z-20 cursor-pointer"
          />
        </div>

        {/* Bottom Bar — Caption & Message Action */}
        <div className="absolute bottom-0 inset-x-0 z-30 p-4 pb-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-3">
          {currentStory.caption && (
            <div className="bg-black/40 backdrop-blur-md border border-white/10 px-3.5 py-2 rounded-xl text-xs text-paper/90 leading-relaxed drop-shadow">
              {currentStory.caption}
            </div>
          )}

          {/* Fan to Creator Direct Chat Button */}
          {!isOwner && (
            <button
              onClick={handleStartChat}
              disabled={startingChat}
              className="w-full py-2.5 px-4 rounded-xl bg-gold/90 hover:bg-gold text-ink font-semibold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
            >
              {startingChat ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Connecting to chat...</span>
                </>
              ) : (
                <>
                  <MessageSquare size={14} />
                  <span>Message {currentSession.creator.display_name.split(' ')[0]}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Session right arrow (desktop) */}
      {sessionIndex < sessions.length - 1 && (
        <button
          onClick={goToNext}
          className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-paper items-center justify-center backdrop-blur transition-colors z-20"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}
