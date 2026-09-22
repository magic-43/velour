import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a number', ok: /\d/.test(password) },
  ];
  if (!password) return null;
  return (
    <ul className="mt-2 space-y-1">
      {checks.map(c => (
        <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-green-400' : 'text-muted'}`}>
          <CheckCircle2 size={12} className={c.ok ? 'text-green-400' : 'text-muted/40'} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

export default function Signup() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
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

    // Sign up with internal email — user never sees this
    const internalEmail = `${trimmed}@velour.internal`;

    const { error: authError } = await supabase.auth.signUp({
      email: internalEmail,
      password,
      options: {
        data: { username: trimmed },
        // Skip email confirmation — we don't use real emails at signup
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

    // Navigate to / — Root.tsx will redirect to /welcome automatically
    // because onboarding_completed is not yet set in user_metadata
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="h-screen bg-ink flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10 fade-1">
          <h1 className="font-serif text-5xl tracking-[0.22em] font-light text-paper">VELOUR</h1>
        </div>

        {/* Form card */}
        <div className="bg-ink-light border border-border-subtle rounded-2xl p-8 fade-2">
          <h2 className="font-serif text-2xl text-paper mb-1">Create an account</h2>
          <p className="text-sm text-muted mb-7">No email required — just a username and password</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs text-muted tracking-wider uppercase mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="your_username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={24}
                className="w-full bg-ink border border-border-subtle rounded-xl px-4 py-3 text-paper placeholder-muted/50 focus:outline-none focus:border-gold/60 transition-colors"
              />
              <p className="text-xs text-muted mt-1.5">
                Letters, numbers, underscores only. 3–24 characters.
              </p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs text-muted tracking-wider uppercase mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full bg-ink border border-border-subtle rounded-xl px-4 py-3 pr-11 text-paper placeholder-muted/50 focus:outline-none focus:border-gold/60 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-paper transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gold hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed text-ink font-semibold rounded-xl py-3 transition-colors mt-2"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : (
                'Create account'
              )}
            </button>
          </form>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-muted mt-6 fade-3">
          Already have an account?{' '}
          <Link to="/login" className="text-gold hover:text-gold-light transition-colors font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
