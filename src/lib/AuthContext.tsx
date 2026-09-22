import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error.message);
      return;
    }
    const prof = data as Profile;
    setProfile(prof);

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

  // Update last_seen_at on page focus
  const updateLastSeen = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id);
  }, [user]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Update last_seen_at on page visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') updateLastSeen();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    updateLastSeen(); // on mount
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [updateLastSeen]);

  const signOut = async () => {
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
