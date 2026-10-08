import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AppShell from './components/layout/AppShell';
import AppErrorBoundary from './components/AppErrorBoundary';
import { registerNotificationNavigation } from './lib/notificationService';

// Pages
import Root from './pages/Root';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';
import Feed from './pages/Feed';
import Explore from './pages/Explore';
import Messages from './pages/Messages';
import Conversation from './pages/Conversation';
import Wallet from './pages/Wallet';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import PublicProfile from './pages/PublicProfile';
import { useAndroidBackButton } from './lib/useAndroidBackButton';

// ─── Guards ──────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function BanCheck({ children }: { children: React.ReactNode }) {
  const { isBanned, loading } = useAuth();
  if (loading) return null;
  if (isBanned) return (
    <div className="h-screen bg-ink flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <h1 className="font-serif text-3xl text-paper mb-3">Account suspended</h1>
        <p className="text-muted text-sm leading-relaxed">
          Your account has been suspended. If you believe this is a mistake, please contact support.
        </p>
      </div>
    </div>
  );
  return <>{children}</>;
}

function Spinner() {
  return (
    <div className="h-screen bg-ink flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Routes ──────────────────────────────────────────────────────────────────

function AppRoutes() {
  const navigate = useNavigate();
  useAndroidBackButton();

  useEffect(() => {
    const cleanup = registerNotificationNavigation((path) => {
      navigate(path);
    });
    return cleanup;
  }, [navigate]);

  return (
    <Routes>
      {/* ── Guest only ── */}
      <Route path="/login"  element={<RequireGuest><Login /></RequireGuest>} />
      <Route path="/signup" element={<RequireGuest><Signup /></RequireGuest>} />

      {/* ── Onboarding (auth required, one-time) ── */}
      <Route
        path="/welcome"
        element={
          <RequireAuth>
            <BanCheck><Onboarding /></BanCheck>
          </RequireAuth>
        }
      />

      {/* ── Authenticated shell routes ── */}
      <Route
        element={
          <RequireAuth>
            <BanCheck>
              <AppShell />
            </BanCheck>
          </RequireAuth>
        }
      >
        <Route path="/"                      element={<Root />} />
        <Route path="/explore"               element={<Explore />} />
        <Route path="/messages"              element={<Messages />} />
        <Route path="/messages/:conversationId" element={<Conversation />} />
        <Route path="/wallet"                element={<Wallet />} />
        <Route path="/me"                    element={<Profile />} />
        <Route path="/profile/:username"     element={<PublicProfile />} />
        <Route path="/creator/:creatorId"    element={<PublicProfile />} />
        <Route path="/settings"              element={<Settings />} />
        <Route path="/settings/:section"     element={<Settings />} />
      </Route>

      {/* ── Admin (standalone, no AppShell) ── */}
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          </RequireAuth>
        }
      />

      {/* ── Fallback ── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
