import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  MoreHorizontal,
  Plus,
  Heart,
  Bookmark,
  Trash2,
  BarChart3,
  Check,
  Eye,
  Clock,
  X,
  Play,
  Edit3,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DeleteStoryConfirmDialog from './DeleteStoryConfirmDialog';
import type { Story, CreatorProfile } from '../../types';

interface MyStatusViewProps {
  stories: Story[];
  creatorProfile: CreatorProfile;
  onBack: () => void;
  onSelectStory: (index: number) => void;
  onDeleteStory?: (storyId: string) => Promise<void>;
  onUpdateCaption?: (storyId: string, caption: string | null) => Promise<void>;
  onAddStory?: () => void;
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

function getTimeRemaining(dateString: string): string {
  const expiresTime = new Date(dateString).getTime() + 24 * 60 * 60 * 1000;
  const diffMs = expiresTime - Date.now();
  if (diffMs <= 0) return 'Expired';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export default function MyStatusView({
  stories,
  creatorProfile,
  onBack,
  onSelectStory,
  onDeleteStory,
  onUpdateCaption,
  onAddStory,
}: MyStatusViewProps) {
  const [likesMap, setLikesMap] = useState<Record<string, number>>({});
  const [savesMap, setSavesMap] = useState<Record<string, number>>({});
  const [activeMenuStoryId, setActiveMenuStoryId] = useState<string | null>(null);
  const [insightStory, setInsightStory] = useState<Story | null>(null);
  const [storyToDelete, setStoryToDelete] = useState<Story | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(new Set());

  // Caption Editing State within Story Insights
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [editedCaption, setEditedCaption] = useState('');
  const [isSavingCaption, setIsSavingCaption] = useState(false);
  const [captionSuccess, setCaptionSuccess] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!activeMenuStoryId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuStoryId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuStoryId]);

  // Fetch reactions (likes and saves) for creator stats
  useEffect(() => {
    if (stories.length === 0) return;

    let cancelled = false;
    const fetchReactions = async () => {
      try {
        const storyIds = stories.map((s) => s.id);
        const { data, error } = await supabase
          .from('story_reactions')
          .select('story_id, reaction_type')
          .in('story_id', storyIds);

        if (error && error.code !== '42P01') {
          console.error('Error fetching reactions for status view:', error);
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
        console.error('Failed to load reactions for status view:', err);
      }
    };

    fetchReactions();
    return () => {
      cancelled = true;
    };
  }, [stories]);

  const handleOpenInsight = (story: Story) => {
    setActiveMenuStoryId(null);
    setInsightStory(story);
    setEditedCaption(story.caption || '');
    setIsEditingCaption(false);
    setCaptionSuccess(false);
  };

  const handleSaveCaption = async () => {
    if (!insightStory || !onUpdateCaption || isSavingCaption) return;
    setIsSavingCaption(true);
    try {
      const cleanCaption = editedCaption.trim().length > 0 ? editedCaption.trim() : null;
      await onUpdateCaption(insightStory.id, cleanCaption);
      setInsightStory((prev) => (prev ? { ...prev, caption: cleanCaption } : null));
      setIsEditingCaption(false);
      setCaptionSuccess(true);
      setTimeout(() => setCaptionSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to update caption:', err);
    } finally {
      setIsSavingCaption(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!storyToDelete || !onDeleteStory || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteStory(storyToDelete.id);
      setStoryToDelete(null);
      setActiveMenuStoryId(null);
      if (insightStory?.id === storyToDelete.id) {
        setInsightStory(null);
      }
    } catch (err) {
      console.error('Failed to delete story from MyStatusView:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedStoryIds.size === 0 || !onDeleteStory || isDeleting) return;
    setIsDeleting(true);
    try {
      for (const id of Array.from(selectedStoryIds)) {
        await onDeleteStory(id);
      }
      setSelectedStoryIds(new Set());
      setIsEditMode(false);
    } catch (err) {
      console.error('Failed to batch delete stories:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectStory = (storyId: string) => {
    setSelectedStoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-black text-paper overflow-y-auto px-4 sm:px-6 pt-2 pb-[calc(140px+env(safe-area-inset-bottom,0px))] md:pb-24">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 mb-5 flex items-center justify-between gap-3 bg-black/95 px-4 py-3.5 backdrop-blur-md sm:px-6 border-b border-[#201f24]">
        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Back to feed"
        >
          <ChevronLeft size={22} />
        </button>

        {/* Title */}
        <h1 className="text-base sm:text-lg font-semibold text-white tracking-wide">
          My story
        </h1>

        {/* Edit button */}
        {stories.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setIsEditMode((prev) => !prev);
              setSelectedStoryIds(new Set());
              setActiveMenuStoryId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              isEditMode
                ? 'bg-gold text-ink font-bold'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            {isEditMode ? 'Done' : 'Edit'}
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="max-w-xl w-full mx-auto flex-1 flex flex-col">
        {/* WhatsApp-Style Story List Card */}
        <div className="bg-[#161619] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden shadow-2xl mb-4">
          {/* Active Stories Items */}
          {stories.map((story, index) => {
            const cover =
              story.thumbnail_url || (story.media_type === 'image' ? story.media_url : null);
            const viewCount = story.view_count || 0;
            const likesCount = likesMap[story.id] || 0;
            const savesCount = savesMap[story.id] || 0;
            const isMenuOpen = activeMenuStoryId === story.id;
            const isSelected = selectedStoryIds.has(story.id);

            return (
              <div
                key={story.id}
                onClick={() => {
                  if (isEditMode) {
                    toggleSelectStory(story.id);
                  } else {
                    onSelectStory(index);
                  }
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.03] transition-colors group cursor-pointer relative select-none"
              >
                {/* Left Side: Thumbnail & Info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Edit Checkbox */}
                  {isEditMode && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectStory(story.id);
                      }}
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-gold border-gold text-ink'
                          : 'border-white/40 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check size={13} strokeWidth={3} />}
                    </div>
                  )}

                  {/* Circular Story Thumbnail */}
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-white/15 shrink-0 bg-ink shadow-sm relative">
                    {cover ? (
                      <img
                        src={cover}
                        alt="Story preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gold/30 to-ink" />
                    )}
                  </div>

                  {/* Info: Views & Timestamp */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-white truncate">
                      <span>
                        {viewCount === 0
                          ? 'No views yet'
                          : viewCount === 1
                          ? '1 view'
                          : `${viewCount.toLocaleString()} views`}
                      </span>
                      {likesCount > 0 && (
                        <>
                          <span className="text-white/40">•</span>
                          <Heart size={13} className="text-rose-400 fill-rose-400 shrink-0" />
                          <span className="text-xs text-rose-300 font-medium">
                            {likesCount}
                          </span>
                        </>
                      )}
                      {savesCount > 0 && (
                        <>
                          <span className="text-white/40">•</span>
                          <Bookmark size={13} className="text-gold fill-gold shrink-0" />
                          <span className="text-xs text-gold font-medium">
                            {savesCount}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-white/50 mt-0.5">
                      {timeAgo(story.published_at)}
                    </p>
                  </div>
                </div>

                {/* Right Side: Three Dots Action Button */}
                {!isEditMode && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuStoryId(isMenuOpen ? null : story.id);
                      }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      aria-label="Story options"
                    >
                      <MoreHorizontal size={20} />
                    </button>

                    {/* Popover Menu - Insight & Delete only */}
                    {isMenuOpen && (
                      <div
                        ref={menuRef}
                        className="absolute right-0 top-10 z-50 w-36 rounded-xl bg-[#202024] border border-white/10 shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-150 divide-y divide-white/5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenInsight(story)}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-medium text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <BarChart3 size={15} className="text-gold" />
                          <span>Insight</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuStoryId(null);
                            setStoryToDelete(story);
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-red-400 hover:bg-red-500/15 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Story Button with Gold Accent at the bottom of the card */}
          {onAddStory && (
            <button
              type="button"
              onClick={onAddStory}
              className="w-full px-4 py-3.5 flex items-center gap-3.5 hover:bg-white/[0.04] transition-colors cursor-pointer text-left group"
            >
              <div className="w-12 h-12 rounded-full bg-gold/15 text-gold border border-gold/30 group-hover:bg-gold group-hover:text-ink flex items-center justify-center shrink-0 transition-colors shadow-sm">
                <Plus size={22} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-white group-hover:text-gold transition-colors">
                  Add to your story
                </p>
                <p className="text-xs text-white/50 mt-0.5">Share a photo or video</p>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Story Insight Modal */}
      {insightStory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="insight-modal-title"
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setInsightStory(null)}
        >
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-[#121214] border border-white/10 shadow-2xl overflow-hidden relative animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Subtle Luxury Gold Highlight Line at Top */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-gold" />
                <h2 id="insight-modal-title" className="text-sm font-semibold tracking-wide text-paper">
                  Story Insights
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInsightStory(null)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close insights"
              >
                <X size={15} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 pt-3 space-y-4">
              {/* Story Thumbnail & Info Banner */}
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                <div
                  onClick={() => {
                    const storyIdx = stories.findIndex((s) => s.id === insightStory.id);
                    setInsightStory(null);
                    if (storyIdx >= 0) onSelectStory(storyIdx);
                  }}
                  className="w-12 h-16 rounded-lg overflow-hidden bg-ink border border-white/10 shrink-0 relative cursor-pointer group"
                  title="Tap to view story"
                >
                  {insightStory.thumbnail_url || (insightStory.media_type === 'image' ? insightStory.media_url : null) ? (
                    <img
                      src={
                        insightStory.thumbnail_url ||
                        (insightStory.media_type === 'image' ? insightStory.media_url : '')
                      }
                      alt="Story preview"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gold/30 to-ink" />
                  )}
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <Play size={12} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" />
                  </div>
                  <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-white/80 uppercase">
                    {insightStory.media_type}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Published</p>
                    <span className="text-[11px] text-gold font-medium flex items-center gap-1">
                      <Clock size={10} />
                      {getTimeRemaining(insightStory.published_at)}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-white truncate mt-0.5">
                    {new Date(insightStory.published_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-[11px] text-white/40 mt-1 truncate">
                    Active story moment
                  </p>
                </div>
              </div>

              {/* Simplified Minimal Stats Strip */}
              <div className="grid grid-cols-3 divide-x divide-white/5 rounded-xl bg-white/[0.03] border border-white/5 py-3 text-center">
                <div className="px-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-white/50 mb-1">
                    <Eye size={13} className="text-gold" />
                    <span>Views</span>
                  </div>
                  <span className="text-lg font-serif font-bold text-white tracking-tight">
                    {(insightStory.view_count || 0).toLocaleString()}
                  </span>
                </div>

                <div className="px-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-white/50 mb-1">
                    <Heart size={13} className="text-rose-400 fill-rose-400/20" />
                    <span>Likes</span>
                  </div>
                  <span className="text-lg font-serif font-bold text-white tracking-tight">
                    {(likesMap[insightStory.id] || 0).toLocaleString()}
                  </span>
                </div>

                <div className="px-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-white/50 mb-1">
                    <Bookmark size={13} className="text-gold fill-gold/20" />
                    <span>Saves</span>
                  </div>
                  <span className="text-lg font-serif font-bold text-white tracking-tight">
                    {(savesMap[insightStory.id] || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Minimal Caption Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-white/40 font-medium">
                  <span>Caption</span>
                  {!isEditingCaption && onUpdateCaption && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditedCaption(insightStory.caption || '');
                        setIsEditingCaption(true);
                      }}
                      className="text-gold hover:text-gold-light transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 size={11} />
                      <span>{insightStory.caption ? 'Edit' : 'Add'}</span>
                    </button>
                  )}
                </div>

                {isEditingCaption ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedCaption}
                      onChange={(e) => setEditedCaption(e.target.value)}
                      placeholder="Write a caption..."
                      maxLength={250}
                      rows={2}
                      className="w-full bg-black/40 border border-gold/40 rounded-xl p-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-gold resize-none leading-relaxed transition-all"
                      autoFocus
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/30 font-mono">
                        {editedCaption.length}/250
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isSavingCaption}
                          onClick={() => {
                            setIsEditingCaption(false);
                            setEditedCaption(insightStory.caption || '');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSavingCaption}
                          onClick={handleSaveCaption}
                          className="px-3 py-1 rounded-lg bg-gold hover:bg-gold-light text-ink text-xs font-semibold transition-colors flex items-center gap-1 shadow cursor-pointer disabled:opacity-50"
                        >
                          {isSavingCaption ? (
                            <>
                              <div className="w-3 h-3 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Check size={12} strokeWidth={2.5} />
                              <span>Save</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      if (onUpdateCaption) {
                        setEditedCaption(insightStory.caption || '');
                        setIsEditingCaption(true);
                      }
                    }}
                    className={`p-3 rounded-xl bg-white/[0.02] border border-white/5 transition-colors ${
                      onUpdateCaption ? 'cursor-pointer hover:bg-white/[0.04]' : ''
                    }`}
                  >
                    {insightStory.caption ? (
                      <p className="text-xs text-white/80 leading-relaxed break-words">
                        {insightStory.caption}
                      </p>
                    ) : (
                      <p className="text-xs text-white/30 italic">
                        No caption added yet. Tap to add...
                      </p>
                    )}
                  </div>
                )}

                {captionSuccess && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1 pt-0.5 animate-in fade-in">
                    <Check size={11} strokeWidth={2.5} />
                    <span>Caption saved successfully</span>
                  </p>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const storyIdx = stories.findIndex((s) => s.id === insightStory.id);
                    setInsightStory(null);
                    if (storyIdx >= 0) onSelectStory(storyIdx);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  <Play size={12} fill="currentColor" />
                  <span>View Story</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = insightStory;
                    setInsightStory(null);
                    setStoryToDelete(target);
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-red-500/10 text-white/60 hover:text-red-400 text-xs font-medium border border-white/5 hover:border-red-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Select Delete Action Bar - Elevated above mobile bottom navigation */}
      {isEditMode && selectedStoryIds.size > 0 && (
        <div
          className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-8 inset-x-4 max-w-md mx-auto z-[60] p-3 rounded-2xl bg-[#1c1b20]/95 backdrop-blur-md border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.85)] flex items-center justify-between animate-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex items-center gap-2 pl-2">
            <span className="text-xs font-semibold text-white/95">
              {selectedStoryIds.size} selected
            </span>
            <span className="text-white/30">•</span>
            <button
              type="button"
              onClick={() => {
                if (selectedStoryIds.size === stories.length) {
                  setSelectedStoryIds(new Set());
                } else {
                  setSelectedStoryIds(new Set(stories.map((s) => s.id)));
                }
              }}
              className="text-xs text-gold hover:text-gold-light underline font-medium cursor-pointer transition-colors"
            >
              {selectedStoryIds.size === stories.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <button
            type="button"
            onClick={handleBatchDelete}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-lg disabled:opacity-50 cursor-pointer"
          >
            <Trash2 size={14} />
            <span>{isDeleting ? 'Deleting...' : 'Delete Selected'}</span>
          </button>
        </div>
      )}

      {/* Story Delete Confirmation Dialog */}
      <DeleteStoryConfirmDialog
        isOpen={Boolean(storyToDelete)}
        onClose={() => setStoryToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Story?"
        description="This story will be permanently removed from your active feed. This action cannot be undone."
        thumbnailUrl={
          storyToDelete?.thumbnail_url ||
          (storyToDelete?.media_type === 'image' ? storyToDelete?.media_url : null)
        }
        mediaType={storyToDelete?.media_type}
        isDeleting={isDeleting}
      />
    </div>
  );
}
