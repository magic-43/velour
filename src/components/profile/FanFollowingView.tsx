import { useState, useEffect } from 'react';
import { ArrowLeft, Compass, Search, X, MessageSquare, CheckCircle2, UserMinus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useBackHandler } from '../../lib/backButtonRegistry';
import type { CreatorProfile } from '../../types';

interface FanFollowingViewProps {
  onBack: () => void;
}

interface FollowingItem {
  id: string; // follow row id or creator id
  creator: CreatorProfile;
  followedAt?: string | null;
}

function getAvatarColor(name: string) {
  const colors = [
    'bg-amber-500',
    'bg-rose-500',
    'bg-purple-500',
    'bg-blue-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-indigo-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function FanFollowingView({ onBack }: FanFollowingViewProps) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [following, setFollowing] = useState<FollowingItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Android hardware back button handler
  useBackHandler(() => {
    onBack();
    return true;
  }, true, 80);

  const fetchFollowing = async () => {
    if (!profile) return;
    try {
      setLoading(true);

      let rawFollows: any[] = [];
      const { data: followsData, error: followErr } = await supabase
        .from('follows')
        .select(`
          id,
          creator_profile_id,
          created_at,
          creator:creator_profiles!creator_profile_id(
            id,
            owner_id,
            display_name,
            bio,
            avatar_url,
            cover_url,
            category,
            tags,
            is_verified,
            is_active,
            created_at,
            owner:profiles!owner_id(id, username, display_name, avatar_url, role, last_seen_at)
          )
        `)
        .eq('fan_id', profile.id)
        .order('created_at', { ascending: false });

      if (!followErr && followsData) {
        rawFollows = followsData;
      } else {
        const { data: fallbackFollows } = await supabase
          .from('follows')
          .select('id, creator_profile_id, created_at')
          .eq('fan_id', profile.id)
          .order('created_at', { ascending: false });
        if (fallbackFollows) rawFollows = fallbackFollows;
      }

      let list: FollowingItem[] = [];

      for (const row of rawFollows) {
        if (row.creator) {
          if (row.creator.owner?.role !== 'admin' && row.creator.owner?.username !== 'admin') {
            list.push({
              id: row.id,
              creator: row.creator as CreatorProfile,
              followedAt: row.created_at,
            });
          }
        } else if (row.creator_profile_id) {
          // Resolve by id or owner_id
          const { data: cData } = await supabase
            .from('creator_profiles')
            .select(`
              id, owner_id, display_name, bio, avatar_url, cover_url, category, tags, is_verified, is_active, created_at,
              owner:profiles!owner_id(id, username, display_name, avatar_url, role, last_seen_at)
            `)
            .or(`id.eq.${row.creator_profile_id},owner_id.eq.${row.creator_profile_id}`)
            .maybeSingle();

          const cRaw = cData as any;
          const owner = Array.isArray(cRaw?.owner) ? cRaw.owner[0] : cRaw?.owner;
          if (cRaw && owner?.role !== 'admin' && owner?.username !== 'admin') {
            list.push({
              id: row.id,
              creator: { ...cRaw, owner } as unknown as CreatorProfile,
              followedAt: row.created_at,
            });
          }
        }
      }

      // 2. Fallback check local storage
      if (list.length === 0) {
        try {
          const raw = localStorage.getItem(`velour_user_follows_${profile.id}`);
          if (raw) {
            const creatorIds: string[] = JSON.parse(raw);
            if (creatorIds.length > 0) {
              const { data: cData } = await supabase
                .from('creator_profiles')
                .select(`
                  id, owner_id, display_name, bio, avatar_url, cover_url, category, tags, is_verified, is_active, created_at,
                  owner:profiles!owner_id(id, username, display_name, avatar_url, role, last_seen_at)
                `)
                .or(`id.in.(${creatorIds.join(',')}),owner_id.in.(${creatorIds.join(',')})`);

              if (cData) {
                list = cData.map((c: any) => {
                  const owner = Array.isArray(c?.owner) ? c.owner[0] : c?.owner;
                  return {
                    id: c.id,
                    creator: { ...c, owner } as unknown as CreatorProfile,
                    followedAt: new Date().toISOString(),
                  };
                });
              }
            }
          }
        } catch {}
      }

      setFollowing(list);
    } catch (err) {
      console.error('Error fetching following creators:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowing();

    if (!profile) return;
    const channel = supabase
      .channel(`fan_following_realtime_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
          filter: `fan_id=eq.${profile.id}`,
        },
        () => {
          fetchFollowing();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const handleUnfollow = async (item: FollowingItem) => {
    if (!profile) return;
    const creatorId = item.creator.id;

    // Optimistic removal
    setFollowing((prev) => prev.filter((i) => i.creator.id !== creatorId));

    try {
      const userKey = `velour_user_follows_${profile.id}`;
      const existing: string[] = JSON.parse(localStorage.getItem(userKey) || '[]');
      localStorage.setItem(userKey, JSON.stringify(existing.filter((id) => id !== creatorId)));

      const creatorKey = `velour_creator_followers_${creatorId}`;
      const creatorFans: string[] = JSON.parse(localStorage.getItem(creatorKey) || '[]');
      localStorage.setItem(creatorKey, JSON.stringify(creatorFans.filter((id) => id !== profile.id)));

      await supabase
        .from('follows')
        .delete()
        .eq('fan_id', profile.id)
        .eq('creator_profile_id', creatorId);
    } catch (err) {
      console.warn('Error unfollowing creator:', err);
    }
  };

  const handleMessage = async (creatorId: string) => {
    if (!user) return;
    try {
      const { data: convId, error: rpcErr } = await supabase.rpc('get_or_create_conversation', {
        p_creator_profile_id: creatorId,
      });

      if (!rpcErr && convId) {
        navigate(`/messages/${convId}`);
        return;
      }

      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('fan_id', user.id)
        .eq('creator_profile_id', creatorId)
        .maybeSingle();

      if (existing?.id) {
        navigate(`/messages/${existing.id}`);
        return;
      }

      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          fan_id: user.id,
          creator_profile_id: creatorId,
        })
        .select('id')
        .single();

      if (newConv?.id) {
        navigate(`/messages/${newConv.id}`);
      }
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  const isOnline = (lastSeenAt?: string | null): boolean => {
    if (!lastSeenAt) return false;
    return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
  };

  const filteredFollowing = following.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const nameMatch = item.creator.display_name.toLowerCase().includes(q);
    const userMatch = item.creator.owner?.username?.toLowerCase().includes(q);
    const catMatch = item.creator.category?.toLowerCase().includes(q);
    return nameMatch || userMatch || catMatch;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-ink">
      {/* Header matching Stories/Home page */}
      <div className="sticky top-0 z-30 shrink-0 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3.5 backdrop-blur-md sm:px-5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-muted hover:text-paper transition-colors cursor-pointer"
            aria-label="Back to profile"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-baseline gap-2">
            <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">
              Following
            </h3>
            <span className="text-xs text-muted font-mono">
              ({following.length})
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 pt-4 pb-24 md:pb-8">
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={15} />
          <input
            type="text"
            placeholder="Search followed creators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#121214] border border-white/[0.06] rounded-xl pl-9 pr-9 py-2 text-xs text-paper placeholder-white/20 focus:outline-none focus:border-gold/40 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-paper"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Content State */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted">Loading followed creators…</span>
          </div>
        ) : filteredFollowing.length === 0 ? (
          <div className="py-16 px-4 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-muted mb-3.5">
              <Compass size={28} />
            </div>
            <h4 className="text-sm font-semibold text-paper mb-1">
              {search ? 'No matches found' : 'Not following any creators yet'}
            </h4>
            <p className="text-xs text-muted max-w-[260px] mb-5">
              {search
                ? `No creators match "${search}"`
                : 'Discover and follow your favorite creators on Explore.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => navigate('/explore')}
                className="px-5 py-2.5 rounded-full bg-gold text-ink font-semibold text-xs hover:bg-gold-light active:scale-95 transition-all cursor-pointer shadow-lg shadow-gold/20"
              >
                Discover Creators
              </button>
            )}
          </div>
        ) : (
          /* Following List */
          <div className="bg-[#101010] rounded-2xl overflow-hidden border border-white/[0.04] divide-y divide-white/[0.04]">
            {filteredFollowing.map((item) => {
              const { creator } = item;
              const online = isOnline(creator.owner?.last_seen_at);
              const initial = creator.display_name.charAt(0).toUpperCase();

              return (
                <div
                  key={creator.id}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left group"
                >
                  <div
                    onClick={() => {
                      const username = creator.owner?.username || creator.display_name.toLowerCase().replace(/\s+/g, '');
                      navigate(`/profile/${username}`);
                    }}
                    className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer"
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-ink-light border border-white/10 flex items-center justify-center">
                        {creator.avatar_url ? (
                          <img
                            src={creator.avatar_url}
                            alt={creator.display_name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div
                            className={`w-full h-full flex items-center justify-center text-white text-sm font-semibold ${getAvatarColor(
                              creator.display_name
                            )}`}
                          >
                            {initial}
                          </div>
                        )}
                      </div>
                      {online && (
                        <span
                          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#101010]"
                          title="Online now"
                        />
                      )}
                    </div>

                    {/* Creator Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-paper truncate group-hover:text-gold transition-colors">
                          {creator.display_name}
                        </p>
                        {creator.is_verified && (
                          <CheckCircle2 size={12} className="text-gold fill-gold/20 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {creator.owner?.username && (
                          <span className="text-[11px] text-muted truncate">
                            @{creator.owner.username}
                          </span>
                        )}
                        {creator.category && (
                          <>
                            <span className="text-[10px] text-white/20">•</span>
                            <span className="text-[10px] text-gold/80 px-1.5 py-0.2 rounded bg-gold/10 font-medium">
                              {creator.category}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions: Message + Unfollow */}
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => handleMessage(creator.id)}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-gold hover:text-ink text-white/70 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Send message"
                    >
                      <MessageSquare size={12} />
                      <span className="hidden sm:inline">Message</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUnfollow(item)}
                      className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-red-500/20 text-white/40 hover:text-red-400 text-xs font-medium transition-all flex items-center cursor-pointer"
                      title="Unfollow"
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
