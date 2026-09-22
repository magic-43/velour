import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { CreatorProfile } from '../../types';
import { useAuth } from '../AuthContext';

const STORAGE_KEY = 'velour:active-creator-profile';

interface UseCreatorProfilesReturn {
  creatorProfiles: CreatorProfile[];
  activeCreatorProfile: CreatorProfile | null;
  setActiveCreatorProfile: (profile: CreatorProfile) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useCreatorProfiles(): UseCreatorProfilesReturn {
  const { user, profile, isCreator } = useAuth();
  const [creatorProfiles, setCreatorProfiles] = useState<CreatorProfile[]>([]);
  const [activeCreatorProfile, setActiveCreatorProfileState] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    if (!user || !isCreator) {
      setCreatorProfiles([]);
      setActiveCreatorProfileState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('creator_profiles')
      .select('*')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching creator profiles:', error.message);
      setLoading(false);
      return;
    }

    let profiles = (data ?? []) as CreatorProfile[];

    // Auto-provision initial creator persona if none exists yet
    if (profiles.length === 0) {
      const defaultName = profile?.display_name || profile?.username || 'Creator';
      const { data: newProfile, error: createError } = await supabase
        .from('creator_profiles')
        .insert({
          owner_id: user.id,
          display_name: defaultName,
          avatar_url: profile?.avatar_url || null,
          is_active: true,
        })
        .select()
        .single();

      if (!createError && newProfile) {
        profiles = [newProfile as CreatorProfile];
      }
    }

    setCreatorProfiles(profiles);

    // Restore last active profile from localStorage
    const storedId = localStorage.getItem(STORAGE_KEY);
    const stored = profiles.find(p => p.id === storedId);
    setActiveCreatorProfileState(stored ?? profiles[0] ?? null);

    setLoading(false);
  }, [user, profile, isCreator]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const setActiveCreatorProfile = useCallback((profile: CreatorProfile) => {
    setActiveCreatorProfileState(profile);
    localStorage.setItem(STORAGE_KEY, profile.id);
  }, []);

  return {
    creatorProfiles,
    activeCreatorProfile,
    setActiveCreatorProfile,
    loading,
    refetch: fetchProfiles,
  };
}
