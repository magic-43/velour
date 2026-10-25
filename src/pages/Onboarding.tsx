import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  ArrowRight,
  ArrowLeft,
  Check,
  UserCheck,
  UserPlus,
  Lock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { uploadPublicFile } from '../lib/r2';
import { useBackHandler } from '../lib/backButtonRegistry';
import { triggerHaptic } from '../lib/haptics';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreatorSuggestion {
  id: string;
  name: string;
  avatar: string | null;
  category: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const DESIRE_OPTIONS = [
  { id: 'chat',     label: 'Intimate Chat' },
  { id: 'editorial',label: 'Editorial Art' },
  { id: 'video',    label: 'Cinematic Drops' },
  { id: 'vip',      label: 'Custom VIP' },
  { id: 'moments',  label: 'Daily Stories' },
  { id: 'vaults',   label: 'Locked Vaults' },
];

const FALLBACK_CREATORS: CreatorSuggestion[] = [
  { id: 'fallback-1', name: 'Elena Rostova',  avatar: '/images/1.jpeg', category: 'Editorial' },
  { id: 'fallback-2', name: 'Valeria Vance',  avatar: '/images/2.jpeg', category: 'Cinema' },
  { id: 'fallback-3', name: 'Camille Noir',   avatar: '/images/3.jpeg', category: 'Seduction' },
];

// ─── Step titles / subtitles ──────────────────────────────────────────────────

const STEPS = [
  {
    title:    'Your Alias',
    subtitle: 'Choose a private name for your identity inside the House.',
  },
  {
    title:    'Your Desires',
    subtitle: 'Select what you want to explore. You can change this anytime.',
  },
  {
    title:    'Who to Follow',
    subtitle: 'Start your circle. Follow at least one creator to ignite your feed.',
  },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<0 | 1 | 2>(0); // 0-indexed: 0=alias 1=desires 2=circle

  // Step 0
  const [displayName, setDisplayName]   = useState('');
  const [avatarFile, setAvatarFile]     = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Step 1 — nothing pre-selected
  const [selectedDesires, setSelectedDesires] = useState<string[]>([]);

  // Step 2
  const [creators, setCreators]         = useState<CreatorSuggestion[]>([]);
  const [followedIds, setFollowedIds]   = useState<Set<string>>(new Set());
  const [loadingCreators, setLoadingCreators] = useState(false);

  const [uploading, setUploading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [readyToRedirect, setReadyToRedirect] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Guards ──────────────────────────────────────────────────────────────────

  // Redirect if already onboarded
  useEffect(() => {
    if (user?.user_metadata?.onboarding_completed) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Redirect after completion
  useEffect(() => {
    if (!readyToRedirect) return;
    if (user?.user_metadata?.onboarding_completed === true || Boolean(profile?.display_name)) {
      navigate('/', { replace: true });
    }
  }, [readyToRedirect, user, profile, navigate]);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setLoadingCreators(true);
      try {
        const { data, error: e } = await supabase
          .from('creator_profiles')
          .select('id, display_name, avatar_url, category')
          .eq('is_active', true)
          .limit(4);

        if (!e && data && data.length > 0) {
          setCreators(
            data.map((c: any) => ({
              id:       c.id,
              name:     c.display_name || 'Creator',
              avatar:   c.avatar_url || null,
              category: c.category || 'Featured',
            }))
          );
        } else {
          setCreators(FALLBACK_CREATORS);
        }
      } catch {
        setCreators(FALLBACK_CREATORS);
      } finally {
        setLoadingCreators(false);
      }
    })();
  }, []);

  // ── Android back ────────────────────────────────────────────────────────────

  useBackHandler(() => {
    if (step > 0) { setStep((s) => (s - 1) as 0 | 1 | 2); return true; }
    return false;
  }, step > 0, 100);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError(null);
    triggerHaptic('light');
  };

  const toggleDesire = (id: string) => {
    triggerHaptic('selection');
    setSelectedDesires((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleFollow = async (creatorId: string) => {
    triggerHaptic('light');
    setFollowedIds((prev) => {
      const next = new Set(prev);
      next.has(creatorId) ? next.delete(creatorId) : next.add(creatorId);
      return next;
    });

    if (user?.id && !creatorId.startsWith('fallback-')) {
      try {
        if (followedIds.has(creatorId)) {
          await supabase.from('follows').delete()
            .eq('fan_id', user.id).eq('creator_profile_id', creatorId);
        } else {
          await supabase.from('follows').upsert(
            { fan_id: user.id, creator_profile_id: creatorId },
            { onConflict: 'fan_id,creator_profile_id' }
          );
        }
      } catch (err) {
        console.warn('Follow toggle error:', err);
      }
    }
  };

  const goNext = () => {
    setError(null);
    if (step === 0) {
      if (!displayName.trim()) { setError('Please enter an alias to continue.'); return; }
    }
    triggerHaptic('medium');
    setStep((s) => (s + 1) as 0 | 1 | 2);
  };

  const goBack = () => {
    triggerHaptic('light');
    setStep((s) => (s - 1) as 0 | 1 | 2);
  };

  const handleFinish = async () => {
    if (!user) return;
    setUploading(true);
    setError(null);
    triggerHaptic('medium');

    let finalAvatarUrl = avatarPreview;
    if (avatarFile) {
      try {
        const ext = avatarFile.name.split('.').pop();
        finalAvatarUrl = await uploadPublicFile(avatarFile, `avatars/${user.id}/avatar.${ext}`);
      } catch (err) {
        console.warn('Avatar upload failed:', err);
      }
    }

    const upsertData: Record<string, any> = {
      id: user.id,
      display_name: displayName.trim(),
      username: user.user_metadata?.username ?? '',
    };
    if (finalAvatarUrl) upsertData.avatar_url = finalAvatarUrl;

    const { error: profileError } = await supabase
      .from('profiles').upsert(upsertData, { onConflict: 'id' });

    if (profileError) {
      setError(`Could not save profile: ${profileError.message}`);
      setUploading(false);
      return;
    }

    await supabase.auth.updateUser({
      data: { onboarding_completed: true, desires: selectedDesires },
    });

    try {
      localStorage.setItem(`velour_fan_desires_${user.id}`, JSON.stringify(selectedDesires));
      localStorage.setItem('velour_house_guide_auto_open', 'true');
    } catch (_) {}

    await refreshProfile();
    setReadyToRedirect(true);
    setUploading(false);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const stepInfo  = STEPS[step];
  const isLast    = step === 2;
  const canGoNext = step === 0 ? displayName.trim().length > 0 : true;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    /*
     * Mobile: full-screen flex column with fixed footer (no scroll on content)
     * Desktop (md+): centered card with max-width, normal document flow, scrollable if needed
     */
    <div className="min-h-screen bg-[#070707] text-paper flex flex-col md:items-center md:justify-center">

      {/* ── Ambient decoration ───────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(201,169,110,0.06)_0%,transparent_70%)]"
      />

      {/*
       * INNER WRAPPER
       * Mobile:  takes full viewport height, flex-col, no overflow
       * Desktop: a comfortable centered card with generous padding
       */}
      <div className="
        relative z-10
        flex flex-col
        w-full flex-1
        md:max-w-lg md:w-full
        md:my-10 md:rounded-2xl
        md:border md:border-white/[0.07]
        md:bg-[#0d0c0b]
        md:shadow-2xl
        /* Mobile: stretch full height */
        h-[100dvh] md:h-auto
      ">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="shrink-0 px-7 pt-10 pb-6 md:px-10 md:pt-10">
          {/* Brand */}
          <p className="text-[10px] tracking-[0.3em] uppercase font-mono text-gold/60 mb-5">
            Velour · House of Desire
          </p>

          {/* Step progress dots */}
          <div className="flex gap-1.5 mb-6">
            {[0, 1, 2].map((s) => (
              <div
                key={s}
                className={`
                  h-[1px] flex-1 rounded-full transition-all duration-300
                  ${s <= step ? 'bg-gold' : 'bg-white/10'}
                `}
              />
            ))}
          </div>

          {/* Title */}
          <h1 className="font-serif text-[28px] sm:text-3xl font-light text-paper tracking-wide leading-snug">
            {stepInfo.title}
          </h1>
          <p className="text-muted text-sm font-light mt-1.5 leading-relaxed">
            {stepInfo.subtitle}
          </p>
        </header>

        {/* ── Content (scrollable on desktop, flex-1 on mobile so footer stays pinned) ── */}
        <main className="flex-1 min-h-0 overflow-y-auto px-7 md:px-10 pb-4 md:pb-8">

          {/* ── STEP 0: Alias + optional photo ─────────────────────────── */}
          {step === 0 && (
            <div className="animate-in fade-in duration-200 space-y-7">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <label className="cursor-pointer group">
                  <div className="
                    w-[88px] h-[88px] rounded-full
                    border border-white/10 group-hover:border-gold/60
                    transition-colors overflow-hidden
                    bg-[#141312] flex items-center justify-center
                    shadow-lg
                  ">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={24} className="text-white/20 group-hover:text-gold/50 transition-colors" />
                    )}
                  </div>
                  <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
                </label>
                <p className="text-[11px] text-muted/50 font-light">
                  Optional photo
                </p>
              </div>

              {/* Alias input */}
              <div>
                <label className="block text-[11px] uppercase tracking-[0.18em] font-mono text-muted mb-2">
                  Display alias
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={displayName}
                  onChange={(e) => { setDisplayName(e.target.value); setError(null); }}
                  placeholder="e.g. Julian, Noir, Alexandre…"
                  maxLength={30}
                  autoFocus
                  className="
                    w-full bg-transparent
                    border-b border-white/15 focus:border-gold/70
                    py-2.5 text-paper text-base font-serif
                    placeholder-white/20
                    focus:outline-none transition-colors
                  "
                />
                {error && (
                  <p className="text-rose-400 text-xs mt-2">{error}</p>
                )}
              </div>

              {/* Privacy note */}
              <div className="flex items-start gap-2.5 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <Lock size={13} className="text-gold/60 mt-0.5 shrink-0" />
                <p className="text-[12px] text-muted/70 leading-relaxed font-light">
                  Your real name, email, and payment details are never shown to creators or other members.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 1: Desires ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {DESIRE_OPTIONS.map((opt) => {
                  const on = selectedDesires.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleDesire(opt.id)}
                      className={`
                        group relative flex items-center justify-between
                        px-4 py-3.5 rounded-xl text-left
                        border transition-all cursor-pointer
                        ${on
                          ? 'border-gold/50 bg-gold/[0.07] text-paper'
                          : 'border-white/[0.08] bg-transparent text-muted/80 hover:border-white/20 hover:text-paper/90'
                        }
                      `}
                    >
                      <span className={`text-sm font-light ${on ? 'text-paper' : ''}`}>
                        {opt.label}
                      </span>
                      <span className={`
                        ml-2 w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-all
                        ${on ? 'border-gold bg-gold text-ink' : 'border-white/15'}
                      `}>
                        {on && <Check size={9} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted/40 font-light mt-5">
                Nothing selected? That's fine — your feed adapts over time.
              </p>
            </div>
          )}

          {/* ── STEP 2: Follow creators ─────────────────────────────────── */}
          {step === 2 && (
            <div className="animate-in fade-in duration-200">
              {loadingCreators ? (
                <div className="flex justify-center py-10">
                  <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {creators.map((c) => {
                    const following = followedIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between py-4 gap-3"
                      >
                        {/* Avatar */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-[#141312] shrink-0">
                            {c.avatar ? (
                              <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-serif text-gold text-sm">
                                {c.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-paper font-light truncate">{c.name}</p>
                            <p className="text-[11px] text-muted/60 font-light truncate">{c.category}</p>
                          </div>
                        </div>

                        {/* Follow toggle */}
                        <button
                          type="button"
                          onClick={() => toggleFollow(c.id)}
                          className={`
                            shrink-0 px-4 py-1.5 rounded-full text-xs font-light
                            border transition-all cursor-pointer flex items-center gap-1.5
                            ${following
                              ? 'border-gold/40 text-gold bg-gold/[0.08]'
                              : 'border-white/15 text-paper/70 hover:border-gold/40 hover:text-paper'
                            }
                          `}
                        >
                          {following ? (
                            <><UserCheck size={12} /><span>Following</span></>
                          ) : (
                            <><UserPlus size={12} /><span>Follow</span></>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {error && (
                <p className="text-rose-400 text-xs mt-3 text-center">{error}</p>
              )}
            </div>
          )}

        </main>

        {/* ── Fixed footer (pinned on mobile, normal flow on desktop) ────── */}
        <footer className="
          shrink-0
          px-7 pt-4 pb-8 md:px-10 md:pb-10
          /* stick to bottom on mobile */
          sticky bottom-0
          bg-gradient-to-t from-[#070707] via-[#070707]/95 to-transparent
          md:static md:bg-transparent
        ">
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                disabled={uploading}
                className="
                  shrink-0 flex items-center gap-1.5
                  px-4 py-3 rounded-full
                  border border-white/10 hover:border-white/20
                  text-muted hover:text-paper
                  text-xs uppercase tracking-wider font-light
                  transition-colors cursor-pointer
                  disabled:opacity-40
                "
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>
            )}

            <button
              type="button"
              onClick={isLast ? handleFinish : goNext}
              disabled={uploading || (!canGoNext && !isLast)}
              className="
                flex-1 flex items-center justify-center gap-2
                py-3.5 px-6 rounded-full
                bg-gradient-to-r from-[#f5e6c8] via-[#c9a96e] to-[#9e7638]
                text-ink font-semibold text-xs tracking-[0.15em] uppercase
                shadow-md hover:brightness-110 active:scale-[0.98]
                transition-all cursor-pointer
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {uploading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                  <span>Entering…</span>
                </>
              ) : isLast ? (
                <>
                  <span>Enter the House</span>
                  <ArrowRight size={14} />
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
}
