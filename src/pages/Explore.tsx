import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useCreatorProfiles } from '../lib/hooks/useCreatorProfiles';
import type { CreatorProfile, Profile } from '../types';
import CreatorProfilePanel from '../components/creator/CreatorProfilePanel';

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-emerald-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-rose-500',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface DiscoveryItem {
  id: string;
  type: 'creator' | 'client';
  name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  last_seen_at?: string | null;
  creator?: CreatorProfile;
  client?: Profile;
}

export default function Explore() {
  const { user, isCreator } = useAuth();
  const { activeCreatorProfile } = useCreatorProfiles();
  const navigate = useNavigate();

  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [clients, setClients] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(false);
  // For creators, default view is 'clients'. For fans, default is 'creators'.
  const [discoveryFilter, setDiscoveryFilter] = useState<'clients' | 'creators' | 'all'>(
    isCreator ? 'clients' : 'creators'
  );
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [selectedDiscoverCreatorId, setSelectedDiscoverCreatorId] = useState<string | null>(null);
  const [messagingClientId, setMessagingClientId] = useState<string | null>(null);

  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Sync default filter if isCreator becomes true on auth resolution
  useEffect(() => {
    if (isCreator) {
      setDiscoveryFilter('clients');
    }
  }, [isCreator]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCreators = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('creator_profiles')
      .select('*, owner:profiles!owner_id(id, username, display_name, avatar_url)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const formatted: CreatorProfile[] = (data as any[]).map((item) => ({
        ...item,
        avatar_url: item.avatar_url || item.owner?.avatar_url || null,
      }));
      setCreators(formatted);
    }
    setLoading(false);
  }, []);

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, role, is_banned, last_seen_at, created_at')
      .eq('role', 'fan')
      .eq('is_banned', false)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setClients(data as Profile[]);
    }
    setClientsLoading(false);
  }, []);

  useEffect(() => {
    fetchCreators();
    if (isCreator) {
      fetchClients();
    }

    const channelId = `explore-realtime:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_profiles' },
        () => {
          fetchCreators();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          if (isCreator) fetchClients();
          fetchCreators();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCreators, fetchClients, isCreator]);

  // Combine items into a unified list based on active filter
  const items: DiscoveryItem[] = useMemo(() => {
    const list: DiscoveryItem[] = [];

    if (discoveryFilter === 'clients' || discoveryFilter === 'all') {
      clients.forEach((c) => {
        list.push({
          id: c.id,
          type: 'client',
          name: c.display_name || c.username,
          username: c.username,
          avatar_url: c.avatar_url,
          bio: c.bio,
          last_seen_at: c.last_seen_at,
          client: c,
        });
      });
    }

    if (discoveryFilter === 'creators' || discoveryFilter === 'all') {
      creators.forEach((cr) => {
        const avatar = cr.avatar_url || cr.owner?.avatar_url || null;
        list.push({
          id: cr.id,
          type: 'creator',
          name: cr.display_name,
          username: cr.owner?.username || cr.display_name.toLowerCase().replace(/\s+/g, ''),
          avatar_url: avatar,
          bio: cr.bio,
          creator: cr,
        });
      });
    }

    return list;
  }, [discoveryFilter, clients, creators]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    const q = discoverSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        item.username.toLowerCase().includes(q) ||
        (item.bio || '').toLowerCase().includes(q)
      );
    });
  }, [items, discoverSearch]);

  const handleMessageCreator = async (creatorProfileId: string) => {
    if (!user) {
      navigate('/auth');
      return;
    }

    try {
      const { data: convId, error } = await supabase.rpc('get_or_create_conversation', {
        p_creator_profile_id: creatorProfileId,
      });

      if (!error && convId) {
        navigate(`/messages/${convId}`);
      } else {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('fan_id', user.id)
          .eq('creator_profile_id', creatorProfileId)
          .maybeSingle();

        if (existing?.id) {
          navigate(`/messages/${existing.id}`);
        } else {
          console.error('Failed to get conversation:', error);
        }
      }
    } catch (err) {
      console.error('Error starting chat from Explore:', err);
    }
  };

  const handleClientMessage = async (client: Profile) => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setMessagingClientId(client.id);

    try {
      let creatorProfileId = activeCreatorProfile?.id;
      if (!creatorProfileId) {
        const { data: owned } = await supabase
          .from('creator_profiles')
          .select('id')
          .eq('owner_id', user.id)
          .eq('is_active', true)
          .limit(1);

        if (owned && owned.length > 0) {
          creatorProfileId = owned[0].id;
        }
      }

      if (!creatorProfileId) {
        console.error('No creator profile found for this user');
        setMessagingClientId(null);
        return;
      }

      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('fan_id', client.id)
        .eq('creator_profile_id', creatorProfileId)
        .maybeSingle();

      if (existing?.id) {
        navigate(`/messages/${existing.id}`);
        return;
      }

      const { data: convId, error: rpcErr } = await supabase.rpc('get_or_create_conversation', {
        p_creator_profile_id: creatorProfileId,
        p_fan_id: client.id,
      });

      if (!rpcErr && convId) {
        navigate(`/messages/${convId}`);
        return;
      }

      const { data: newConv, error: insErr } = await supabase
        .from('conversations')
        .insert({
          fan_id: client.id,
          creator_profile_id: creatorProfileId,
        })
        .select('id')
        .single();

      if (!insErr && newConv?.id) {
        navigate(`/messages/${newConv.id}`);
      } else {
        console.error('Failed to create conversation with client:', rpcErr || insErr);
      }
    } catch (err) {
      console.error('Error starting chat with client:', err);
    } finally {
      setMessagingClientId(null);
    }
  };

  const isOnline = (lastSeenAt?: string | null) => {
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

  return (
    <div className="h-full flex flex-col overflow-hidden bg-ink">
      {selectedDiscoverCreatorId ? (
        <CreatorProfilePanel
          creatorId={selectedDiscoverCreatorId}
          onBack={() => setSelectedDiscoverCreatorId(null)}
          onMessage={handleMessageCreator}
        />
      ) : (
        <>
          {/* Top Header: Discover | Sort */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between bg-ink shrink-0">
            {/* Title in app's serif font */}
            <h1 className="font-serif text-2xl text-paper font-semibold tracking-tight">
              Discover
            </h1>

            {/* Sort / Filter capsule button on the right */}
            <div className="relative" ref={filterMenuRef}>
              <button
                type="button"
                onClick={() => setShowFilterDropdown((prev) => !prev)}
                className="px-4 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white text-sm font-medium transition-colors active:scale-95"
              >
                {isCreator
                  ? (discoveryFilter === 'all'
                      ? 'All'
                      : discoveryFilter === 'creators'
                      ? 'Creators'
                      : 'Sort')
                  : 'Sort'}
              </button>

              {/* Dropdown Menu */}
              {showFilterDropdown && (
                <div className="absolute right-0 mt-2 w-36 rounded-xl border border-zinc-800 bg-[#1c1c1e] p-1 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                  {[
                    { key: 'clients', label: 'Clients' },
                    { key: 'creators', label: 'Creators' },
                    { key: 'all', label: 'All' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setDiscoveryFilter(opt.key as 'clients' | 'creators' | 'all');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        discoveryFilter === opt.key
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {discoveryFilter === opt.key && <Check size={13} className="text-white" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-4 py-2 bg-ink shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="text"
                value={discoverSearch}
                onChange={(event) => setDiscoverSearch(event.target.value)}
                placeholder="Search"
                className="w-full bg-[#1c1c1e] text-white rounded-xl py-2 pl-10 pr-9 text-sm focus:outline-none placeholder-zinc-500 transition-colors"
              />
              {discoverSearch && (
                <button
                  type="button"
                  onClick={() => setDiscoverSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Contacts List Body */}
          <div className="flex-1 overflow-y-auto bg-ink pb-24 md:pb-8">
            {/* Loading Indicator */}
            {(loading || clientsLoading) && items.length === 0 ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="h-[40vh] flex items-center justify-center text-center px-6">
                <div>
                  <p className="text-base font-medium text-paper mb-1">No contacts found</p>
                  <p className="text-xs text-zinc-500">
                    {discoverSearch ? 'Try a different search term.' : 'No profiles match the selected view.'}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                {filteredItems.map((item) => {
                  const online = isOnline(item.last_seen_at);

                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      onClick={() => {
                        if (item.type === 'creator') {
                          setSelectedDiscoverCreatorId(item.id);
                        } else if (item.client) {
                          handleClientMessage(item.client);
                        }
                      }}
                      className="flex items-center gap-3.5 px-4 hover:bg-ink-light/50 active:bg-ink-light/80 transition-colors cursor-pointer group"
                    >
                      {/* Avatar */}
                      <div className="w-11 h-11 rounded-full shrink-0 overflow-hidden bg-zinc-800 flex items-center justify-center">
                        {item.avatar_url ? (
                          <img
                            src={item.avatar_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div
                            className={`w-full h-full ${getAvatarColor(
                              item.name
                            )} flex items-center justify-center text-white font-semibold text-base select-none`}
                          >
                            {item.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Content & Inset Divider */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center border-b border-[#1c1c1e] py-2.5 pr-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[15px] font-medium text-paper truncate leading-tight">
                            {item.name}
                          </span>
                        </div>

                        <span
                          className={`text-[13px] truncate leading-tight mt-0.5 ${
                            online ? 'text-gold font-medium' : 'text-zinc-500'
                          }`}
                        >
                          {formatLastSeen(item.last_seen_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

