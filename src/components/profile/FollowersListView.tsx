import { useState, useEffect } from 'react';
import { ArrowLeft, Users, Search, X, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useBackHandler } from '../../lib/backButtonRegistry';
import type { Profile } from '../../types';

interface FollowersListViewProps {
  onBack: () => void;
}

interface FollowerItem {
  id: string;
  fan: Profile;
  followedAt?: string | null;
}

function getAvatarColor(name: string) {
  const colors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function FollowersListView({ onBack }: FollowersListViewProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [followers, setFollowers] = useState<FollowerItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Android hardware back button handler
  useBackHandler(() => {
    onBack();
    return true;
  }, true, 80);

  useEffect(() => {
    if (!profile) return;

    async function fetchFollowers() {
      try {
        setLoading(true);

        // Fetch creator personas
        const { data: personas } = await supabase
          .from('creator_profiles')
          .select('id')
          .eq('owner_id', profile!.id);

        const targetIds = Array.from(
          new Set([profile!.id, ...(personas || []).map((p) => p.id)])
        );

        let rawFollows: any[] = [];
        // 1. Try querying follows with join
        const { data: followsData, error: followErr } = await supabase
          .from('follows')
          .select(`
            id,
            fan_id,
            created_at,
            fan:profiles!fan_id(id, username, display_name, avatar_url, last_seen_at)
          `)
          .in('creator_profile_id', targetIds)
          .order('created_at', { ascending: false });

        if (!followErr && followsData) {
          rawFollows = followsData;
        } else {
          // Fallback: select without join
          const { data: fallbackFollows } = await supabase
            .from('follows')
            .select('*')
            .in('creator_profile_id', targetIds)
            .order('created_at', { ascending: false });
          if (fallbackFollows) rawFollows = fallbackFollows;
        }

        let list: FollowerItem[] = [];

        // If join resolved fan profiles
        if (rawFollows.some((r) => Boolean(r.fan))) {
          list = rawFollows
            .filter((row: any) => Boolean(row.fan))
            .map((row: any) => ({
              id: row.id,
              fan: row.fan as Profile,
              followedAt: row.created_at,
            }));
        } else if (rawFollows.length > 0) {
          // Resolve fan profiles in batch
          const fanIds = Array.from(new Set(rawFollows.map((r: any) => r.fan_id).filter(Boolean)));
          if (fanIds.length > 0) {
            const { data: fansData } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url, last_seen_at')
              .in('id', fanIds);

            if (fansData) {
              const fanMap = new Map(fansData.map((f: any) => [f.id, f]));
              list = rawFollows.map((row: any) => ({
                id: row.id,
                fan: (fanMap.get(row.fan_id) || { id: row.fan_id, username: 'Fan', display_name: 'Fan' }) as Profile,
                followedAt: row.created_at,
              }));
            }
          }
        }

        // Merge local storage fallback if list is still empty
        if (list.length === 0) {
          const localFanIds: string[] = [];
          for (const tId of targetIds) {
            try {
              const raw = localStorage.getItem(`velour_creator_followers_${tId}`);
              if (raw) localFanIds.push(...JSON.parse(raw));
            } catch {}
          }
          if (localFanIds.length > 0) {
            const { data: fansData } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url, last_seen_at')
              .in('id', Array.from(new Set(localFanIds)));

            if (fansData) {
              list = fansData.map((f: any) => ({
                id: f.id,
                fan: f as Profile,
                followedAt: new Date().toISOString(),
              }));
            }
          }
        }

        setFollowers(list);
      } catch (err) {
        console.error('Error fetching followers:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchFollowers();

    const channel = supabase
      .channel(`followers_list_realtime_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
        },
        () => {
          fetchFollowers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const handleMessageFan = async (fanId: string) => {
    if (!profile) return;
    try {
      const { data: cProfiles } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('owner_id', profile.id)
        .limit(1);

      const creatorProfileId = cProfiles?.[0]?.id || profile.id;

      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('fan_id', fanId)
        .eq('creator_profile_id', creatorProfileId)
        .maybeSingle();

      if (existing?.id) {
        navigate(`/messages/${existing.id}`);
        return;
      }

      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          fan_id: fanId,
          creator_profile_id: creatorProfileId,
        })
        .select('id')
        .single();

      if (newConv?.id) {
        navigate(`/messages/${newConv.id}`);
      }
    } catch (err) {
      console.error('Failed to open conversation with fan:', err);
    }
  };

  const isOnline = (lastSeenAt?: string | null): boolean => {
    if (!lastSeenAt) return false;
    return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
  };

  const formatLastSeen = (lastSeenAt?: string | null) => {
    if (!lastSeenAt) return 'last seen recently';
    if (isOnline(lastSeenAt)) return 'online';
    const d = new Date(lastSeenAt);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `active ${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `active ${diffHrs}h ago`;
    return `active ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  };

  const filtered = followers.filter(({ fan }) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const nameMatch = (fan.display_name || '').toLowerCase().includes(q);
    const userMatch = (fan.username || '').toLowerCase().includes(q);
    return nameMatch || userMatch;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-ink">
      {/* Header matching Stories/Home page (permanently pinned) */}
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
              Followers
            </h3>
            <span className="text-xs text-muted font-mono">
              ({followers.length})
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
            placeholder="Search followers..."
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
            <span className="text-xs text-muted">Loading followers…</span>
          </div>
        ) : followers.length === 0 ? (
          <div className="py-20 px-4 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-muted mb-3.5">
              <Users size={28} />
            </div>
            <h4 className="font-medium text-sm text-paper mb-1">No followers yet</h4>
            <p className="text-muted text-xs max-w-xs mb-5 leading-relaxed">
              When fans follow your profile, they will appear here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted text-xs">
            No followers found matching "{search}".
          </div>
        ) : (
          <div className="overflow-hidden space-y-1">
            {filtered.map(({ fan }) => {
              const online = isOnline(fan.last_seen_at);
              const name = fan.display_name || fan.username || 'User';

              return (
                <div
                  key={fan.id}
                  onClick={() => handleMessageFan(fan.id)}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors cursor-pointer group rounded-xl border border-transparent hover:border-white/[0.04]"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-full shrink-0 overflow-hidden bg-zinc-800 flex items-center justify-center">
                      {fan.avatar_url ? (
                        <img
                          src={fan.avatar_url}
                          alt={name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className={`w-full h-full ${getAvatarColor(
                            name
                          )} flex items-center justify-center text-white font-semibold text-base select-none`}
                        >
                          {name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <span className="text-sm font-semibold text-paper truncate leading-tight group-hover:text-gold transition-colors">
                          {name}
                        </span>
                        <span className="text-[11px] text-muted/60 shrink-0">
                          @{fan.username}
                        </span>
                      </div>

                      <span
                        className={`text-xs truncate leading-tight mt-0.5 block ${
                          online ? 'text-gold font-medium' : 'text-zinc-500'
                        }`}
                      >
                        {formatLastSeen(fan.last_seen_at)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMessageFan(fan.id);
                    }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-gold hover:text-ink text-white/60 transition-colors cursor-pointer shrink-0"
                    title="Message fan"
                  >
                    <MessageSquare size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
