import React, { useState } from 'react';
import { X, KeyRound, Mail, Lock, CheckCircle2, AlertCircle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessLogin?: () => void;
}

export default function RecoveryModal({ isOpen, onClose, onSuccessLogin }: RecoveryModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [username, setUsername] = useState('');
  const [obfuscatedEmail, setObfuscatedEmail] = useState('');
  const [actualEmail, setActualEmail] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBackHandler(() => {
    onClose();
    return true;
  }, isOpen, 160);

  if (!isOpen) return null;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setError('Please enter your username.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: dbError } = await supabase
        .from('profiles')
        .select('id, username, email')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (dbError) throw dbError;

      if (!data) {
        setError('No account found with this username.');
        setLoading(false);
        return;
      }

      if (!data.email) {
        setError('No recovery email was configured for this account. Please contact Velour support.');
        setLoading(false);
        return;
      }

      const emailStr = data.email.trim();
      const parts = emailStr.split('@');
      const namePart = parts[0] || '';
      const domainPart = parts[1] || '';
      const maskedName = namePart.length > 2
        ? `${namePart[0]}***${namePart[namePart.length - 1]}`
        : `${namePart[0] || '*'}***`;
      const masked = `${maskedName}@${domainPart}`;

      setActualEmail(emailStr);
      setObfuscatedEmail(masked);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lookup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const inputClean = recoveryInput.trim().toLowerCase();
    if (!inputClean) {
      setError('Please enter your recovery email.');
      return;
    }

    if (inputClean !== actualEmail.toLowerCase()) {
      setError('The recovery email entered does not match our records.');
      return;
    }

    setStep(3);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const cleanUsername = username.trim().toLowerCase();
      const cleanEmail = recoveryInput.trim().toLowerCase();

      // Call secure database RPC
      const { data: success, error: rpcError } = await supabase.rpc('reset_user_password', {
        p_username: cleanUsername,
        p_recovery_email: cleanEmail,
        p_new_password: newPassword,
      });

      if (rpcError) {
        throw rpcError;
      }

      // Automatically sign in with new credentials
      const internalEmail = `${cleanUsername}@velour.internal`;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: newPassword,
      });

      if (signInError) {
        // If signIn error occurs, still mark step 4 so user can log in manually
        console.warn('Auto login after reset failed, proceeding to manual login:', signInError);
      }

      setStep(4);
      setTimeout(() => {
        onSuccessLogin?.();
        onClose();
      }, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm bg-[#121212] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <KeyRound size={17} className="text-gold" />
            <h3 className="font-serif font-semibold text-paper text-base">Account Recovery</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <form onSubmit={handleLookup} className="space-y-4">
              <p className="text-xs text-muted leading-relaxed">
                Enter your username to begin self-serve recovery via your verified email address.
              </p>

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1 uppercase tracking-wider">
                  Username
                </label>
                <input
                  type="text"
                  placeholder="e.g. alexandra"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-paper text-sm focus:outline-none focus:border-gold/50"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="w-full py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <span>Find Account</span>}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <div className="p-3 rounded-xl bg-gold/10 border border-gold/20 text-gold text-xs flex items-center gap-2">
                <ShieldCheck size={16} className="shrink-0" />
                <span>Recovery email on file: <strong>{obfuscatedEmail}</strong></span>
              </div>

              <p className="text-xs text-muted leading-relaxed">
                Confirm your identity by entering your full recovery email address.
              </p>

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1 uppercase tracking-wider">
                  Full Recovery Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                  <input
                    type="email"
                    placeholder="Enter complete email address"
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-paper text-sm focus:outline-none focus:border-gold/50"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 py-2.5 rounded-xl border border-white/10 text-muted hover:text-paper text-xs font-semibold transition-all"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!recoveryInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  <span>Verify Email</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-xs text-muted leading-relaxed">
                Verified! Choose a new password for <strong>@{username}</strong>.
              </p>

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1 uppercase tracking-wider">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                  <input
                    type="password"
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-paper text-sm focus:outline-none focus:border-gold/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1 uppercase tracking-wider">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                  <input
                    type="password"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-paper text-sm focus:outline-none focus:border-gold/50"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
                className="w-full py-2.5 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span>Reset Password & Sign In</span>
                )}
              </button>
            </form>
          )}

          {step === 4 && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
              <CheckCircle2 size={44} className="text-emerald-400 animate-in zoom-in-75 duration-200" />
              <h4 className="font-serif text-paper text-base font-semibold">Password Changed</h4>
              <p className="text-xs text-muted">
                Your password has been updated and your account is ready. Signing in...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
