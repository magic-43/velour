import { useState, useEffect } from 'react';
import { ArrowLeft, Bookmark, Play, Video, Camera, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import ArchiveStoryViewer from './ArchiveStoryViewer';
import { useBackHandler } from '../../lib/backButtonRegistry';
import type { StoryWithCreator } from '../../types';

interface FanSavedStoriesViewProps {
  onBack: () => void;
  onCountChange?: (count: number) => void;
}

export default function FanSavedStoriesView({ onBack, onCountChange }: FanSavedStoriesViewProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [savedStories, setSavedStories] = useState<StoryWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);

  // Android hardware back button handler
  useBackHandler(() => {
    onBack();
    return true;
  }, true, 80);

  const fetchSavedStories = async () => {
    if (!profile) return;
    try {
      setLoading(true);

      // 1. Gather IDs from localStorage
      const localKey = `saved_stories_${profile.id}`;
      let localIds: string[] = [];
      try {
        localIds = JSON.parse(localStorage.getItem(localKey) || '[]');
      } catch {
        localIds = [];
      }

      // 2. Gather IDs from Supabase story_reactions
      const { data: dbReactions } = await supabase
        .from('story_reactions')
        .select('story_id')
        .eq('user_id', profile.id)
        .eq('reaction_type', 'bookmark');

      const dbIds = (dbReactions || []).map((r) => r.story_id);
      const allIds = Array.from(new Set([...localIds, ...dbIds]));

      if (allIds.length === 0) {
        setSavedStories([]);
        if (onCountChange) onCountChange(0);
        return;
      }

      // 3. Query story records matching saved IDs
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          creator_profile:creator_profiles!creator_profile_id(
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
            owner:profiles!owner_id(username)
          )
        `)
        .in('id', allIds)
        .order('published_at', { ascending: false });

      if (!error && data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stories = data.filter((s: any) => Boolean(s.creator_profile)) as StoryWithCreator[];
        setSavedStories(stories);
        if (onCountChange) onCountChange(stories.length);
      }
    } catch (err) {
      console.error('Failed to load saved stories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedStories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const handleRemoveBookmark = async (storyId: string) => {
    if (!profile) return;

    // 1. Remove from localStorage
    const localKey = `saved_stories_${profile.id}`;
    try {
      const localIds = JSON.parse(localStorage.getItem(localKey) || '[]');
      const filtered = localIds.filter((id: string) => id !== storyId);
      localStorage.setItem(localKey, JSON.stringify(filtered));
    } catch {
      // Ignore JSON error
    }

    // 2. Remove from Supabase
    await supabase
      .from('story_reactions')
      .delete()
      .eq('user_id', profile.id)
      .eq('story_id', storyId)
      .eq('reaction_type', 'bookmark');

    // 3. Update state
    setSavedStories((prev) => {
      const updated = prev.filter((s) => s.id !== storyId);
      if (onCountChange) onCountChange(updated.length);
      return updated;
    });

    if (activeStoryIndex !== null) {
      if (savedStories.length <= 1) {
        setActiveStoryIndex(null);
      } else if (activeStoryIndex >= savedStories.length - 1) {
        setActiveStoryIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
      }
    }
  };

  return (
    <div className="px-4 sm:px-5 pt-0 pb-24 md:pb-8 max-w-[600px] w-full mx-auto md:mx-0">
      {/* Header matching Stories/Home page */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-5 mb-4 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3.5 backdrop-blur-md sm:px-5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-muted hover:text-paper transition-colors cursor-pointer"
            aria-label="Back to profile"
          >
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">
            Saved Stories
          </h3>
        </div>

        {savedStories.length > 0 && (
          <span className="text-xs text-muted font-medium tracking-tight">
            {savedStories.length} {savedStories.length === 1 ? 'story' : 'stories'}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-muted">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs">Loading saved stories...</p>
        </div>
      ) : savedStories.length === 0 ? (
        /* Empty State */
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-muted mb-3.5">
            <Bookmark size={22} strokeWidth={1.5} />
          </div>
          <h4 className="font-medium text-sm text-paper mb-1">
            No saved stories yet
          </h4>
          <p className="text-muted text-xs max-w-xs mb-5 leading-relaxed">
            Bookmark memorable creator moments from the feed to preserve and replay them anytime.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gold hover:bg-gold-light text-ink text-xs font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
          >
            <Sparkles size={14} />
            <span>Browse Stories</span>
          </button>
        </div>
      ) : (
        /* 9:16 Saved Stories Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {savedStories.map((story, index) => {
            const creator = story.creator_profile;

            return (
              <div
                key={story.id}
                onClick={() => setActiveStoryIndex(index)}
                className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-ink-light border border-white/10 hover:border-gold/50 transition-all cursor-pointer shadow-sm select-none"
              >
                {/* Media Preview */}
                {story.media_type === 'video' ? (
                  story.thumbnail_url ? (
                    <img
                      src={story.thumbnail_url}
                      alt={story.caption || 'Video story'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                      <Play size={24} className="text-white/60" />
                    </div>
                  )
                ) : (
                  <img
                    src={story.media_url}
                    alt={story.caption || 'Story photo'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                )}

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/50 opacity-90 group-hover:opacity-95 transition-opacity" />

                {/* Top Badges: Media Type & Remove Bookmark */}
                <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none">
                  <span className="px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur text-[9px] font-mono text-white/90 uppercase flex items-center gap-1">
                    {story.media_type === 'video' ? (
                      <>
                        <Video size={10} className="text-gold" />
                        <span>Video</span>
                      </>
                    ) : (
                      <>
                        <Camera size={10} className="text-gold" />
                        <span>Photo</span>
                      </>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveBookmark(story.id);
                    }}
                    className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-gold flex items-center justify-center backdrop-blur transition-all pointer-events-auto cursor-pointer"
                    title="Remove bookmark"
                  >
                    <Bookmark size={12} fill="currentColor" />
                  </button>
                </div>

                {/* Center Hover Play Icon */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all backdrop-blur-sm">
                    <Play size={16} fill="currentColor" className="ml-0.5 text-gold" />
                  </div>
                </div>

                {/* Bottom Creator Pill & Caption */}
                <div className="absolute bottom-2 inset-x-2 pointer-events-none">
                  {creator && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-4 h-4 rounded-full overflow-hidden bg-zinc-800 border border-white/20 shrink-0">
                        {creator.avatar_url ? (
                          <img
                            src={creator.avatar_url}
                            alt={creator.display_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-[8px] text-gold font-serif">
                            {creator.display_name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-paper font-semibold truncate leading-tight drop-shadow">
                        {creator.display_name}
                      </span>
                    </div>
                  )}

                  {story.caption && (
                    <p className="text-[10px] text-white/80 line-clamp-1 leading-snug drop-shadow font-medium">
                      {story.caption}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Screen Story Replay Viewer */}
      {activeStoryIndex !== null && savedStories.length > 0 && (
        <ArchiveStoryViewer
          stories={savedStories}
          initialIndex={activeStoryIndex}
          isFanSavedView={true}
          onClose={() => setActiveStoryIndex(null)}
          onRemoveBookmark={handleRemoveBookmark}
        />
      )}
    </div>
  );
}
