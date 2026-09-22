import React, { useState } from 'react';
import { X, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { saveAccountSession } from '../../lib/multiAccount';
import { useAuth } from '../../lib/AuthContext';
import type { Profile } from '../../types';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AddAccountModal({ isOpen, onClose, onSuccess }: AddAccountModalProps) {
  const { refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();
    if (!cleanUsername || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    try {
      const email = `${cleanUsername}@velour.internal`;
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('Incorrect username or password. Please try again.');
        } else {
          setError(authError.message);
        }
        setSubmitting(false);
        return;
      }

      if (data?.session && data?.user) {
        // Fetch profile to verify creator role and save details
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profileData) {
          setError('Failed to fetch profile details.');
          setSubmitting(false);
          return;
        }

        const prof = profileData as Profile;
        if (prof.role !== 'creator' && prof.role !== 'admin') {
          // Revert session if not a creator
          await supabase.auth.signOut();
          setError('Only creator accounts can be added to the switcher.');
          setSubmitting(false);
          return;
        }

        // Save session in multi-account storage
        saveAccountSession(data.session, prof);
        if (refreshProfile) await refreshProfile();

        // Reset and close
        setUsername('');
        setPassword('');
        onSuccess?.();
        onClose();
      }
    } catch (err: any) {
      console.error('Error adding account:', err);
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm rounded-2xl bg-[#161618] border border-white/10 p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-muted hover:text-paper p-1 rounded-full transition-colors"
          title="Close"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="mb-5">
          <h3 className="font-semibold text-lg text-paper">Add account</h3>
          <p className="text-xs text-muted mt-1">
            Sign in with an existing creator account to switch seamlessly.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-3 flex items-start gap-2.5">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-muted tracking-wider uppercase mb-1.5">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm select-none">
                @
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="creator_handle"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={submitting}
                className="w-full bg-[#0e0e10] border border-white/10 focus:border-gold/50 rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-paper placeholder:text-muted/40 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted tracking-wider uppercase mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={submitting}
                className="w-full bg-[#0e0e10] border border-white/10 focus:border-gold/50 rounded-xl px-3.5 pr-10 py-2.5 text-sm text-paper placeholder:text-muted/40 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-paper transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Add account'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full py-2 text-xs text-muted hover:text-paper transition-colors text-center"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
