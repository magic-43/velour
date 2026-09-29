import React, { useState, useRef, useEffect, useMemo, type ChangeEvent, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Share2, Pencil, Settings as SettingsIcon,
  ChevronDown, EyeOff, Plus, Eye, TrendingUp, Users,
  Archive, Film, Wallet, ChevronRight, Check, Sparkles,
  Play, Camera, Loader2
} from 'lucide-react';
import type { Profile, HomeStorySession, CreatorProfile } from '../../types';
import { useCreatorProfiles } from '../../lib/hooks/useCreatorProfiles';
import { useStories } from '../../lib/hooks/useStories';
import { supabase } from '../../lib/supabase';
import { uploadPublicFile } from '../../lib/r2';
import AccountSwitcherModal from './AccountSwitcherModal';
import CreateStoryModal from '../stories/CreateStoryModal';
import HomeStoryFeed from '../stories/HomeStoryFeed';
import CreatorProfilePanel from '../creator/CreatorProfilePanel';
import ShareProfileModal from './ShareProfileModal';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface CreatorStudioProfileProps {
  profile: Profile;
  followersCount: number;
  archiveCount: number;
  vaultCount: number;
  totalViews: number;
  onPhotoUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onOpenVault: () => void;
  onOpenArchive: () => void;
  onOpenFollowers: () => void;
}

type StudioTab = 'stories' | 'insights';

export default function CreatorStudioProfile({
  profile,
  followersCount,
  archiveCount,
  vaultCount,
  totalViews,
  onPhotoUpload,
  fileInputRef,
  onOpenVault,
  onOpenArchive,
  onOpenFollowers,
}: CreatorStudioProfileProps) {
  const navigate = useNavigate();
  const { activeCreatorProfile, refetch } = useCreatorProfiles();
  const { sessions, postStory, postStoryBatch, deleteStory, markStoryViewed } = useStories();

  const [coverUrl, setCoverUrl] = useState<string | null>(activeCreatorProfile?.cover_url || null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<StudioTab>('stories');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [viewingStoryIndex, setViewingStoryIndex] = useState<number | null>(null);

  // Android hardware back button handlers for Creator Studio overlays and modals
  useBackHandler(() => {
    setViewingStoryIndex(null);
    return true;
  }, viewingStoryIndex !== null, 100);

  useBackHandler(() => {
    setCreateStoryOpen(false);
    return true;
  }, createStoryOpen, 95);

  useBackHandler(() => {
    setPublicProfileOpen(false);
    return true;
  }, publicProfileOpen, 95);

  useBackHandler(() => {
    setShareModalOpen(false);
    return true;
  }, shareModalOpen, 95);

  useBackHandler(() => {
    setSwitcherOpen(false);
    return true;
  }, switcherOpen, 95);

  useBackHandler(() => {
    setActiveTab('stories');
    return true;
  }, activeTab === 'insights', 60);

  useEffect(() => {
    if (activeCreatorProfile?.cover_url) {
      setCoverUrl(activeCreatorProfile.cover_url);
    }
  }, [activeCreatorProfile?.cover_url]);

  // Filter creator's own active stories from story sessions
  const mySession = sessions.find(
    (s) =>
      (activeCreatorProfile && s.creator.id === activeCreatorProfile.id) ||
      s.creator.owner_id === profile.id
  );
  const myActiveStories = mySession?.stories || [];

  // HomeStoryFeed session matching the homepage viewer
  const studioStorySessions = useMemo((): HomeStorySession[] => {
    if (!myActiveStories.length) return [];

    if (mySession) {
      return [mySession];
    }

    const creatorInfo: CreatorProfile = activeCreatorProfile || {
      id: profile.id,
      owner_id: profile.id,
      display_name: profile.display_name || profile.username,
      bio: profile.bio || null,
      avatar_url: profile.avatar_url || null,
      cover_url: coverUrl,
      category: 'Creator',
      tags: [],
      is_verified: true,
      is_active: true,
      created_at: profile.created_at,
    };

    return [
      {
        creator: creatorInfo,
        stories: myActiveStories,
        archivedStories: [],
        archiveGroups: [],
        slides: myActiveStories,
        unviewedCount: myActiveStories.length,
        firstUnviewedIndex: 0,
        isAllViewed: false,
      },
    ];
  }, [myActiveStories, mySession, activeCreatorProfile, profile, coverUrl]);

  // Upload cover image
  const handleCoverUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    try {
      setUploadingCover(true);
      const ext = file.name.split('.').pop() || 'jpg';
      const key = `covers/${profile.id}/cover.${ext}`;
      const publicUrl = await uploadPublicFile(file, key, { maxWidth: 1920, quality: 0.85 });
      const urlWithTime = `${publicUrl}?t=${Date.now()}`;

      await supabase
        .from('creator_profiles')
        .update({ cover_url: urlWithTime })
        .eq('owner_id', profile.id);

      setCoverUrl(urlWithTime);
      if (refetch) await refetch();
    } catch (err) {
      console.error('Failed to upload cover photo:', err);
    } finally {
      setUploadingCover(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#090909] text-paper pb-28 select-none">
      {/* Hidden file input for avatar photo update */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onPhotoUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Hidden file input for cover photo update */}
      <input
        type="file"
        ref={coverInputRef}
        onChange={handleCoverUpload}
        accept="image/*"
        className="hidden"
      />

      {/* ── Top Bar Overlay (Transparent Floating) ────────────────── */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-end px-4 pt-3.5 pb-2 bg-transparent pointer-events-auto">
        {/* Right Action Icons: Share, Edit, Settings */}
        <div className="flex items-center gap-2">
          {/* Share Pill */}
          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md active:scale-95 text-white text-xs font-medium transition-all cursor-pointer shadow-lg border border-white/10"
          >
            <Share2 size={14} />
            <span>Share</span>
          </button>

          {/* Edit Profile Circle */}
          <button
            type="button"
            onClick={() => navigate('/settings/account')}
            title="Edit Profile"
            className="w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg border border-white/10"
          >
            <Pencil size={15} strokeWidth={1.8} />
          </button>

          {/* Settings Circle */}
          <button
            type="button"
            onClick={() => navigate('/settings')}
            title="Creator Settings & Tools"
            className="w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg border border-white/10"
          >
            <SettingsIcon size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* ── Taller Cover Backdrop with Custom Image Support ────────── */}
      <div className="relative w-full h-64 sm:h-76 md:h-84 overflow-hidden bg-[#141416]">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-[#242428] via-[#161619] to-[#090909]" />
        )}

        {/* Smooth multi-stop bottom gradient fade to #090909 */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-[#090909]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#090909] via-[#090909]/80 to-transparent" />

        {/* Cover Image Upload / Change Button */}
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          disabled={uploadingCover}
          className="absolute top-16 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/75 backdrop-blur-md border border-white/15 text-white text-[11px] font-medium transition-all active:scale-95 cursor-pointer shadow-lg disabled:opacity-50"
          title={coverUrl ? 'Change cover photo' : 'Add cover photo'}
        >
          {uploadingCover ? (
            <>
              <Loader2 size={13} className="animate-spin text-white" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Camera size={13} strokeWidth={2} />
              <span>{coverUrl ? 'Change Cover' : 'Add Cover'}</span>
            </>
          )}
        </button>
      </div>

      {/* ── Avatar + Creator Info Section ──────────────────────────── */}
      <div className="relative px-4 -mt-14 sm:-mt-16 z-10">
        <div className="flex items-end gap-3.5">
          {/* Avatar with Camera/Pencil Badge */}
          <div className="relative shrink-0">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-[#18181b] border-2 border-white/20 overflow-hidden flex items-center justify-center shadow-2xl cursor-pointer hover:border-gold/50 transition-all active:scale-95"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-serif text-3xl text-gold">
                  {(profile.display_name || profile.username || 'C').charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Upload badge */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white text-black flex items-center justify-center shadow-md hover:bg-white/90 transition-all cursor-pointer active:scale-95"
              title="Change photo"
            >
              <Pencil size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Profile Name & Follower Subtitle */}
          <div className="min-w-0 flex-1 pb-1">
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="inline-flex items-center gap-1.5 group cursor-pointer text-left max-w-full"
              title="Switch persona or account"
            >
              <h1 className="font-bold text-xl sm:text-2xl text-white tracking-tight truncate group-hover:text-gold transition-colors">
                {profile.display_name || profile.username}
              </h1>
              <ChevronDown
                size={20}
                className="text-white/60 group-hover:text-gold transition-colors shrink-0"
              />
            </button>

            <div className="flex items-center gap-1.5 text-sm text-white/60 mt-0.5">
              <span className="truncate">
                @{profile.username} · {followersCount.toLocaleString()} Followers
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Studio Navigation Tabs ─────────────────────────────────── */}
      <div className="flex border-b border-white/[0.08] px-2 mt-4">
        {(['stories', 'insights'] as StudioTab[]).map((tab) => {
          const isActive = activeTab === tab;
          const labels: Record<StudioTab, string> = {
            stories: 'Stories',
            insights: 'Insights',
          };

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3.5 text-center text-sm font-semibold tracking-wide transition-all relative cursor-pointer ${
                isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {labels[tab]}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white rounded-full" />
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
            {myActiveStories.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {myActiveStories.map((story, idx) => (
                  <div
                    key={story.id}
                    onClick={() => setViewingStoryIndex(idx)}
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

                    {/* View count pill */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[10px] text-white font-medium z-[1]">
                      <Eye size={10} />
                      <span>{story.view_count || 0}</span>
                    </div>

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
                  Stories that you post will appear here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INSIGHTS */}
        {activeTab === 'insights' && (
          <div className="px-4 space-y-4">
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-[#121214] border border-white/[0.04]">
                <div className="flex items-center justify-between text-white/50 mb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider">Total Views</span>
                  <TrendingUp size={15} className="text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {totalViews.toLocaleString()}
                </div>
                <p className="text-[10px] text-white/40 mt-1">Across all published stories</p>
              </div>

              <div
                onClick={onOpenFollowers}
                className="p-4 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-white/50 mb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider">Followers</span>
                  <Users size={15} className="text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {followersCount.toLocaleString()}
                </div>
                <p className="text-[10px] text-white/40 mt-1">Connected fans & subscribers</p>
              </div>

              <div
                onClick={onOpenArchive}
                className="p-4 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-white/50 mb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider">Published</span>
                  <Archive size={15} className="text-sky-400" />
                </div>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {archiveCount.toLocaleString()}
                </div>
                <p className="text-[10px] text-white/40 mt-1">Total archived stories</p>
              </div>

              <div
                onClick={onOpenVault}
                className="p-4 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-white/50 mb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider">Vault Media</span>
                  <Film size={15} className="text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {vaultCount.toLocaleString()}
                </div>
                <p className="text-[10px] text-white/40 mt-1">Saved photos & videos</p>
              </div>
            </div>

            {/* Quick Monetization & Media links */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => navigate('/wallet')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] transition-colors group cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-md">
                    <Wallet size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">Wallet & Earnings</h4>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      Manage payouts, balance & PPV income
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-white/40 group-hover:text-white transition-colors" />
              </button>

              <button
                type="button"
                onClick={onOpenVault}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] transition-colors group cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center shrink-0 shadow-md">
                    <Film size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">Media Vault</h4>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      Upload and price photos/videos for fans
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-white/40 group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals & Sheets ─────────────────────────────────────────── */}

      {/* Create Story Modal */}
      {createStoryOpen && (
        <CreateStoryModal
          isOpen={createStoryOpen}
          onClose={() => setCreateStoryOpen(false)}
          onPost={postStory}
          onPostBatch={postStoryBatch}
        />
      )}

      {/* Account / Persona Switcher Modal */}
      <AccountSwitcherModal
        isOpen={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />

      {/* Homepage-identical Story Viewer */}
      {viewingStoryIndex !== null && studioStorySessions.length > 0 && (
        <div className="fixed inset-0 z-[100] md:absolute md:inset-0 md:z-50 bg-ink overflow-hidden">
          <HomeStoryFeed
            sessions={studioStorySessions}
            userId={profile.id}
            initialSessionIndex={0}
            initialSlideIndex={viewingStoryIndex}
            onPositionChange={(_, slideIndex) => {
              setViewingStoryIndex(slideIndex);
            }}
            onClose={() => setViewingStoryIndex(null)}
            onDeleteStory={async (storyId) => {
              await deleteStory(storyId);
              if (myActiveStories.length <= 1) {
                setViewingStoryIndex(null);
              }
            }}
            onStoryViewed={markStoryViewed}
          />
        </div>
      )}

      {/* Public Profile Fan-Facing Preview Sheet */}
      {publicProfileOpen && (
        <div className="fixed inset-0 z-50 bg-[#090909] overflow-y-auto">
          <CreatorProfilePanel
            creatorId={activeCreatorProfile?.id || profile.id}
            onBack={() => setPublicProfileOpen(false)}
            onMessage={() => {
              setPublicProfileOpen(false);
              navigate('/conversations');
            }}
          />
        </div>
      )}

      {/* Share Profile Modal */}
      <ShareProfileModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        profile={profile}
        creatorProfile={activeCreatorProfile}
      />
    </div>
  );
}
