import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import RecoveryModal from '../components/auth/RecoveryModal';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

// Curated sensual, editorial portraits capturing intimate moody lighting & velvet aesthetics
const EDITORIAL_VIGNETTES = [
  {
    id: '1',
    title: 'Lady Sonya',
    img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
    rotation: '-rotate-3 sm:-rotate-6',
    translate: '-translate-x-6 sm:-translate-x-12 translate-y-3 sm:translate-y-4',
    zIndex: 10,
    aspect: 'aspect-[3/4]',
    scale: 'scale-90 sm:scale-95',
    floatClass: 'animate-float-a',
    delay: '0s',
  },
  {
    id: '2',
    title: 'Velour Central',
    img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&auto=format&fit=crop&q=80',
    rotation: 'rotate-0',
    translate: 'translate-x-0 translate-y-0',
    zIndex: 20,
    aspect: 'aspect-[3/4.2]',
    scale: 'scale-100 sm:scale-105',
    floatClass: 'animate-float-b',
    delay: '1s',
  },
  {
    id: '3',
    title: 'Elena & Lucas',
    img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80',
    rotation: 'rotate-4 sm:rotate-6',
    translate: 'translate-x-6 sm:translate-x-12 translate-y-2 sm:translate-y-3',
    zIndex: 10,
    aspect: 'aspect-[3/4]',
    scale: 'scale-90 sm:scale-95',
    floatClass: 'animate-float-a',
    delay: '2s',
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
          className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-gold' : 'text-muted'}`}
        >
          <CheckCircle2 size={12} className={c.ok ? 'text-gold' : 'text-muted/40'} />
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
      <div className="h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Seductive Editorial Vignette Composition
  const EditorialShowcase = () => (
    <div className="relative w-full max-w-[340px] sm:max-w-[400px] lg:max-w-[460px] mx-auto flex items-center justify-center py-4 select-none">
      {/* Intimate Backlight Ambiance (Candlelight Amber & Velvet Wine) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(201,169,110,0.16)_0%,rgba(136,19,55,0.12)_45%,transparent_75%)] blur-3xl pointer-events-none" />

      {/* Layered Seductive Cards Fan */}
      <div className="relative flex items-center justify-center w-full h-[280px] sm:h-[340px] lg:h-[390px]">
        {EDITORIAL_VIGNETTES.map((vignette) => (
          <div
            key={vignette.id}
            className={`absolute transition-all duration-700 ease-out ${vignette.rotation} ${vignette.translate} ${vignette.scale}`}
            style={{ zIndex: vignette.zIndex }}
          >
            <div
              className={`${vignette.floatClass} relative w-[160px] sm:w-[200px] lg:w-[230px] ${vignette.aspect} rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] group`}
              style={{ animationDelay: vignette.delay }}
            >
              {/* Image */}
              <img
                src={vignette.img}
                alt={vignette.title}
                className="w-full h-full object-cover brightness-[0.82] contrast-[1.08] saturate-[0.9] group-hover:scale-105 transition-transform duration-700"
              />

              {/* Seductive Velvet Shadow & Candlelight Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-950/20 via-transparent to-rose-950/20 mix-blend-color pointer-events-none" />

              {/* Delicate Gold Rim Highlight */}
              <div className="absolute inset-0 rounded-2xl border border-gold/20 pointer-events-none" />
            </div>
          </div>
        ))}

        {/* Floating VELOUR Serif Monogram Overlay */}
        <div className="absolute -bottom-2 sm:-bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center whitespace-nowrap">
          <div className="relative">
            <div className="absolute -inset-4 bg-black/60 rounded-full blur-xl pointer-events-none" />
            <h1 className="relative font-serif text-3xl sm:text-4xl lg:text-5xl font-light tracking-[0.28em] text-paper drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] uppercase">
              VELOUR
            </h1>
            <p className="font-serif italic text-gold/85 text-xs sm:text-sm tracking-widest mt-0.5 font-light">
              Where desire meets discretion
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Authentication Form UI
  const AuthForm = ({ isMobileSheet = false }: { isMobileSheet?: boolean }) => (
    <div className="w-full max-w-sm mx-auto space-y-6">
      {/* Segmented Mode Selector (Velvet & Gold) */}
      <div className="bg-[#121211] p-1 rounded-full border border-white/[0.08] flex items-center">
        <button
          type="button"
          onClick={() => {
            setMode('signin');
            setError(null);
          }}
          className={`flex-1 py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer ${
            mode === 'signin'
              ? 'bg-gold text-ink shadow-lg shadow-gold/20'
              : 'text-paper/50 hover:text-paper'
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
          className={`flex-1 py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer ${
            mode === 'signup'
              ? 'bg-gold text-ink shadow-lg shadow-gold/20'
              : 'text-paper/50 hover:text-paper'
          }`}
        >
          Create Account
        </button>
      </div>

      {/* Editorial Header */}
      <div>
        <h3 className="font-serif text-2xl sm:text-3xl font-light text-paper tracking-wide">
          {mode === 'signin' ? 'Welcome back' : 'Claim your identity'}
        </h3>
        <p className="text-xs text-muted/80 mt-1 font-light tracking-wide">
          {mode === 'signin'
            ? 'Enter your private lounge and unlock exclusive moments'
            : 'Join the sanctuary of intimate creator devotion'}
        </p>
      </div>

      {/* Form Elements */}
      <form
        onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}
        className="space-y-4"
      >
        {/* Username Input */}
        <div>
          <label className="block text-[10px] font-semibold text-muted tracking-widest uppercase mb-1.5">
            Username
          </label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gold/60 pointer-events-none text-xs font-serif italic">
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
              className="w-full bg-[#111110] border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-paper placeholder-muted/30 focus:outline-none focus:border-gold/60 transition-colors"
            />
          </div>
          {mode === 'signup' && (
            <p className="text-[10px] text-muted/60 mt-1 pl-1">
              3–24 characters (letters, numbers, underscores)
            </p>
          )}
        </div>

        {/* Password Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] font-semibold text-muted tracking-widest uppercase">
              Password
            </label>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="text-xs text-gold/80 hover:text-gold transition-colors font-medium cursor-pointer"
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <Lock
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/50 pointer-events-none"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              className="w-full bg-[#111110] border border-white/10 rounded-xl pl-10 pr-11 py-3 text-sm text-paper placeholder-muted/30 focus:outline-none focus:border-gold/60 transition-colors"
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
          <div className="flex items-start gap-2 bg-red-950/30 border border-red-500/20 rounded-xl px-3.5 py-2.5 text-xs text-red-300">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-full font-semibold text-xs tracking-widest uppercase transition-all shadow-lg shadow-gold/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 bg-gold hover:bg-gold-light text-ink active:scale-[0.98]"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
              <span>{mode === 'signin' ? 'Entering…' : 'Creating identity…'}</span>
            </>
          ) : (
            <span>{mode === 'signin' ? 'Enter Velour' : 'Join Velour'}</span>
          )}
        </button>
      </form>

      {/* Switcher Footer */}
      <p className="text-center text-xs text-muted/70 pt-2 font-light">
        {mode === 'signin' ? (
          <>
            Don't have an identity yet?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className="text-gold hover:underline font-semibold cursor-pointer"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already a member?{' '}
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
    <div className="min-h-screen w-full bg-[#070707] text-paper flex flex-col md:flex-row relative overflow-hidden">
      {/* ─────────────────────────────────────────────────────────────────────────
          LEFT COLUMN: Seductive Velvet & Editorial Showcase (Desktop 52%, Mobile Full)
      ───────────────────────────────────────────────────────────────────────── */}
      <div className="w-full md:w-[52%] lg:w-[55%] min-h-screen flex flex-col justify-between p-6 sm:p-10 lg:p-14 relative overflow-hidden md:border-r border-white/[0.05]">
        {/* Intimate Ambient Shadows & Candlelight Halo */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-rose-950/15 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-amber-950/20 rounded-full blur-[160px] pointer-events-none" />

        {/* Top Header Monogram */}
        <div className="w-full flex items-center justify-between z-10">
          <div className="font-serif tracking-[0.28em] text-sm font-light text-gold/90 uppercase">
            VELOUR
          </div>
        </div>

        {/* Center Editorial Showcase */}
        <div className="w-full flex-1 flex items-center justify-center py-6 sm:py-8 z-10">
          <EditorialShowcase />
        </div>

        {/* Bottom Section (Mobile Action Area & Desktop Editorial Statement) */}
        <div className="w-full z-10 pt-4 pb-2 flex flex-col items-center text-center">
          <h2 className="font-serif text-2xl sm:text-3xl font-light tracking-wide text-paper mb-2">
            Step into the Velvet
          </h2>
          <p className="text-xs sm:text-sm text-paper/60 font-light max-w-sm leading-relaxed mb-6">
            Intimate creator moments, private drops & desires unveiled behind closed doors.
          </p>

          {/* MOBILE ONLY: Two luxury pill buttons */}
          <div className="w-full max-w-xs space-y-3 md:hidden">
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setMobileSheetOpen(true);
              }}
              className="w-full py-4 rounded-full bg-gold hover:bg-gold-light text-ink font-semibold text-xs tracking-widest uppercase shadow-xl shadow-gold/15 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
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
              className="w-full py-4 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-paper font-medium text-xs tracking-wider uppercase border border-white/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
            >
              Sign in
            </button>
          </div>

          {/* DESKTOP ONLY: Intimate Devotion Statement (Zero generic badges) */}
          <div className="hidden md:block pt-3 text-left w-full max-w-md mx-auto">
            <div className="border-t border-white/[0.06] pt-4">
              <p className="font-serif italic text-gold/75 text-sm tracking-wide font-light text-center">
                “Private connections, uncensored passion, exclusive devotion.”
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          RIGHT COLUMN: Desktop Velvet Auth Panel (Hidden on Mobile)
      ───────────────────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex md:w-[48%] lg:w-[45%] min-h-screen items-center justify-center p-8 lg:p-14 bg-[#0a0a09]/95 relative">
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
            className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={() => setMobileSheetOpen(false)}
          />

          {/* Sheet Modal */}
          <div className="relative bg-[#0d0d0c] border-t border-white/10 rounded-t-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
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
              <span className="font-serif text-xs uppercase tracking-widest text-gold/80 font-light">
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
