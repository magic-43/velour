import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Camera, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { uploadPublicFile } from '../lib/r2';

/**
 * Onboarding — /welcome
 * Runs exactly once after signup.
 *
 * Navigation fix: instead of calling navigate() right after updateUser(),
 * we set a `readyToRedirect` flag and let a useEffect watch for the auth
 * context to actually commit the updated user/profile state before redirecting.
 * This avoids the black screen caused by React state batching lag.
 */
export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyToRedirect, setReadyToRedirect] = useState(false);

  // Already completed on mount — skip straight to home
  useEffect(() => {
    if (user?.user_metadata?.onboarding_completed) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // After handleFinish sets readyToRedirect, wait for auth state to settle
  // (either metadata flag OR profile.display_name confirms completion)
  useEffect(() => {
    if (!readyToRedirect) return;

    const onboardingConfirmed =
      user?.user_metadata?.onboarding_completed === true ||
      !!profile?.display_name;

    if (onboardingConfirmed) {
      navigate('/', { replace: true });
    }
  }, [readyToRedirect, user, profile, navigate]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleFinish = async () => {
    if (!user) return;

    if (!displayName.trim()) {
      setError('Please enter a display name to continue.');
      return;
    }

    setUploading(true);
    setError(null);

    let avatarUrl: string | null = null;

    // Upload avatar if provided — optional, silent fail
    if (avatarFile) {
      try {
        const ext = avatarFile.name.split('.').pop();
        const key = `avatars/${user.id}/avatar.${ext}`;
        avatarUrl = await uploadPublicFile(avatarFile, key);
      } catch (err) {
        // Avatar is optional — log quietly and continue without it
        console.warn('Avatar upload failed (can be set later in Profile):', err);
      }
    }

    // Upsert the profile row
    const upsertData: Record<string, string> = { id: user.id };
    upsertData.display_name = displayName.trim();
    upsertData.username = user.user_metadata?.username ?? '';
    if (avatarUrl) upsertData.avatar_url = avatarUrl;

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(upsertData, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile upsert error:', profileError);
      setError(`Failed to save profile: ${profileError.message}`);
      setUploading(false);
      return;
    }

    // Mark onboarding complete in auth metadata — fires onAuthStateChange
    await supabase.auth.updateUser({
      data: { onboarding_completed: true },
    });

    // Refresh profile in context (triggers re-render with new display_name)
    await refreshProfile();

    // Signal the useEffect above to navigate once auth state commits
    setReadyToRedirect(true);
    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-10 fade-1">
          <h1 className="font-serif text-4xl tracking-[0.22em] font-light text-paper mb-2">
            VELOUR
          </h1>
          <p className="text-muted text-sm">Let's set up your profile</p>
        </div>

        <div className="bg-ink-light border border-border-subtle rounded-2xl p-8 fade-2 space-y-6">
          {/* Avatar picker */}
          <div className="flex flex-col items-center gap-3">
            <label className="cursor-pointer group relative">
              <div className="w-24 h-24 rounded-full bg-ink border-2 border-border-subtle group-hover:border-gold/50 transition-colors overflow-hidden flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera size={28} className="text-muted group-hover:text-gold transition-colors" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-7 h-7 bg-gold rounded-full flex items-center justify-center shadow">
                <Camera size={14} className="text-ink" />
              </div>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarChange}
              />
            </label>
            <p className="text-xs text-muted">Add a profile photo (optional)</p>
          </div>

          {/* Display name */}
          <div>
            <label className="block text-xs text-muted tracking-wider uppercase mb-2">
              Display name <span className="text-gold">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setError(null); }}
              placeholder="How should we call you?"
              maxLength={40}
              className="w-full bg-ink border border-border-subtle rounded-xl px-4 py-3 text-paper placeholder-muted/50 focus:outline-none focus:border-gold/60 transition-colors"
            />
            <p className="text-xs text-muted mt-1.5">You can change this anytime.</p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-300 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {/* Continue button */}
          <button
            onClick={handleFinish}
            disabled={uploading || !displayName.trim()}
            className="w-full bg-gold hover:bg-gold-light disabled:opacity-40 disabled:cursor-not-allowed text-ink font-semibold rounded-xl py-3 transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
