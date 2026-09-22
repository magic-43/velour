import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';
import { useCreatorProfiles } from './useCreatorProfiles';
import { uploadPublicFile } from '../r2';
import { captureVideoThumbnail } from '../videoThumbnail';
import type { Story, HomeStorySession, CreatorProfile, ArchiveGroup, FeedSlide, AudienceSettings } from '../../types';

interface PostStoryItem {
  file: File;
  mediaType: 'image' | 'video';
  caption?: string;
  isHD?: boolean;
  thumbnailFile?: File;
}

interface UseStoriesReturn {
  sessions: HomeStorySession[];
  loading: boolean;
  refetch: () => Promise<void>;
  postStory: (
    file: File,
    mediaType: 'image' | 'video',
    caption?: string,
    audienceSettings?: AudienceSettings,
    isHD?: boolean,
    thumbnailFile?: File
  ) => Promise<Story>;
  postStoryBatch: (items: PostStoryItem[], audienceSettings?: AudienceSettings) => Promise<Story[]>;
  deleteStory: (storyId: string) => Promise<void>;
  updateStoryCaption: (storyId: string, newCaption: string | null) => Promise<void>;
  markStoryViewed: (storyId: string) => Promise<void>;
}

// Viewed stories persistence in localStorage
export function getViewedStoryIds(userId?: string): Set<string> {
  try {
    const key = `velour_viewed_stories_${userId || 'guest'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveViewedStoryId(storyId: string, userId?: string) {
  try {
    const key = `velour_viewed_stories_${userId || 'guest'}`;
    const current = getViewedStoryIds(userId);
    current.add(storyId);
    localStorage.setItem(key, JSON.stringify(Array.from(current)));
  } catch {
    // ignore
  }
}

export function useStories(): UseStoriesReturn {
  const { user } = useAuth();
  const { activeCreatorProfile } = useCreatorProfiles();
  const [sessions, setSessions] = useState<HomeStorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const viewedStoryIds = useRef<Set<string>>(getViewedStoryIds(user?.id));

  useEffect(() => {
    viewedStoryIds.current = getViewedStoryIds(user?.id);
  }, [user?.id]);

  const activeCreatorProfileRef = useRef(activeCreatorProfile);
  activeCreatorProfileRef.current = activeCreatorProfile;
  const userRef = useRef(user);
  userRef.current = user;

  // Fetch stories and build v1 story sessions with live + archive transitions
  const fetchStories = useCallback(async () => {
    try {
      let { data, error } = await supabase
        .from('stories')
        .select(`
          id,
          creator_profile_id,
          media_url,
          thumbnail_url,
          media_type,
          caption,
          published_at,
          expires_at,
          view_count,
          audience_type,
          audience_user_ids,
          is_hd,
          creator_profile:creator_profiles!creator_profile_id (
            id,
            owner_id,
            display_name,
            bio,
            avatar_url,
            cover_url,
            category,
            tags,
            is_verified,
            is_active,
            created_at,
            owner:profiles!owner_id (
              id,
              username,
              display_name,
              avatar_url
            )
          )
        `)
        .order('published_at', { ascending: false });

      if (error && (error.message?.includes('audience') || error.message?.includes('is_hd') || error.code === '42703')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fallback = await supabase
          .from('stories')
          .select(`
            id,
            creator_profile_id,
            media_url,
            thumbnail_url,
            media_type,
            caption,
            published_at,
            expires_at,
            view_count,
            creator_profile:creator_profiles!creator_profile_id (
              id,
              owner_id,
              display_name,
              bio,
              avatar_url,
              cover_url,
              category,
              tags,
              is_verified,
              is_active,
              created_at,
              owner:profiles!owner_id (
                id,
                username,
                display_name,
                avatar_url
              )
            )
          `)
          .order('published_at', { ascending: false });
        data = fallback.data as typeof data;
        error = fallback.error;
      }

      if (error) {
        console.error('Error fetching stories:', error.message);
        setSessions([]);
        return;
      }

      const creatorMap = new Map<string, { creator: CreatorProfile; allStories: Story[] }>();

      for (const row of (data ?? []) as any[]) {
        const creatorRaw = row.creator_profile;
        if (!creatorRaw || !creatorRaw.is_active) continue;

        const creator: CreatorProfile = {
          ...creatorRaw,
          avatar_url: creatorRaw.avatar_url || creatorRaw.owner?.avatar_url || null,
        };

        // Audience Privacy Verification
        const isOwner = user && creator.owner_id === user.id;
        if (!isOwner) {
          const audienceType = row.audience_type || 'all';
          const userIds: string[] = Array.isArray(row.audience_user_ids) ? row.audience_user_ids : [];
          if (audienceType === 'exclude' && user && userIds.includes(user.id)) {
            continue; // Viewer is excluded from this story
          }
          if (audienceType === 'include' && (!user || !userIds.includes(user.id))) {
            continue; // Viewer is not in allowed list for this story
          }
        }

        const story: Story = {
          id: row.id,
          creator_profile_id: row.creator_profile_id,
          media_url: row.media_url,
          thumbnail_url: row.thumbnail_url,
          media_type: row.media_type,
          caption: row.caption,
          published_at: row.published_at,
          expires_at: row.expires_at,
          view_count: row.view_count || 0,
          audience_type: row.audience_type,
          audience_user_ids: row.audience_user_ids,
          is_hd: Boolean(row.is_hd || (row.media_url && (row.media_url.includes('_hd.') || row.media_url.includes('hd=1')))),
        };

        if (!creatorMap.has(creator.id)) {
          creatorMap.set(creator.id, {
            creator,
            allStories: [story],
          });
        } else {
          creatorMap.get(creator.id)!.allStories.push(story);
        }
      }

      const viewedSet = getViewedStoryIds(userRef.current?.id);
      const builtSessions: HomeStorySession[] = [];

      for (const [, { creator, allStories }] of creatorMap) {
        if (allStories.length === 0) continue;

        // Sort stories chronological: Oldest to Newest
        allStories.sort(
          (a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
        );

        const unviewedStories = allStories.filter((s) => !viewedSet.has(s.id));
        const unviewedCount = unviewedStories.length;
        const isAllViewed = unviewedCount === 0;
        const firstUnviewedIndex = isAllViewed
          ? 0
          : allStories.findIndex((s) => !viewedSet.has(s.id));

        builtSessions.push({
          creator,
          stories: allStories,
          archivedStories: [],
          archiveGroups: [],
          slides: allStories,
          unviewedCount,
          firstUnviewedIndex: firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0,
          isAllViewed,
        });
      }

      // Sort sessions:
      // 1. Creator's own session is always pinned at index 0
      // 2. Creators with unviewed stories (sorted by latest story activity)
      // 3. Creators whose stories are all viewed (sorted by latest story activity)
      const myCreatorId = activeCreatorProfileRef.current?.id;
      const myUserId = userRef.current?.id;

      builtSessions.sort((a, b) => {
        const isMeA = (myCreatorId && a.creator.id === myCreatorId) || (myUserId && a.creator.owner_id === myUserId);
        const isMeB = (myCreatorId && b.creator.id === myCreatorId) || (myUserId && b.creator.owner_id === myUserId);
        if (isMeA && !isMeB) return -1;
        if (!isMeA && isMeB) return 1;

        if (!a.isAllViewed && b.isAllViewed) return -1;
        if (a.isAllViewed && !b.isAllViewed) return 1;

        const latestA = a.stories[a.stories.length - 1];
        const latestB = b.stories[b.stories.length - 1];
        const timeA = latestA ? new Date(latestA.published_at).getTime() : 0;
        const timeB = latestB ? new Date(latestB.published_at).getTime() : 0;
        return timeB - timeA;
      });

      setSessions(builtSessions);
    } catch (err) {
      console.error('Failed to load stories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  // When active creator profile is loaded, ensure creator's session is pinned to index 0
  useEffect(() => {
    if (!activeCreatorProfile?.id && !user?.id) return;
    setSessions((prev) => {
      if (prev.length <= 1) return prev;
      const copy = [...prev];
      const myCreatorId = activeCreatorProfile?.id;
      const myUserId = user?.id;

      copy.sort((a, b) => {
        const isMeA = (myCreatorId && a.creator.id === myCreatorId) || (myUserId && a.creator.owner_id === myUserId);
        const isMeB = (myCreatorId && b.creator.id === myCreatorId) || (myUserId && b.creator.owner_id === myUserId);
        if (isMeA && !isMeB) return -1;
        if (!isMeA && isMeB) return 1;

        if (!a.isAllViewed && b.isAllViewed) return -1;
        if (a.isAllViewed && !b.isAllViewed) return 1;

        const latestA = a.stories[a.stories.length - 1];
        const latestB = b.stories[b.stories.length - 1];
        const timeA = latestA ? new Date(latestA.published_at).getTime() : 0;
        const timeB = latestB ? new Date(latestB.published_at).getTime() : 0;
        return timeB - timeA;
      });
      return copy;
    });
  }, [activeCreatorProfile?.id, user?.id]);

  // Realtime subscription for instant story updates
  useEffect(() => {
    const channelId = `stories-feed:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories' },
        () => {
          fetchStories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStories]);

  // Post batch of stories via Cloudflare R2
  const postStoryBatch = useCallback(
    async (
      items: PostStoryItem[],
      audienceSettings?: AudienceSettings
    ): Promise<Story[]> => {
      if (!user) throw new Error('Not authenticated');
      if (!activeCreatorProfile) throw new Error('No active creator profile found');
      if (items.length === 0) return [];

      const createdStories: Story[] = [];

      for (const item of items) {
        const { file, mediaType, caption } = item;
        let thumbnailFile = item.thumbnailFile;
        const isHd = item.isHD !== false;
        const ext = file.name.split('.').pop() || (mediaType === 'image' ? 'jpg' : 'mp4');
        const hdMarker = isHd ? '_hd' : '';
        const baseId = crypto.randomUUID();
        const key = `stories/${activeCreatorProfile.id}/${baseId}${hdMarker}.${ext}`;

        // Upload media file to R2
        const publicUrl = await uploadPublicFile(file, key, { skipCompression: true });

        // Identify and upload thumbnail (both photos and videos get ultra-light ~5KB thumbnails)
        let finalThumbnailUrl: string | null = null;
        if (mediaType === 'image') {
          if (thumbnailFile) {
            const thumbExt = thumbnailFile.type === 'image/webp' ? 'webp' : 'jpg';
            const thumbKey = `stories/${activeCreatorProfile.id}/${baseId}_thumb.${thumbExt}`;
            try {
              finalThumbnailUrl = await uploadPublicFile(thumbnailFile, thumbKey, { skipCompression: true });
            } catch (tErr) {
              console.warn('Photo thumbnail upload failed, falling back to full media URL:', tErr);
              finalThumbnailUrl = publicUrl;
            }
          } else {
            finalThumbnailUrl = publicUrl;
          }
        } else {
          // If video thumbnail was not already supplied, extract frame client-side
          if (!thumbnailFile) {
            try {
              thumbnailFile = await captureVideoThumbnail(file);
            } catch (thumbErr) {
              console.warn('Video thumbnail capture failed:', thumbErr);
            }
          }

          if (thumbnailFile) {
            const thumbKey = `stories/${activeCreatorProfile.id}/${baseId}_thumb.jpg`;
            finalThumbnailUrl = await uploadPublicFile(thumbnailFile, thumbKey, { skipCompression: true });
          }
        }

        const now = new Date();
        const expiresAt = null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertPayload: Record<string, any> = {
          creator_profile_id: activeCreatorProfile.id,
          media_url: publicUrl,
          thumbnail_url: finalThumbnailUrl,
          media_type: mediaType,
          caption: caption?.trim() || null,
          published_at: now.toISOString(),
          expires_at: expiresAt,
          view_count: 0,
          is_hd: isHd,
        };

        if (audienceSettings) {
          insertPayload.audience_type = audienceSettings.type;
          insertPayload.audience_user_ids = audienceSettings.userIds;
        }

        let { data, error } = await supabase
          .from('stories')
          .insert(insertPayload)
          .select()
          .single();

        // If DB migration not executed yet, retry without is_hd or audience columns
        if (error && (error.message?.includes('audience') || error.message?.includes('is_hd') || error.code === '42703')) {
          if (error.message?.includes('is_hd') || error.code === '42703') {
            delete insertPayload.is_hd;
          }
          if (error.message?.includes('audience') || error.code === '42703') {
            delete insertPayload.audience_type;
            delete insertPayload.audience_user_ids;
          }
          const retry = await supabase
            .from('stories')
            .insert(insertPayload)
            .select()
            .single();
          data = retry.data;
          error = retry.error;
        }

        if (error || !data) {
          throw new Error(error?.message || 'Failed to publish story');
        }

        createdStories.push(data as Story);
      }

      await fetchStories();
      return createdStories;
    },
    [user, activeCreatorProfile, fetchStories]
  );

  // Post single story
  const postStory = useCallback(
    async (
      file: File,
      mediaType: 'image' | 'video',
      caption?: string,
      audienceSettings?: AudienceSettings,
      isHD?: boolean,
      thumbnailFile?: File
    ): Promise<Story> => {
      const [story] = await postStoryBatch(
        [{ file, mediaType, caption, isHD: isHD ?? true, thumbnailFile }],
        audienceSettings
      );
      return story;
    },
    [postStoryBatch]
  );

  // Delete a story (owner only)
  const deleteStory = useCallback(
    async (storyId: string) => {
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (error) throw error;
      await fetchStories();
    },
    [fetchStories]
  );

  // Update a story caption (owner only)
  const updateStoryCaption = useCallback(
    async (storyId: string, newCaption: string | null) => {
      const cleanCaption = newCaption && newCaption.trim().length > 0 ? newCaption.trim() : null;
      const { error } = await supabase
        .from('stories')
        .update({ caption: cleanCaption })
        .eq('id', storyId);

      if (error) {
        console.error('Error updating story caption:', error);
        throw error;
      }

      // Update local state immediately so all views update without waiting
      setSessions((prevSessions) =>
        prevSessions.map((session) => ({
          ...session,
          stories: session.stories.map((story) =>
            story.id === storyId ? { ...story, caption: cleanCaption } : story
          ),
          archivedStories: session.archivedStories.map((story) =>
            story.id === storyId ? { ...story, caption: cleanCaption } : story
          ),
        }))
      );
    },
    []
  );

  // Track story views and persist in localStorage
  const markStoryViewed = useCallback(
    async (storyId: string) => {
      saveViewedStoryId(storyId, userRef.current?.id);
      if (viewedStoryIds.current.has(storyId)) return;
      viewedStoryIds.current.add(storyId);

      try {
        await supabase.rpc('increment_story_view', { p_story_id: storyId });

        // Optimistically increment view count and update unviewed count in local state
        setSessions((prevSessions) =>
          prevSessions.map((session) => {
            const hasStory = session.stories.some((s) => s.id === storyId);
            if (!hasStory) return session;

            const viewedSet = getViewedStoryIds(userRef.current?.id);
            const unviewedCount = session.stories.filter((s) => !viewedSet.has(s.id)).length;
            const isAllViewed = unviewedCount === 0;
            const firstUnviewedIndex = isAllViewed
              ? 0
              : session.stories.findIndex((s) => !viewedSet.has(s.id));

            return {
              ...session,
              unviewedCount,
              isAllViewed,
              firstUnviewedIndex: firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0,
              stories: session.stories.map((story) =>
                story.id === storyId
                  ? { ...story, view_count: (story.view_count || 0) + 1 }
                  : story
              ),
              slides: session.slides.map((slide) =>
                slide.id === storyId
                  ? { ...(slide as Story), view_count: ((slide as Story).view_count || 0) + 1 }
                  : slide
              ),
            };
          })
        );
      } catch {
        // Silently ignore
      }
    },
    []
  );

  return {
    sessions,
    loading,
    refetch: fetchStories,
    postStory,
    postStoryBatch,
    deleteStory,
    updateStoryCaption,
    markStoryViewed,
  };
}
