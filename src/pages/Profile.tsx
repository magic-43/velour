import { useState, useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Key, Wallet, Bookmark, Compass,
  Bell, Shield, Mail, LogOut, ChevronRight,
  ArrowLeft, Check, Pencil, ChevronDown,
  Archive, Users, Film
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { uploadPublicFile } from '../lib/r2';
import AccountSwitcherModal from '../components/profile/AccountSwitcherModal';
import CreatorVaultView from '../components/profile/CreatorVaultView';
import StoryArchiveView from '../components/profile/StoryArchiveView';
import FollowersListView from '../components/profile/FollowersListView';
import FanVaultView from '../components/profile/FanVaultView';
import FanSavedStoriesView from '../components/profile/FanSavedStoriesView';
import FanFollowingView from '../components/profile/FanFollowingView';
import CreatorStudioProfile from '../components/profile/CreatorStudioProfile';
import { getVaultItems } from '../lib/creatorVault';
import { useBackHandler } from '../lib/backButtonRegistry';

type SubView = 'none' | 'vault' | 'saved' | 'archive' | 'followers' | 'following';

export default function Profile() {
  const { profile, signOut, isCreator, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rawTab = searchParams.get('tab') || searchParams.get('view');
  const validTabs: SubView[] = ['vault', 'saved', 'archive', 'followers', 'following'];
  const subView: SubView = (rawTab && validTabs.includes(rawTab as SubView))
    ? (rawTab as SubView)
    : 'none';

  const setSubView = (view: SubView) => {
    if (view === 'none') {
      if (window.history.state && window.history.state.idx > 0) {
        navigate(-1);
      } else {
        setSearchParams({}, { replace: true });
      }
    } else {
      setSearchParams({ tab: view });
    }
  };
  const [vaultCount, setVaultCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [archiveCount, setArchiveCount] = useState<number>(0);
  const [savedCount, setSavedCount] = useState<number>(0);
  const [totalViews, setTotalViews] = useState<number>(0);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [switcherOpen, setSwitcherOpen] = useState<boolean>(false);

  // Android hardware back button handlers for Profile subviews and modals
  useBackHandler(() => {
    setSwitcherOpen(false);
    return true;
  }, switcherOpen, 90);

  useBackHandler(() => {
    setSubView('none');
    return true;
  }, subView !== 'none', 80);

  useEffect(() => {
    if (!profile) return;
    const currentUserId = profile.id;

    async function fetchStats() {
      try {
        if (isCreator) {
          // 1. Vault items from creator vault storage
          const vaultItems = getVaultItems(currentUserId);
          setVaultCount(vaultItems.length);

          // 2. Fetch creator persona IDs
          const { data: personas } = await supabase
            .from('creator_profiles')
            .select('id')
            .eq('owner_id', currentUserId);

          const targetIds = Array.from(
            new Set([currentUserId, ...(personas || []).map((p) => p.id)])
          );

          // 3. Followers count from real follows table (RPC first, then table count)
          let resolvedFCount: number | null = null;
          try {
            const { data: rpcCount, error: rpcErr } = await supabase.rpc('get_creator_followers_count', {
              p_creator_id: currentUserId,
            });
            if (!rpcErr && typeof rpcCount === 'number') {
              resolvedFCount = rpcCount;
            }
          } catch {}

          if (resolvedFCount !== null) {
            setFollowersCount(resolvedFCount);
          } else {
            const { count: fCount, error: fErr } = await supabase
              .from('follows')
              .select('*', { count: 'exact', head: true })
              .in('creator_profile_id', targetIds);

            if (!fErr && typeof fCount === 'number') {
              setFollowersCount(fCount);
            } else {
              // Local fallback
              let sumFollowers = 0;
              for (const tId of targetIds) {
                try {
                  const raw = localStorage.getItem(`velour_creator_followers_${tId}`);
                  if (raw) sumFollowers += JSON.parse(raw).length;
                } catch {}
              }
              setFollowersCount(sumFollowers);
            }
          }

          // 4. Archived stories count
          const { count: sCount } = await supabase
            .from('stories')
            .select('*', { count: 'exact', head: true })
            .in('creator_profile_id', targetIds);

          if (typeof sCount === 'number') setArchiveCount(sCount);

          // 5. Total story views
          const { data: viewsData } = await supabase
            .from('stories')
            .select('view_count')
            .in('creator_profile_id', targetIds);

          if (viewsData) {
            const sum = viewsData.reduce((acc, curr) => acc + (curr.view_count || 0), 0);
            setTotalViews(sum);
          }
        } else {
          // 1. Vault items (STRICTLY verified attachment unlocks for fans)
          const { count: vCount } = await supabase
            .from('attachment_unlocks')
            .select('*', { count: 'exact', head: true })
            .eq('fan_id', currentUserId)
            .eq('status', 'verified');

          let localVaultCount = 0;
          try {
            const raw = localStorage.getItem(`velour_unlocked_media_${currentUserId}`);
            if (raw) {
              const items = JSON.parse(raw);
              if (Array.isArray(items)) {
                localVaultCount = items.filter((i: any) => i && i.status === 'verified').length;
              }
            }
          } catch {
            localVaultCount = 0;
          }

          setVaultCount(Math.max(vCount || 0, localVaultCount));

          // 2. Following count from real follows table
          const { count: followingC, error: followErr } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('fan_id', currentUserId);

          if (!followErr && typeof followingC === 'number') {
            setFollowingCount(followingC);
          } else {
            let localFollowingCount = 0;
            try {
              const raw = localStorage.getItem(`velour_user_follows_${currentUserId}`);
              if (raw) localFollowingCount = JSON.parse(raw).length;
            } catch {}
            setFollowingCount(localFollowingCount);
          }

          // 3. Saved stories count from localStorage & Supabase reactions
          const localKey = `saved_stories_${currentUserId}`;
          let localSavedIds: string[] = [];
          try {
            localSavedIds = JSON.parse(localStorage.getItem(localKey) || '[]');
          } catch {
            localSavedIds = [];
          }

          const { data: dbReactions } = await supabase
            .from('story_reactions')
            .select('story_id')
            .eq('user_id', currentUserId)
            .eq('reaction_type', 'bookmark');

          const dbSavedIds = (dbReactions || []).map((r) => r.story_id);
          const allSavedIds = Array.from(new Set([...localSavedIds, ...dbSavedIds]));
          setSavedCount(allSavedIds.length);
        }
      } catch (err) {
        console.error('Error fetching profile stats:', err);
      }
    }

    fetchStats();

    // Realtime subscription to follows table so creator stats update live
    const channel = supabase
      .channel(`profile_stats_realtime_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, isCreator]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    try {
      setUploadingPhoto(true);
      const ext = file.name.split('.').pop();
      const key = `avatars/${profile.id}/avatar.${ext}`;

      // Upload to Cloudflare R2 public bucket
      const publicUrl = await uploadPublicFile(file, key);

      const avatarUrlWithTime = `${publicUrl}?t=${Date.now()}`;

      // Store the CDN URL in the profile (with cache-bust)
      await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrlWithTime })
        .eq('id', profile.id);

      // Keep creator_profiles in sync
      await supabase
        .from('creator_profiles')
        .update({ avatar_url: avatarUrlWithTime })
        .eq('owner_id', profile.id);

      if (refreshProfile) await refreshProfile();
    } catch (err) {
      console.error('Failed to upload profile photo:', err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (!profile) return null;

  // ── SUBVIEW: The Vault ───────────────────────────────────────────────────────
  if (subView === 'vault') {
    if (isCreator) {
      return (
        <CreatorVaultView
          onBack={() => {
            setSubView('none');
            if (profile) setVaultCount(getVaultItems(profile.id).length);
          }}
        />
      );
    }

    return (
      <FanVaultView
        onBack={() => setSubView('none')}
        onCountChange={(c) => setVaultCount(c)}
      />
    );
  }

  // ── SUBVIEW: Story Archive (Creators Only) ───────────────────────────────────
  if (subView === 'archive') {
    return <StoryArchiveView onBack={() => setSubView('none')} />;
  }

  // ── SUBVIEW: Followers List (Creators Only) ──────────────────────────────────
  if (subView === 'followers') {
    return <FollowersListView onBack={() => setSubView('none')} />;
  }

  // ── SUBVIEW: Following List (Fans) ──────────────────────────────────────────
  if (subView === 'following') {
    return <FanFollowingView onBack={() => setSubView('none')} />;
  }

  // ── SUBVIEW: Saved Stories (Fans) ───────────────────────────────────────────
  if (subView === 'saved') {
    return (
      <FanSavedStoriesView
        onBack={() => setSubView('none')}
        onCountChange={(c) => setSavedCount(c)}
      />
    );
  }

  // ── CREATOR STUDIO PROFILE VIEW (Snapchat / Creator Studio Style) ───────────
  if (isCreator) {
    return (
      <CreatorStudioProfile
        profile={profile}
        followersCount={followersCount}
        archiveCount={archiveCount}
        vaultCount={vaultCount}
        totalViews={totalViews}
        onPhotoUpload={handlePhotoUpload}
        fileInputRef={fileInputRef}
        onOpenVault={() => setSubView('vault')}
        onOpenArchive={() => setSubView('archive')}
        onOpenFollowers={() => setSubView('followers')}
      />
    );
  }

  // ── MAIN TELEGRAM-STYLE FAN PROFILE VIEW ────────────────────────────────────
  return (
    <div className="px-4 sm:px-5 pt-4 pb-24 md:pb-8 max-w-[600px] w-full mx-auto md:mx-0">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        accept="image/*"
        className="hidden"
      />

      {/* ── Sticky Top Bar with Title and Edit Button ─────────────────── */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-5 -mt-4 mb-4 flex items-center justify-between px-4 sm:px-5 py-3.5 bg-ink/95 backdrop-blur-md border-b border-border-subtle">
        <h1 className="font-serif text-2xl text-paper font-semibold tracking-tight">Profile</h1>
        <button
          onClick={() => navigate('/settings/account')}
          title="Edit Profile"
          className="w-10 h-10 rounded-full bg-[#1c1c1e] hover:bg-[#2c2c2e] text-paper flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <Pencil size={18} strokeWidth={2} />
        </button>
      </div>

      {/* ── Centered Header ───────────────────────────────────── */}
      <div className="flex flex-col items-center text-center mb-6">
        {/* Avatar */}
        <div className="relative">
          <div
            onClick={() => fileInputRef.current?.click()}
            title="Tap to change avatar"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-ink-light border border-[#1f1f1f] hover:border-gold/50 overflow-hidden flex items-center justify-center shadow-lg cursor-pointer transition-all active:scale-95"
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-serif text-4xl sm:text-5xl text-gold select-none">
                {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Display Name with Accordion next to it for creators */}
        {isCreator ? (
          <button
            onClick={() => setSwitcherOpen(true)}
            className="inline-flex items-center gap-2 mt-3.5 group cursor-pointer transition-transform active:scale-[0.98]"
            title="Switch creator account"
          >
            <h1 className="font-bold text-2xl sm:text-3xl text-paper tracking-tight leading-tight group-hover:text-gold transition-colors">
              {profile.display_name ?? profile.username}
            </h1>
            <ChevronDown
              size={20}
              className="text-muted group-hover:text-gold transition-colors shrink-0"
            />
          </button>
        ) : (
          <h1 className="font-bold text-2xl sm:text-3xl text-paper tracking-tight mt-3.5 leading-tight">
            {profile.display_name ?? profile.username}
          </h1>
        )}

        {/* Subtitle */}
        <p className="text-muted text-sm mt-1">@{profile.username}</p>
      </div>

      {/* ── Grouped Section 1: Media Library / The Vault & Wallet ─────── */}
      <div className="bg-[#101010] rounded-2xl overflow-hidden mb-3 shadow-sm">
        <TelegramRow
          iconBg="bg-gradient-to-br from-amber-500 to-amber-700 text-white"
          icon={isCreator ? <Film size={15} /> : <Key size={15} />}
          label={isCreator ? 'Media Library' : 'The Vault'}
          badge={vaultCount > 0 ? `${vaultCount}` : undefined}
          onClick={() => setSubView('vault')}
        />
        {isCreator && (
          <>
            <div className="h-px bg-white/[0.04] ml-13" />
            <TelegramRow
              iconBg="bg-gradient-to-br from-blue-500 to-blue-700 text-white"
              icon={<Wallet size={15} />}
              label="Wallet"
              onClick={() => navigate('/wallet')}
            />
          </>
        )}
      </div>

      {/* ── Grouped Section 2: Stories & Social ───────────────────────── */}
      <div className="bg-[#101010] rounded-2xl overflow-hidden mb-3 shadow-sm">
        {isCreator ? (
          <>
            <TelegramRow
              iconBg="bg-gradient-to-br from-sky-400 to-sky-600 text-white"
              icon={<Archive size={15} />}
              label="Story Archive"
              badge={archiveCount > 0 ? `${archiveCount}` : undefined}
              onClick={() => setSubView('archive')}
            />
            <div className="h-px bg-white/[0.04] ml-13" />
            <TelegramRow
              iconBg="bg-gradient-to-br from-purple-500 to-purple-700 text-white"
              icon={<Users size={15} />}
              label="Followers"
              badge={followersCount > 0 ? `${followersCount}` : undefined}
              onClick={() => setSubView('followers')}
            />
          </>
        ) : (
          <>
            <TelegramRow
              iconBg="bg-gradient-to-br from-sky-400 to-sky-600 text-white"
              icon={<Bookmark size={15} />}
              label="Saved Stories"
              badge={savedCount > 0 ? `${savedCount}` : undefined}
              onClick={() => setSubView('saved')}
            />
            <div className="h-px bg-white/[0.04] ml-13" />
            <TelegramRow
              iconBg="bg-gradient-to-br from-purple-500 to-purple-700 text-white"
              icon={<Compass size={15} />}
              label="Following"
              badge={followingCount > 0 ? `${followingCount}` : undefined}
              onClick={() => setSubView('following')}
            />
          </>
        )}
      </div>

      {/* ── Grouped Section 3: Preferences & Security ─────────────────── */}
      <div className="bg-[#101010] rounded-2xl overflow-hidden mb-3 shadow-sm">
        <TelegramRow
          iconBg="bg-gradient-to-br from-rose-500 to-rose-700 text-white"
          icon={<Bell size={15} />}
          label="Notifications"
          onClick={() => navigate('/settings/notifications')}
        />
        <div className="h-px bg-white/[0.04] ml-13" />
        <TelegramRow
          iconBg="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white"
          icon={<Shield size={15} />}
          label="Privacy & Security"
          onClick={() => navigate('/settings/security')}
        />
        <div className="h-px bg-white/[0.04] ml-13" />
        <TelegramRow
          iconBg="bg-gradient-to-br from-teal-400 to-teal-600 text-white"
          icon={<Mail size={15} />}
          label="Recovery Email"
          badge={profile.email ? (
            <span className="flex items-center gap-1 text-emerald-400 text-xs">
              <Check size={12} /> Set
            </span>
          ) : 'Not set'}
          onClick={() => navigate('/settings/recovery-email')}
        />
      </div>

      {/* ── Grouped Section 4: Sign Out ───────────────────────────────── */}
      <div className="bg-[#101010] rounded-2xl overflow-hidden shadow-sm">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-red-950/20 transition-colors text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shrink-0 shadow-sm">
              <LogOut size={16} />
            </div>
            <span className="text-[15px] font-medium text-red-400 group-hover:text-red-300 transition-colors">
              Sign Out
            </span>
          </div>
        </button>
      </div>

      {/* Account Switcher Modal (Creators Only) */}
      {isCreator && (
        <AccountSwitcherModal
          isOpen={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
        />
      )}
    </div>
  );
}

// ── Telegram-Style Grouped Row ───────────────────────────────────────────────

interface TelegramRowProps {
  icon: ReactNode;
  iconBg: string;
  label: string;
  badge?: ReactNode;
  onClick: () => void;
}

function TelegramRow({ icon, iconBg, label, badge, onClick }: TelegramRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.04] transition-colors text-left group cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
          {icon}
        </div>
        <span className="text-[15px] font-medium text-paper truncate">{label}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        {badge && (
          <span className="text-sm text-muted font-normal">{badge}</span>
        )}
        <ChevronRight size={18} className="text-muted/60 group-hover:text-paper transition-colors" />
      </div>
    </button>
  );
}
