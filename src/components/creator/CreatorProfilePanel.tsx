import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MessageCircle, Play, Share2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CreatorProfile, Story } from '../../types';
import { useAuth } from '../../lib/AuthContext';
import StoryViewerModal from '../stories/StoryViewerModal';

interface CreatorProfilePanelProps {
  creatorId: string;
  onBack: () => void;
  onMessage: (creatorId: string) => void;
}

type ProfileTab = 'archive' | 'about';

export default function CreatorProfilePanel({
  creatorId,
  onBack,
  onMessage,
}: CreatorProfilePanelProps) {
  const { user } = useAuth();
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('archive');

  useEffect(() => {
    fetchCreator(creatorId);
    fetchStories(creatorId);
    setActiveTab('archive');
  }, [creatorId, user?.id]);

  const fetchCreator = async (id: string) => {
    setLoading(true);
    setError(null);

    const { data, error: creatorError } = await supabase
      .from('creator_profiles')
      .select('*, owner:profiles!owner_id(id, username, display_name, avatar_url)')
      .eq('id', id)
      .single();

    if (creatorError || !data) {
      setError('Creator not found.');
      setCreator(null);
    } else {
      const raw = data as CreatorProfile;
      setCreator({
        ...raw,
        avatar_url: raw.avatar_url || raw.owner?.avatar_url || null,
      });
    }

    setLoading(false);
  };

  const fetchStories = async (id: string) => {
    setStoriesLoading(true);

    const { data, error: storiesError } = await supabase
      .from('stories')
      .select('*')
      .eq('creator_profile_id', id)
      .order('published_at', { ascending: false });

    if (storiesError && storiesError.code !== '42P01') {
      console.error('Error fetching creator stories:', storiesError);
      setStories([]);
    } else {
      setStories((data as Story[]) || []);
    }

    setStoriesLoading(false);
  };

  const storyGroups = useMemo(() => {
    const groups = new Map<string, Story[]>();

    stories.forEach((story) => {
      const dateKey = new Date(story.published_at).toISOString().slice(0, 10);
      const existing = groups.get(dateKey) || [];
      existing.push(story);
      groups.set(dateKey, existing);
    });

    return Array.from(groups.entries())
      .map(([dateKey, items]) => ({
        dateKey,
        label: new Date(items[0].published_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        items,
      }))
      .sort((left, right) => right.dateKey.localeCompare(left.dateKey));
  }, [stories]);

  const storyIndexMap = useMemo(
    () =>
      stories.reduce<Record<string, number>>((accumulator, story, index) => {
        accumulator[story.id] = index;
        return accumulator;
      }, {}),
    [stories]
  );

  const handle = creator?.display_name.toLowerCase().replace(/\s+/g, '') || 'creator';
  const metadataLine = `${storyGroups.length} archive day${storyGroups.length === 1 ? '' : 's'} · ${stories.length} total stor${stories.length === 1 ? 'y' : 'ies'}`;

  const isOwner = Boolean(user && creator && creator.owner_id === user.id);

  if (loading) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="h-full min-h-0 flex flex-col items-center justify-center text-center p-8">
        <p className="font-serif text-3xl text-paper mb-3">Unavailable</p>
        <p className="text-sm text-muted mb-6">{error || 'Creator not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="border border-border-subtle px-5 py-3 text-[0.7rem] tracking-[0.18em] uppercase text-paper hover:border-gold hover:text-gold transition-colors"
        >
          Back To Discover
        </button>
      </div>
    );
  }

  const renderArchiveTab = () => {
    if (storiesLoading) {
      return (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"></div>
        </div>
      );
    }

    if (storyGroups.length === 0) {
      return (
        <div className="border border-dashed border-border-subtle bg-ink-light/30 p-6 text-center rounded-xl">
          <p className="font-serif text-lg text-paper mb-1">No archive yet</p>
          <p className="text-sm text-muted">Stories will land here once they are posted.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-4 gap-3">
        {storyGroups.map((group) => {
          const cover =
            group.items[0]?.thumbnail_url ||
            (group.items[0]?.media_type === 'image' ? group.items[0]?.media_url : null);

          return (
            <button
              key={group.dateKey}
              type="button"
              onClick={() => setActiveStoryIndex(storyIndexMap[group.items[0].id])}
              className="relative aspect-[9/14] overflow-hidden rounded-md border border-border-subtle text-left transition-colors group hover:border-gold/40"
            >
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#171717] to-[#090909]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/90" />
              <div className="absolute top-2 left-2 w-7 h-7 rounded-full border border-gold/60 p-[1px] bg-transparent">
                <div className="w-full h-full rounded-full overflow-hidden bg-[#111111] flex items-center justify-center">
                  <span className="text-[0.44rem] tracking-[0.08em] uppercase text-gold">{group.items.length}</span>
                </div>
              </div>
              {group.items[0].media_type === 'video' && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full border border-border-subtle bg-black/55 flex items-center justify-center text-gold">
                  <Play size={10} />
                </div>
              )}
              <div className="absolute left-0 right-0 bottom-0 p-2">
                <p className="text-paper font-serif text-[0.78rem] leading-tight truncate">{group.label}</p>
                <p className="text-[0.56rem] text-gold uppercase tracking-[0.08em] mt-0.5">{group.items.length}</p>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderAboutTab = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">About</p>
        <p className="text-[0.92rem] leading-7 text-paper/90 whitespace-pre-wrap">
          {creator.bio || 'No bio available.'}
        </p>
      </div>
      <div className="border-t border-border-subtle pt-4">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-muted">Handle</p>
          <p className="text-sm text-paper mt-1">@{handle}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-ink">
      {/* Sticky top header */}
      <div className="sticky top-0 z-20 border-b border-border-subtle bg-ink/95 backdrop-blur px-4 sm:px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-paper hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-paper">{creator.display_name}</p>
            <p className="truncate text-[0.72rem] text-muted">{stories.length} stories</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: creator.display_name, url: window.location.href }).catch(() => {});
            }
          }}
          className="flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-paper hover:bg-white/5 transition-colors"
        >
          <Share2 size={16} />
        </button>
      </div>

      {/* Cover Image */}
      <div className="h-[170px] sm:h-[210px] relative bg-ink-light border-b border-border-subtle">
        {creator.cover_url ? (
          <img src={creator.cover_url} alt="" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gold/10 to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-transparent" />
      </div>

      {/* Creator Profile Body */}
      <div className="px-4 sm:px-5 relative -mt-12 z-10 pb-20">
        <div className="rounded-full border-4 border-ink overflow-hidden bg-ink-light shadow-2xl w-24 h-24">
          {creator.avatar_url ? (
            <img src={creator.avatar_url} alt={creator.display_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gold/30 to-ink flex items-center justify-center font-serif text-2xl text-paper">
              {creator.display_name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-semibold text-[1.7rem] leading-tight text-paper">{creator.display_name}</h1>
            <p className="text-sm text-muted mt-0.5">@{handle}</p>
          </div>

          {!isOwner && (
            <button
              type="button"
              onClick={() => onMessage(creator.id)}
              className="shrink-0 inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink hover:bg-gold-light transition-colors"
            >
              <MessageCircle size={14} />
              Message
            </button>
          )}
        </div>

        <p className="mt-3 text-[0.92rem] leading-6 text-paper/90 whitespace-pre-wrap">
          {creator.bio || 'No bio available.'}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.74rem] text-muted">
          <span>{metadataLine}</span>
        </div>

        {/* Profile Tabs */}
        <div className="mt-5 border-b border-border-subtle flex items-center gap-6">
          {[
            { key: 'archive', label: 'Archive' },
            { key: 'about', label: 'About' },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as ProfileTab)}
                className={`relative pb-3 text-[0.74rem] uppercase tracking-[0.14em] transition-colors ${
                  isActive ? 'text-paper' : 'text-muted hover:text-paper'
                }`}
              >
                {tab.label}
                {isActive && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-gold" />}
              </button>
            );
          })}
        </div>

        <div className="pt-5">
          {activeTab === 'archive' && renderArchiveTab()}
          {activeTab === 'about' && renderAboutTab()}
        </div>
      </div>

      {activeStoryIndex !== null && (
        <StoryViewerModal
          stories={stories}
          creatorName={creator.display_name}
          avatarUrl={creator.avatar_url}
          userId={user?.id}
          initialIndex={activeStoryIndex}
          onClose={() => setActiveStoryIndex(null)}
          onChangeIndex={setActiveStoryIndex}
          onMessage={!isOwner ? () => onMessage(creator.id) : undefined}
        />
      )}
    </div>
  );
}
