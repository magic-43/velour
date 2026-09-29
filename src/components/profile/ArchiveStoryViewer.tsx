import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, Volume2, VolumeX,
  Play, Pause, RotateCcw, Film, Trash2, Eye, Calendar,
  Check, Loader2, Bookmark
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { addVaultItem } from '../../lib/creatorVault';
import { useBackHandler } from '../../lib/backButtonRegistry';
import type { Story, StoryWithCreator } from '../../types';

interface ArchiveStoryViewerProps {
  stories: (Story | StoryWithCreator)[];
  initialIndex: number;
  onClose: () => void;
  onStoryDeleted?: (storyId: string) => void;
  isFanSavedView?: boolean;
  onRemoveBookmark?: (storyId: string) => void;
}

const DEFAULT_IMAGE_DURATION = 5500; // 5.5s per photo

export default function ArchiveStoryViewer({
  stories,
  initialIndex,
  onClose,
  onStoryDeleted,
  isFanSavedView,
  onRemoveBookmark,
}: ArchiveStoryViewerProps) {
  const { profile } = useAuth();

  const [currentIndex, setCurrentIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, stories.length - 1))
  );
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  // Playback & load states
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);

  // Action states
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [isRepublishing, setIsRepublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Android hardware back button handlers
  useBackHandler(() => {
    setShowDeleteConfirm(false);
    return true;
  }, showDeleteConfirm, 110);

  useBackHandler(() => {
    onClose();
    return true;
  }, true, 100);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedAtProgressRef = useRef<number>(0);

  const currentStory = stories[currentIndex] || null;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Reset progress and states on story change
  useEffect(() => {
    setImageLoaded(false);
    setIsVideoBuffering(currentStory?.media_type === 'video');
    setProgress(0);
    pausedAtProgressRef.current = 0;
  }, [currentIndex, currentStory?.id, currentStory?.media_type]);

  // Navigate to next archived story
  const goToNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
      pausedAtProgressRef.current = 0;
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  // Navigate to previous archived story
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
      pausedAtProgressRef.current = 0;
    }
  }, [currentIndex]);

  // Progress timer loop
  useEffect(() => {
    if (!currentStory || isPaused || showDeleteConfirm) return;

    if (currentStory.media_type === 'image' && !imageLoaded) return;
    if (currentStory.media_type === 'video' && isVideoBuffering) return;

    startTimeRef.current =
      Date.now() - (pausedAtProgressRef.current * DEFAULT_IMAGE_DURATION) / 100;

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
  }, [currentStory, isPaused, showDeleteConfirm, imageLoaded, isVideoBuffering, goToNext]);

  // Keyboard navigation & Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, onClose]);

  // Action: Republish to Active 24h Stories
  const handleRepublish = async () => {
    if (!currentStory || isRepublishing) return;
    try {
      setIsRepublishing(true);
      const targetCreatorId =
        currentStory.creator_profile_id || profile?.id;

      const { error } = await supabase.from('stories').insert({
        creator_profile_id: targetCreatorId,
        media_url: currentStory.media_url,
        thumbnail_url: currentStory.thumbnail_url,
        media_type: currentStory.media_type,
        caption: currentStory.caption,
        published_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        view_count: 0,
      });

      if (error) throw error;
      setActionToast('Republished to active stories!');
      setTimeout(() => setActionToast(null), 2500);
    } catch (err) {
      console.error('Failed to republish story:', err);
      alert('Failed to republish story.');
    } finally {
      setIsRepublishing(false);
    }
  };

  // Action: Save directly to Media Library
  const handleSaveToLibrary = () => {
    if (!currentStory || !profile || isSaving) return;
    try {
      setIsSaving(true);
      addVaultItem(profile.id, {
        mediaUrl: currentStory.media_url,
        thumbnailUrl: currentStory.thumbnail_url,
        mediaType: currentStory.media_type,
        title: currentStory.caption || `Story from ${formatDate(currentStory.published_at)}`,
        fileName: `archive-${currentStory.id}`,
      });
      setActionToast('Saved to Media Library!');
      setTimeout(() => setActionToast(null), 2500);
    } catch (err) {
      console.error('Failed to save to media library:', err);
      alert('Failed to save to Media Library.');
    } finally {
      setIsSaving(false);
    }
  };

  // Action: Permanently Delete from Archive
  const handleDeleteStory = async () => {
    if (!currentStory || isDeleting) return;
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('stories').delete().eq('id', currentStory.id);
      if (error) throw error;

      setShowDeleteConfirm(false);
      if (onStoryDeleted) onStoryDeleted(currentStory.id);

      if (stories.length <= 1) {
        onClose();
      } else if (currentIndex >= stories.length - 1) {
        setCurrentIndex((prev) => prev - 1);
      }
    } catch (err) {
      console.error('Failed to delete story:', err);
      alert('Failed to delete story.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!currentStory) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentStoryWithCreator = currentStory as any;
  const storyCreator = currentStoryWithCreator.creator_profile || currentStoryWithCreator.creator;

  const creatorName =
    (isFanSavedView && (storyCreator?.display_name || storyCreator?.name)) ||
    profile?.display_name ||
    profile?.username ||
    'Creator';
  const avatarUrl = (isFanSavedView && storyCreator?.avatar_url) ? storyCreator.avatar_url : profile?.avatar_url;

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-md flex items-center justify-center select-none"
      onClick={onClose}
    >
      {/* Desktop Prev Button */}
      {currentIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goToPrevious();
          }}
          className="hidden md:flex absolute left-8 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center backdrop-blur-md border border-white/10 transition-all cursor-pointer z-30"
          aria-label="Previous story"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Desktop Next Button */}
      {currentIndex < stories.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goToNext();
          }}
          className="hidden md:flex absolute right-8 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center backdrop-blur-md border border-white/10 transition-all cursor-pointer z-30"
          aria-label="Next story"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* 9:16 Full-Screen Story Frame */}
      <div
        className="relative w-full max-w-[440px] h-full sm:h-[94vh] sm:rounded-3xl overflow-hidden bg-black flex flex-col shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Bar Segments */}
        <div className="absolute top-0 inset-x-0 z-30 pt-3 px-3 flex gap-1.5 pointer-events-none">
          {stories.map((st, idx) => {
            let fillPct = 0;
            if (idx < currentIndex) fillPct = 100;
            else if (idx === currentIndex) fillPct = progress;

            return (
              <div
                key={st.id}
                className="flex-1 h-1 bg-white/25 rounded-full overflow-hidden backdrop-blur-sm"
              >
                <div
                  className="h-full bg-white transition-[width] duration-75 ease-linear"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Top Header Bar */}
        <div className="absolute top-0 inset-x-0 z-30 pt-6 px-3.5 pb-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between text-paper">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-800 border border-white/20 shrink-0 flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt={creatorName} className="w-full h-full object-cover" />
              ) : (
                <span className="font-serif text-sm text-gold">
                  {creatorName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Name & Published Date */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-paper truncate leading-tight drop-shadow">
                  {creatorName}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-gold/20 text-gold border border-gold/30 font-medium">
                  {isFanSavedView ? 'Saved' : 'Archive'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted drop-shadow mt-0.5">
                <Calendar size={11} className="text-gold/80" />
                <span>{formatDate(currentStory.published_at)}</span>
                <span className="text-white/40">•</span>
                <span className="text-white/70">
                  {currentIndex + 1} of {stories.length}
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {currentStory.media_type === 'video' && (
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-paper backdrop-blur flex items-center justify-center transition-colors cursor-pointer"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-paper backdrop-blur flex items-center justify-center transition-colors cursor-pointer"
              aria-label={isPaused ? 'Play' : 'Pause'}
            >
              {isPaused ? <Play size={15} /> : <Pause size={15} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-paper backdrop-blur flex items-center justify-center transition-colors cursor-pointer ml-0.5"
              aria-label="Close"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Media Presentation Layer */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
          {currentStory.media_type === 'image' ? (
            <img
              src={currentStory.media_url}
              alt={currentStory.caption || 'Archived story'}
              onLoad={() => setImageLoaded(true)}
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ) : (
            <video
              ref={videoRef}
              src={currentStory.media_url}
              autoPlay
              playsInline
              muted={isMuted}
              onWaiting={() => setIsVideoBuffering(true)}
              onPlaying={() => setIsVideoBuffering(false)}
              onCanPlayThrough={() => setIsVideoBuffering(false)}
              className="w-full h-full object-cover"
            />
          )}

          {/* Buffering Spinner */}
          {((currentStory.media_type === 'image' && !imageLoaded) || isVideoBuffering) && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-gold animate-spin bg-black/40 backdrop-blur-sm" />
            </div>
          )}

          {/* Tap Zones: Left 35% prev, Right 65% next */}
          <div
            onClick={goToPrevious}
            className="absolute left-0 inset-y-0 w-[35%] z-20 cursor-pointer"
            title="Previous story"
          />
          <div
            onClick={goToNext}
            className="absolute right-0 inset-y-0 w-[65%] z-20 cursor-pointer"
            title="Next story"
          />

          {/* Toast Notification */}
          {actionToast && (
            <div className="absolute top-20 inset-x-4 z-40 bg-gold text-ink font-semibold text-xs py-2 px-3 rounded-xl shadow-lg flex items-center justify-center gap-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
              <Check size={14} strokeWidth={2.5} />
              <span>{actionToast}</span>
            </div>
          )}
        </div>

        {/* Bottom Details & Action Controls */}
        <div className="relative z-30 p-3.5 bg-gradient-to-t from-black/95 via-black/85 to-transparent space-y-2.5">
          {/* Caption */}
          {currentStory.caption && (
            <p className="text-xs sm:text-sm text-paper font-medium line-clamp-2 drop-shadow">
              {currentStory.caption}
            </p>
          )}

          {/* Views Pill & Actions Bar */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
            {/* View Count */}
            <div className="flex items-center gap-1.5 text-xs text-muted font-medium bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-xl">
              <Eye size={13} className="text-gold" />
              <span>{currentStory.view_count || 0} views</span>
            </div>

            {/* Creator Actions vs Fan Saved Action */}
            {isFanSavedView ? (
              <button
                type="button"
                onClick={() => {
                  if (onRemoveBookmark) {
                    onRemoveBookmark(currentStory.id);
                    setActionToast('Removed from Saved Stories');
                    setTimeout(() => setActionToast(null), 2000);
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-gold/15 hover:bg-gold/25 text-gold border border-gold/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Remove from saved stories"
              >
                <Bookmark size={13} className="fill-gold" />
                <span>Saved</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* Republish to Story */}
                <button
                  type="button"
                  onClick={handleRepublish}
                  disabled={isRepublishing}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-paper border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Republish to active 24h stories"
                >
                  {isRepublishing ? (
                    <Loader2 size={13} className="animate-spin text-gold" />
                  ) : (
                    <RotateCcw size={13} className="text-gold" />
                  )}
                  <span className="hidden sm:inline">Republish</span>
                </button>

                {/* Save to Media Library */}
                <button
                  type="button"
                  onClick={handleSaveToLibrary}
                  disabled={isSaving}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-paper border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Save into Media Library"
                >
                  {isSaving ? (
                    <Loader2 size={13} className="animate-spin text-gold" />
                  ) : (
                    <Film size={13} className="text-gold" />
                  )}
                  <span className="hidden sm:inline">Save to Library</span>
                </button>

                {/* Delete from Archive */}
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-muted hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-colors cursor-pointer"
                  title="Delete from archive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-5">
            <div className="w-full max-w-xs bg-[#161618] border border-white/15 rounded-2xl p-4 shadow-2xl text-center">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={18} />
              </div>
              <h4 className="font-semibold text-sm text-paper mb-1">Delete Story?</h4>
              <p className="text-xs text-muted mb-4 leading-relaxed">
                This story will be permanently removed from your archive.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-muted hover:text-paper text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteStory}
                  disabled={isDeleting}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <span>Delete</span>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
