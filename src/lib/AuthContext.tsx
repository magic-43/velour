import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Profile, UserRole } from '../types';
import {
  saveAccountSession,
  getSavedAccounts,
  switchAccount as switchAccountSession,
  removeSavedAccount,
  type SavedAccount,
} from './multiAccount';
import { getCachedProfile, saveCachedProfile } from './offline/db';
import { globalPresenceManager } from './presenceManager';
import { getMyLastSeenPrivacy } from './utils/presenceUtils';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole;
  isAdmin: boolean;
  isCreator: boolean;
  isFan: boolean;
  isBanned: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  savedAccounts: SavedAccount[];
  switchSavedAccount: (userId: string) => Promise<boolean>;
  removeSavedAccountSession: (userId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => getSavedAccounts());
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string, activeSession?: Session | null) => {
    // 1. Fast path: check offline cache first
    try {
      const cached = await getCachedProfile(userId);
      if (cached) {
        setProfile(cached);
      }
    } catch (_) {}

    // 2. Fetch fresh profile from Supabase
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('Error fetching profile (may be offline):', error.message);
      return;
    }
    const prof = data as Profile;
    setProfile(prof);
    saveCachedProfile(prof).catch(() => {});

    // If user is a creator or admin, auto-record their session in saved accounts
    if (prof.role === 'creator' || prof.role === 'admin') {
      const sess = activeSession ?? (await supabase.auth.getSession()).data.session;
      if (sess) {
        saveAccountSession(sess, prof);
        setSavedAccounts(getSavedAccounts());
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id, session);
  }, [user, session, fetchProfile]);

  // Switch between saved accounts
  const switchSavedAccount = useCallback(async (targetUserId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const ok = await switchAccountSession(targetUserId);
      if (ok) {
        setSavedAccounts(getSavedAccounts());
        const { data: { session: newSession } } = await supabase.auth.getSession();
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id, newSession);
        }
      }
      return ok;
    } finally {
      setLoading(false);
    }
  }, [fetchProfile]);

  // Remove saved account session
  const removeSavedAccountSession = useCallback((targetUserId: string) => {
    removeSavedAccount(targetUserId);
    setSavedAccounts(getSavedAccounts());
  }, []);

  // Update last_seen_at on page focus, heartbeats, and unload
  const lastSeenPingRef = useRef<number>(0);
  const updateLastSeen = useCallback(async () => {
    if (!user) return;
    if (getMyLastSeenPrivacy(user.id) === 'nobody') return;
    lastSeenPingRef.current = Date.now();
    try {
      await supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id);
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        globalPresenceManager.initialize(session.user.id);
        // Optimistically populate profile from IndexedDB immediately so UI renders offline
        try {
          const cached = await getCachedProfile(session.user.id);
          if (cached) {
            setProfile(cached);
            setLoading(false);
          }
        } catch (_) {}
        fetchProfile(session.user.id, session).finally(() => setLoading(false));
      } else {
        globalPresenceManager.cleanup();
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        globalPresenceManager.initialize(session.user.id);
        fetchProfile(session.user.id, session);
      } else {
        globalPresenceManager.cleanup();
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Robust presence lifecycle: periodic heartbeat + visibility + unload
  useEffect(() => {
    if (!user) return;

    // 1. Initial ping on mount/auth
    updateLastSeen();

    // 2. Active heartbeat while visible (every 25s)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateLastSeen();
      }
    }, 25000);

    // 3. User activity ping (debounced 15s)
    const handleActivity = () => {
      if (Date.now() - lastSeenPingRef.current > 15000 && document.visibilityState === 'visible') {
        updateLastSeen();
      }
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    // 4. Page visibility change
    const handleVisibility = () => {
      updateLastSeen();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 5. Before unload / background exit
    const handleUnload = () => {
      updateLastSeen();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [user, updateLastSeen]);

  const signOut = async () => {
    globalPresenceManager.cleanup();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const role: UserRole = profile?.role ?? 'fan';
  const isAdmin = role === 'admin';
  const isCreator = role === 'creator' || isAdmin;
  const isFan = role === 'fan';
  const isBanned = profile?.is_banned ?? false;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isAdmin,
        isCreator,
        isFan,
        isBanned,
        loading,
        signOut,
        refreshProfile,
        savedAccounts,
        switchSavedAccount,
        removeSavedAccountSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
