import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from '../types';

export interface SavedAccount {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  lastActiveAt: number;
}

const STORAGE_KEY = 'velour:saved_accounts';

/**
 * Retrieve all saved creator account credentials on this device
 */
export function getSavedAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const accounts = JSON.parse(raw) as SavedAccount[];
    return Array.isArray(accounts) ? accounts : [];
  } catch (err) {
    console.error('Error reading saved accounts:', err);
    return [];
  }
}

/**
 * Persist or update an account session in localStorage
 */
export function saveAccountSession(session: Session, profile: Profile): void {
  if (!session?.access_token || !session?.refresh_token || !profile) return;

  try {
    const current = getSavedAccounts();
    const updatedAccount: SavedAccount = {
      userId: profile.id,
      username: profile.username,
      displayName: profile.display_name || profile.username,
      avatarUrl: profile.avatar_url || null,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      lastActiveAt: Date.now(),
    };

    const nextAccounts = current.filter((a) => a.userId !== profile.id);
    nextAccounts.unshift(updatedAccount); // Most recent at the top
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAccounts));
  } catch (err) {
    console.error('Failed to save account session:', err);
  }
}

/**
 * Remove a specific saved account from device storage
 */
export function removeSavedAccount(userId: string): void {
  try {
    const current = getSavedAccounts();
    const filtered = current.filter((a) => a.userId !== userId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to remove saved account:', err);
  }
}

/**
 * Switch active session to a saved account without requiring password
 */
export async function switchAccount(userId: string): Promise<boolean> {
  try {
    const accounts = getSavedAccounts();
    const target = accounts.find((a) => a.userId === userId);
    if (!target) return false;

    const { data, error } = await supabase.auth.setSession({
      access_token: target.accessToken,
      refresh_token: target.refreshToken,
    });

    if (error) {
      console.error('Error switching session:', error.message);
      // If refresh token is expired or invalid, remove from saved
      if (error.message.toLowerCase().includes('expired') || error.message.toLowerCase().includes('invalid')) {
        removeSavedAccount(userId);
      }
      return false;
    }

    if (data.session) {
      // Update tokens in local storage with the refreshed ones
      const nextAccounts = accounts.map((a) =>
        a.userId === userId
          ? {
              ...a,
              accessToken: data.session!.access_token,
              refreshToken: data.session!.refresh_token,
              lastActiveAt: Date.now(),
            }
          : a
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAccounts));
    }

    return true;
  } catch (err) {
    console.error('Exception during account switch:', err);
    return false;
  }
}
