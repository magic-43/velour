import { useState, useEffect } from 'react';
import { ArrowLeft, Compass, Search, X, MessageSquare, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useBackHandler } from '../../lib/backButtonRegistry';
import type { CreatorProfile } from '../../types';

interface FanFollowingViewProps {
  onBack: () => void;
}

interface FollowingItem {
  conversationId: string;
  creator: CreatorProfile;
  lastMessageAt: string | null;
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
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [following, setFollowing] = useState<FollowingItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Android hardware back button handler
  useBackHandler(() => {
    onBack();
    return true;
  }, true, 80);

  useEffect(() => {
    if (!profile) return;

    async function fetchFollowing() {
      try {
        setLoading(true);

        // Fetch conversations connected to this fan
        const { data, error } = await supabase
          .from('conversations')
          .select(`
            id,
            last_message_at,
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
          .eq('fan_id', profile!.id)
          .order('last_message_at', { ascending: false, nullsFirst: false });

        if (!error && data) {
          const list: FollowingItem[] = data
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((row: any) => Boolean(row.creator) && row.creator?.owner?.role !== 'admin' && row.creator?.owner?.username !== 'admin')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((row: any) => ({
              conversationId: row.id,
              creator: row.creator as CreatorProfile,
              lastMessageAt: row.last_message_at,
            }));

          setFollowing(list);
        }
      } catch (err) {
        console.error('Error fetching following creators:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchFollowing();
  }, [profile]);

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
    <div className="px-4 sm:px-5 pt-0 pb-24 md:pb-8 max-w-[600px] w-full mx-auto md:mx-0">
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
          <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">
            Following
          </h3>
        </div>

        {following.length > 0 && (
          <span className="text-xs text-muted font-medium tracking-tight">
            {following.length} {following.length === 1 ? 'creator' : 'creators'}
          </span>
        )}
      </div>

      {/* Discover-Style Search Input */}
      {following.length > 0 && (
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search creators you follow..."
            className="w-full bg-[#101010] border border-white/[0.06] rounded-xl pl-9 pr-9 py-2 text-xs text-paper placeholder-muted/50 focus:outline-none focus:border-gold/40 transition-colors"
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
      )}

      {/* Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-muted">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs">Loading creators...</p>
        </div>
      ) : following.length === 0 ? (
        /* Empty State */
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-muted mb-3.5">
            <Compass size={22} strokeWidth={1.5} />
          </div>
          <h4 className="font-medium text-sm text-paper mb-1">
            You are not following any creators yet
          </h4>
          <p className="text-muted text-xs max-w-xs mb-5 leading-relaxed">
            Discover verified creators, unlock private moments, and start 1-to-1 conversations.
          </p>
          <button
            type="button"
            onClick={() => navigate('/explore')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gold hover:bg-gold-light text-ink text-xs font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
          >
            <Compass size={14} />
            <span>Discover Creators</span>
          </button>
        </div>
      ) : filteredFollowing.length === 0 ? (
        /* No Search Matches */
        <div className="py-16 text-center text-muted">
          <p className="text-xs">No creators match &quot;{search}&quot;</p>
        </div>
      ) : (
        /* Following List */
        <div className="bg-[#101010] rounded-2xl overflow-hidden border border-white/[0.04] divide-y divide-white/[0.04]">
          {filteredFollowing.map(({ conversationId, creator }) => {
            const online = isOnline(creator.owner?.last_seen_at);
            const initial = creator.display_name.charAt(0).toUpperCase();

            return (
              <div
                key={conversationId}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left group"
              >
                <div
                  onClick={() => navigate(`/messages/${conversationId}`)}
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

                {/* Quick Action: Message */}
                <button
                  type="button"
                  onClick={() => navigate(`/messages/${conversationId}`)}
                  className="ml-2.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-gold hover:text-ink text-white/70 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="Send message"
                >
                  <MessageSquare size={12} />
                  <span>Message</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
