import { ChevronLeft, ChevronRight, Heart, Play, Volume2, VolumeX, X, Bookmark, MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useStoryPreloader } from '../../lib/hooks/useStoryPreloader';
import { useNetworkQuality } from '../../lib/hooks/useNetworkQuality';
import type { Story, TransitionSlide, FeedSlide } from '../../types';

interface AdjacentCreatorPreview {
  creatorName: string;
  avatarUrl?: string | null;
  previewUrl?: string | null;
  storyCount: number;
}

const isTransitionSlide = (slide: FeedSlide): slide is TransitionSlide =>
  'kind' in slide && slide.kind === 'transition';

interface StoryViewerModalProps {
  stories: FeedSlide[];
  creatorName: string;
  avatarUrl?: string | null;
  userId?: string;
  initialIndex: number;
  previousCreator?: AdjacentCreatorPreview;
  nextCreator?: AdjacentCreatorPreview;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
  onOpenPreviousCreator?: () => void;
  onOpenNextCreator?: () => void;
  onMessage?: () => void;
}

export default function StoryViewerModal({
  stories,
  creatorName,
  avatarUrl,
  userId,
  initialIndex,
  previousCreator,
  nextCreator,
  onClose,
  onChangeIndex,
  onOpenPreviousCreator,
  onOpenNextCreator,
  onMessage,
}: StoryViewerModalProps) {
  const story = stories[initialIndex];
  const isTransition = story ? isTransitionSlide(story) : false;
  const transitionSlide: TransitionSlide | null = isTransition ? (story as TransitionSlide) : null;
  const mediaStory: Story | null = !isTransition ? (story as Story) : null;
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const imageTimerRef = useRef<number | null>(null);
  const videoTimerRef = useRef<number | null>(null);
  const [hasLoved, setHasLoved] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [updatingReaction, setUpdatingReaction] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [heartPulse, setHeartPulse] = useState(false);
  const [videoErrored, setVideoErrored] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Network resilience & playback states
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { isSlowConnection } = useNetworkQuality();

  const canGoBack = initialIndex > 0;
  const canGoForward = initialIndex < stories.length - 1;
  const imageDuration = 6000;
  const transitionDuration = 2400;

  // Background Preloader: Silently warm up next slides and adjacent creator
  const preloadableStories = useMemo(() => {
    return stories
      .filter((s): s is Story => !isTransitionSlide(s))
      .map((s) => ({
        id: s.id,
        media_url: s.media_url,
        thumbnail_url: s.thumbnail_url,
        media_type: s.media_type,
      }));
  }, [stories]);

  useStoryPreloader({
    currentIndex: initialIndex,
    stories: preloadableStories,
    adjacentCreator: nextCreator
      ? {
          avatarUrl: nextCreator.avatarUrl,
          previewUrl: nextCreator.previewUrl,
        }
      : null,
    isSlowConnection,
  });

  // Reset media states when moving to a new slide
  useEffect(() => {
    setImageLoaded(false);
    setIsVideoBuffering(mediaStory?.media_type === 'video');
    setVideoErrored(false);
    setLoadTimeout(false);
  }, [story?.id, initialIndex, reloadKey]);

  // 12-Second Load Timeout: Show retry banner if media stalls on slow network
  useEffect(() => {
    const isReady = isTransition || (mediaStory?.media_type === 'image' ? imageLoaded : !isVideoBuffering);
    if (isReady || videoErrored) {
      setLoadTimeout(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadTimeout(true);
    }, 12000);

    return () => clearTimeout(timer);
  }, [imageLoaded, isVideoBuffering, isTransition, mediaStory, videoErrored, reloadKey]);

  if (!story) return null;

  const goPrevious = () => {
    if (canGoBack) {
      onChangeIndex(initialIndex - 1);
      return;
    }

    if (onOpenPreviousCreator) {
      onOpenPreviousCreator();
    }
  };

  const goNext = () => {
    if (canGoForward) {
      onChangeIndex(initialIndex + 1);
      return;
    }

    if (onOpenNextCreator) {
      onOpenNextCreator();
      return;
    }

    onClose();
  };

  useEffect(() => {
    if (!userId || isTransition) {
      setHasLoved(false);
      setIsBookmarked(false);
      return;
    }

    const saved = JSON.parse(localStorage.getItem(`saved_stories_${userId}`) || '[]');
    setIsBookmarked(saved.includes(story.id));

    let cancelled = false;

    const fetchReaction = async () => {
      const { data, error } = await supabase
        .from('story_reactions')
        .select('id')
        .eq('story_id', story.id)
        .eq('user_id', userId)
        .eq('reaction_type', 'love')
        .maybeSingle();

      if (cancelled) return;

      if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
        console.error('Error fetching story reaction:', error);
      }

      setHasLoved(Boolean(data));
    };

    fetchReaction();

    return () => {
      cancelled = true;
    };
  }, [story.id, userId, isTransition]);

  useEffect(() => {
    setCurrentProgress(0);
    setVideoErrored(false);

    if (isTransition) {
      const startedAt = Date.now();
      imageTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min((elapsed / transitionDuration) * 100, 100);
        setCurrentProgress(progress);

        if (progress >= 100) {
          if (imageTimerRef.current) {
            window.clearInterval(imageTimerRef.current);
          }
          goNext();
        }
      }, 80);

      return () => {
        if (imageTimerRef.current) {
          window.clearInterval(imageTimerRef.current);
        }
      };
    }

    if (mediaStory?.media_type === 'video') {
      const video = videoRef.current;
      if (!video) return;

      const syncProgress = () => {
        if (!video.duration || Number.isNaN(video.duration)) return;
        if (video.paused || video.seeking) return;
        setCurrentProgress((video.currentTime / video.duration) * 100);
      };

      const handleLoadedMetadata = () => {
        setCurrentProgress(0);
        video.currentTime = 0;
        video.muted = isMuted;
        video.play().catch((error) => {
          console.error('Error autoplaying story video:', error);
        });
      };

      const handleWaiting = () => {
        setIsVideoBuffering(true);
      };

      const handlePlaying = () => {
        setIsVideoBuffering(false);
        setLoadTimeout(false);
      };

      const handleEnded = () => {
        goNext();
      };

      const handleError = () => {
        setVideoErrored(true);
        setIsVideoBuffering(false);
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('waiting', handleWaiting);
      video.addEventListener('stalled', handleWaiting);
      video.addEventListener('playing', handlePlaying);
      video.addEventListener('canplaythrough', handlePlaying);
      video.addEventListener('ended', handleEnded);
      video.addEventListener('error', handleError);
      handleLoadedMetadata();
      videoTimerRef.current = window.setInterval(syncProgress, 100);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('stalled', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('canplaythrough', handlePlaying);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('error', handleError);
        if (videoTimerRef.current) {
          window.clearInterval(videoTimerRef.current);
        }
      };
    }

    // Photo Timer Gating: Only tick after imageLoaded is true
    if (!imageLoaded) return;

    const startedAt = Date.now();
    imageTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min((elapsed / imageDuration) * 100, 100);
      setCurrentProgress(progress);

      if (progress >= 100) {
        if (imageTimerRef.current) {
          window.clearInterval(imageTimerRef.current);
        }
        goNext();
      }
    }, 80);

    return () => {
      if (imageTimerRef.current) {
        window.clearInterval(imageTimerRef.current);
      }
    };
  }, [story.id, initialIndex, isTransition, mediaStory?.media_type, isMuted, imageLoaded]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    const handleTouchStart = (event: TouchEvent) => {
      touchStartX.current = event.touches[0]?.clientX ?? null;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (touchStartX.current === null) return;

      const deltaX = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      touchStartX.current = null;

      if (deltaX > 60) {
        goPrevious();
      } else if (deltaX < -60) {
        goNext();
      }
    };

    node.addEventListener('touchstart', handleTouchStart, { passive: true });
    node.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      node.removeEventListener('touchstart', handleTouchStart);
      node.removeEventListener('touchend', handleTouchEnd);
    };
  }, [initialIndex, canGoBack, canGoForward, onOpenPreviousCreator, onOpenNextCreator]);

  useEffect(() => {
    if (!heartPulse) return;
    const timer = window.setTimeout(() => setHeartPulse(false), 220);
    return () => window.clearTimeout(timer);
  }, [heartPulse]);

  const handleBookmark = () => {
    if (!userId || isTransition) return;
    const savedKey = `saved_stories_${userId}`;
    const saved = JSON.parse(localStorage.getItem(savedKey) || '[]');

    if (isBookmarked) {
      const newSaved = saved.filter((id: string) => id !== story.id);
      localStorage.setItem(savedKey, JSON.stringify(newSaved));
      setIsBookmarked(false);
    } else {
      const newSaved = [...saved, story.id];
      localStorage.setItem(savedKey, JSON.stringify(newSaved));
      setIsBookmarked(true);
    }
  };

  const handleLove = async () => {
    if (!userId || updatingReaction || isTransition) return;

    setUpdatingReaction(true);

    if (hasLoved) {
      const { error } = await supabase
        .from('story_reactions')
        .delete()
        .eq('story_id', story.id)
        .eq('user_id', userId)
        .eq('reaction_type', 'love');

      if (!error) {
        setHasLoved(false);
        setHeartPulse(true);
      } else {
        console.error('Error removing story reaction:', error);
      }
    } else {
      const { error } = await supabase.from('story_reactions').upsert(
        {
          story_id: story.id,
          user_id: userId,
          reaction_type: 'love',
        },
        { onConflict: 'story_id,user_id,reaction_type' }
      );

      if (!error) {
        setHasLoved(true);
        setHeartPulse(true);
      } else {
        console.error('Error saving story reaction:', error);
      }
    }

    setUpdatingReaction(false);
  };

  const renderPreview = (creator: AdjacentCreatorPreview | undefined, onClick?: () => void) => {
    if (!creator) {
      return <div className="hidden xl:block w-[170px]" />;
    }

    return (
      <button
        type="button"
        onClick={onClick}
        className="hidden xl:block w-[170px] h-[560px] rounded-[28px] overflow-hidden bg-white/[0.03] border border-white/[0.05] opacity-60 hover:opacity-90 transition-opacity"
      >
        <div className="w-full h-full relative bg-[#141414]">
          {creator.previewUrl ? (
            <img src={creator.previewUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#282828] to-[#101010]" />
          )}
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute top-4 left-4 w-11 h-11 rounded-full overflow-hidden border border-white/20 bg-black/40">
            {creator.avatarUrl ? (
              <img src={creator.avatarUrl} alt={creator.creatorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4 text-left">
            <p className="text-sm text-white truncate">{creator.creatorName}</p>
            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-white/65 mt-1">
              {creator.storyCount} {creator.storyCount === 1 ? 'story' : 'stories'}
            </p>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[90] bg-[#181818] flex items-center justify-center p-4 sm:p-6">
      <button
        onClick={onClose}
        className="absolute top-5 right-5 sm:top-6 sm:right-6 w-11 h-11 text-white/80 flex items-center justify-center hover:text-white transition-colors z-[6]"
      >
        <X size={28} strokeWidth={1.75} />
      </button>

      <div className="w-full max-w-[1220px] flex items-center justify-center gap-8">
        {renderPreview(previousCreator, onOpenPreviousCreator)}

        <div
          ref={frameRef}
          className="relative w-full max-w-[440px] h-[88vh] min-h-[700px] max-h-[880px] rounded-[34px] overflow-hidden bg-black shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
        >
          {isTransition ? (
            <div className="w-full h-full bg-[radial-gradient(circle_at_top,rgba(201,169,110,0.22),transparent_30%),linear-gradient(180deg,#101010_0%,#070707_100%)] flex flex-col items-center justify-center px-10 text-center">
              <div className="w-20 h-20 rounded-full overflow-hidden border border-gold/40 bg-black/50 mb-6">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={creatorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gold/30 to-transparent" />
                )}
              </div>
              <p className="text-[0.68rem] uppercase tracking-[0.22em] text-gold/85 mb-4">
                {transitionSlide?.eyebrow || 'Saved Stories'}
              </p>
              <h3 className="font-serif text-4xl text-white leading-tight">{transitionSlide?.title}</h3>
              <p className="mt-4 text-sm leading-7 text-white/70 max-w-[280px]">{transitionSlide?.description}</p>
            </div>
          ) : mediaStory?.media_type === 'video' ? (
            videoErrored ? (
              mediaStory.thumbnail_url ? (
                <img
                  src={mediaStory.thumbnail_url}
                  alt={mediaStory.caption || `${creatorName} story`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black text-white/60">
                  <div className="text-center">
                    <Play size={28} className="mx-auto mb-3" />
                    <p className="text-sm">Video could not be played.</p>
                  </div>
                </div>
              )
            ) : (
              <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
                {/* Ambient Blurred Backdrop for non-9:16 media */}
                <div
                  className="absolute inset-0 bg-cover bg-center blur-2xl opacity-40 scale-110 pointer-events-none"
                  style={{ backgroundImage: `url(${mediaStory.thumbnail_url || mediaStory.media_url})` }}
                />
                <video
                  key={`${mediaStory.id}-${reloadKey}`}
                  ref={videoRef}
                  src={mediaStory.media_url}
                  poster={mediaStory.thumbnail_url || undefined}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  preload="auto"
                  className="relative z-[1] w-full h-full object-contain"
                />
              </div>
            )
          ) : (
            <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
              {/* Ambient Blurred Backdrop for non-9:16 media */}
              <div
                className="absolute inset-0 bg-cover bg-center blur-2xl opacity-40 scale-110 pointer-events-none"
                style={{ backgroundImage: `url(${mediaStory?.thumbnail_url || mediaStory?.media_url})` }}
              />
              {/* Blur-Up LQIP Placeholder (Instant visual gratification ~3-5KB) */}
              {mediaStory?.thumbnail_url && !imageLoaded && (
                <img
                  src={mediaStory.thumbnail_url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain filter blur-2xl scale-105 opacity-70 transition-opacity pointer-events-none"
                />
              )}
              <img
                key={`${mediaStory?.id}-${reloadKey}`}
                src={mediaStory?.media_url}
                alt={mediaStory?.caption || `${creatorName} story`}
                onLoad={() => {
                  setImageLoaded(true);
                  setLoadTimeout(false);
                }}
                onError={() => setLoadTimeout(true)}
                className={`relative z-[1] w-full h-full object-contain transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {/* Buffering Spinner: Subtle glowing gold ring */}
          {!isTransition &&
            ((mediaStory?.media_type === 'image' && !imageLoaded) || isVideoBuffering) &&
            !loadTimeout &&
            !videoErrored && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[10]">
                <div className="w-12 h-12 rounded-full border-[2.5px] border-white/20 border-t-gold animate-spin backdrop-blur-[2px] bg-black/30 shadow-xl" />
              </div>
            )}

          {/* Timeout or Error: Poor Connection Retry UI */}
          {!isTransition && (loadTimeout || videoErrored) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 z-[25] p-6 text-center animate-fade-in">
              <p className="text-white text-sm font-medium drop-shadow">
                {videoErrored ? 'Failed to load video' : 'Poor network connection'}
              </p>
              <p className="text-white/60 text-xs max-w-[240px] leading-relaxed">
                Check your network and tap below to retry loading.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setVideoErrored(false);
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

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_28%),rgba(0,0,0,0.12)] z-[1]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/62 z-[1]" />

          <div className="absolute inset-x-0 top-0 flex gap-2 px-4 pt-4 z-[4]">
            {stories.map((item, index) => (
              <div key={item.id} className="relative h-[2px] flex-1 bg-white/25 overflow-hidden rounded-full">
                {index < initialIndex && <div className="absolute inset-0 bg-white" />}
                {index === initialIndex && (
                  <div
                    className="absolute inset-y-0 left-0 w-full origin-left bg-white transition-transform duration-75"
                    style={{ transform: `scaleX(${Math.max(0, Math.min(1, currentProgress / 100))})` }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="absolute inset-x-0 top-0 px-4 pt-7 z-[4]">
            <div className="flex items-start justify-between gap-3 pt-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full overflow-hidden border border-white/20 bg-black/40 shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={creatorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gold/30 to-transparent" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{creatorName}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[0.72rem] text-white/75 truncate">
                      {isTransition ? 'Saved stories' : mediaStory?.media_type === 'video' ? 'Video story' : 'Photo story'}
                    </p>
                    {mediaStory?.is_hd && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-white/20 border border-white/30 text-white shadow-sm leading-none">
                        HD
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-white/85">
                <button
                  type="button"
                  onClick={() => setIsMuted((p) => !p)}
                  className="w-8 h-8 rounded-full bg-black/25 flex items-center justify-center"
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                {mediaStory?.media_type === 'video' && <Play size={14} fill="currentColor" />}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={goPrevious}
            className="absolute left-0 top-0 bottom-0 w-1/3 z-[3]"
            aria-label="Previous story"
          />
          <button
            type="button"
            onClick={goNext}
            className="absolute right-0 top-0 bottom-0 w-1/3 z-[3]"
            aria-label="Next story"
          />

          <div className="absolute inset-x-0 bottom-0 p-5 z-[4]">
            {!isTransition && mediaStory?.caption && (
              <p className="text-sm text-white leading-6 max-w-[85%] drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)]">
                {mediaStory.caption}
              </p>
            )}

            {!isTransition && (
              <div className="absolute bottom-10 right-4 flex flex-col items-center gap-5 transition-all duration-200 z-[4]">
                <button
                  type="button"
                  aria-label="React with love"
                  onClick={handleLove}
                  disabled={!userId || updatingReaction}
                  className={`transition-all duration-200 ${
                    hasLoved ? 'text-pink-400' : 'text-white hover:text-pink-400'
                  } ${heartPulse ? 'scale-125' : 'scale-100'} ${!userId ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Heart size={28} fill={hasLoved ? 'currentColor' : 'none'} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label="Bookmark story"
                  onClick={handleBookmark}
                  disabled={!userId}
                  className={`transition-all duration-200 ${
                    isBookmarked ? 'text-gold' : 'text-white hover:text-gold'
                  } ${!userId ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Bookmark size={26} fill={isBookmarked ? 'currentColor' : 'none'} strokeWidth={1.75} />
                </button>
                {onMessage && (
                  <button
                    type="button"
                    aria-label="Message creator"
                    onClick={onMessage}
                    className="text-white hover:text-gold transition-colors"
                  >
                    <MessageCircle size={26} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={goPrevious}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 text-white/80 items-center justify-center z-[5] hover:bg-black/50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            onClick={goNext}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 text-white/80 items-center justify-center z-[5] hover:bg-black/50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {renderPreview(nextCreator, onOpenNextCreator)}
      </div>
    </div>
  );
}
