import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      const from = (location.state as { from?: string })?.from ?? '/';
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedUsername || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setSubmitting(true);

    // Construct internal email from username
    const email = `${trimmedUsername}@velour.internal`;

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (authError) {
      // Show a friendly error — never expose the internal email scheme
      if (authError.message.includes('Invalid login credentials')) {
        setError('Incorrect username or password. Please try again.');
      } else {
        setError(authError.message);
      }
      return;
    }

    // AuthContext will pick up the new session and navigate via Root.tsx
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
          <h1 className="font-serif text-5xl tracking-[0.22em] font-light text-paper">
            VELOUR
          </h1>
        </div>

        {/* Form card */}
        <div className="bg-ink-light border border-border-subtle rounded-2xl p-8 fade-2">
          <h2 className="font-serif text-2xl text-paper mb-1">Welcome back</h2>
          <p className="text-sm text-muted mb-7">Sign in with your username</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs text-muted tracking-wider uppercase mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your_username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-ink border border-border-subtle rounded-xl px-4 py-3 text-paper placeholder-muted/50 focus:outline-none focus:border-gold/60 transition-colors"
              />
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
                  autoComplete="current-password"
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
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Sign up link */}
        <p className="text-center text-sm text-muted mt-6 fade-3">
          Don't have an account?{' '}
          <Link to="/signup" className="text-gold hover:text-gold-light transition-colors font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
