import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';

interface UseFollowReturn {
  isFollowing: boolean;
  followersCount: number;
  loading: boolean;
  toggleFollow: () => Promise<boolean>;
}

export function useFollow(creatorProfileId?: string, initialCount = 0): UseFollowReturn {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(initialCount);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchFollowStatus = useCallback(async () => {
    if (!creatorProfileId) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch exact followers count via RPC
      let countFound: number | null = null;
      try {
        const { data: rpcCount, error: rpcErr } = await supabase.rpc('get_creator_followers_count', {
          p_creator_id: creatorProfileId,
        });
        if (!rpcErr && typeof rpcCount === 'number') {
          countFound = rpcCount;
        }
      } catch {}

      if (countFound !== null) {
        if (isMounted.current) setFollowersCount(countFound);
      } else {
        // Fallback: direct table count
        const { count, error: countErr } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('creator_profile_id', creatorProfileId);

        if (!countErr && typeof count === 'number') {
          if (isMounted.current) setFollowersCount(count);
        } else {
          // Fallback local check
          try {
            const raw = localStorage.getItem(`velour_creator_followers_${creatorProfileId}`);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && isMounted.current) {
                setFollowersCount(parsed.length);
              }
            }
          } catch {}
        }
      }

      // 2. Check if current user is following
      if (user?.id) {
        const { data, error: followErr } = await supabase
          .from('follows')
          .select('id')
          .eq('creator_profile_id', creatorProfileId)
          .eq('fan_id', user.id)
          .maybeSingle();

        if (!followErr) {
          if (isMounted.current) setIsFollowing(Boolean(data));
        } else {
          // Local fallback check
          try {
            const raw = localStorage.getItem(`velour_user_follows_${user.id}`);
            if (raw) {
              const list: string[] = JSON.parse(raw);
              if (isMounted.current) setIsFollowing(list.includes(creatorProfileId));
            }
          } catch {}
        }
      } else {
        if (isMounted.current) setIsFollowing(false);
      }
    } catch (err) {
      console.debug('useFollow check error:', err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [creatorProfileId, user?.id]);

  useEffect(() => {
    fetchFollowStatus();
  }, [fetchFollowStatus]);

  // Realtime listener for follower count updates
  useEffect(() => {
    if (!creatorProfileId) return;

    const channel = supabase
      .channel(`follows_realtime_${creatorProfileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
        },
        () => {
          fetchFollowStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [creatorProfileId, fetchFollowStatus]);

  const toggleFollow = useCallback(async (): Promise<boolean> => {
    if (!user?.id || !creatorProfileId) return false;

    const prevFollowing = isFollowing;
    const prevCount = followersCount;

    // Optimistic UI update
    const nextFollowing = !prevFollowing;
    setIsFollowing(nextFollowing);
    setFollowersCount(prev => Math.max(0, prev + (nextFollowing ? 1 : -1)));

    // Update local storage cache immediately
    try {
      const userKey = `velour_user_follows_${user.id}`;
      const existing: string[] = JSON.parse(localStorage.getItem(userKey) || '[]');
      const updated = nextFollowing
        ? Array.from(new Set([...existing, creatorProfileId]))
        : existing.filter(id => id !== creatorProfileId);
      localStorage.setItem(userKey, JSON.stringify(updated));

      const creatorKey = `velour_creator_followers_${creatorProfileId}`;
      const creatorFans: string[] = JSON.parse(localStorage.getItem(creatorKey) || '[]');
      const updatedFans = nextFollowing
        ? Array.from(new Set([...creatorFans, user.id]))
        : creatorFans.filter(id => id !== user.id);
      localStorage.setItem(creatorKey, JSON.stringify(updatedFans));
    } catch {}

    // 1. Try atomic security-definer RPC
    let rpcHandled = false;
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('toggle_follow_creator', {
        p_creator_id: creatorProfileId,
      });
      if (!rpcErr && rpcRes) {
        rpcHandled = true;
        if (typeof rpcRes.is_following === 'boolean') {
          setIsFollowing(rpcRes.is_following);
        }
        if (typeof rpcRes.followers_count === 'number') {
          setFollowersCount(rpcRes.followers_count);
        }
        return true;
      }
    } catch {
      rpcHandled = false;
    }

    // 2. Fallback direct table query
    try {
      if (nextFollowing) {
        const { error } = await supabase.from('follows').insert({
          fan_id: user.id,
          creator_profile_id: creatorProfileId,
        });
        if (error && !error.message.includes('duplicate key') && !error.message.includes('relation "public.follows" does not exist')) {
          console.warn('Error creating follow in DB:', error.message);
        }
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('fan_id', user.id)
          .eq('creator_profile_id', creatorProfileId);
        if (error && !error.message.includes('relation "public.follows" does not exist')) {
          console.warn('Error removing follow in DB:', error.message);
        }
      }
      return true;
    } catch (err) {
      console.warn('toggleFollow error, rolling back:', err);
      setIsFollowing(prevFollowing);
      setFollowersCount(prevCount);
      return false;
    }
  }, [user?.id, creatorProfileId, isFollowing, followersCount]);

  return {
    isFollowing,
    followersCount,
    loading,
    toggleFollow,
  };
}
