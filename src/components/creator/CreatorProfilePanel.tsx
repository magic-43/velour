import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MessageCircle, Play,
  Sparkles, CheckCircle, Flame, Calendar, User as UserIcon, Tag
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CreatorProfile, Story, HomeStorySession } from '../../types';
import { useAuth } from '../../lib/AuthContext';
import HomeStoryFeed from '../stories/HomeStoryFeed';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface CreatorProfilePanelProps {
  creatorId?: string;
  username?: string;
  onBack?: () => void;
  onMessage?: (creatorId: string) => void;
}

type ProfileTab = 'stories' | 'about';

export default function CreatorProfilePanel({
  creatorId,
  username,
  onBack,
  onMessage,
}: CreatorProfilePanelProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('stories');

  // Android hardware back button handlers for CreatorProfilePanel
  useBackHandler(() => {
    setActiveStoryIndex(null);
    return true;
  }, activeStoryIndex !== null, 100);

  useBackHandler(() => {
    if (onBack) {
      onBack();
      return true;
    }
    return false;
  }, Boolean(onBack), 80);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        let targetCreatorId = creatorId;

        // If username is provided instead of creatorId, find creator by username
        if (!targetCreatorId && username) {
          const cleanUsername = username.trim().toLowerCase().replace(/^@+/, '');
          const { data: userData } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', cleanUsername)
            .maybeSingle();

          if (userData?.id) {
            const { data: cData } = await supabase
              .from('creator_profiles')
              .select('id')
              .eq('owner_id', userData.id)
              .maybeSingle();

            if (cData?.id) {
              targetCreatorId = cData.id;
            }
          }
        }

        if (!targetCreatorId) {
          setError('Creator profile not found.');
          setLoading(false);
          return;
        }

        // 1. Fetch Creator Profile
        const { data: creatorData, error: cErr } = await supabase
          .from('creator_profiles')
          .select('*, owner:profiles!owner_id(id, username, display_name, avatar_url, created_at)')
          .eq('id', targetCreatorId)
          .single();

        if (cErr || !creatorData) {
          setError('Creator not found.');
          setCreator(null);
          setLoading(false);
          return;
        }

        const raw = creatorData as CreatorProfile;
        setCreator({
          ...raw,
          avatar_url: raw.avatar_url || raw.owner?.avatar_url || null,
        });

        // 2. Fetch Creator Stories
        setStoriesLoading(true);
        const { data: storiesData, error: sErr } = await supabase
          .from('stories')
          .select('*')
          .eq('creator_profile_id', targetCreatorId)
          .order('published_at', { ascending: false });

        if (!sErr && storiesData) {
          setStories(storiesData as Story[]);
        } else {
          setStories([]);
        }
        setStoriesLoading(false);
      } catch (err) {
        console.error('Failed to load creator public profile:', err);
        setError('Failed to load profile.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [creatorId, username]);

  // Parse structured details from tags (e.g. gender:Female, dob:1998-10-24, kinks)
  const parsedDetails = useMemo(() => {
    const rawTags = creator?.tags || [];
    let gender = '';
    let dob = '';
    const kinks: string[] = [];

    rawTags.forEach((t) => {
      const lower = t.toLowerCase();
      if (lower.startsWith('gender:')) {
        gender = t.slice(7).trim();
      } else if (lower.startsWith('dob:') || lower.startsWith('birthday:')) {
        dob = t.split(':')[1].trim();
      } else if (lower.startsWith('kink:')) {
        kinks.push(t.slice(5).trim());
      } else {
        kinks.push(t.trim());
      }
    });

    return { gender, dob, kinks };
  }, [creator?.tags]);

  // HomeStoryFeed session matching the homepage viewer
  const panelStorySessions = useMemo((): HomeStorySession[] => {
    if (!creator || !stories.length) return [];

    return [
      {
        creator,
        stories,
        archivedStories: [],
        archiveGroups: [],
        slides: stories,
        unviewedCount: stories.length,
        firstUnviewedIndex: 0,
        isAllViewed: false,
      },
    ];
  }, [creator, stories]);

  // Back navigation handler
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/explore');
    }
  };

  // Message Creator Handler
  const handleMessage = async () => {
    if (!creator) return;

    if (onMessage) {
      onMessage(creator.id);
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    try {
      const { data: convId, error: rpcErr } = await supabase.rpc('get_or_create_conversation', {
        p_creator_profile_id: creator.id,
      });

      if (!rpcErr && convId) {
        navigate(`/messages/${convId}`);
        return;
      }

      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('fan_id', user.id)
        .eq('creator_profile_id', creator.id)
        .maybeSingle();

      if (existing?.id) {
        navigate(`/messages/${existing.id}`);
        return;
      }

      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          fan_id: user.id,
          creator_profile_id: creator.id,
        })
        .select('id')
        .single();

      if (newConv?.id) {
        navigate(`/messages/${newConv.id}`);
      }
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  const isOwner = Boolean(user && creator && creator.owner_id === user.id);
  const handle = creator?.owner?.username || creator?.display_name.toLowerCase().replace(/\s+/g, '') || 'creator';

  if (loading) {
    return (
      <div className="min-h-full h-full bg-[#090909] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="min-h-full h-full bg-[#090909] flex flex-col items-center justify-center text-center p-8 select-none">
        <h2 className="font-serif text-3xl text-paper mb-2">Unavailable</h2>
        <p className="text-sm text-white/50 max-w-sm mb-6">{error || 'Creator not found.'}</p>
        <button
          type="button"
          onClick={handleBack}
          className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold tracking-wider uppercase transition-colors"
        >
          Return Back
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-[#090909] text-paper pb-32 select-none">
      {/* ── Sticky Top Bar with Back Button & Creator Name ── */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#090909]/95 backdrop-blur-md border-b border-white/10">
        {/* Back Button */}
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm border border-white/10"
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </button>

        {/* Creator Name Title in Header */}
        <span className="font-serif font-semibold text-paper text-base tracking-tight truncate max-w-[220px]">
          {creator.display_name}
        </span>

        {/* Message Quick Trigger on Top Right */}
        <button
          type="button"
          onClick={handleStartChat}
          aria-label="Message"
          className="w-10 h-10 rounded-full bg-gold/15 hover:bg-gold/25 active:scale-95 text-gold flex items-center justify-center transition-all cursor-pointer shadow-sm border border-gold/30"
          title="Message Creator"
        >
          <MessageCircle size={19} />
        </button>
      </div>

      {/* ── Taller Cover Backdrop ─────────────────────────────────── */}
      <div className="relative w-full h-64 sm:h-76 md:h-84 overflow-hidden bg-[#141416]">
        {creator.cover_url ? (
          <img
            src={creator.cover_url}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-[#242428] via-[#161619] to-[#090909]" />
        )}

        {/* Smooth multi-stop bottom gradient fade to #090909 */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-[#090909]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#090909] via-[#090909]/80 to-transparent" />
      </div>

      {/* ── Avatar + Creator Info Section ──────────────────────────── */}
      <div className="relative px-4 -mt-14 sm:-mt-16 z-10">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-end gap-3.5 min-w-0">
            {/* Avatar */}
            <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-[#18181b] border-2 border-white/20 overflow-hidden flex items-center justify-center shadow-2xl shrink-0">
              {creator.avatar_url ? (
                <img
                  src={creator.avatar_url}
                  alt={creator.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-serif text-3xl text-gold">
                  {creator.display_name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Name & Handle (Followers count removed) */}
            <div className="min-w-0 pb-1">
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-xl sm:text-2xl text-white tracking-tight truncate">
                  {creator.display_name}
                </h1>
                {creator.is_verified && (
                  <CheckCircle size={18} className="text-gold fill-gold/20 shrink-0" />
                )}
              </div>

              <div className="flex items-center gap-1.5 text-sm text-white/60 mt-0.5">
                <span className="truncate">@{handle}</span>
                {creator.category && (
                  <>
                    <span>·</span>
                    <span className="text-gold/90">{creator.category}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Button: Message (for fans) */}
          {!isOwner && (
            <button
              type="button"
              onClick={handleMessage}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gold hover:bg-gold-light active:scale-95 text-ink font-semibold text-xs tracking-wide shadow-lg transition-all cursor-pointer shrink-0"
            >
              <MessageCircle size={15} />
              <span>Message</span>
            </button>
          )}
        </div>

        {/* Bio preview under header */}
        {creator.bio && (
          <p className="mt-3.5 text-xs sm:text-sm text-white/80 leading-relaxed max-w-xl whitespace-pre-wrap">
            {creator.bio}
          </p>
        )}
      </div>

      {/* ── Public Profile Navigation Tabs ─────────────────────────── */}
      <div className="flex border-b border-white/[0.08] px-2 mt-4">
        {(['stories', 'about'] as ProfileTab[]).map((tab) => {
          const isActive = activeTab === tab;
          const labels: Record<ProfileTab, string> = {
            stories: 'Stories',
            about: 'About',
          };

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-center text-xs font-semibold tracking-wide transition-all relative cursor-pointer ${
                isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {labels[tab]}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <div className="pt-4">
        {/* TAB 1: STORIES */}
        {activeTab === 'stories' && (
          <div className="px-2">
            {storiesLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              </div>
            ) : stories.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {stories.map((story, idx) => (
                  <div
                    key={story.id}
                    onClick={() => setActiveStoryIndex(idx)}
                    className="relative aspect-[9/16] bg-[#141416] overflow-hidden group cursor-pointer border border-white/[0.02] hover:border-gold/40 transition-colors"
                  >
                    {story.media_type === 'video' ? (
                      story.thumbnail_url ? (
                        <img
                          src={story.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <video
                          src={story.media_url}
                          className="w-full h-full object-cover pointer-events-none"
                          preload="metadata"
                          muted
                        />
                      )
                    ) : (
                      <img
                        src={story.media_url}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}

                    {/* Video indicator badge */}
                    {story.media_type === 'video' && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white z-[1]">
                        <Play size={10} fill="white" />
                      </div>
                    )}

                    {/* Subtle bottom gradient on hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                ))}
              </div>
            ) : (
              /* Empty state matching the Spotlight design */
              <div className="py-24 flex flex-col items-center justify-center text-center px-6">
                <p className="font-semibold text-base sm:text-lg text-paper mb-1">
                  No Stories
                </p>
                <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                  Stories posted by {creator.display_name} will appear here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ABOUT (Expanded into DOB, Kinks, Gender & Identity) */}
        {activeTab === 'about' && (
          <div className="px-4 space-y-3.5">
            {/* Biography Card */}
            <div className="p-4 rounded-2xl bg-[#121214] border border-white/[0.04] space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50 block">
                Biography
              </span>
              <p className="text-xs sm:text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
                {creator.bio || 'No biography written yet.'}
              </p>
            </div>

            {/* Persona & Identity Attributes Grid */}
            <div className="p-4 rounded-2xl bg-[#121214] border border-white/[0.04] space-y-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50 block">
                Creator Details
              </span>

              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* Gender / Identity */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="flex items-center gap-1.5 text-muted mb-1">
                    <UserIcon size={13} className="text-purple-400" />
                    <span className="text-[10px] uppercase font-semibold tracking-wider">Gender</span>
                  </div>
                  <p className="text-xs font-medium text-paper">
                    {parsedDetails.gender || 'Not specified'}
                  </p>
                </div>

                {/* Date of Birth / Zodiac */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="flex items-center gap-1.5 text-muted mb-1">
                    <Calendar size={13} className="text-amber-400" />
                    <span className="text-[10px] uppercase font-semibold tracking-wider">Date of Birth</span>
                  </div>
                  <p className="text-xs font-medium text-paper">
                    {parsedDetails.dob || 'Private'}
                  </p>
                </div>
              </div>
            </div>

            {/* Kinks & Specialties Section */}
            <div className="p-4 rounded-2xl bg-[#121214] border border-white/[0.04] space-y-3">
              <div className="flex items-center gap-2">
                <Flame size={15} className="text-rose-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                  Kinks & Specialties
                </span>
              </div>

              {parsedDetails.kinks.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {parsedDetails.kinks.map((kink) => (
                    <span
                      key={kink}
                      className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-paper/90 font-medium tracking-wide flex items-center gap-1.5 shadow-sm"
                    >
                      <Tag size={11} className="text-gold" />
                      <span>{kink}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40 leading-relaxed pt-1">
                  No specific kinks or specialty tags added yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Story Viewer (Homepage Identical) ─────────────────────────────────── */}
      {activeStoryIndex !== null && panelStorySessions.length > 0 && (
        <div className="fixed inset-0 z-[100] md:absolute md:inset-0 md:z-50 bg-ink overflow-hidden">
          <HomeStoryFeed
            sessions={panelStorySessions}
            userId={user?.id}
            initialSessionIndex={0}
            initialSlideIndex={activeStoryIndex}
            onPositionChange={(_, slideIndex) => {
              setActiveStoryIndex(slideIndex);
            }}
            onClose={() => setActiveStoryIndex(null)}
            onMessage={() => handleMessage()}
          />
        </div>
      )}
    </div>
  );
}
