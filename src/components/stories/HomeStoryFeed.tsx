import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Heart,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
  Bookmark,
  Send,
  Check,
  Mic,
  Smile,
  Grid3x3,
  Image as ImageIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import EmojiKeyboardDrawer from '../chat/EmojiKeyboardDrawer';
import { supabase } from '../../lib/supabase';
import { encodeStoryReply, encodeStoryReaction } from '../../lib/storyReplies';
import { useStoryPreloader } from '../../lib/hooks/useStoryPreloader';
import { useNetworkQuality } from '../../lib/hooks/useNetworkQuality';
import { getViewedStoryIds, saveViewedStoryId } from '../../lib/hooks/useStories';
import type { CreatorProfile, Story, TransitionSlide, FeedSlide, HomeStorySession } from '../../types';

interface HomeStoryFeedProps {
  sessions: HomeStorySession[];
  userId?: string;
  initialSessionIndex?: number;
  initialSlideIndex?: number;
  onPositionChange?: (sessionIndex: number, slideIndex: number) => void;
  onClose?: () => void;
  onMessage?: (creatorProfileId: string) => void;
  onDeleteStory?: (storyId: string) => Promise<void>;
  onStoryViewed?: (storyId: string) => void;
}

interface TapHeart {
  id: number;
  x: number;
  y: number;
}

const isTransitionSlide = (slide: FeedSlide): slide is TransitionSlide =>
  'kind' in slide && slide.kind === 'transition';

export default function HomeStoryFeed({
  sessions,
  userId,
  initialSessionIndex = 0,
  initialSlideIndex = 0,
  onPositionChange,
  onClose,
  onMessage,
  onDeleteStory,
  onStoryViewed,
}: HomeStoryFeedProps) {
  const [currentSessionIndex, setCurrentSessionIndex] = useState(() => {
    if (!sessions.length) return 0;
    return Math.max(0, Math.min(initialSessionIndex, sessions.length - 1));
  });
  const [currentSlideIndex, setCurrentSlideIndex] = useState(() => {
    if (!sessions.length) return 0;
    const boundedSessionIndex = Math.max(0, Math.min(initialSessionIndex, sessions.length - 1));
    const slideCount = sessions[boundedSessionIndex]?.slides.length || 0;
    if (!slideCount) return 0;
    return Math.max(0, Math.min(initialSlideIndex, slideCount - 1));
  });
  const [hasLoved, setHasLoved] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [updatingReaction, setUpdatingReaction] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [heartPulse, setHeartPulse] = useState(false);
  const [tapHearts, setTapHearts] = useState<TapHeart[]>([]);
  const [videoErrored, setVideoErrored] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Social story reply state
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccessMsg, setReplySuccessMsg] = useState<string | null>(null);
  const [showReplyEmojiDrawer, setShowReplyEmojiDrawer] = useState(false);
  const [showGridDrawer, setShowGridDrawer] = useState(false);

  // Network resilience & playback states
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { isSlowConnection } = useNetworkQuality();

  const frameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageTimerRef = useRef<number | null>(null);
  const videoTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastWheelTimeRef = useRef(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const previousSlideIdRef = useRef<string | null>(null);
  const viewedStoriesRef = useRef<Set<string>>(getViewedStoryIds(userId));

  useEffect(() => {
    viewedStoriesRef.current = getViewedStoryIds(userId);
  }, [userId]);
  const progressRef = useRef(0);
  const currentSessionIndexRef = useRef(0);
  const sessionTransitionTimeoutRef = useRef<number | null>(null);
  const lastTouchSampleRef = useRef<{ y: number; t: number } | null>(null);
  const verticalVelocityRef = useRef(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [panelTransitionMs, setPanelTransitionMs] = useState(0);
  const [isVerticalDragging, setIsVerticalDragging] = useState(false);
  const skipSessionSlideResetRef = useRef(false);

  const imageDuration = 6000;
  const transitionDuration = 2400;
  const horizontalSwipeThreshold = 70;
  const verticalSwipeThreshold = 80;
  const wheelThreshold = 48;
  const verticalFlingVelocityThreshold = 0.55;

  const currentSession = sessions[currentSessionIndex] || null;
  const currentSlide = currentSession?.slides[currentSlideIndex] || null;
  const isTransition = currentSlide ? isTransitionSlide(currentSlide) : false;
  const transitionSlide: TransitionSlide | null = isTransition ? (currentSlide as TransitionSlide) : null;
  const mediaStory: Story | null = !isTransition && currentSlide ? (currentSlide as Story) : null;
  const previousSession = currentSessionIndex > 0 ? sessions[currentSessionIndex - 1] : null;
  const nextSession = currentSessionIndex < sessions.length - 1 ? sessions[currentSessionIndex + 1] : null;

  const isOwner = Boolean(userId && currentSession && currentSession.creator.owner_id === userId);

  // Background Preloader: Silently warm up next slides and adjacent creator
  const preloadableStories = useMemo(() => {
    return (currentSession?.slides || [])
      .filter((s): s is Story => !isTransitionSlide(s))
      .map((s) => ({
        id: s.id,
        media_url: s.media_url,
        thumbnail_url: s.thumbnail_url,
        media_type: s.media_type,
      }));
  }, [currentSession]);

  useStoryPreloader({
    currentIndex: currentSlideIndex,
    stories: preloadableStories,
    adjacentCreator: nextSession
      ? {
          avatarUrl: nextSession.creator.avatar_url,
          previewUrl: nextSession.slides[0] && !isTransitionSlide(nextSession.slides[0]) ? nextSession.slides[0].media_url : undefined,
        }
      : null,
    isSlowConnection,
  });

  // Reset media states when moving to a new slide or session
  useEffect(() => {
    setImageLoaded(false);
    setIsVideoBuffering(mediaStory?.media_type === 'video');
    setVideoErrored(false);
    setLoadTimeout(false);
  }, [currentSlide?.id, currentSlideIndex, currentSessionIndex, reloadKey]);

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

  useEffect(() => {
    progressRef.current = currentProgress;
  }, [currentProgress]);

  useEffect(() => {
    currentSessionIndexRef.current = currentSessionIndex;
  }, [currentSessionIndex]);

  useEffect(() => {
    const updateHeight = () => {
      const height = frameRef.current?.clientHeight || window.innerHeight;
      setPanelHeight(height);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    if (!sessions.length) {
      setCurrentSessionIndex(0);
      setCurrentSlideIndex(0);
      return;
    }

    setCurrentSessionIndex((previous) => Math.min(previous, sessions.length - 1));
  }, [sessions.length]);

  useEffect(() => {
    if (!sessions.length) return;
    const boundedInitial = Math.max(0, Math.min(initialSessionIndex, sessions.length - 1));
    const slideCount = sessions[boundedInitial]?.slides.length || 0;
    const boundedSlide = slideCount > 0 ? Math.max(0, Math.min(initialSlideIndex, slideCount - 1)) : 0;
    skipSessionSlideResetRef.current = true;
    setCurrentSessionIndex(boundedInitial);
    setCurrentSlideIndex(boundedSlide);
    setVerticalOffset(0);
    setPanelTransitionMs(0);
    setIsVerticalDragging(false);
  }, [initialSessionIndex, initialSlideIndex, sessions.length]);

  useEffect(() => {
    if (skipSessionSlideResetRef.current) {
      skipSessionSlideResetRef.current = false;
      setIsPaused(false);
      setVerticalOffset(0);
      setPanelTransitionMs(0);
      return;
    }

    const nextSession = sessions[currentSessionIndex];
    const resumeIndex = nextSession?.firstUnviewedIndex ?? 0;
    setCurrentSlideIndex(resumeIndex);
    setIsPaused(false);
    setVerticalOffset(0);
    setPanelTransitionMs(0);
  }, [currentSessionIndex, sessions]);

  useEffect(() => {
    if (!currentSession) return;
    const maxSlideIndex = Math.max(0, currentSession.slides.length - 1);
    setCurrentSlideIndex((previous) => Math.min(previous, maxSlideIndex));
  }, [currentSession, currentSessionIndex]);

  useEffect(() => {
    onPositionChange?.(currentSessionIndex, currentSlideIndex);
  }, [currentSessionIndex, currentSlideIndex, onPositionChange]);

  useEffect(() => {
    if (!currentSlide) return;
    if (previousSlideIdRef.current === currentSlide.id) return;

    previousSlideIdRef.current = currentSlide.id;
    setCurrentProgress(0);
    progressRef.current = 0;
    setVideoErrored(false);
    setIsPaused(false);
  }, [currentSlide]);

  // Record story view once per story
  useEffect(() => {
    if (!mediaStory?.id) return;
    saveViewedStoryId(mediaStory.id, userId);
    if (viewedStoriesRef.current.has(mediaStory.id)) return;
    viewedStoriesRef.current.add(mediaStory.id);

    if (onStoryViewed) {
      onStoryViewed(mediaStory.id);
    } else {
      (async () => {
        try {
          await supabase.rpc('increment_story_view', { p_story_id: mediaStory.id });
        } catch {
          // ignore
        }
      })();
    }
  }, [mediaStory?.id, onStoryViewed, userId]);

  // Sync like and bookmark status for the current viewer on the current slide
  useEffect(() => {
    if (!mediaStory?.id || !userId) {
      setHasLoved(false);
      setIsBookmarked(false);
      return;
    }

    let isMounted = true;

    supabase
      .from('story_reactions')
      .select('reaction_type')
      .eq('story_id', mediaStory.id)
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (!isMounted) return;
        const savedKey = `saved_stories_${userId}`;
        const saved = JSON.parse(localStorage.getItem(savedKey) || '[]');

        if (error) {
          setIsBookmarked(saved.includes(mediaStory.id));
          return;
        }

        const reactionTypes = new Set((data || []).map((r) => r.reaction_type));
        setHasLoved(reactionTypes.has('love'));
        setIsBookmarked(reactionTypes.has('bookmark') || saved.includes(mediaStory.id));
      });

    return () => {
      isMounted = false;
    };
  }, [mediaStory?.id, userId]);

  const animateBackToCurrentSession = () => {
    setPanelTransitionMs(220);
    setVerticalOffset(0);
    window.setTimeout(() => {
      setPanelTransitionMs(0);
    }, 220);
  };

  const moveToSession = (direction: -1 | 1) => {
    if (!panelHeight) return;
    if (sessionTransitionTimeoutRef.current) return;

    const currentIndex = currentSessionIndexRef.current;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex > sessions.length - 1) {
      animateBackToCurrentSession();
      return;
    }

    setPanelTransitionMs(320);
    setVerticalOffset(direction === 1 ? -panelHeight : panelHeight);

    if (sessionTransitionTimeoutRef.current) {
      window.clearTimeout(sessionTransitionTimeoutRef.current);
    }

    sessionTransitionTimeoutRef.current = window.setTimeout(() => {
      setCurrentSessionIndex(nextIndex);
      setVerticalOffset(0);
      setPanelTransitionMs(0);
      setIsVerticalDragging(false);
      sessionTransitionTimeoutRef.current = null;
    }, 320);
  };

  const goPreviousSlide = () => {
    if (!currentSession) return;
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex((previous) => previous - 1);
    }
  };

  const goNextSlide = () => {
    if (!currentSession) return;

    if (currentSlideIndex < currentSession.slides.length - 1) {
      setCurrentSlideIndex((previous) => previous + 1);
      return;
    }

    // Advance to next session if available
    if (currentSessionIndex < sessions.length - 1) {
      moveToSession(1);
    } else if (onClose) {
      onClose();
    } else {
      setCurrentSlideIndex(0);
      setIsPaused(false);
    }
  };

  useEffect(() => {
    if (!currentSlide || !currentSession) return;

    if (isPaused) {
      return;
    }

    if (isTransition) {
      const startedAt = performance.now() - (progressRef.current / 100) * transitionDuration;
      imageTimerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAt;
        const progress = Math.min((elapsed / transitionDuration) * 100, 100);
        setCurrentProgress(progress);

        if (progress >= 100) {
          if (imageTimerRef.current) {
            window.clearInterval(imageTimerRef.current);
          }
          goNextSlide();
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
        if (progressRef.current > 0 && video.duration) {
          video.currentTime = (progressRef.current / 100) * video.duration;
        }
        video.muted = isMuted;
        video.play().catch((error) => {
          console.error('Error autoplaying home story video:', error);
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
        goNextSlide();
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

    const startedAt = performance.now() - (progressRef.current / 100) * imageDuration;
    imageTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min((elapsed / imageDuration) * 100, 100);
      setCurrentProgress(progress);

      if (progress >= 100) {
        if (imageTimerRef.current) {
          window.clearInterval(imageTimerRef.current);
        }
        goNextSlide();
      }
    }, 80);

    return () => {
      if (imageTimerRef.current) {
        window.clearInterval(imageTimerRef.current);
      }
    };
  }, [currentSessionIndex, currentSlideIndex, currentSlide, isTransition, mediaStory?.media_type, isPaused, isMuted, imageLoaded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaStory || mediaStory.media_type !== 'video') return;

    video.muted = isMuted;

    if (isPaused) {
      video.pause();
      return;
    }

    video.play().catch((error) => {
      console.error('Error resuming home story video:', error);
    });
  }, [isMuted, isPaused, mediaStory?.id, mediaStory?.media_type]);

  useEffect(() => {
    if (!currentSlide || !userId || isTransition) {
      setHasLoved(false);
      setIsBookmarked(false);
      return;
    }

    const saved = JSON.parse(localStorage.getItem(`saved_stories_${userId}`) || '[]');
    setIsBookmarked(saved.includes(currentSlide.id));

    let cancelled = false;

    const fetchReaction = async () => {
      const { data, error } = await supabase
        .from('story_reactions')
        .select('id')
        .eq('story_id', currentSlide.id)
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
  }, [currentSlide, userId, isTransition]);

  useEffect(() => {
    if (!heartPulse) return;
    const timer = window.setTimeout(() => setHeartPulse(false), 220);
    return () => window.clearTimeout(timer);
  }, [heartPulse]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement || target instanceof SVGElement)) return false;
      return Boolean(
        target.closest('.EmojiPickerReact') ||
        target.closest('.epr-main') ||
        target.closest('[data-emoji-drawer]') ||
        target.closest('[data-no-swipe]') ||
        target.closest('input, textarea, button, a')
      );
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isInteractiveTarget(event.target)) {
        touchStartRef.current = null;
        return;
      }

      const startY = event.touches[0]?.clientY ?? 0;
      touchStartRef.current = {
        x: event.touches[0]?.clientX ?? 0,
        y: startY,
      };
      lastTouchSampleRef.current = { y: startY, t: performance.now() };
      verticalVelocityRef.current = 0;
      setIsVerticalDragging(false);
      setPanelTransitionMs(0);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!touchStartRef.current || isInteractiveTarget(event.target)) return;

      const deltaX = (event.touches[0]?.clientX ?? 0) - touchStartRef.current.x;
      const deltaY = (event.touches[0]?.clientY ?? 0) - touchStartRef.current.y;
      const currentY = event.touches[0]?.clientY ?? 0;
      const currentTime = performance.now();
      if (lastTouchSampleRef.current) {
        const dt = currentTime - lastTouchSampleRef.current.t;
        if (dt > 0) {
          verticalVelocityRef.current = (currentY - lastTouchSampleRef.current.y) / dt;
        }
      }
      lastTouchSampleRef.current = { y: currentY, t: currentTime };

      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
        event.preventDefault();
        setIsVerticalDragging(true);
        if (panelHeight) {
          const clamped = Math.max(-panelHeight, Math.min(panelHeight, deltaY));
          setVerticalOffset(clamped);
        }
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!touchStartRef.current || isInteractiveTarget(event.target)) {
        touchStartRef.current = null;
        lastTouchSampleRef.current = null;
        return;
      }

      const deltaX = (event.changedTouches[0]?.clientX ?? 0) - touchStartRef.current.x;
      const deltaY = (event.changedTouches[0]?.clientY ?? 0) - touchStartRef.current.y;
      touchStartRef.current = null;
      lastTouchSampleRef.current = null;

      if (isVerticalDragging) {
        const flingDirection = verticalVelocityRef.current > 0 ? -1 : 1;
        const shouldFling = Math.abs(verticalVelocityRef.current) > verticalFlingVelocityThreshold;
        if (Math.abs(deltaY) > verticalSwipeThreshold || shouldFling) {
          moveToSession(shouldFling ? flingDirection : deltaY > 0 ? -1 : 1);
        } else {
          animateBackToCurrentSession();
        }
        verticalVelocityRef.current = 0;
        setIsVerticalDragging(false);
        return;
      }

      if (Math.abs(deltaX) > horizontalSwipeThreshold) {
        if (deltaX > 0) {
          goPreviousSlide();
        } else {
          goNextSlide();
        }
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelTimeRef.current < 650) return;
      if (Math.abs(event.deltaY) < wheelThreshold) return;

      lastWheelTimeRef.current = now;
      moveToSession(event.deltaY > 0 ? 1 : -1);
    };

    node.addEventListener('touchstart', handleTouchStart, { passive: true });
    node.addEventListener('touchmove', handleTouchMove, { passive: false });
    node.addEventListener('touchend', handleTouchEnd, { passive: true });
    node.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      node.removeEventListener('touchstart', handleTouchStart);
      node.removeEventListener('touchmove', handleTouchMove);
      node.removeEventListener('touchend', handleTouchEnd);
      node.removeEventListener('wheel', handleWheel);
    };
  }, [sessions.length, currentSessionIndex, currentSlideIndex, panelHeight, isVerticalDragging]);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
      if (sessionTransitionTimeoutRef.current) {
        window.clearTimeout(sessionTransitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);


  const handleLove = async () => {
    if (!userId || updatingReaction || !mediaStory) return;

    setUpdatingReaction(true);

    if (hasLoved) {
      const { error } = await supabase
        .from('story_reactions')
        .delete()
        .eq('story_id', mediaStory.id)
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
          story_id: mediaStory.id,
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

  const handleBookmark = async () => {
    if (!currentSlide || !userId || isTransition || !mediaStory) return;
    const savedKey = `saved_stories_${userId}`;
    const saved = JSON.parse(localStorage.getItem(savedKey) || '[]');

    if (isBookmarked) {
      const newSaved = saved.filter((id: string) => id !== mediaStory.id);
      localStorage.setItem(savedKey, JSON.stringify(newSaved));
      setIsBookmarked(false);

      const { error } = await supabase
        .from('story_reactions')
        .delete()
        .eq('story_id', mediaStory.id)
        .eq('user_id', userId)
        .eq('reaction_type', 'bookmark');
      if (error) {
        console.error('Error removing story bookmark:', error);
      }
    } else {
      const newSaved = [...saved, mediaStory.id];
      localStorage.setItem(savedKey, JSON.stringify(newSaved));
      setIsBookmarked(true);

      const { error } = await supabase.from('story_reactions').upsert(
        {
          story_id: mediaStory.id,
          user_id: userId,
          reaction_type: 'bookmark',
        },
        { onConflict: 'story_id,user_id,reaction_type' }
      );
      if (error) {
        console.error('Error saving story bookmark:', error);
      }
    }
  };



  const archiveLabels = useMemo(() => {
    if (!currentSession) return '';
    return currentSession.archiveGroups
      .slice(0, 3)
      .map((group) => group.label)
      .join(', ');
  }, [currentSession]);

  const togglePause = () => {
    setIsPaused((previous) => !previous);
  };

  const toggleMute = () => {
    setIsMuted((previous) => !previous);
  };

  const spawnTapHeart = (clientX: number, clientY: number) => {
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!frameRect) return;

    const id = Date.now() + Math.floor(Math.random() * 1000);
    const x = clientX - frameRect.left;
    const y = clientY - frameRect.top;
    setTapHearts((previous) => [...previous, { id, x, y }]);

    window.setTimeout(() => {
      setTapHearts((previous) => previous.filter((heart) => heart.id !== id));
    }, 700);
  };

  const handleCenterTap = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      spawnTapHeart(event.clientX, event.clientY);
      void handleLove();
      return;
    }

    clickTimeoutRef.current = window.setTimeout(() => {
      clickTimeoutRef.current = null;
      togglePause();
    }, 220);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !userId || !currentSession || sendingReply) return;
    const textToSend = replyText.trim();
    setReplyText('');
    setShowReplyEmojiDrawer(false);
    setIsPaused(false);
    setReplySuccessMsg('Reply sent');
    setTimeout(() => setReplySuccessMsg(null), 2500);

    setSendingReply(true);
    try {
      let convId: string | null = null;

      // 1. Check existing conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('fan_id', userId)
        .eq('creator_profile_id', currentSession.creator.id)
        .maybeSingle();

      if (existing?.id) {
        convId = existing.id;
      } else {
        // 2. Try RPC with both parameters
        const { data: rpcId } = await supabase.rpc('get_or_create_conversation', {
          p_creator_profile_id: currentSession.creator.id,
          p_fan_id: userId,
        });

        if (rpcId) {
          convId = rpcId;
        } else {
          // 3. Try RPC with single parameter
          const { data: singleRpcId } = await supabase.rpc('get_or_create_conversation', {
            p_creator_profile_id: currentSession.creator.id,
          });

          if (singleRpcId) {
            convId = singleRpcId;
          } else {
            // 4. Direct insert fallback
            const { data: newConv } = await supabase
              .from('conversations')
              .insert({
                fan_id: userId,
                creator_profile_id: currentSession.creator.id,
              })
              .select('id')
              .single();
            if (newConv?.id) convId = newConv.id;
          }
        }
      }

      if (convId) {
        const encodedContent = encodeStoryReply(textToSend, {
          storyId: mediaStory?.id || currentSlide?.id || null,
          mediaUrl: mediaStory?.thumbnail_url || mediaStory?.media_url || null,
          mediaType: mediaStory?.media_type || 'image',
          caption: mediaStory?.caption || null,
          creatorName: currentSession.creator.display_name,
          creatorId: currentSession.creator.id,
        });

        await supabase.from('messages').insert({
          conversation_id: convId,
          sender_id: userId,
          sender_type: 'fan',
          content: encodedContent,
          message_type: 'text',
        });
      }
    } catch (err) {
      console.error('Error sending story reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const sendQuickReaction = async (emoji: string) => {
    if (!userId || !currentSession || sendingReply) return;

    // Floating heart/emoji effect
    const frameRect = frameRef.current?.getBoundingClientRect();
    const x = frameRect ? frameRect.width / 2 + (Math.random() * 60 - 30) : window.innerWidth / 2;
    const y = frameRect ? frameRect.height * 0.7 : window.innerHeight * 0.7;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setTapHearts((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setTapHearts((prev) => prev.filter((h) => h.id !== id));
    }, 700);

    setReplySuccessMsg(`Sent ${emoji}`);
    setTimeout(() => setReplySuccessMsg(null), 2000);

    try {
      let convId: string | null = null;
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('fan_id', userId)
        .eq('creator_profile_id', currentSession.creator.id)
        .maybeSingle();

      if (existing?.id) {
        convId = existing.id;
      } else {
        const { data: rpcId } = await supabase.rpc('get_or_create_conversation', {
          p_creator_profile_id: currentSession.creator.id,
          p_fan_id: userId,
        });
        if (rpcId) {
          convId = rpcId;
        } else {
          const { data: singleRpcId } = await supabase.rpc('get_or_create_conversation', {
            p_creator_profile_id: currentSession.creator.id,
          });
          if (singleRpcId) convId = singleRpcId;
        }
      }

      if (convId) {
        const encodedContent = encodeStoryReaction(emoji, {
          storyId: mediaStory?.id || currentSlide?.id || null,
          mediaUrl: mediaStory?.thumbnail_url || mediaStory?.media_url || null,
          mediaType: mediaStory?.media_type || 'image',
          caption: mediaStory?.caption || null,
          creatorName: currentSession.creator.display_name,
          creatorId: currentSession.creator.id,
        });

        await supabase.from('messages').insert({
          conversation_id: convId,
          sender_id: userId,
          sender_type: 'fan',
          content: encodedContent,
          message_type: 'text',
        });
      }
    } catch (err) {
      console.error('Failed to send quick reaction:', err);
    }
  };

  const renderSessionPreview = (session: HomeStorySession) => {
    const previewStory =
      session.stories[session.stories.length - 1] ||
      session.archivedStories[session.archivedStories.length - 1] ||
      null;

    if (!previewStory) {
      return <div className="w-full h-full bg-gradient-to-br from-[#111111] to-[#050505]" />;
    }

    if (previewStory.media_type === 'video') {
      if (previewStory.thumbnail_url) {
        return (
          <img
            src={previewStory.thumbnail_url}
            alt={`${session.creator.display_name} preview`}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        );
      }

      return <div className="w-full h-full bg-black" />;
    }

    return (
      <img
        src={previewStory.media_url}
        alt={`${session.creator.display_name} preview`}
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  };

  if (!sessions.length || !currentSession || !currentSlide) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center">
        <div>
          <p className="font-serif text-2xl text-paper mb-2">No stories live</p>
          <p className="text-sm text-muted">Live story sessions will appear here when creators post.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={frameRef} className="h-full bg-ink overflow-hidden relative touch-pan-y">
      {/* Top Segmented Progress Bar */}
      <div className="absolute inset-x-0 top-0 z-[4] px-4 pt-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))]">
        <div className="flex gap-2">
          {currentSession.slides.map((slide, index) => (
            <div key={slide.id} className="relative h-[2px] flex-1 bg-white/20 overflow-hidden rounded-full">
              {index < currentSlideIndex && <div className="absolute inset-0 bg-white" />}
              {index === currentSlideIndex && (
                <div
                  className="absolute inset-y-0 left-0 w-full origin-left bg-white transition-transform duration-75"
                  style={{ transform: `scaleX(${Math.max(0, Math.min(1, currentProgress / 100))})` }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top Creator Header */}
      <div className="absolute inset-x-0 top-0 px-4 pt-[max(2rem,calc(env(safe-area-inset-top)+1.5rem))] z-[4]">
        <div className="flex items-start justify-between gap-3 pt-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-full overflow-hidden border ${
                isOwner ? 'border-gold ring-2 ring-gold/30' : 'border-white/20'
              } bg-black/30 shrink-0`}
            >
              {currentSession.creator.avatar_url ? (
                <img
                  src={currentSession.creator.avatar_url}
                  alt={isOwner ? 'You' : currentSession.creator.display_name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gold/30 to-transparent" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm text-white font-medium truncate flex items-center gap-1.5">
                  <span>{isOwner ? 'You' : currentSession.creator.display_name}</span>
                  {isOwner && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-[0.72rem] text-white/75 truncate">
                  {isOwner
                    ? 'Your story'
                    : mediaStory?.media_type === 'video'
                    ? 'Video story'
                    : 'Photo story'}
                </p>
                {mediaStory?.is_hd && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-white/20 border border-white/30 text-white shadow-sm leading-none">
                    HD
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-white/85">
            <button
              type="button"
              onClick={togglePause}
              className="w-8 h-8 rounded-full bg-black/25 flex items-center justify-center hover:text-white transition-colors"
              aria-label={isPaused ? 'Play story' : 'Pause story'}
            >
              {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} />}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="w-8 h-8 rounded-full bg-black/25 flex items-center justify-center hover:text-white transition-colors"
              aria-label={isMuted ? 'Unmute story' : 'Mute story'}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            {currentSession.slides.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setShowGridDrawer(true);
                  setIsPaused(true);
                }}
                className={`w-8 h-8 rounded-full bg-black/25 flex items-center justify-center transition-colors ${
                  showGridDrawer ? 'text-gold' : 'hover:text-white'
                }`}
                title="View all stories from this creator"
                aria-label="View all stories"
              >
                <Grid3x3 size={15} />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/25 flex items-center justify-center hover:text-white transition-colors"
                aria-label="Close viewer"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Swiper Presentation Area */}
      <div className="h-full w-full relative overflow-hidden">
        {previousSession && (
          <div
            className="absolute inset-0 z-[0]"
            style={{
              transform: `translateY(${verticalOffset - panelHeight}px)`,
              transition: isVerticalDragging ? 'none' : `transform ${panelTransitionMs}ms cubic-bezier(0.22,1,0.36,1)`,
            }}
          >
            {renderSessionPreview(previousSession)}
          </div>
        )}

        {nextSession && (
          <div
            className="absolute inset-0 z-[0]"
            style={{
              transform: `translateY(${verticalOffset + panelHeight}px)`,
              transition: isVerticalDragging ? 'none' : `transform ${panelTransitionMs}ms cubic-bezier(0.22,1,0.36,1)`,
            }}
          >
            {renderSessionPreview(nextSession)}
          </div>
        )}

        <div
          className="absolute inset-0 z-[1] will-change-transform"
          style={{
            transform: `translateY(${verticalOffset}px)`,
            transition: isVerticalDragging ? 'none' : `transform ${panelTransitionMs}ms cubic-bezier(0.22,1,0.36,1)`,
          }}
        >
          {isTransition ? (
            <div className="w-full h-full bg-[radial-gradient(circle_at_top,rgba(201,169,110,0.22),transparent_30%),linear-gradient(180deg,#101010_0%,#070707_100%)] flex flex-col items-center justify-center px-10 text-center">
              <div className="w-24 h-24 rounded-full overflow-hidden border border-gold/40 bg-black/50 mb-6">
                {currentSession.creator.avatar_url ? (
                  <img
                    src={currentSession.creator.avatar_url}
                    alt={currentSession.creator.display_name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gold/30 to-transparent" />
                )}
              </div>
              <p className="text-[0.68rem] uppercase tracking-[0.22em] text-gold/85 mb-4">
                {transitionSlide?.eyebrow || 'Saved Stories'}
              </p>
              <h3 className="font-serif text-4xl text-white leading-tight">{transitionSlide?.title}</h3>
              <p className="mt-4 text-sm leading-7 text-white/70 max-w-[280px]">{transitionSlide?.description}</p>
              {archiveLabels && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-[320px]">
                  {currentSession.archiveGroups.slice(0, 4).map((group) => (
                    <span
                      key={group.dateKey}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-white/60"
                    >
                      {group.label}
                    </span>
                  ))}
                </div>
              )}
              {currentSessionIndex < sessions.length - 1 && (
                <p className="mt-10 text-[0.72rem] uppercase tracking-[0.16em] text-white/45">
                  Swipe up for next creator
                </p>
              )}
            </div>
          ) : mediaStory?.media_type === 'video' ? (
            videoErrored ? (
              mediaStory.thumbnail_url ? (
                <img
                  src={mediaStory.thumbnail_url}
                  alt={mediaStory.caption || `${currentSession.creator.display_name} story`}
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
                alt={mediaStory?.caption || `${currentSession.creator.display_name} story`}
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
        </div>

        {/* Ambient Overlay Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_28%),rgba(0,0,0,0.12)] z-[1]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/65 z-[1]" />

        {/* Tap zones: left 1/3 prev, right 1/3 next, center 1/3 pause/double-tap heart */}
        <button
          type="button"
          onClick={goPreviousSlide}
          className="absolute left-0 top-0 bottom-24 w-1/3 z-[3]"
          aria-label="Previous story"
        />
        <button
          type="button"
          onClick={goNextSlide}
          className="absolute right-0 top-0 bottom-24 w-1/3 z-[3]"
          aria-label="Next story"
        />
        <button
          type="button"
          onClick={handleCenterTap}
          className="absolute left-1/3 right-1/3 top-0 bottom-24 z-[3]"
          aria-label="Pause or like story"
        />

        {/* Floating Tap Hearts on Double Tap */}
        {tapHearts.map((heart) => (
          <div
            key={heart.id}
            className="absolute z-[6] pointer-events-none"
            style={{ left: heart.x, top: heart.y, transform: 'translate(-50%, -50%)' }}
          >
            <div className="relative w-12 h-12">
              <Heart className="absolute inset-0 w-12 h-12 text-pink-400 fill-pink-400 drop-shadow-[0_0_16px_rgba(244,114,182,0.5)]" />
              <Heart className="absolute inset-0 w-12 h-12 text-pink-300 fill-pink-300 animate-ping opacity-70" />
            </div>
          </div>
        ))}

        {/* Bottom Section: Caption & Social Reply Bar (matching media_1789906282506.png) */}
        {!isTransition && (
          <div className="absolute inset-x-0 bottom-0 z-[10] p-4 sm:p-5 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] flex flex-col gap-2.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-auto">
            {/* Story Caption (Centered above reply bar as in Instagram/WhatsApp stories) */}
            {mediaStory?.caption && (
              <p className="text-sm font-medium text-white text-center sm:text-left drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] max-w-full px-2 leading-relaxed select-none">
                {mediaStory.caption}
              </p>
            )}

            {/* Vertically Stacked Action Buttons (Like & Save on the right side) - hidden when emoji drawer is open */}
            {!isOwner && !showReplyEmojiDrawer && (
              <div
                className="absolute right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[10] flex flex-col items-center gap-3 transition-all duration-200"
              >
                {/* Heart Like Button */}
                <button
                  type="button"
                  aria-label="React with love"
                  onClick={handleLove}
                  disabled={!userId || updatingReaction}
                  className={`w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center transition-transform hover:scale-110 active:scale-90 shrink-0 shadow-lg ${
                    hasLoved ? 'text-rose-400 border-rose-400/40' : 'text-white/90 hover:text-rose-400'
                  } ${heartPulse ? 'scale-125' : 'scale-100'} ${!userId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Heart size={20} fill={hasLoved ? 'currentColor' : 'none'} strokeWidth={2} />
                </button>

                {/* Bookmark Save Button */}
                <button
                  type="button"
                  aria-label="Bookmark story"
                  onClick={handleBookmark}
                  disabled={!userId}
                  className={`w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors shrink-0 shadow-lg ${
                    isBookmarked ? 'text-gold border-gold/40' : 'text-white/80 hover:text-white'
                  } ${!userId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Bookmark size={20} fill={isBookmarked ? 'currentColor' : 'none'} strokeWidth={2} />
                </button>
              </div>
            )}

            {/* Fan View Social Reply Bar */}
            {!isOwner && (
              <div className="w-full flex flex-col items-center pt-0.5 pointer-events-auto">
                {/* Capsule Input Row */}
                <div
                  data-no-swipe="true"
                  className="w-full min-h-[48px] rounded-full bg-[#242426]/95 border border-white/10 focus-within:border-gold/50 backdrop-blur-md px-4 py-1.5 flex items-center gap-2.5 shadow-2xl transition-all"
                >
                  <input
                    type="text"
                    placeholder={`Reply to ${currentSession.creator.display_name.split(' ')[0]}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onFocus={() => setIsPaused(true)}
                    onBlur={() => {
                      if (!replyText.trim() && !showReplyEmojiDrawer) {
                        setIsPaused(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    className="flex-1 bg-transparent text-sm text-white placeholder-neutral-400 focus:outline-none pr-1"
                  />

                  {/* Right Action Icons: Mic, Emoji, Plus/Send (Image 3) */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="text-neutral-400 hover:text-white transition-colors cursor-pointer p-1"
                      title="Voice message"
                    >
                      <Mic size={20} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = !showReplyEmojiDrawer;
                        setShowReplyEmojiDrawer(next);
                        if (next) setIsPaused(true);
                      }}
                      className={`transition-colors cursor-pointer p-1 ${
                        showReplyEmojiDrawer ? 'text-gold' : 'text-neutral-400 hover:text-white'
                      }`}
                      title={showReplyEmojiDrawer ? 'Switch to keyboard' : 'Open emojis'}
                    >
                      {showReplyEmojiDrawer ? <Grid3x3 size={20} /> : <Smile size={20} />}
                    </button>

                    {replyText.trim() && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendReply();
                        }}
                        disabled={sendingReply}
                        className="w-8 h-8 rounded-full bg-gold hover:bg-gold-light text-ink flex items-center justify-center font-bold shrink-0 shadow-lg active:scale-95 transition-all cursor-pointer"
                        title="Send reply"
                      >
                        {sendingReply ? (
                          <div className="w-3.5 h-3.5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send size={15} className="translate-x-[1px]" strokeWidth={2.4} />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-Input Emoji Layer: Full-Width across story container */}
                {showReplyEmojiDrawer && (
                  <div
                    data-emoji-drawer="true"
                    data-no-swipe="true"
                    className="-mx-4 sm:-mx-5 -mb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] mt-2.5 w-[calc(100%+2rem)] sm:w-[calc(100%+2.5rem)] border-t border-white/10 pb-[env(safe-area-inset-bottom,0px)] bg-[#18181b] animate-in slide-in-from-bottom-2 duration-200"
                  >
                    <EmojiKeyboardDrawer
                      onEmojiSelect={(emojiData) => {
                        setReplyText((prev) => prev + emojiData.emoji);
                      }}
                      height={290}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Floating Success Toast for Sent Reply / Reaction (Overlay over image, does not distort layout) */}
        {replySuccessMsg && (
          <div className="absolute bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-[25] pointer-events-none px-4 py-2 rounded-full bg-black/90 border border-gold/60 text-gold text-xs font-semibold shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 flex items-center gap-1.5 whitespace-nowrap">
            <Check size={14} className="text-gold" strokeWidth={2.5} />
            <span>{replySuccessMsg}</span>
          </div>
        )}

        {/* Pause Indicator */}
        {isPaused && (
          <div className="absolute inset-0 z-[4] flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/45 border border-white/10 flex items-center justify-center text-white/85">
              <Pause size={26} />
            </div>
          </div>
        )}

        {/* Desktop Lateral Navigation */}
        <button
          type="button"
          onClick={goPreviousSlide}
          className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 text-white/80 items-center justify-center z-[5] hover:bg-black/50 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          type="button"
          onClick={goNextSlide}
          className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 text-white/80 items-center justify-center z-[5] hover:bg-black/50 transition-colors"
        >
          <ChevronRight size={16} />
        </button>

        {currentSessionIndex > 0 && (
          <button
            type="button"
            onClick={() => moveToSession(-1)}
            className="hidden sm:flex absolute top-20 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-black/30 text-white/80 items-center justify-center z-[5] hover:bg-black/50 transition-colors"
          >
            <ChevronUp size={18} />
          </button>
        )}

        {currentSessionIndex < sessions.length - 1 && (
          <button
            type="button"
            onClick={() => moveToSession(1)}
            className="hidden sm:flex absolute bottom-20 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-black/30 text-white/80 items-center justify-center z-[5] hover:bg-black/50 transition-colors"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>

      {/* ── Story Grid Navigation Drawer (Easily navigate all stories of this creator) ── */}
      {showGridDrawer && (
        <div
          data-no-swipe="true"
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200"
          onClick={() => {
            setShowGridDrawer(false);
            setIsPaused(false);
          }}
        >
          <div
            className="bg-[#141416] border-t border-white/10 rounded-t-2xl max-h-[75vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-black/40 border border-white/20 shrink-0">
                  {currentSession.creator.avatar_url && (
                    <img
                      src={currentSession.creator.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">
                    {currentSession.creator.display_name}
                  </h4>
                  <p className="text-[11px] text-white/50">
                    {currentSession.slides.length} {currentSession.slides.length === 1 ? 'story' : 'stories'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowGridDrawer(false);
                  setIsPaused(false);
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close stories grid"
              >
                <X size={16} />
              </button>
            </div>

            {/* Thumbnails Grid */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 sm:grid-cols-4 gap-2.5 no-scrollbar">
              {currentSession.slides.map((slide, idx) => {
                const s = slide as Story;
                const isCurrent = idx === currentSlideIndex;
                const cover = s.thumbnail_url || (s.media_type === 'image' ? s.media_url : null);
                const isViewed = viewedStoriesRef.current.has(s.id);

                return (
                  <button
                    key={s.id || idx}
                    type="button"
                    onClick={() => {
                      setCurrentSlideIndex(idx);
                      setShowGridDrawer(false);
                      setIsPaused(false);
                    }}
                    className={`relative aspect-[9/14] rounded-lg overflow-hidden border-2 text-left group transition-all transform active:scale-95 cursor-pointer ${
                      isCurrent
                        ? 'border-gold ring-2 ring-gold/40 shadow-lg shadow-gold/20'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={`Story ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-black" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />

                    {/* Story Type Icon */}
                    <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90">
                      {s.media_type === 'video' ? (
                        <Play size={9} fill="currentColor" />
                      ) : (
                        <ImageIcon size={10} />
                      )}
                    </div>

                    {/* Story Sequence Number */}
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[9px] font-mono text-white/80">
                      #{idx + 1}
                    </div>

                    {/* Status Badge */}
                    <div className="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between">
                      {isCurrent ? (
                        <span className="text-[10px] font-bold text-gold bg-black/90 px-1.5 py-0.5 rounded shadow">
                          Playing
                        </span>
                      ) : !isViewed ? (
                        <span className="w-2 h-2 rounded-full bg-gold shadow-sm shadow-gold animate-pulse" title="Unwatched" />
                      ) : (
                        <span className="text-[9px] text-white/40 font-medium">Seen</span>
                      )}
                      {s.is_hd && (
                        <span className="text-[8px] font-bold text-white/70 bg-white/20 px-1 rounded">
                          HD
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
