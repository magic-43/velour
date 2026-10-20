import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  X,
  Sparkles,
  Shield,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import RecoveryModal from '../components/auth/RecoveryModal';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

interface OrbitCreator {
  id: string;
  name: string;
  angle: number; // degrees
  distRatio: number; // 0.0 to 0.5
  ringColor: string;
  glowColor: string;
  img: string;
  delay: string;
  floatType: 'a' | 'b';
}

const ORBIT_CREATORS: OrbitCreator[] = [
  {
    id: '1',
    name: 'Alhandro',
    angle: -90,
    distRatio: 0.33,
    ringColor: 'border-emerald-400',
    glowColor: 'rgba(52, 211, 153, 0.45)',
    img: 'https://ksgapugqzqxuogltsudr.supabase.co/storage/v1/object/public/avatars/031ab3f8-c103-4fb2-8621-82c0f7764a2c/avatar.jpeg',
    delay: '0s',
    floatType: 'a',
  },
  {
    id: '2',
    name: 'Sonya',
    angle: -40,
    distRatio: 0.40,
    ringColor: 'border-purple-400',
    glowColor: 'rgba(192, 132, 252, 0.45)',
    img: 'https://pub-536a7bb243d746739c63845c5bea62db.r2.dev/avatars/792110b8-86ba-403e-b0d5-428d7f3881a8/avatar.webp',
    delay: '0.9s',
    floatType: 'b',
  },
  {
    id: '3',
    name: 'Elena',
    angle: 8,
    distRatio: 0.35,
    ringColor: 'border-cyan-400',
    glowColor: 'rgba(34, 211, 238, 0.45)',
    img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    delay: '1.5s',
    floatType: 'a',
  },
  {
    id: '4',
    name: 'Lucas',
    angle: 52,
    distRatio: 0.39,
    ringColor: 'border-amber-400',
    glowColor: 'rgba(251, 191, 36, 0.45)',
    img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    delay: '0.4s',
    floatType: 'b',
  },
  {
    id: '5',
    name: 'Chloe',
    angle: 90,
    distRatio: 0.33,
    ringColor: 'border-gold',
    glowColor: 'rgba(201, 169, 110, 0.5)',
    img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    delay: '1.8s',
    floatType: 'a',
  },
  {
    id: '6',
    name: 'Daddy',
    angle: 135,
    distRatio: 0.40,
    ringColor: 'border-rose-400',
    glowColor: 'rgba(251, 113, 133, 0.45)',
    img: 'https://pub-536a7bb243d746739c63845c5bea62db.r2.dev/avatars/366a94e8-531b-4318-825e-ab0299b133bf/avatar.webp',
    delay: '1.1s',
    floatType: 'b',
  },
  {
    id: '7',
    name: 'Aria',
    angle: 175,
    distRatio: 0.35,
    ringColor: 'border-pink-400',
    glowColor: 'rgba(244, 114, 182, 0.45)',
    img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
    delay: '2.2s',
    floatType: 'a',
  },
  {
    id: '8',
    name: 'Marcus',
    angle: -140,
    distRatio: 0.39,
    ringColor: 'border-teal-400',
    glowColor: 'rgba(45, 212, 191, 0.45)',
    img: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    delay: '0.6s',
    floatType: 'b',
  },
];

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a number', ok: /\d/.test(password) },
  ];
  if (!password) return null;
  return (
    <ul className="mt-2 space-y-1">
      {checks.map(c => (
        <li
          key={c.label}
          className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-emerald-400' : 'text-muted'}`}
        >
          <CheckCircle2 size={12} className={c.ok ? 'text-emerald-400' : 'text-muted/40'} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

interface LoginProps {
  initialMode?: 'signin' | 'signup';
}

export default function Login({ initialMode = 'signin' }: LoginProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Mode state: 'signin' | 'signup'
  const [mode, setMode] = useState<'signin' | 'signup'>(() => {
    const params = new URLSearchParams(location.search);
    const m = params.get('mode') || params.get('tab');
    if (m === 'signup') return 'signup';
    if (m === 'signin') return 'signin';
    return initialMode;
  });

  // Mobile bottom sheet open state
  const [mobileSheetOpen, setMobileSheetOpen] = useState(initialMode === 'signup');

  // Common form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      const from = (location.state as { from?: string })?.from ?? '/';
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, location.state]);

  // Handle Sign In Submit
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    const email = `${trimmedUsername}@velour.internal`;

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (authError) {
      if (authError.message.includes('Invalid login credentials')) {
        setError('Incorrect username or password. Please try again.');
      } else {
        setError(authError.message);
      }
      return;
    }

    navigate('/', { replace: true });
  };

  // Handle Sign Up Submit
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = username.trim().toLowerCase();

    if (!USERNAME_REGEX.test(trimmed)) {
      setError('Username must be 3–24 characters and only contain letters, numbers, or underscores.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);

    // Check if username is already taken
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', trimmed)
      .maybeSingle();

    if (existing) {
      setError('That username is already taken. Please choose another.');
      setSubmitting(false);
      return;
    }

    // Sign up with internal email
    const internalEmail = `${trimmed}@velour.internal`;

    const { error: authError } = await supabase.auth.signUp({
      email: internalEmail,
      password,
      options: {
        data: { username: trimmed },
        emailRedirectTo: undefined,
      },
    });

    setSubmitting(false);

    if (authError) {
      if (authError.message.includes('already registered')) {
        setError('That username is already taken. Please choose another.');
      } else {
        setError(authError.message);
      }
      return;
    }

    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="h-screen bg-[#070907] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Visual Orbital Constellation Component
  const OrbitalConstellation = () => (
    <div className="relative w-[320px] h-[320px] sm:w-[380px] sm:h-[380px] md:w-[420px] md:h-[420px] lg:w-[470px] lg:h-[470px] flex items-center justify-center select-none">
      {/* Background Radial Glow & Atmosphere */}
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18)_0%,rgba(201,169,110,0.10)_40%,transparent_72%)] blur-2xl pointer-events-none" />

      {/* SVG Rays & Concentric Orbit Lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="-250 -250 500 500"
      >
        <defs>
          <radialGradient id="rayGradient" cx="0" cy="0" r="250" gradientUnits="userSpaceOnUse">
            <stop offset="12%" stopColor="#c9a96e" stopOpacity="0.38" />
            <stop offset="55%" stopColor="#10b981" stopOpacity="0.16" />
            <stop offset="95%" stopColor="#070907" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Orbit Rings */}
        <circle cx="0" cy="0" r="85" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 6" />
        <circle cx="0" cy="0" r="145" fill="none" stroke="rgba(255,255,255,0.06)" />
        <circle cx="0" cy="0" r="215" fill="none" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 8" />

        {/* 16 Radial Rays emanating from the center */}
        {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5].map(
          (angleDeg, idx) => {
            const rad = (angleDeg * Math.PI) / 180;
            const x2 = Math.cos(rad) * 250;
            const y2 = Math.sin(rad) * 250;
            return (
              <line
                key={idx}
                x1="0"
                y1="0"
                x2={x2}
                y2={y2}
                stroke="url(#rayGradient)"
                strokeWidth="1.2"
                className="animate-ray-shimmer"
                style={{ animationDelay: `${(idx * 0.3) % 2.5}s` }}
              />
            );
          }
        )}
      </svg>

      {/* Orbiting Creator Avatars */}
      {ORBIT_CREATORS.map((creator) => {
        const rad = (creator.angle * Math.PI) / 180;
        // distRatio maps to percentage of container
        const posX = Math.cos(rad) * (creator.distRatio * 100);
        const posY = Math.sin(rad) * (creator.distRatio * 100);

        return (
          <div
            key={creator.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-auto transition-transform hover:scale-115 duration-300"
            style={{
              left: `calc(50% + ${posX}%)`,
              top: `calc(50% + ${posY}%)`,
            }}
          >
            <div
              className={`${
                creator.floatType === 'a' ? 'animate-float-a' : 'animate-float-b'
              } relative group cursor-pointer`}
              style={{ animationDelay: creator.delay }}
            >
              {/* Outer Glow Ring */}
              <div
                className={`w-11 h-11 sm:w-13 sm:h-13 md:w-14 md:h-14 rounded-full border-2 ${creator.ringColor} overflow-hidden bg-black/60 shadow-lg transition-all duration-300`}
                style={{
                  boxShadow: `0 0 16px ${creator.glowColor}`,
                }}
              >
                <img
                  src={creator.img}
                  alt={creator.name}
                  className="w-full h-full object-cover select-none"
                  onError={(e) => {
                    // Fallback to stylized editorial portrait if URL fails
                    e.currentTarget.src =
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
                  }}
                />
              </div>

              {/* Creator Name Tooltip on hover */}
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 text-[10px] text-white/90 px-2 py-0.5 rounded-full pointer-events-none whitespace-nowrap border border-white/10 z-30">
                {creator.name}
              </div>
            </div>
          </div>
        );
      })}

      {/* Centerpiece: VELOUR Wordmark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none select-none text-center">
        <div className="relative">
          {/* Subtle warm halo behind brand text */}
          <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-emerald-500/25 via-gold/35 to-emerald-500/25 blur-2xl animate-core-pulse pointer-events-none" />
          <h1 className="relative font-black tracking-[-0.04em] italic text-4xl sm:text-5xl lg:text-6xl text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] select-none">
            VELOUR
          </h1>
        </div>
      </div>
    </div>
  );

  // Authentication Form UI
  const AuthForm = ({ isMobileSheet = false }: { isMobileSheet?: boolean }) => (
    <div className="w-full max-w-sm mx-auto space-y-5">
      {/* Segmented Mode Switcher */}
      <div className="bg-black/50 p-1 rounded-2xl border border-white/10 flex items-center">
        <button
          type="button"
          onClick={() => {
            setMode('signin');
            setError(null);
          }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            mode === 'signin'
              ? 'bg-white text-black shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signup');
            setError(null);
          }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            mode === 'signup'
              ? 'bg-white text-black shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Create Account
        </button>
      </div>

      {/* Header Text */}
      <div>
        <h3 className="text-xl font-bold text-white tracking-tight">
          {mode === 'signin' ? 'Welcome back' : 'Create an account'}
        </h3>
        <p className="text-xs text-muted mt-1">
          {mode === 'signin'
            ? 'Sign in to access your vault and conversations'
            : 'Join Velour for private creator moments & drops'}
        </p>
      </div>

      {/* Form Elements */}
      <form
        onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}
        className="space-y-4"
      >
        {/* Username Input */}
        <div>
          <label className="block text-[11px] font-semibold text-muted tracking-wider uppercase mb-1.5">
            Username
          </label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60 pointer-events-none text-xs font-mono">
              @
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-paper placeholder-muted/40 focus:outline-none focus:border-gold/70 transition-colors"
            />
          </div>
          {mode === 'signup' && (
            <p className="text-[10px] text-muted/70 mt-1 pl-1">
              3–24 characters (letters, numbers, underscores)
            </p>
          )}
        </div>

        {/* Password Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11px] font-semibold text-muted tracking-wider uppercase">
              Password
            </label>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="text-xs text-gold/90 hover:text-gold transition-colors font-medium cursor-pointer"
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <Lock
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60 pointer-events-none"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-11 py-3 text-sm text-paper placeholder-muted/40 focus:outline-none focus:border-gold/70 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-paper transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {mode === 'signup' && <PasswordStrength password={password} />}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2 bg-red-950/40 border border-red-500/20 rounded-xl px-3.5 py-2.5 text-xs text-red-300">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className={`w-full py-3.5 rounded-full font-bold text-sm tracking-wide transition-all shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 ${
            mode === 'signin'
              ? 'bg-gold hover:bg-gold-light text-ink shadow-gold/15 active:scale-[0.98]'
              : 'bg-white hover:bg-white/90 text-black shadow-white/10 active:scale-[0.98]'
          }`}
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>{mode === 'signin' ? 'Signing in…' : 'Creating account…'}</span>
            </>
          ) : (
            <span>{mode === 'signin' ? 'Sign in' : 'Create account'}</span>
          )}
        </button>
      </form>

      {/* Switcher Footer */}
      <p className="text-center text-xs text-muted pt-1">
        {mode === 'signin' ? (
          <>
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className="text-gold hover:underline font-semibold cursor-pointer"
            >
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className="text-gold hover:underline font-semibold cursor-pointer"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-[#070907] text-paper flex flex-col md:flex-row relative overflow-hidden">
      {/* ─────────────────────────────────────────────────────────────────────────
          LEFT COLUMN: The Orbital Constellation Showcase (Desktop 54%, Mobile Full)
      ───────────────────────────────────────────────────────────────────────── */}
      <div className="w-full md:w-[52%] lg:w-[55%] min-h-screen flex flex-col justify-between p-5 sm:p-8 lg:p-12 relative overflow-hidden md:border-r border-white/[0.06]">
        {/* Subtle Ambient Backdrops */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-950/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-amber-950/15 rounded-full blur-[140px] pointer-events-none" />

        {/* Top Header / Monogram */}
        <div className="w-full flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <span className="font-serif tracking-[0.25em] text-xs font-light text-gold uppercase">
              Velour
            </span>
            <span className="text-[10px] bg-white/5 border border-white/10 text-white/50 px-2 py-0.5 rounded-full">
              Private
            </span>
          </div>
        </div>

        {/* Center Orbital Constellation */}
        <div className="w-full flex-1 flex items-center justify-center py-6 sm:py-8 z-10">
          <OrbitalConstellation />
        </div>

        {/* Bottom Section (Mobile Landing View & Desktop Pitch) */}
        <div className="w-full z-10 pt-2 pb-4 flex flex-col items-center text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
            Welcome to Velour
          </h2>
          <p className="text-xs sm:text-sm text-white/60 mb-6 max-w-sm leading-relaxed">
            Exclusive creator moments, private drops & intimate connections.
          </p>

          {/* MOBILE ONLY: The exact buttons from the mockup */}
          <div className="w-full max-w-xs space-y-3 md:hidden">
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setMobileSheetOpen(true);
              }}
              className="w-full py-4 rounded-full bg-white hover:bg-white/95 text-black font-bold text-sm tracking-wide shadow-xl shadow-white/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
            >
              Create an account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setMobileSheetOpen(true);
              }}
              className="w-full py-4 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold text-sm tracking-wide border border-white/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
            >
              Sign in
            </button>
          </div>

          {/* DESKTOP ONLY: Trust & Security Chips */}
          <div className="hidden md:flex items-center justify-center gap-3 pt-2 text-xs text-white/50">
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/5 px-3 py-1 rounded-full">
              <Sparkles size={13} className="text-gold" />
              <span>Verified Creators</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/5 px-3 py-1 rounded-full">
              <Shield size={13} className="text-emerald-400" />
              <span>100% Encrypted</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/5 px-3 py-1 rounded-full">
              <Zap size={13} className="text-cyan-400" />
              <span>Instant Access</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          RIGHT COLUMN: Desktop Form Panel (Hidden on Mobile)
      ───────────────────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex md:w-[48%] lg:w-[45%] min-h-screen items-center justify-center p-8 lg:p-14 bg-[#090c0a]/90 relative">
        <div className="w-full max-w-sm">
          <AuthForm />
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          MOBILE SLIDE-UP SHEET: Renders when clicking "Create an account" or "Sign in"
      ───────────────────────────────────────────────────────────────────────── */}
      {mobileSheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
            onClick={() => setMobileSheetOpen(false)}
          />

          {/* Sheet Modal */}
          <div className="relative bg-[#0d100d] border-t border-white/10 rounded-t-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            {/* Top Bar with Dismiss and Drag Handle */}
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="p-1.5 -ml-1 text-white/70 hover:text-white rounded-lg cursor-pointer"
              >
                <ArrowLeft size={18} />
              </button>
              <span className="text-xs uppercase tracking-wider text-muted font-medium">
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </span>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="p-1.5 -mr-1 text-white/70 hover:text-white rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Auth Form inside Sheet */}
            <AuthForm isMobileSheet={true} />
          </div>
        </div>
      )}

      {/* Recovery Modal */}
      <RecoveryModal
        isOpen={showRecovery}
        onClose={() => setShowRecovery(false)}
        onSuccessLogin={() => navigate('/', { replace: true })}
      />
    </div>
  );
}
