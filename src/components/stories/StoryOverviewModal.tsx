import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Eye,
  Heart,
  Bookmark,
  Film,
  Image as ImageIcon,
  Clock,
  Play,
  Trash2,
  Plus,
  BarChart3,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DeleteStoryConfirmDialog from './DeleteStoryConfirmDialog';
import type { Story, CreatorProfile } from '../../types';

interface StoryOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  stories: Story[];
  creatorProfile: CreatorProfile;
  onSelectStory?: (index: number) => void;
  onDeleteStory?: (storyId: string) => Promise<void>;
  onAddStory?: () => void;
}

export default function StoryOverviewModal({
  isOpen,
  onClose,
  stories,
  creatorProfile,
  onSelectStory,
  onDeleteStory,
  onAddStory,
}: StoryOverviewModalProps) {
  const [likesMap, setLikesMap] = useState<Record<string, number>>({});
  const [savesMap, setSavesMap] = useState<Record<string, number>>({});
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<Story | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch reactions per story
  useEffect(() => {
    if (!isOpen || stories.length === 0) return;

    let cancelled = false;
    const fetchReactions = async () => {
      setLoadingLikes(true);
      try {
        const storyIds = stories.map((s) => s.id);
        const { data, error } = await supabase
          .from('story_reactions')
          .select('story_id, reaction_type')
          .in('story_id', storyIds);

        if (error && error.code !== '42P01') {
          console.error('Error fetching reactions for overview:', error);
          return;
        }

        if (cancelled) return;

        const likes: Record<string, number> = {};
        const saves: Record<string, number> = {};
        for (const row of data || []) {
          if (row.reaction_type === 'love') {
            likes[row.story_id] = (likes[row.story_id] || 0) + 1;
          } else if (row.reaction_type === 'bookmark') {
            saves[row.story_id] = (saves[row.story_id] || 0) + 1;
          }
        }
        setLikesMap(likes);
        setSavesMap(saves);
      } catch (err) {
        console.error('Failed to load reactions counts for overview:', err);
      } finally {
        if (!cancelled) setLoadingLikes(false);
      }
    };

    fetchReactions();
    return () => {
      cancelled = true;
    };
  }, [isOpen, stories]);

  // Aggregate Metrics
  const totalViews = useMemo(() => {
    return stories.reduce((sum, s) => sum + (s.view_count || 0), 0);
  }, [stories]);

  const totalLikes = useMemo(() => {
    return Object.values(likesMap).reduce((sum, count) => sum + count, 0);
  }, [likesMap]);

  const totalSaves = useMemo(() => {
    return Object.values(savesMap).reduce((sum, count) => sum + count, 0);
  }, [savesMap]);

  // Time remaining helper
  const getTimeRemaining = (publishedAt: string) => {
    const expiresTime = new Date(publishedAt).getTime() + 24 * 60 * 60 * 1000;
    const diffMs = expiresTime - Date.now();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h left`;
    return `${mins}m left`;
  };

  const handleConfirmDelete = async () => {
    if (!storyToDelete || !onDeleteStory || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteStory(storyToDelete.id);
      setStoryToDelete(null);
    } catch (err) {
      console.error('Error deleting story in overview:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="overview-title"
        className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-lg animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-[#0d0d0f] border border-gold/30 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#23201d] bg-[#121114]">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-gold p-[2px] shadow-md bg-ink">
                  {creatorProfile.avatar_url ? (
                    <img
                      src={creatorProfile.avatar_url}
                      alt={creatorProfile.display_name}
                      className="w-full h-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gold/20 flex items-center justify-center text-gold font-serif font-bold text-sm">
                      {creatorProfile.display_name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded-full bg-gold text-[8px] font-black tracking-wider text-ink uppercase flex items-center gap-0.5 shadow">
                  <Sparkles size={7} />
                  <span>YOU</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 id="overview-title" className="font-serif text-base sm:text-lg text-paper font-semibold leading-tight">
                    Story Overview
                  </h2>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-[10px] font-medium text-gold">
                    <BarChart3 size={11} />
                    <span>Creator Insights</span>
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Track audience reach & manage your live moments
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-paper/80 hover:text-paper flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close overview"
            >
              <X size={18} />
            </button>
          </div>

          {/* Performance Summary Banner */}
          <div className="px-5 sm:px-6 py-4 bg-gradient-to-b from-[#151419] to-[#0d0d0f] border-b border-[#23201d]">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {/* Metric 1: Views */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-ink-light/50 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-[11px] font-medium mb-1">
                  <span>Total Views</span>
                  <div className="w-6 h-6 rounded-lg bg-gold/10 text-gold flex items-center justify-center">
                    <Eye size={13} />
                  </div>
                </div>
                <p className="font-serif text-lg sm:text-2xl text-paper font-bold tracking-tight">
                  {totalViews.toLocaleString()}
                </p>
              </div>

              {/* Metric 2: Likes */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-ink-light/50 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-[11px] font-medium mb-1">
                  <span>Total Likes</span>
                  <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <Heart size={13} className={totalLikes > 0 ? 'fill-rose-400' : ''} />
                  </div>
                </div>
                <p className="font-serif text-lg sm:text-2xl text-paper font-bold tracking-tight">
                  {loadingLikes ? '...' : totalLikes.toLocaleString()}
                </p>
              </div>

              {/* Metric 3: Saves */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-ink-light/50 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-[11px] font-medium mb-1">
                  <span>Total Saves</span>
                  <div className="w-6 h-6 rounded-lg bg-gold/10 text-gold flex items-center justify-center">
                    <Bookmark size={13} className={totalSaves > 0 ? 'fill-gold' : ''} />
                  </div>
                </div>
                <p className="font-serif text-lg sm:text-2xl text-paper font-bold tracking-tight">
                  {loadingLikes ? '...' : totalSaves.toLocaleString()}
                </p>
              </div>

              {/* Metric 4: Active Stories */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-ink-light/50 border border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-[11px] font-medium mb-1">
                  <span>Active Stories</span>
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Film size={13} />
                  </div>
                </div>
                <p className="font-serif text-lg sm:text-2xl text-paper font-bold tracking-tight">
                  {stories.length}
                </p>
              </div>

              {/* Quick Action: Add Story */}
              {onAddStory && (
                <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-center lg:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAddStory();
                    }}
                    className="w-full h-full min-h-[48px] py-2.5 px-4 rounded-2xl bg-gold hover:bg-gold-light text-ink text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-gold/20 cursor-pointer"
                  >
                    <Plus size={16} strokeWidth={2.5} />
                    <span>New Story</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Stories Grid Scroll Area */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            {stories.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold mb-3">
                  <Film size={26} />
                </div>
                <h3 className="font-serif text-lg text-paper font-medium mb-1">No Active Stories</h3>
                <p className="text-xs text-muted max-w-sm mb-5 leading-relaxed">
                  Your live stories will appear here for 24 hours with real-time viewer and reaction metrics.
                </p>
                {onAddStory && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAddStory();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus size={15} strokeWidth={2.5} />
                    <span>Post Your First Story</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {stories.map((story, index) => {
                  const cover = story.thumbnail_url || (story.media_type === 'image' ? story.media_url : null);
                  const likes = likesMap[story.id] || 0;
                  const saves = savesMap[story.id] || 0;
                  const timeBadge = getTimeRemaining(story.published_at);

                  return (
                    <div
                      key={story.id}
                      className="group relative aspect-[9/13] rounded-2xl overflow-hidden border border-[#262320] bg-ink-light/40 shadow-sm transition-all hover:border-gold/50 hover:shadow-xl"
                    >
                      {/* Media Thumbnail */}
                      {cover ? (
                        <img
                          src={cover}
                          alt="Story thumbnail"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-ink-light via-ink to-black flex items-center justify-center">
                          <Film size={28} className="text-muted/40" />
                        </div>
                      )}

                      {/* Top Gradient & Badges */}
                      <div className="absolute inset-x-0 top-0 p-2.5 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[9px] font-semibold uppercase tracking-wider text-paper/90 flex items-center gap-1">
                            {story.media_type === 'video' ? <Film size={8} /> : <ImageIcon size={8} />}
                            <span>{story.media_type === 'video' ? 'Video' : 'Photo'}</span>
                          </span>
                          {story.is_hd && (
                            <span className="px-1.5 py-0.5 rounded bg-gold/20 border border-gold/40 text-[9px] font-bold text-gold">
                              HD
                            </span>
                          )}
                        </div>

                        <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[9px] font-medium text-white/80 flex items-center gap-1">
                          <Clock size={9} />
                          <span>{timeBadge}</span>
                        </span>
                      </div>

                      {/* Bottom Gradient & Live Metrics */}
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                        {story.caption && (
                          <p className="text-[11px] text-paper/95 font-medium truncate mb-1.5 drop-shadow">
                            {story.caption}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-white/90">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[11px] font-medium">
                              <Eye size={12} className="text-gold" />
                              <span>{story.view_count || 0}</span>
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-medium">
                              <Heart size={12} className="text-rose-400 fill-rose-400/40" />
                              <span>{likes}</span>
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-medium">
                              <Bookmark size={12} className="text-gold fill-gold/40" />
                              <span>{saves}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Hover / Active Actions Overlay */}
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2.5 p-4">
                        {onSelectStory && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSelectStory(index);
                            }}
                            className="w-10 h-10 rounded-full bg-gold hover:bg-gold-light text-ink flex items-center justify-center transition-transform hover:scale-110 shadow-lg cursor-pointer"
                            title="Play this story"
                          >
                            <Play size={18} fill="currentColor" className="ml-0.5" />
                          </button>
                        )}

                        <div className="flex items-center gap-2">
                          <a
                            href={story.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-paper flex items-center justify-center transition-colors"
                            title="View original media"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={13} />
                          </a>

                          {onDeleteStory && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setStoryToDelete(story);
                              }}
                              className="w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 flex items-center justify-center transition-colors cursor-pointer"
                              title="Delete story"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteStoryConfirmDialog
        isOpen={Boolean(storyToDelete)}
        onClose={() => setStoryToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Story?"
        description="This will permanently delete this story and its analytics. This cannot be undone."
        thumbnailUrl={storyToDelete?.thumbnail_url || (storyToDelete?.media_type === 'image' ? storyToDelete?.media_url : null)}
        mediaType={storyToDelete?.media_type}
        isDeleting={isDeleting}
      />
    </>
  );
}
