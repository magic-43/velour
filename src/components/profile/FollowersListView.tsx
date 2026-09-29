import { useState, useEffect } from 'react';
import { ArrowLeft, Users, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useBackHandler } from '../../lib/backButtonRegistry';
import type { Profile } from '../../types';

interface FollowersListViewProps {
  onBack: () => void;
}

interface FollowerItem {
  conversationId: string;
  fan: Profile;
  lastMessageAt: string | null;
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

        // Query conversations where this creator is the creator_profile_id
        const { data, error } = await supabase
          .from('conversations')
          .select(`
            id,
            last_message_at,
            fan:profiles!fan_id(id, username, display_name, avatar_url, last_seen_at)
          `)
          .in('creator_profile_id', targetIds)
          .order('last_message_at', { ascending: false, nullsFirst: false });

        if (!error && data) {
          const list: FollowerItem[] = data
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((row: any) => Boolean(row.fan))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((row: any) => ({
              conversationId: row.id,
              fan: row.fan as Profile,
              lastMessageAt: row.last_message_at,
            }));

          setFollowers(list);
        }
      } catch (err) {
        console.error('Error fetching followers:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchFollowers();
  }, [profile]);

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
    if (diffMins < 1) return 'last seen just now';
    if (diffMins === 1) return 'last seen 1 minute ago';
    if (diffMins < 60) return `last seen ${diffMins} minutes ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs === 1) return 'last seen 1 hour ago';
    if (diffHrs < 24) return `last seen ${diffHrs} hours ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return 'last seen yesterday';
    return `last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  };

  const filtered = followers.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = (f.fan.display_name || '').toLowerCase();
    const username = (f.fan.username || '').toLowerCase();
    return name.includes(q) || username.includes(q);
  });

  return (
    <div className="px-4 sm:px-5 pt-0 pb-24 md:pb-8 max-w-[650px] w-full mx-auto md:mx-0">
      {/* Header matching Stories/Home page */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-5 mb-4 flex items-center justify-between gap-3 bg-ink/95 px-4 py-3.5 backdrop-blur-md sm:px-5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-muted hover:text-paper transition-colors cursor-pointer"
            aria-label="Back to profile"
          >
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">Followers</h3>
        </div>

        {followers.length > 0 && (
          <span className="text-xs text-muted font-medium tracking-tight">
            {followers.length} {followers.length === 1 ? 'follower' : 'followers'}
          </span>
        )}
      </div>

      {/* Search Bar matching Discover */}
      {followers.length > 0 && (
        <div className="mb-3 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            className="w-full bg-[#1c1c1e] text-white rounded-xl py-2 pl-10 pr-9 text-sm focus:outline-none placeholder-zinc-500 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Followers List Body */}
      {loading ? (
        <div className="py-24 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : followers.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-muted mb-3.5">
            <Users size={22} strokeWidth={1.5} />
          </div>
          <h4 className="font-medium text-sm text-paper mb-1">No followers yet</h4>
          <p className="text-muted text-xs max-w-xs mb-5 leading-relaxed">
            When fans connect with you, unlock your stories, or message you, they will appear here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted text-xs">
          No followers found matching "{search}".
        </div>
      ) : (
        <div className="overflow-hidden">
          {filtered.map(({ conversationId, fan }) => {
            const online = isOnline(fan.last_seen_at);
            const name = fan.display_name || fan.username || 'User';

            return (
              <div
                key={fan.id}
                onClick={() => navigate(`/messages/${conversationId}`)}
                className="flex items-center gap-3.5 px-2 sm:px-3 hover:bg-ink-light/50 active:bg-ink-light/80 transition-colors cursor-pointer group rounded-xl"
              >
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

                {/* Content & Inset Divider */}
                <div className="flex-1 min-w-0 flex flex-col justify-center border-b border-[#1c1c1e] py-2.5 pr-2">
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="text-[15px] font-medium text-paper truncate leading-tight">
                      {name}
                    </span>
                    <span className="text-[11px] text-muted/60 shrink-0">
                      @{fan.username}
                    </span>
                  </div>

                  <span
                    className={`text-[13px] truncate leading-tight mt-0.5 ${
                      online ? 'text-gold font-medium' : 'text-zinc-500'
                    }`}
                  >
                    {formatLastSeen(fan.last_seen_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
