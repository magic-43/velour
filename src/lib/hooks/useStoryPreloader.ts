import { useEffect, useRef } from 'react';

export interface PreloadableStory {
  id: string;
  media_url?: string;
  thumbnail_url?: string | null;
  media_type?: 'image' | 'video';
}

export interface AdjacentCreator {
  avatarUrl?: string | null;
  previewUrl?: string | null;
}

interface UseStoryPreloaderOptions {
  currentIndex: number;
  stories: PreloadableStory[];
  adjacentCreator?: AdjacentCreator | null;
  isSlowConnection?: boolean;
}

// Global set of URLs already warmed in browser cache during this session
const preloadedUrls = new Set<string>();

export function useStoryPreloader({
  currentIndex,
  stories,
  adjacentCreator,
  isSlowConnection = false,
}: UseStoryPreloaderOptions) {
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    if (!stories || stories.length === 0) return;

    // Determine how many slides to prefetch ahead
    const prefetchCount = isSlowConnection ? 1 : 2;

    for (let offset = 1; offset <= prefetchCount; offset++) {
      const targetIndex = currentIndex + offset;
      if (targetIndex >= stories.length) break;

      const story = stories[targetIndex];
      if (!story) continue;

      // 1. Preload thumbnail immediately (always fast, ~3-5KB)
      if (story.thumbnail_url && !preloadedUrls.has(story.thumbnail_url)) {
        preloadedUrls.add(story.thumbnail_url);
        const thumbImg = new Image();
        thumbImg.src = story.thumbnail_url;
      }

      // 2. Preload main media
      if (story.media_url && !preloadedUrls.has(story.media_url)) {
        if (story.media_type === 'image') {
          preloadedUrls.add(story.media_url);
          const mainImg = new Image();
          mainImg.src = story.media_url;
        } else if (story.media_type === 'video') {
          // For videos, warm up connection and initial buffer
          preloadedUrls.add(story.media_url);
          try {
            const vid = document.createElement('video');
            vid.preload = isSlowConnection ? 'metadata' : 'auto';
            vid.muted = true;
            vid.playsInline = true;
            vid.src = story.media_url;
            videoElementsRef.current.set(story.media_url, vid);
          } catch (e) {
            console.debug('Failed to pre-warm video:', e);
          }
        }
      }
    }

    // 3. Preload adjacent creator when nearing the end of current session
    if (adjacentCreator && currentIndex >= stories.length - 2) {
      if (adjacentCreator.avatarUrl && !preloadedUrls.has(adjacentCreator.avatarUrl)) {
        preloadedUrls.add(adjacentCreator.avatarUrl);
        const avatarImg = new Image();
        avatarImg.src = adjacentCreator.avatarUrl;
      }
      if (adjacentCreator.previewUrl && !preloadedUrls.has(adjacentCreator.previewUrl)) {
        preloadedUrls.add(adjacentCreator.previewUrl);
        const prevImg = new Image();
        prevImg.src = adjacentCreator.previewUrl;
      }
    }
  }, [currentIndex, stories, adjacentCreator, isSlowConnection]);

  // Clean up video preloaders on unmount
  useEffect(() => {
    const videoMap = videoElementsRef.current;
    return () => {
      videoMap.forEach((vid) => {
        vid.src = '';
        vid.load();
      });
      videoMap.clear();
    };
  }, []);
}
