import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  ArrowRight,
  ArrowLeft,
  Check,
  Lock,
  UserCheck,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { uploadPublicFile } from '../lib/r2';
import { useBackHandler } from '../lib/backButtonRegistry';
import { triggerHaptic } from '../lib/haptics';

interface CreatorSuggestion {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  category: string;
}

const DESIRE_PILLS = [
  { id: 'chat', label: 'Intimate Chat' },
  { id: 'editorial', label: 'Editorial Art' },
  { id: 'video', label: 'Cinematic Drops' },
  { id: 'vip', label: 'Custom VIP' },
  { id: 'moments', label: 'Daily Stories' },
  { id: 'vaults', label: 'Locked Vaults' },
];

const PRESET_CRESTS = [
  { id: 'gold', label: 'Gold', bg: 'bg-[#2a2315]', text: 'text-gold', border: 'border-gold/60' },
  { id: 'wine', label: 'Wine', bg: 'bg-[#2b0d16]', text: 'text-rose-300', border: 'border-rose-400/60' },
  { id: 'noir', label: 'Noir', bg: 'bg-[#18181b]', text: 'text-paper', border: 'border-white/40' },
  { id: 'amber', label: 'Amber', bg: 'bg-[#2e1b0b]', text: 'text-amber-300', border: 'border-amber-400/60' },
];

const FALLBACK_CREATORS: CreatorSuggestion[] = [
  {
    id: 'fallback-1',
    name: 'Elena Rostova',
    handle: '@elena.velour',
    avatar: '/images/1.jpeg',
    category: 'Editorial',
  },
  {
    id: 'fallback-2',
    name: 'Valeria Vance',
    handle: '@valeria.intime',
    avatar: '/images/2.jpeg',
    category: 'Cinema & Drops',
  },
  {
    id: 'fallback-3',
    name: 'Camille Noir',
    handle: '@camille.noir',
    avatar: '/images/3.jpeg',
    category: 'Haute Seduction',
  },
];

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // 1: Persona, 2: Desires, 3: Circle
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

  // Step 3: Circle
  const [creators, setCreators] = useState<CreatorSuggestion[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loadingCreators, setLoadingCreators] = useState(false);

  // Status
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyToRedirect, setReadyToRedirect] = useState(false);

  // Hardware Back Button on Android
  useBackHandler(() => {
    if (step === 3) {
      setStep(2);
      return true;
    }
    if (step === 2) {
      setStep(1);
      return true;
    }
    return false;
  }, step > 1, 100);

  // Redirect if already onboarded
  useEffect(() => {
    if (user?.user_metadata?.onboarding_completed) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Redirect after completion sync
  useEffect(() => {
    if (!readyToRedirect) return;
    const confirmed =
      user?.user_metadata?.onboarding_completed === true ||
      Boolean(profile?.display_name);

    if (confirmed) {
      navigate('/', { replace: true });
    }
  }, [readyToRedirect, user, profile, navigate]);

  // Fetch verified creators for Step 3
  useEffect(() => {
    const fetchTopCreators = async () => {
      setLoadingCreators(true);
      try {
        const { data, error: fetchErr } = await supabase
          .from('creator_profiles')
          .select('id, display_name, avatar_url, category, owner:profiles!owner_id(username)')
          .eq('is_active', true)
          .limit(3);

        if (!fetchErr && data && data.length > 0) {
          const mapped: CreatorSuggestion[] = data.map((c: any) => ({
            id: c.id,
            name: c.display_name || 'Creator',
            handle: c.owner?.username ? `@${c.owner.username}` : '@velour',
            avatar: c.avatar_url || null,
            category: c.category || 'Featured Creator',
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
    triggerHaptic('light');
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    setAvatarFile(null);
    setAvatarPreview(null);
    setError(null);
    triggerHaptic('selection');
  };

  const toggleDesire = (id: string) => {
    triggerHaptic('selection');
    setSelectedDesires((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleFollow = async (creatorId: string) => {
    triggerHaptic('light');
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
      setError('Please choose a private alias.');
      return;
    }
    setError(null);
    triggerHaptic('medium');
    setStep(2);
  };

  const handleStep2Submit = () => {
    setError(null);
    triggerHaptic('medium');
    setStep(3);
  };

  const handleFinalFinish = async () => {
    if (!user) return;
    setUploading(true);
    setError(null);
    triggerHaptic('medium');

    let finalAvatarUrl = avatarPreview;

    if (avatarFile) {
      try {
        const ext = avatarFile.name.split('.').pop();
        const key = `avatars/${user.id}/avatar.${ext}`;
        finalAvatarUrl = await uploadPublicFile(avatarFile, key);
      } catch (err) {
        console.warn('Avatar upload failed, continuing with default:', err);
      }
    }

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

    await supabase.auth.updateUser({
      data: {
        onboarding_completed: true,
        desires: selectedDesires,
        avatar_preset: selectedPreset,
      },
    });

    try {
      localStorage.setItem(`velour_fan_desires_${user.id}`, JSON.stringify(selectedDesires));
      localStorage.setItem('velour_house_guide_auto_open', 'true');
    } catch (_) {}

    await refreshProfile();
    setReadyToRedirect(true);
    setUploading(false);
  };

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-[#070707] text-paper flex flex-col justify-between overflow-hidden select-none relative">
      {/* Discreet Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-gold/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* ── TOP ZONE: Brand & Progress ────────────────────────────────────── */}
      <header className="shrink-0 pt-5 sm:pt-7 px-6 max-w-md mx-auto w-full z-10">
        <div className="flex items-center justify-between text-[11px] font-mono tracking-widest text-muted/60 mb-2.5">
          <span className="tracking-[0.28em] uppercase text-gold/80 font-serif text-xs">Velour</span>
          <span>0{step} / 03</span>
        </div>

        {/* Hairline 3-Step Progress Indicator */}
        <div className="flex gap-1.5 w-full mb-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-[1.5px] flex-1 rounded-full transition-all duration-300 ${
                s <= step ? 'bg-gold' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <h1 className="font-serif text-2xl sm:text-3xl font-light text-paper tracking-wide">
          {step === 1 && 'Private Persona'}
          {step === 2 && 'Curate Desires'}
          {step === 3 && 'Initial Circle'}
        </h1>
        <p className="text-muted text-xs font-light mt-0.5">
          {step === 1 && 'Establish your confidential moniker inside the House.'}
          {step === 2 && 'Select the experiences you wish to explore.'}
          {step === 3 && 'Follow creators to awaken your personal feed.'}
        </p>
      </header>

      {/* ── CENTER ZONE: Minimal Content (Zero-Scroll Guaranteed) ─────────── */}
      <main className="flex-1 min-h-0 flex flex-col justify-center px-6 max-w-md mx-auto w-full z-10">
        {/* ── STEP 1: PERSONA ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
            {/* Avatar Crest / Photo */}
            <div className="relative mb-3">
              <label className="cursor-pointer group block">
                <div className="w-20 h-20 rounded-full border border-gold/40 p-[2px] bg-ink group-hover:border-gold transition-colors overflow-hidden flex items-center justify-center shadow-lg">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : selectedPreset ? (
                    <div
                      className={`w-full h-full rounded-full ${
                        PRESET_CRESTS.find((p) => p.id === selectedPreset)?.bg
                      } flex items-center justify-center font-serif text-2xl font-light ${
                        PRESET_CRESTS.find((p) => p.id === selectedPreset)?.text
                      }`}
                    >
                      {displayName.trim() ? displayName.trim().charAt(0).toUpperCase() : 'V'}
                    </div>
                  ) : (
                    <Camera size={22} className="text-muted group-hover:text-gold transition-colors" />
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gold text-ink rounded-full flex items-center justify-center shadow-md">
                  <Camera size={12} />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>

            {/* Monogram Crest Swatches */}
            <div className="flex items-center justify-center gap-3 mb-6">
              {PRESET_CRESTS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`w-6 h-6 rounded-full ${preset.bg} border ${preset.border} flex items-center justify-center font-serif text-[10px] font-medium ${preset.text} cursor-pointer transition-transform ${
                    selectedPreset === preset.id && !avatarPreview
                      ? 'scale-125 ring-1 ring-gold ring-offset-2 ring-offset-black'
                      : 'opacity-50 hover:opacity-100'
                  }`}
                  title={preset.label}
                >
                  V
                </button>
              ))}
            </div>

            {/* Display Alias Underline Input */}
            <div className="w-full mb-4">
              <label className="block text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-1.5">
                Private Display Alias
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setError(null);
                }}
                placeholder="Choose an alias..."
                maxLength={30}
                autoFocus
                className="w-full bg-transparent border-b border-white/20 focus:border-gold py-2 text-paper placeholder-muted/30 focus:outline-none transition-colors text-base font-serif"
              />
            </div>

            {/* Quiet Discretion Whisper */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted/70 font-light">
              <Lock size={11} className="text-gold/70 shrink-0" />
              <span>100% confidential. Your legal name is never visible.</span>
            </div>

            {error && (
              <p className="text-xs text-rose-300 mt-3 font-light">
                {error}
              </p>
            )}
          </div>
        )}

        {/* ── STEP 2: DESIRES ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="w-full animate-in fade-in duration-200">
            {/* Minimal Chip Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {DESIRE_PILLS.map((opt) => {
                const selected = selectedDesires.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleDesire(opt.id)}
                    className={`h-14 px-3.5 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-gold/60 bg-gold/[0.08] text-paper shadow-sm'
                        : 'border-white/[0.08] bg-white/[0.02] text-muted hover:text-paper/90 hover:border-white/20'
                    }`}
                  >
                    <span className={`text-xs tracking-wide ${selected ? 'font-medium text-paper' : 'font-light'}`}>
                      {opt.label}
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        selected
                          ? 'border-gold bg-gold text-ink'
                          : 'border-white/20 text-transparent'
                      }`}
                    >
                      <Check size={10} strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-muted/60 text-center mt-4 font-light">
              Tap to curate or refine anytime in your profile.
            </p>
          </div>
        )}

        {/* ── STEP 3: CIRCLE ──────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="w-full animate-in fade-in duration-200">
            <div className="space-y-2.5">
              {loadingCreators ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                creators.map((c) => {
                  const isFollowed = followedIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className="py-2.5 flex items-center justify-between gap-3 border-b border-white/[0.06] last:border-b-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full border border-gold/40 p-[1.5px] bg-ink shrink-0 overflow-hidden">
                          {c.avatar ? (
                            <img src={c.avatar} alt={c.name} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <div className="w-full h-full rounded-full bg-gold/15 text-gold font-serif font-bold text-xs flex items-center justify-center">
                              {c.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-paper truncate">{c.name}</p>
                          <p className="text-[11px] text-muted/80 truncate font-light">{c.category}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleFollow(c.id)}
                        className={`px-3 py-1.5 rounded-full text-[11px] tracking-wider uppercase transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                          isFollowed
                            ? 'border border-gold/50 text-gold bg-gold/10 font-medium'
                            : 'border border-white/20 text-paper/90 hover:border-gold/50 font-light'
                        }`}
                      >
                        {isFollowed ? (
                          <>
                            <UserCheck size={12} />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={12} />
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
              <p className="text-xs text-rose-300 mt-2 font-light text-center">
                {error}
              </p>
            )}
          </div>
        )}
      </main>

      {/* ── FIXED BOTTOM ZONE: Continue / Back Controls ───────────────────── */}
      <footer className="shrink-0 p-5 sm:p-6 pb-8 md:pb-6 max-w-md mx-auto w-full z-20">
        <div className="flex items-center gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setStep((prev) => (prev === 3 ? 2 : 1));
              }}
              disabled={uploading}
              className="px-4 py-3 rounded-full border border-white/10 hover:border-white/25 text-muted hover:text-paper text-xs uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-40"
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </button>
          )}

          {step === 1 && (
            <button
              type="button"
              onClick={handleStep1Submit}
              disabled={!displayName.trim()}
              className="w-full py-3.5 px-6 rounded-full bg-gradient-to-r from-[#faeed7] via-[#c9a96e] to-[#9e7638] text-ink font-semibold text-xs tracking-[0.18em] uppercase shadow-md hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <span>Continue</span>
              <ArrowRight size={15} />
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              onClick={handleStep2Submit}
              className="flex-1 py-3.5 px-6 rounded-full bg-gradient-to-r from-[#faeed7] via-[#c9a96e] to-[#9e7638] text-ink font-semibold text-xs tracking-[0.18em] uppercase shadow-md hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Continue</span>
              <ArrowRight size={15} />
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={handleFinalFinish}
              disabled={uploading}
              className="flex-1 py-3.5 px-6 rounded-full bg-gradient-to-r from-[#faeed7] via-[#c9a96e] to-[#9e7638] text-ink font-semibold text-xs tracking-[0.18em] uppercase shadow-md hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {uploading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                  <span>Entering House...</span>
                </>
              ) : (
                <>
                  <span>Enter the House</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
