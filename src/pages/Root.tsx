import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import Feed from './Feed';

/**
 * Root — /
 * Renders inside AppShell (auth already guaranteed by layout route guard).
 * Redirects to /welcome if onboarding not done, otherwise shows Feed.
 *
 * We check BOTH user_metadata.onboarding_completed AND profile.display_name
 * because auth metadata can lag behind navigation by a render cycle, causing
 * a false redirect to /welcome immediately after onboarding finishes.
 */
export default function Root() {
  const { user, profile, loading, role } = useAuth();

  // Wait for auth to settle before making redirect decisions
  if (loading) return (
    <div className="h-screen bg-ink flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Admins and creators never need fan onboarding — send them straight to feed
  const isFanRole = role === 'fan';

  const onboardingDone =
    !isFanRole || // admins + creators skip onboarding entirely
    user?.user_metadata?.onboarding_completed === true ||
    !!profile?.display_name;

  if (!onboardingDone) {
    return <Navigate to="/welcome" replace />;
  }

  return <Feed />;
}
