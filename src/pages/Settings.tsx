import React, { useState, useEffect, useRef, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Bell, Shield, Mail, Key, Check,
  AlertCircle, Camera, LogOut, ChevronRight, Lock,
  Film, Wallet, Archive, Users, Calendar, Sparkles
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { uploadPublicFile } from '../lib/r2';

interface NotificationPreferences {
  directMessages: boolean;
  creatorStories: boolean;
  storyReactions: boolean;
  inAppSounds: boolean;
  emailDigest: boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  directMessages: true,
  creatorStories: true,
  storyReactions: true,
  inAppSounds: true,
  emailDigest: false,
};

export default function Settings() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const { profile, user, refreshProfile, signOut, isCreator } = useAuth();

  // ── Account State ────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Creator Persona Details (DOB, Gender, Kinks) ────────────────────────────
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [kinksInput, setKinksInput] = useState('');

  // ── Dedicated Recovery Email State ───────────────────────────────────────────
  const [recoveryEmail, setRecoveryEmail] = useState(profile?.email || '');
  const [isSavingRecoveryEmail, setIsSavingRecoveryEmail] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // ── Notification State ───────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<NotificationPreferences>(() => {
    if (!profile) return DEFAULT_NOTIFICATIONS;
    try {
      const saved = localStorage.getItem(`velour_notifications_${profile.id}`);
      return saved ? { ...DEFAULT_NOTIFICATIONS, ...JSON.parse(saved) } : DEFAULT_NOTIFICATIONS;
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  });
  const [notificationToast, setNotificationToast] = useState(false);

  // ── Security State ───────────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
      setRecoveryEmail(profile.email || '');

      if (profile.role === 'creator') {
        supabase
          .from('creator_profiles')
          .select('id, tags')
          .eq('owner_id', profile.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              const tags = (data.tags || []) as string[];
              let g = '';
              let d = '';
              const k: string[] = [];
              tags.forEach((t) => {
                const lower = t.toLowerCase();
                if (lower.startsWith('gender:')) {
                  g = t.slice(7).trim();
                } else if (lower.startsWith('dob:') || lower.startsWith('birthday:')) {
                  d = t.split(':')[1]?.trim() || '';
                } else if (lower.startsWith('kink:')) {
                  k.push(t.slice(5).trim());
                } else {
                  k.push(t.trim());
                }
              });
              setGender(g);
              setDob(d);
              setKinksInput(k.join(', '));
            }
          });
      }
    }
  }, [profile]);

  // ── Handle Account Save (No recovery email in account details) ───────────────
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const cleanUsername = username.trim().toLowerCase().replace(/^@+/, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      setAccountError('Username must be at least 3 characters.');
      return;
    }

    setIsSavingAccount(true);
    setAccountError(null);
    setAccountSuccess(null);

    try {
      const updates = {
        display_name: displayName.trim() || null,
        username: cleanUsername,
        bio: bio.trim() || null,
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id);

      if (profileError) {
        if (profileError.message.includes('unique constraint') || profileError.message.includes('duplicate')) {
          throw new Error('This username is already taken. Please choose another.');
        }
        throw profileError;
      }

      // If user is creator, sync creator_profiles display_name, bio & tags
      if (profile.role === 'creator') {
        const newTags: string[] = [];
        if (gender.trim()) {
          newTags.push(`gender:${gender.trim()}`);
        }
        if (dob.trim()) {
          newTags.push(`dob:${dob.trim()}`);
        }
        if (kinksInput.trim()) {
          const splitKinks = kinksInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          newTags.push(...splitKinks);
        }

        await supabase
          .from('creator_profiles')
          .update({
            display_name: displayName.trim() || cleanUsername,
            bio: bio.trim() || null,
            tags: newTags,
          })
          .eq('owner_id', profile.id);
      }

      if (refreshProfile) await refreshProfile();

      setAccountSuccess('Profile updated successfully.');
      setTimeout(() => setAccountSuccess(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      setAccountError(msg);
    } finally {
      setIsSavingAccount(false);
    }
  };

  // ── Handle Recovery Email Save (Dedicated) ──────────────────────────────────
  const handleSaveRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const emailTrimmed = recoveryEmail.trim().toLowerCase();
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setRecoveryError('Please enter a valid email address.');
      return;
    }

    setIsSavingRecoveryEmail(true);
    setRecoveryError(null);
    setRecoverySuccess(null);

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ email: emailTrimmed || null })
        .eq('id', profile.id);

      if (profileError) throw profileError;

      if (refreshProfile) await refreshProfile();
      setRecoverySuccess('Recovery email saved successfully.');
      setTimeout(() => setRecoverySuccess(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update recovery email.';
      setRecoveryError(msg);
    } finally {
      setIsSavingRecoveryEmail(false);
    }
  };

  // ── Handle Avatar Upload ────────────────────────────────────────────────────
  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    try {
      setIsUploadingAvatar(true);
      setAccountError(null);

      const ext = file.name.split('.').pop() || 'jpg';
      const key = `avatars/${profile.id}/avatar.${ext}`;
      const publicUrl = await uploadPublicFile(file, key);
      const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`;

      await supabase
        .from('profiles')
        .update({ avatar_url: urlWithTimestamp })
        .eq('id', profile.id);

      if (profile.role === 'creator') {
        await supabase
          .from('creator_profiles')
          .update({ avatar_url: urlWithTimestamp })
          .eq('owner_id', profile.id);
      }

      setAvatarUrl(urlWithTimestamp);
      if (refreshProfile) await refreshProfile();

      setAccountSuccess('Avatar updated.');
      setTimeout(() => setAccountSuccess(null), 2500);
    } catch (err: unknown) {
      console.error('Avatar upload failed:', err);
      setAccountError('Could not upload avatar image.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // ── Handle Notification Toggle ──────────────────────────────────────────────
  const toggleNotification = (key: keyof NotificationPreferences) => {
    if (!profile) return;
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    try {
      localStorage.setItem(`velour_notifications_${profile.id}`, JSON.stringify(updated));
      setNotificationToast(true);
      setTimeout(() => setNotificationToast(false), 2000);
    } catch (err) {
      console.error('Error saving notification preferences:', err);
    }
  };

  // ── Handle Password Update ──────────────────────────────────────────────────
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setSecurityError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityError('Passwords do not match.');
      return;
    }

    setIsUpdatingPassword(true);
    setSecurityError(null);
    setSecuritySuccess(null);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setSecuritySuccess('Password changed successfully.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSecuritySuccess(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password.';
      setSecurityError(msg);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const sectionTitles: Record<string, string> = {
    account: 'Account',
    notifications: 'Notifications',
    security: 'Privacy & Security',
    'recovery-email': 'Recovery Email',
  };

  const currentTitle = section ? (sectionTitles[section] ?? 'Settings') : 'Settings';

  return (
    <div className="h-full flex flex-col overflow-hidden bg-ink">
      {/* ── Sticky Top Header (guaranteed pinned) ─────────────────── */}
      <div className="sticky top-0 z-30 shrink-0 flex items-center gap-3.5 bg-ink/95 px-4 py-3.5 backdrop-blur-md sm:px-5 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => {
            if (window.history.state && window.history.state.idx > 0) {
              navigate(-1);
            } else {
              navigate('/me');
            }
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">
          {currentTitle}
        </h3>
      </div>

      {/* ── Scrollable Body Area ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 pt-4 pb-24 md:pb-8">
        <div className="max-w-[600px] mx-auto w-full min-h-full pb-10">

        {/* ── SECTION: ACCOUNT / EDIT PROFILE ───────────────────────────────── */}
        {section === 'account' && (
          <div className="space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarChange}
              accept="image/*"
              className="hidden"
            />

            {/* Avatar Row */}
            <div className="bg-[#101010] rounded-2xl p-5 border border-white/[0.04] flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-ink-light border border-white/10 flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-serif text-2xl text-gold">
                      {(displayName || username || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-gold hover:bg-gold-light text-ink flex items-center justify-center transition-all shadow-md cursor-pointer disabled:opacity-50"
                  title="Change avatar photo"
                >
                  <Camera size={12} strokeWidth={2.5} />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-paper truncate">
                  {displayName || `@${username}`}
                </h4>
                <p className="text-xs text-muted mt-0.5">
                  {isUploadingAvatar ? 'Uploading new photo...' : 'Tap the camera icon to upload a new profile picture.'}
                </p>
              </div>
            </div>

            {/* Account Edit Form */}
            <form onSubmit={handleSaveAccount} className="bg-[#101010] rounded-2xl p-5 border border-white/[0.04] space-y-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
                  Display Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={15} />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    maxLength={50}
                    className="w-full bg-black/40 border border-white/10 focus:border-gold/60 focus:ring-1 focus:ring-gold/60 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-paper placeholder-muted/40 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
                  Username
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-muted text-xs font-mono">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                    placeholder="username"
                    maxLength={30}
                    required
                    className="w-full bg-black/40 border border-white/10 focus:border-gold/60 focus:ring-1 focus:ring-gold/60 rounded-xl pl-8 pr-3.5 py-2.5 text-xs text-paper placeholder-muted/40 font-mono transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
                    Bio
                  </label>
                  <span className="text-[10px] text-muted/60 font-mono">{bio.length}/250</span>
                </div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell your story..."
                  maxLength={250}
                  rows={3}
                  className="w-full bg-black/40 border border-white/10 focus:border-gold/60 focus:ring-1 focus:ring-gold/60 rounded-xl p-3 text-xs text-paper placeholder-muted/40 resize-none transition-colors"
                />
              </div>

              {/* Creator-specific Persona Details */}
              {isCreator && (
                <div className="pt-3 border-t border-white/[0.06] space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-gold" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gold">
                      Creator Persona & About Details
                    </span>
                  </div>

                  {/* Gender */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
                      Gender
                    </label>
                    <input
                      type="text"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      placeholder="e.g. Female, Male, Non-binary"
                      maxLength={40}
                      className="w-full bg-black/40 border border-white/10 focus:border-gold/60 focus:ring-1 focus:ring-gold/60 rounded-xl px-3.5 py-2.5 text-xs text-paper placeholder-muted/40 transition-colors"
                    />
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
                      Date of Birth
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={15} />
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 focus:border-gold/60 focus:ring-1 focus:ring-gold/60 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-paper placeholder-muted/40 transition-colors [color-scheme:dark]"
                      />
                    </div>
                  </div>

                  {/* Kinks & Specialties */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
                        Kinks & Specialties
                      </label>
                      <span className="text-[10px] text-muted/60">Comma-separated</span>
                    </div>
                    <input
                      type="text"
                      value={kinksInput}
                      onChange={(e) => setKinksInput(e.target.value)}
                      placeholder="e.g. Latex, Roleplay, BDSM, Cosplay, Dominant"
                      className="w-full bg-black/40 border border-white/10 focus:border-gold/60 focus:ring-1 focus:ring-gold/60 rounded-xl px-3.5 py-2.5 text-xs text-paper placeholder-muted/40 transition-colors"
                    />
                    <p className="text-[10px] text-muted mt-1">
                      These will be displayed as badge pills on your public profile About tab.
                    </p>
                  </div>
                </div>
              )}

              {accountError && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{accountError}</span>
                </div>
              )}

              {accountSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <Check size={14} className="shrink-0" />
                  <span>{accountSuccess}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingAccount}
                  className="w-full py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingAccount ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                      <span>Saving changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── SECTION: NOTIFICATIONS ────────────────────────────────────────── */}
        {section === 'notifications' && (
          <div className="space-y-4">
            <div className="bg-[#101010] rounded-2xl overflow-hidden border border-white/[0.04] divide-y divide-white/[0.04]">
              <NotificationToggleRow
                title="Direct Messages"
                description="Instant alerts when you receive a new chat message"
                checked={notifications.directMessages}
                onChange={() => toggleNotification('directMessages')}
              />
              <NotificationToggleRow
                title="Creator Stories"
                description="Notifications when creators you follow post new moments"
                checked={notifications.creatorStories}
                onChange={() => toggleNotification('creatorStories')}
              />
              <NotificationToggleRow
                title="Reactions & Saves"
                description="Notifies when someone loves or saves your moments"
                checked={notifications.storyReactions}
                onChange={() => toggleNotification('storyReactions')}
              />
              <NotificationToggleRow
                title="Sound & Haptics"
                description="Play in-app audio feedback and haptic vibration"
                checked={notifications.inAppSounds}
                onChange={() => toggleNotification('inAppSounds')}
              />
              <NotificationToggleRow
                title="Email Highlights"
                description="Weekly digest of trending stories and exclusive creator drops"
                checked={notifications.emailDigest}
                onChange={() => toggleNotification('emailDigest')}
              />
            </div>

            {notificationToast && (
              <p className="text-center text-xs text-emerald-400 animate-in fade-in flex items-center justify-center gap-1">
                <Check size={13} /> Preference saved
              </p>
            )}
          </div>
        )}

        {/* ── SECTION: PRIVACY & SECURITY ───────────────────────────────────── */}
        {section === 'security' && (
          <div className="space-y-4">


            {/* Change Password */}
            <form onSubmit={handleUpdatePassword} className="bg-[#101010] rounded-2xl p-5 border border-white/[0.04] space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Key size={15} className="text-gold" />
                <h4 className="text-xs font-semibold text-paper uppercase tracking-wider">Change Password</h4>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={14} />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-black/40 border border-white/10 focus:border-gold/60 focus:ring-1 focus:ring-gold/60 rounded-xl pl-9 pr-3.5 py-2 text-xs text-paper placeholder-muted/40 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={14} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-black/40 border border-white/10 focus:border-gold/60 focus:ring-1 focus:ring-gold/60 rounded-xl pl-9 pr-3.5 py-2 text-xs text-paper placeholder-muted/40 transition-colors"
                  />
                </div>
              </div>

              {securityError && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{securityError}</span>
                </div>
              )}

              {securitySuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <Check size={14} className="shrink-0" />
                  <span>{securitySuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isUpdatingPassword || !newPassword}
                className="w-full py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isUpdatingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>

            {/* Sessions Card */}
            <div className="bg-[#101010] rounded-2xl p-5 border border-white/[0.04] space-y-3">
              <h4 className="text-xs font-semibold text-paper uppercase tracking-wider">Device Sessions</h4>
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-paper">Current Web Browser</p>
                  <p className="text-[11px] text-emerald-400 mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active now
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    navigate('/login', { replace: true });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/10 text-white/70 hover:text-red-400 text-xs font-medium transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SECTION: RECOVERY EMAIL ONLY ───────────────────────────────────── */}
        {section === 'recovery-email' && (
          <div className="space-y-4">


            {/* Recovery Email Form */}
            <form onSubmit={handleSaveRecoveryEmail} className="bg-[#101010] rounded-2xl p-5 border border-white/[0.04] space-y-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
                  Recovery Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={15} />
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="recovery@example.com"
                    required
                    className="w-full bg-black/40 border border-white/10 focus:border-teal-400/60 focus:ring-1 focus:ring-teal-400/60 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-paper placeholder-muted/40 transition-colors"
                  />
                </div>
                <p className="text-[11px] text-muted mt-2 leading-relaxed">
                  Make sure this email is active and accessible so you don&apos;t lose access to your account.
                </p>
              </div>

              {recoveryError && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{recoveryError}</span>
                </div>
              )}

              {recoverySuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <Check size={14} className="shrink-0" />
                  <span>{recoverySuccess}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingRecoveryEmail}
                  className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-ink font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingRecoveryEmail ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                      <span>Saving email...</span>
                    </>
                  ) : (
                    <span>Save Recovery Email</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── GENERAL SETTINGS HUB (if /settings with no section) ─────────────── */}
        {!section && (
          <div className="space-y-4">
            {/* Creator Tools Section (Creators only) */}
            {isCreator && (
              <div className="bg-[#101010] rounded-2xl overflow-hidden border border-white/[0.04]">
                <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.04]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Creator Tools
                  </p>
                </div>
                <SettingsMenuLink
                  icon={<Film size={16} />}
                  iconBg="bg-gradient-to-br from-amber-500 to-amber-700 text-white"
                  label="Media Library"
                  sublabel="Your uploaded vault photos & videos"
                  onClick={() => navigate('/me?tab=vault')}
                />
                <div className="h-px bg-white/[0.04] ml-14" />
                <SettingsMenuLink
                  icon={<Wallet size={16} />}
                  iconBg="bg-gradient-to-br from-blue-500 to-blue-700 text-white"
                  label="Wallet"
                  sublabel="Earnings dashboard & monetization"
                  onClick={() => navigate('/wallet')}
                />
                <div className="h-px bg-white/[0.04] ml-14" />
                <SettingsMenuLink
                  icon={<Archive size={16} />}
                  iconBg="bg-gradient-to-br from-sky-400 to-sky-600 text-white"
                  label="Story Archive"
                  sublabel="View past published story moments"
                  onClick={() => navigate('/me?tab=archive')}
                />
                <div className="h-px bg-white/[0.04] ml-14" />
                <SettingsMenuLink
                  icon={<Users size={16} />}
                  iconBg="bg-gradient-to-br from-purple-500 to-purple-700 text-white"
                  label="Followers"
                  sublabel="Fans connected with your profile"
                  onClick={() => navigate('/me?tab=followers')}
                />
              </div>
            )}

            {/* Account & Preferences */}
            <div className="bg-[#101010] rounded-2xl overflow-hidden border border-white/[0.04]">
              {isCreator && (
                <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.04]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Account & Preferences
                  </p>
                </div>
              )}
              <SettingsMenuLink
                icon={<User size={16} />}
                iconBg="bg-gradient-to-br from-amber-500 to-amber-700 text-white"
                label="Account Profile"
                sublabel={isCreator ? 'Name, username, bio, and persona details' : 'Name, username, and bio'}
                onClick={() => navigate('/settings/account')}
              />
              <div className="h-px bg-white/[0.04] ml-14" />
              <SettingsMenuLink
                icon={<Bell size={16} />}
                iconBg="bg-gradient-to-br from-rose-500 to-rose-700 text-white"
                label="Notifications"
                sublabel="Push alerts, in-app sounds, stories"
                onClick={() => navigate('/settings/notifications')}
              />
              <div className="h-px bg-white/[0.04] ml-14" />
              <SettingsMenuLink
                icon={<Shield size={16} />}
                iconBg="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white"
                label="Privacy & Security"
                sublabel="Password update, email, device sessions"
                onClick={() => navigate('/settings/security')}
              />
              <div className="h-px bg-white/[0.04] ml-14" />
              <SettingsMenuLink
                icon={<Mail size={16} />}
                iconBg="bg-gradient-to-br from-teal-400 to-teal-600 text-white"
                label="Recovery Email"
                sublabel={profile?.email || 'Set a recovery email for your account'}
                onClick={() => navigate('/settings/recovery-email')}
              />
            </div>

            {/* Sign Out */}
            <div className="bg-[#101010] rounded-2xl overflow-hidden border border-white/[0.04]">
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                }}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-red-950/20 transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[8px] bg-red-600/20 text-red-400 flex items-center justify-center shrink-0">
                    <LogOut size={15} />
                  </div>
                  <span className="text-sm font-medium text-red-400 group-hover:text-red-300">
                    Sign Out
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-Components ─────────────────────────────────────────────────────────────

interface NotificationToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function NotificationToggleRow({ title, description, checked, onChange }: NotificationToggleRowProps) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
      <div className="min-w-0 flex-1 pr-3">
        <p className="text-xs font-medium text-paper">{title}</p>
        <p className="text-[11px] text-muted mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
          checked ? 'bg-gold' : 'bg-white/10'
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-ink transition-transform absolute top-1 ${
            checked ? 'translate-x-6' : 'translate-x-1 bg-white/70'
          }`}
        />
      </button>
    </div>
  );
}

interface SettingsMenuLinkProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sublabel: string;
  onClick: () => void;
}

function SettingsMenuLink({ icon, iconBg, label, sublabel, onClick }: SettingsMenuLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.03] transition-colors text-left group cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className={`w-8 h-8 rounded-[8px] ${iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-paper truncate">{label}</p>
          <p className="text-[11px] text-muted truncate mt-0.5">{sublabel}</p>
        </div>
      </div>
      <ChevronRight size={16} className="text-muted/60 group-hover:text-paper transition-colors shrink-0 ml-2" />
    </button>
  );
}
