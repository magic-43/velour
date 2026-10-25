import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  Lock,
  MessageCircle,
  Sparkles,
  Play,
  Flame,
  Eye,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { uploadPublicFile } from '../lib/r2';

interface CreatorSuggestion {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  category: string;
  bio: string;
  isFollowing?: boolean;
}

const DESIRE_OPTIONS = [
  {
    id: 'chat',
    label: 'Intimate Conversations',
    desc: 'Direct 1-on-1 private messaging and voice chats',
    icon: MessageCircle,
  },
  {
    id: 'editorial',
    label: 'Sensual & Editorial Art',
    desc: 'Fine-art photosets, aesthetics, and high-fashion drops',
    icon: Sparkles,
  },
  {
    id: 'video',
    label: 'Exclusive Video Drops',
    desc: 'Cinematic films, uncensored videos, and tease reels',
    icon: Play,
  },
  {
    id: 'vip',
    label: 'Custom Requests & VIP Access',
    desc: 'Bespoke private media created uniquely for you',
    icon: Flame,
  },
  {
    id: 'moments',
    label: 'Late-Night Live Moments',
    desc: 'Raw, unscripted 24-hour stories from top creators',
    icon: Eye,
  },
  {
    id: 'vaults',
    label: 'Locked Vaults & Media',
    desc: 'One-tap unlockable private galleries and secrets',
    icon: Lock,
  },
];

const PRESET_CRESTS = [
  { id: 'gold', label: 'Gold Crest', bg: 'from-[#2e2617] via-[#1a150c] to-[#070707]', border: 'border-gold/60', text: 'text-gold' },
  { id: 'wine', label: 'Velvet Wine', bg: 'from-[#33111b] via-[#1a080d] to-[#070707]', border: 'border-rose-500/60', text: 'text-rose-300' },
  { id: 'noir', label: 'Obsidian Noir', bg: 'from-[#222226] via-[#121214] to-[#070707]', border: 'border-white/40', text: 'text-paper' },
  { id: 'amber', label: 'Candlelight Amber', bg: 'from-[#3d240d] via-[#1f1206] to-[#070707]', border: 'border-amber-500/60', text: 'text-amber-300' },
];

// Fallback creators if database is fresh or offline
const FALLBACK_CREATORS: CreatorSuggestion[] = [
  {
    id: 'fallback-1',
    name: 'Elena Rostova',
    handle: '@elena.velour',
    avatar: '/images/1.jpeg',
    category: 'Sensual Editorial',
    bio: 'Private photography, bespoke audio notes & uncensored moments.',
  },
  {
    id: 'fallback-2',
    name: 'Valeria Vance',
    handle: '@valeria.intime',
    avatar: '/images/2.jpeg',
    category: 'Cinema & Tease',
    bio: 'Late night confessions, private drops and VIP custom requests.',
  },
  {
    id: 'fallback-3',
    name: 'Camille Noir',
    handle: '@camille.noir',
    avatar: '/images/3.jpeg',
    category: 'Haute Seduction',
    bio: 'Fine art nude, direct whispers and unscripted daily stories.',
  },
];

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // Multi-step progress (1: Persona, 2: Desires, 3: Circle)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Persona
  const [displayName, setDisplayName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>('gold');

  // Step 2: Desires
  const [selectedDesires, setSelectedDesires] = useState<string[]>([
    'chat',
    'editorial',
    'moments',
  ]);

  // Step 3: Circle (Suggested creators)
  const [creators, setCreators] = useState<CreatorSuggestion[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loadingCreators, setLoadingCreators] = useState(false);

  // Submission state
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyToRedirect, setReadyToRedirect] = useState(false);

  // If already finished onboarding, redirect straight home
  useEffect(() => {
    if (user?.user_metadata?.onboarding_completed) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Watch for auth state to commit updated metadata before redirecting
  useEffect(() => {
    if (!readyToRedirect) return;
    const confirmed =
      user?.user_metadata?.onboarding_completed === true ||
      Boolean(profile?.display_name);

    if (confirmed) {
      navigate('/', { replace: true });
    }
  }, [readyToRedirect, user, profile, navigate]);

  // Load creator suggestions for Step 3
  useEffect(() => {
    const fetchTopCreators = async () => {
      setLoadingCreators(true);
      try {
        const { data, error: fetchErr } = await supabase
          .from('creator_profiles')
          .select('id, display_name, avatar_url, bio, category, owner:profiles!owner_id(id, username)')
          .eq('is_active', true)
          .limit(4);

        if (!fetchErr && data && data.length > 0) {
          const mapped: CreatorSuggestion[] = data.map((c: any) => ({
            id: c.id,
            name: c.display_name || 'Creator',
            handle: c.owner?.username ? `@${c.owner.username}` : '@velour',
            avatar: c.avatar_url || null,
            category: c.category || 'Featured Creator',
            bio: c.bio || 'Exclusive stories, direct messages & private drops.',
          }));
          setCreators(mapped);
        } else {
          setCreators(FALLBACK_CREATORS);
        }
      } catch {
        setCreators(FALLBACK_CREATORS);
      } finally {
        setLoadingCreators(false);
      }
    };

    fetchTopCreators();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setSelectedPreset(null);
    setError(null);
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    setAvatarFile(null);
    setAvatarPreview(null);
    setError(null);
  };

  const toggleDesire = (id: string) => {
    setSelectedDesires((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleFollow = async (creatorId: string) => {
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) {
        next.delete(creatorId);
      } else {
        next.add(creatorId);
      }
      return next;
    });

    if (user?.id && !creatorId.startsWith('fallback-')) {
      try {
        if (followedIds.has(creatorId)) {
          await supabase
            .from('follows')
            .delete()
            .eq('fan_id', user.id)
            .eq('creator_profile_id', creatorId);
        } else {
          await supabase
            .from('follows')
            .upsert(
              { fan_id: user.id, creator_profile_id: creatorId },
              { onConflict: 'fan_id,creator_profile_id' }
            );
        }
      } catch (err) {
        console.warn('Optimistic follow toggle in onboarding:', err);
      }
    }
  };

  const handleStep1Submit = () => {
    if (!displayName.trim()) {
      setError('Please choose your private display alias to continue.');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleStep2Submit = () => {
    setError(null);
    setStep(3);
  };

  const handleFinalFinish = async () => {
    if (!user) return;
    setUploading(true);
    setError(null);

    let finalAvatarUrl = avatarPreview;

    // Upload custom avatar if file provided
    if (avatarFile) {
      try {
        const ext = avatarFile.name.split('.').pop();
        const key = `avatars/${user.id}/avatar.${ext}`;
        finalAvatarUrl = await uploadPublicFile(avatarFile, key);
      } catch (err) {
        console.warn('Avatar upload failed, continuing with default:', err);
      }
    }

    // Save Profile
    const upsertData: Record<string, any> = {
      id: user.id,
      display_name: displayName.trim(),
      username: user.user_metadata?.username ?? '',
    };
    if (finalAvatarUrl) {
      upsertData.avatar_url = finalAvatarUrl;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(upsertData, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile upsert error:', profileError);
      setError(`Failed to save profile: ${profileError.message}`);
      setUploading(false);
      return;
    }

    // Persist desires and mark onboarding complete in Auth metadata
    await supabase.auth.updateUser({
      data: {
        onboarding_completed: true,
        desires: selectedDesires,
        avatar_preset: selectedPreset,
      },
    });

    // Save preferences locally
    try {
      localStorage.setItem(`velour_fan_desires_${user.id}`, JSON.stringify(selectedDesires));
      // Flag to automatically trigger the House Guide story tour on Home!
      localStorage.setItem('velour_house_guide_auto_open', 'true');
    } catch (_) {}

    await refreshProfile();
    setReadyToRedirect(true);
    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-[#070707] text-paper flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Seductive Ambient Backlight Ambiance */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(201,169,110,0.12)_0%,rgba(136,19,55,0.14)_45%,transparent_75%)] blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Header Monogram & Step Indicator */}
        <div className="text-center mb-6">
          <div className="inline-block font-serif tracking-[0.28em] text-xs font-light text-gold/90 uppercase mb-2">
            VELOUR · HOUSE OF DESIRE
          </div>
          <h1 className="font-serif text-3xl font-light text-paper tracking-wide">
            {step === 1 && 'Your Private Persona'}
            {step === 2 && 'Curate Your Desires'}
            {step === 3 && 'Your Initial Circle'}
          </h1>
          <p className="text-muted text-xs mt-1">
            {step === 1 && 'Establish your confidential identity inside the House.'}
            {step === 2 && 'Select the experiences and aesthetics you wish to explore.'}
            {step === 3 && 'Follow creators to ignite your private feed.'}
          </p>

          {/* Luxury 3-Step Progress Dots */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-8 bg-gradient-to-r from-gold to-gold-light'
                    : s < step
                    ? 'w-4 bg-gold/50'
                    : 'w-4 bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Modal Container */}
        <div className="bg-[#0e0d0c]/90 border border-gold/20 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
          {/* Subtle Top Gold Highlight */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

          {/* ─────────────────────────────────────────────────────────────────
              STEP 1: PERSONA & DISCRETION
          ───────────────────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Avatar Selector (Custom or Monogram Crest) */}
              <div className="flex flex-col items-center">
                <div className="relative mb-3">
                  <label className="cursor-pointer group block">
                    <div className="w-24 h-24 rounded-full border-2 border-gold/40 p-[2px] shadow-lg bg-ink group-hover:border-gold transition-colors overflow-hidden flex items-center justify-center">
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt="Avatar"
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : selectedPreset ? (
                        <div
                          className={`w-full h-full rounded-full bg-gradient-to-br ${
                            PRESET_CRESTS.find((p) => p.id === selectedPreset)?.bg
                          } flex items-center justify-center font-serif text-2xl font-bold ${
                            PRESET_CRESTS.find((p) => p.id === selectedPreset)?.text
                          }`}
                        >
                          {displayName.trim() ? displayName.trim().charAt(0).toUpperCase() : 'V'}
                        </div>
                      ) : (
                        <Camera size={26} className="text-muted group-hover:text-gold transition-colors" />
                      )}
                    </div>
                    <div className="absolute bottom-0 right-0 w-7 h-7 bg-gold text-ink rounded-full flex items-center justify-center shadow-md">
                      <Camera size={14} />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleAvatarChange}
                    />
                  </label>
                </div>

                {/* Preset Monogram Badges for Absolute Anonymity */}
                <div className="text-center">
                  <p className="text-[11px] text-muted mb-2">Or choose a discreet monogram crest:</p>
                  <div className="flex items-center justify-center gap-2.5">
                    {PRESET_CRESTS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset.id)}
                        className={`w-8 h-8 rounded-full bg-gradient-to-br ${preset.bg} border ${
                          preset.border
                        } flex items-center justify-center font-serif text-xs font-bold ${
                          preset.text
                        } cursor-pointer transition-transform ${
                          selectedPreset === preset.id && !avatarPreview
                            ? 'scale-110 ring-2 ring-gold/80'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                        title={preset.label}
                      >
                        V
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Display Alias Input */}
              <div>
                <label className="block text-[11px] tracking-wider uppercase text-gold/90 font-medium mb-1.5">
                  Private Display Alias <span className="text-gold">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. Julian, Alexandre, Nightfall"
                  maxLength={40}
                  className="w-full bg-[#141312] border border-white/10 rounded-xl px-4 py-3 text-paper placeholder-muted/40 focus:outline-none focus:border-gold/60 transition-colors text-sm"
                />
                <p className="text-[11px] text-muted mt-1.5">
                  This alias is visible in private chats and comments. You can alter it anytime.
                </p>
              </div>

              {/* Discretion & Privacy Reassurance Card */}
              <div className="p-3.5 rounded-2xl bg-[#14120e] border border-gold/20 flex items-start gap-3">
                <ShieldCheck size={18} className="text-gold shrink-0 mt-0.5" />
                <div className="text-[11px] text-paper/85 leading-snug">
                  <p className="font-semibold text-gold">Absolute Discretion Assured</p>
                  <p className="text-muted mt-0.5">
                    Your real email, name, and bank records are strictly guarded and never disclosed.
                  </p>
                </div>
              </div>

              {error && (
                <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/50 rounded-xl px-3.5 py-2.5">
                  {error}
                </p>
              )}

              {/* Next Button */}
              <button
                type="button"
                onClick={handleStep1Submit}
                disabled={!displayName.trim()}
                className="w-full py-3.5 px-6 rounded-full bg-gradient-to-r from-[#faeed7] via-[#c9a96e] to-[#9e7638] text-ink font-semibold text-xs tracking-wider uppercase shadow-[0_4px_24px_rgba(201,169,110,0.25)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <span>Continue to Desires</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 2: TASTE & DESIRES CURATION
          ───────────────────────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <p className="text-xs text-muted leading-relaxed">
                Choose the experiences that stir your curiosity. We tailor your personal recommendations based on your selections.
              </p>

              {/* Grid of Desires */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DESIRE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = selectedDesires.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleDesire(opt.id)}
                      className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                        selected
                          ? 'bg-gradient-to-br from-[#1c1810] to-[#120f09] border-gold/70 shadow-[0_0_20px_rgba(201,169,110,0.15)]'
                          : 'bg-[#121110] border-white/[0.06] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            selected ? 'bg-gold text-ink' : 'bg-white/5 text-muted'
                          }`}
                        >
                          <Icon size={15} />
                        </div>
                        {selected && (
                          <div className="w-5 h-5 rounded-full bg-gold/20 text-gold flex items-center justify-center">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className={`text-xs font-semibold ${selected ? 'text-paper' : 'text-paper/80'}`}>
                          {opt.label}
                        </p>
                        <p className="text-[10px] text-muted leading-tight mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Navigation Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-full border border-white/10 hover:border-white/20 text-muted hover:text-paper text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleStep2Submit}
                  className="flex-1 py-3.5 px-6 rounded-full bg-gradient-to-r from-[#faeed7] via-[#c9a96e] to-[#9e7638] text-ink font-semibold text-xs tracking-wider uppercase shadow-[0_4px_24px_rgba(201,169,110,0.25)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Continue to Circle</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 3: INITIAL CIRCLE (CREATOR FOLLOWS)
          ───────────────────────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <p className="text-xs text-muted leading-relaxed">
                Connect with our premier verified creators. Following them populates your home stories and unlocks private message access.
              </p>

              {/* Creator Cards List */}
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {loadingCreators ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  creators.map((c) => {
                    const isFollowed = followedIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className="p-3 rounded-2xl bg-[#131210] border border-white/[0.06] flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Avatar */}
                          <div className="relative w-11 h-11 rounded-full border border-gold/40 p-[1.5px] bg-ink shrink-0 overflow-hidden">
                            {c.avatar ? (
                              <img src={c.avatar} alt={c.name} className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <div className="w-full h-full rounded-full bg-gold/15 text-gold font-serif font-bold text-sm flex items-center justify-center">
                                {c.name.charAt(0)}
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold text-paper truncate">{c.name}</p>
                              <span className="text-[10px] text-gold/80 bg-gold/10 px-1.5 py-0.2 rounded-full font-medium shrink-0">
                                {c.category}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted truncate">{c.bio}</p>
                          </div>
                        </div>

                        {/* Follow Button */}
                        <button
                          type="button"
                          onClick={() => toggleFollow(c.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                            isFollowed
                              ? 'bg-gold/15 text-gold border border-gold/40'
                              : 'bg-gold text-ink font-semibold hover:bg-gold-light'
                          }`}
                        >
                          {isFollowed ? (
                            <>
                              <UserCheck size={13} />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <UserPlus size={13} />
                              <span>Follow</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {error && (
                <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/50 rounded-xl px-3.5 py-2.5">
                  {error}
                </p>
              )}

              {/* Complete Onboarding Button */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={uploading}
                  className="px-4 py-3 rounded-full border border-white/10 hover:border-white/20 text-muted hover:text-paper text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinalFinish}
                  disabled={uploading}
                  className="flex-1 py-3.5 px-6 rounded-full bg-gradient-to-r from-[#faeed7] via-[#c9a96e] to-[#9e7638] text-ink font-semibold text-xs tracking-wider uppercase shadow-[0_4px_24px_rgba(201,169,110,0.25)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {uploading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                      <span>Entering the House...</span>
                    </>
                  ) : (
                    <>
                      <span>Enter the House</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
