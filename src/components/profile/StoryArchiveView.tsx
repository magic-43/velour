import { useState, useEffect } from 'react';
import { ArrowLeft, Archive, Eye, Video, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import ArchiveStoryViewer from './ArchiveStoryViewer';
import type { Story } from '../../types';

interface StoryArchiveViewProps {
  onBack: () => void;
}

export default function StoryArchiveView({ onBack }: StoryArchiveViewProps) {
  const { profile } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;

    async function fetchArchivedStories() {
      try {
        setLoading(true);
        // Get creator persona profiles for this owner
        const { data: personas } = await supabase
          .from('creator_profiles')
          .select('id')
          .eq('owner_id', profile!.id);

        const personaIds = (personas || []).map((p) => p.id);
        // Also check if profile.id itself is used as creator_profile_id directly
        const targetIds = Array.from(new Set([profile!.id, ...personaIds]));

        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .in('creator_profile_id', targetIds)
          .order('published_at', { ascending: false });

        if (!error && data) {
          setStories(data as Story[]);
        }
      } catch (err) {
        console.error('Error fetching story archive:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchArchivedStories();
  }, [profile]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="px-4 sm:px-5 pt-0 pb-24 md:pb-8 max-w-[650px] w-full mx-auto md:mx-0">
      {/* Header matching Stories/Home page */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-5 mb-4 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3 backdrop-blur-md sm:px-5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-ink-light text-muted hover:text-paper transition-colors cursor-pointer"
            aria-label="Back to profile"
          >
            <ArrowLeft size={18} />
          </button>
          <h3 className="text-sm font-medium text-muted tracking-wide uppercase">Story Archive</h3>
        </div>

        {stories.length > 0 && (
          <span className="text-[11px] text-muted tracking-tight">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-24 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stories.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-muted mb-3.5">
            <Archive size={22} strokeWidth={1.5} />
          </div>
          <h4 className="font-medium text-sm text-paper mb-1">Story Archive is empty</h4>
          <p className="text-muted text-xs max-w-xs mb-5 leading-relaxed">
            Stories you publish will automatically appear here for you to revisit anytime.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stories.map((story, idx) => (
            <div
              key={story.id}
              onClick={() => setSelectedStoryIndex(idx)}
              className="group aspect-[9/16] rounded-2xl overflow-hidden relative bg-[#121214] border border-white/10 hover:border-gold/50 transition-all cursor-pointer shadow-md select-none"
            >
              {/* Media preview */}
              {story.media_type === 'video' ? (
                <video
                  src={story.media_url}
                  className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-300"
                  preload="metadata"
                  muted
                />
              ) : (
                <img
                  src={story.media_url}
                  alt={story.caption || 'Archived Story'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              )}

              {/* Top Gradient & Date */}
              <div className="absolute inset-x-0 top-0 p-2.5 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between text-[11px] text-paper">
                <span className="font-medium bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10">
                  {formatDate(story.published_at)}
                </span>
                <span className="w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-gold border border-white/10">
                  {story.media_type === 'video' ? <Video size={10} /> : <Camera size={10} />}
                </span>
              </div>

              {/* Bottom Gradient & Info */}
              <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col gap-1">
                {story.caption && (
                  <p className="text-xs text-paper truncate font-medium drop-shadow-sm">
                    {story.caption}
                  </p>
                )}
                <div className="flex items-center gap-1.5 text-[11px] text-muted font-medium">
                  <Eye size={12} className="text-gold" />
                  <span>{story.view_count || 0} views</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full-Screen Instagram-Style Archive Story Viewer */}
      {selectedStoryIndex !== null && (
        <ArchiveStoryViewer
          stories={stories}
          initialIndex={selectedStoryIndex}
          onClose={() => setSelectedStoryIndex(null)}
          onStoryDeleted={(deletedId) => {
            setStories((prev) => prev.filter((s) => s.id !== deletedId));
          }}
        />
      )}
    </div>
  );
}
