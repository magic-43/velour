import { useState, useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { getVaultItems } from '../lib/creatorVault';

type SubView = 'none' | 'vault' | 'saved' | 'archive' | 'followers';

export default function Profile() {
  const { profile, signOut, isCreator, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subView, setSubView] = useState<SubView>('none');
  const [vaultCount, setVaultCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [archiveCount, setArchiveCount] = useState<number>(0);
  const [savedCount, setSavedCount] = useState<number>(0);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [switcherOpen, setSwitcherOpen] = useState<boolean>(false);

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

          // 3. Followers count (conversations connected to this creator)
          const { count: fCount } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .in('creator_profile_id', targetIds);

          if (typeof fCount === 'number') setFollowersCount(fCount);

          // 4. Archived stories count
          const { count: sCount } = await supabase
            .from('stories')
            .select('*', { count: 'exact', head: true })
            .in('creator_profile_id', targetIds);

          if (typeof sCount === 'number') setArchiveCount(sCount);
        } else {
          // Vault items (verified attachment unlocks for fans)
          const { count: vCount } = await supabase
            .from('attachment_unlocks')
            .select('*', { count: 'exact', head: true })
            .eq('fan_id', currentUserId)
            .eq('status', 'verified');

          if (typeof vCount === 'number') setVaultCount(vCount);

          // Following / connected conversations for fans
          const { count: fCount } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('fan_id', currentUserId);

          if (typeof fCount === 'number') setFollowingCount(fCount);

          setSavedCount(0);
        }
      } catch (err) {
        console.error('Error fetching profile stats:', err);
      }
    }

    fetchStats();
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
      <div className="px-4 sm:px-5 pt-0 pb-24 md:pb-8 max-w-[600px] w-full mx-auto md:mx-0">
        {/* Header matching Stories/Home page */}
        <div className="sticky top-0 z-20 -mx-4 sm:-mx-5 mb-4 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3 backdrop-blur-md sm:px-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubView('none')}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-ink-light text-muted hover:text-paper transition-colors cursor-pointer"
              aria-label="Back to profile"
            >
              <ArrowLeft size={18} />
            </button>
            <h3 className="text-sm font-medium text-muted tracking-wide uppercase">The Vault</h3>
          </div>
          {vaultCount > 0 && (
            <span className="text-[11px] text-muted tracking-tight">
              {vaultCount} {vaultCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {vaultCount === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-muted mb-3.5">
              <Key size={22} strokeWidth={1.5} />
            </div>
            <h4 className="font-medium text-sm text-paper mb-1">
              Your Vault is empty
            </h4>
            <p className="text-muted text-xs max-w-xs mb-5 leading-relaxed">
              Exclusive photos, videos, and private collections unlocked in chats will be archived here.
            </p>
            <button
              type="button"
              onClick={() => navigate('/explore')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gold hover:bg-gold-light text-ink text-xs font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
            >
              <Compass size={14} />
              <span>Discover Creators</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {/* Real items will render here when attachments phase lands */}
          </div>
        )}
      </div>
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

  // ── SUBVIEW: Saved Stories ──────────────────────────────────────────────────
  if (subView === 'saved') {
    return (
      <div className="px-4 sm:px-5 pt-0 pb-24 md:pb-8 max-w-[600px] w-full mx-auto md:mx-0">
        {/* Header matching Stories/Home page */}
        <div className="sticky top-0 z-20 -mx-4 sm:-mx-5 mb-4 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3 backdrop-blur-md sm:px-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubView('none')}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-ink-light text-muted hover:text-paper transition-colors cursor-pointer"
              aria-label="Back to profile"
            >
              <ArrowLeft size={18} />
            </button>
            <h3 className="text-sm font-medium text-muted tracking-wide uppercase">Saved Stories</h3>
          </div>
          {savedCount > 0 && (
            <span className="text-[11px] text-muted tracking-tight">
              {savedCount} {savedCount === 1 ? 'story' : 'stories'}
            </span>
          )}
        </div>

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
            <span>Browse Stories</span>
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN TELEGRAM-STYLE PROFILE VIEW ─────────────────────────────────────────
  return (
    <div className="px-4 sm:px-5 pt-4 pb-24 md:pb-8 max-w-[600px] w-full mx-auto md:mx-0">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        accept="image/*"
        className="hidden"
      />

      {/* ── Top Bar with Edit Button ──────────────────────────────────── */}
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={() => navigate('/settings/account')}
          title="Edit Profile"
          className="w-9 h-9 rounded-full bg-[#101010] hover:bg-[#1a1a1a] text-paper/80 hover:text-paper flex items-center justify-center transition-all shadow-sm active:scale-95"
        >
          <Pencil size={15} strokeWidth={1.8} />
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
              onClick={() => navigate('/explore')}
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
          onClick={() => navigate('/settings/account')}
        />
      </div>

      {/* ── Grouped Section 4: Sign Out ───────────────────────────────── */}
      <div className="bg-[#101010] rounded-2xl overflow-hidden shadow-sm">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-950/20 transition-colors text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-[7px] bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shrink-0 shadow-sm">
              <LogOut size={14} />
            </div>
            <span className="text-sm font-medium text-red-400 group-hover:text-red-300 transition-colors">
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
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition-colors text-left group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-7 h-7 rounded-[7px] ${iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-paper truncate">{label}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        {badge && (
          <span className="text-xs text-muted font-normal">{badge}</span>
        )}
        <ChevronRight size={16} className="text-muted/60 group-hover:text-paper transition-colors" />
      </div>
    </button>
  );
}
