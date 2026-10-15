import { useState } from 'react';
import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import {
  Play, Compass, MessageSquare,
  ChevronRight, X,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useGlobalMessageNotifications } from '../../lib/hooks/useGlobalMessageNotifications';
import { requestNotificationPermission, canPromptDesktopNotifications } from '../../lib/notificationService';
import InAppMessageToast from '../chat/InAppMessageToast';

// ─── Nav Configurations ──────────────────────────────────────────────────────

// Desktop sidebar nav (Profile is intentionally excluded here; it is represented solely by the bottom user pill)
const SIDEBAR_FAN_NAV = [
  { path: '/',         label: 'Home',     Icon: Play          },
  { path: '/explore',  label: 'Discover', Icon: Compass       },
  { path: '/messages', label: 'Messages', Icon: MessageSquare },
];

const SIDEBAR_CREATOR_NAV = [
  { path: '/',         label: 'Home',     Icon: Play          },
  { path: '/explore',  label: 'Discover', Icon: Compass       },
  { path: '/messages', label: 'Messages', Icon: MessageSquare },
];

// Mobile bottom nav items (Profile is rendered as a miniature avatar pill at the end)
const MOBILE_FAN_NAV = [
  { path: '/',         label: 'Home',     Icon: Play          },
  { path: '/explore',  label: 'Discover', Icon: Compass       },
  { path: '/messages', label: 'Messages', Icon: MessageSquare },
];

const MOBILE_CREATOR_NAV = [
  { path: '/',         label: 'Home',     Icon: Play          },
  { path: '/explore',  label: 'Discover', Icon: Compass       },
  { path: '/messages', label: 'Messages', Icon: MessageSquare },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function AppShell() {
  const { profile, isCreator } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { totalUnreadCount, inAppToast, dismissToast } = useGlobalMessageNotifications();

  const [showDesktopPrompt, setShowDesktopPrompt] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      const dismissed = localStorage.getItem('velour_dismissed_desktop_notif');
      return !dismissed && canPromptDesktopNotifications();
    } catch {
      return false;
    }
  });

  const handleEnableDesktopNotifications = async () => {
    setShowDesktopPrompt(false);
    await requestNotificationPermission();
  };

  const handleDismissDesktopPrompt = () => {
    setShowDesktopPrompt(false);
    try {
      localStorage.setItem('velour_dismissed_desktop_notif', 'true');
    } catch (_) {}
  };

  const sidebarNavItems = isCreator ? SIDEBAR_CREATOR_NAV : SIDEBAR_FAN_NAV;
  const mobileNavItems  = isCreator ? MOBILE_CREATOR_NAV  : MOBILE_FAN_NAV;

  const isMessages = location.pathname.startsWith('/messages');
  const isProfile  = location.pathname === '/me';
  const isDiscover = location.pathname === '/explore';
  const isHome = location.pathname === '/';
  const isSettings = location.pathname.startsWith('/settings');
  const isWallet = location.pathname === '/wallet';
  const isProfileSubView = isProfile && (location.search.includes('tab=') || location.search.includes('view='));

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Match v1 mainShellClass per route (fixed layout routes have pinned sticky header)
  const isFixedLayoutRoute = isDiscover || isHome || isSettings || isWallet || isProfile;
  const mainShellClass = isFixedLayoutRoute
    ? 'flex-1 max-w-[600px] w-full mx-auto md:mx-0 md:border-r border-border-subtle pb-0 relative h-[calc(100dvh-68px)] md:h-screen min-h-0 overflow-hidden'
    : 'flex-1 max-w-[600px] w-full mx-auto md:mx-0 md:border-r border-border-subtle pb-20 md:pb-0 relative min-h-screen h-screen overflow-y-auto overflow-x-hidden';

  return (
    <div className="h-[100dvh] md:h-screen bg-ink text-paper font-sans flex justify-center overflow-hidden overscroll-none relative">
      {/* ── Global Floating In-App Message Toast ─────────────────────────── */}
      <InAppMessageToast toast={inAppToast} onDismiss={dismissToast} />

      <div className="w-full h-full flex transition-all duration-500 ease-in-out max-w-[1200px]">

        {/* ── Left Sidebar (Desktop) ──────────────────────────────────────── */}
        <aside
          className={`hidden md:flex flex-col shrink-0 sticky top-0 h-screen border-r border-border-subtle pt-6 pb-8 transition-all duration-300
            ${isMessages ? 'w-[75px] px-2 items-center' : 'w-64 lg:w-72 px-4 lg:px-6'}`}
        >
          {/* Logo */}
          <Link
            to="/"
            className={`inline-block mb-10 ${isMessages ? 'w-full text-center pl-0' : 'pl-2'}`}
          >
            {isMessages ? (
              <div className="w-10 h-10 bg-gold rounded-full flex items-center justify-center text-ink font-serif font-bold tracking-tighter mx-auto select-none">
                V
              </div>
            ) : (
              <h1 className="font-serif text-3xl tracking-[0.22em] font-light text-paper leading-none select-none">
                VELOUR
              </h1>
            )}
          </Link>

          {/* Nav items (Home, Discover, Messages, + Wallet for creators) */}
          <nav className="flex-1 space-y-2 w-full">
            {sidebarNavItems.map(({ path, label, Icon }) => {
              const active = isActive(path);
              const isMessagesTab = path === '/messages';
              return (
                <Link
                  key={path}
                  to={path}
                  title={label}
                  className={`flex items-center transition-all duration-300 font-medium relative
                    ${isMessages
                      ? 'justify-center w-12 h-12 p-0 mx-auto rounded-full'
                      : 'w-full gap-4 px-4 py-3.5 rounded-full'}
                    ${active
                      ? 'bg-ink-light text-paper'
                      : 'text-muted hover:text-paper hover:bg-ink-light/50'}`}
                >
                  <div className="relative flex items-center justify-center">
                    <Icon
                      size={24}
                      strokeWidth={active ? 2 : 1.5}
                      className={active ? 'text-gold' : ''}
                    />
                    {isMessagesTab && totalUnreadCount > 0 && isMessages && (
                      <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-gold text-ink font-bold text-[0.6rem] flex items-center justify-center shadow-md">
                        {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                      </span>
                    )}
                  </div>
                  {!isMessages && <span className="truncate">{label}</span>}
                  {isMessagesTab && totalUnreadCount > 0 && !isMessages && (
                    <span className="ml-auto px-1.5 py-0.5 min-w-[20px] h-5 rounded-full bg-gold text-ink font-bold text-[0.65rem] flex items-center justify-center shadow-sm">
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Profile Pill (The sole profile navigation trigger on desktop sidebar) */}
          <div className="mt-auto w-full px-2 relative group">
            <div
              onClick={() => navigate('/me')}
              className={`flex items-center p-2 rounded-full cursor-pointer transition-colors
                ${isMessages
                  ? 'justify-center w-12 h-12 mx-auto hover:bg-ink-light'
                  : 'gap-3 hover:bg-ink-light w-full'}
                ${isProfile ? 'bg-ink-light border border-border-subtle ring-1 ring-gold/30' : ''}`}
            >
              <div className="w-10 h-10 rounded-full bg-ink-light border border-border-subtle flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gold font-serif text-lg">
                    {(profile?.display_name ?? profile?.username ?? '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {!isMessages && (
                <>
                  <div className="flex-1 overflow-hidden">
                    <p className={`text-sm font-bold truncate ${isProfile ? 'text-gold' : 'text-paper'}`}>
                      {profile?.display_name ?? profile?.username}
                    </p>
                    <p className="text-[0.65rem] text-muted truncate tracking-wide">
                      @{profile?.username}
                    </p>
                  </div>
                  <ChevronRight size={16} className={`transition-colors ${isProfile ? 'text-gold' : 'text-muted group-hover:text-gold'}`} />
                </>
              )}
            </div>

            {/* Hover tooltip in collapsed (messages) state */}
            {isMessages && (
              <div className="absolute left-[60px] top-1/2 -translate-y-1/2 bg-ink-light border border-border-subtle p-3 rounded-xl shadow-xl w-48 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                <p className="text-sm font-medium text-paper truncate">
                  {profile?.display_name ?? profile?.username}
                </p>
                <p className="text-xs text-muted truncate">@{profile?.username}</p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Content Area ─────────────────────────────────────────────────── */}

        {isMessages ? (
          /* Messages: 2-column full-bleed layout, no right sidebar */
          <div className="flex-1 flex h-full max-h-[100dvh] overflow-hidden flex-col md:flex-row relative">
            <Outlet />
          </div>
        ) : (
          /* Standard: center column */
          <main className={mainShellClass}>
            <Outlet />
          </main>
        )}
      </div>

      {/* ── Mobile Bottom Navigation ─────────────────────────────────────── */}
      {/* Hide bottom nav when in a conversation on mobile */}
      {!(isMessages && location.pathname !== '/messages') && (
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border-subtle bg-ink/95 px-2 shadow-[0_-10px_20px_rgba(0,0,0,0.5)] backdrop-blur-lg"
          style={{
            height: 'calc(68px + env(safe-area-inset-bottom))',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.25rem)',
          }}
        >
          {mobileNavItems.map(({ path, label, Icon }) => {
            const active = isActive(path);
            const isMessagesTab = path === '/messages';
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative
                  ${active ? 'text-paper' : 'text-muted hover:text-paper'}`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon size={23} strokeWidth={active ? 2.4 : 1.8} className={active ? 'text-gold' : ''} />
                  {isMessagesTab && totalUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-gold text-ink font-bold text-[0.6rem] flex items-center justify-center shadow-md">
                      {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                    </span>
                  )}
                </div>
                <span className={`text-[11px] tracking-wide ${active ? 'font-semibold text-paper' : 'font-medium'}`}>{label}</span>
                {active && (
                  <span className="absolute bottom-1 w-1 h-1 bg-gold rounded-full" />
                )}
              </Link>
            );
          })}

          {/* Profile Tab on Mobile (Avatar Pill) */}
          <Link
            to="/me"
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative
              ${isProfile ? 'text-paper' : 'text-muted hover:text-paper'}`}
          >
            <div
              className={`w-6.5 h-6.5 rounded-full overflow-hidden border transition-all ${
                isProfile ? 'border-gold ring-1 ring-gold/60' : 'border-border-subtle'
              } bg-ink-light flex items-center justify-center`}
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gold font-serif text-xs font-semibold leading-none">
                  {(profile?.display_name ?? profile?.username ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className={`text-[11px] tracking-wide ${isProfile ? 'text-paper font-semibold' : 'text-muted font-medium'}`}>
              Profile
            </span>
            {isProfile && (
              <span className="absolute bottom-1 w-1 h-1 bg-gold rounded-full" />
            )}
          </Link>
        </nav>
      )}

      {/* ── Desktop Notification Permission Pill (One-click enable) ───────── */}
      {showDesktopPrompt && (
        <div className="hidden md:flex fixed bottom-6 right-6 z-40 bg-[#16161a]/95 border border-gold/30 text-paper px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="w-8 h-8 rounded-full bg-gold/15 text-gold flex items-center justify-center shrink-0">
            <MessageSquare size={16} />
          </div>
          <div className="text-xs">
            <p className="font-semibold text-paper">Desktop Notifications</p>
            <p className="text-muted">Get alerted when you receive new messages</p>
          </div>
          <button
            type="button"
            onClick={handleEnableDesktopNotifications}
            className="px-3 py-1.5 bg-gold text-ink font-semibold text-xs rounded-xl hover:bg-gold-light transition-colors cursor-pointer shrink-0"
          >
            Enable
          </button>
          <button
            type="button"
            onClick={handleDismissDesktopPrompt}
            className="text-muted hover:text-white p-1 transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
