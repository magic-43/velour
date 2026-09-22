import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Shield, ShieldOff, UserCheck, UserX, LogOut, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import type { Profile } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterRole = 'all' | 'fan' | 'creator' | 'admin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleBadge(role: string) {
  const map: Record<string, string> = {
    admin:   'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    creator: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    fan:     'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30',
  };
  return map[role] ?? map.fan;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  onPromote,
  onRevoke,
  onBan,
  onUnban,
  loading,
}: {
  user: Profile;
  onPromote: (id: string, name: string, avatarUrl?: string | null) => void;
  onRevoke: (id: string) => void;
  onBan: (id: string) => void;
  onUnban: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-zinc-900/40 transition-colors">
      {/* User Info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden font-medium text-sm text-paper">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            user.username.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-paper truncate">
              {user.display_name ?? user.username}
            </span>
            <span className="text-xs text-zinc-500 truncate">@{user.username}</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${roleBadge(user.role)}`}>
              {user.role}
            </span>
            {user.is_banned && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                banned
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 mt-0.5">Joined {timeAgo(user.created_at)}</p>
        </div>
      </div>

      {/* Actions */}
      {user.role !== 'admin' && (
        <div className="flex items-center gap-2 shrink-0">
          {/* Promote / Revoke */}
          {user.role === 'fan' ? (
            <button
              onClick={() => onPromote(user.id, user.display_name ?? user.username, user.avatar_url)}
              disabled={loading}
              title="Promote to creator"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-medium transition-colors disabled:opacity-40"
            >
              <UserCheck size={13} />
              Make Creator
            </button>
          ) : (
            <button
              onClick={() => onRevoke(user.id)}
              disabled={loading}
              title="Revoke creator"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700/30 hover:bg-zinc-700/50 text-zinc-400 text-xs font-medium transition-colors disabled:opacity-40"
            >
              <UserX size={13} />
              Revoke
            </button>
          )}

          {/* Ban / Unban */}
          {user.is_banned ? (
            <button
              onClick={() => onUnban(user.id)}
              disabled={loading}
              title="Unban user"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Shield size={13} />
              Unban
            </button>
          ) : (
            <button
              onClick={() => onBan(user.id)}
              disabled={loading}
              title="Ban user"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors disabled:opacity-40"
            >
              <ShieldOff size={13} />
              Ban
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function Admin() {
  const { profile, isAdmin, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterRole>('all');
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/', { replace: true });
  }, [authLoading, isAdmin, navigate]);

  const fetchUsers = useCallback(async () => {
    setFetching(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setUsers(data as Profile[]);
    setFetching(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handlePromote = async (userId: string, displayName: string, avatarUrl?: string | null) => {
    setActionLoading(true);
    try {
      // 1. Update role
      const { error: roleErr } = await supabase
        .from('profiles')
        .update({ role: 'creator' })
        .eq('id', userId);
      if (roleErr) throw roleErr;

      // 2. Ensure a creator profile exists for this user
      const { data: existingProfiles, error: checkErr } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('owner_id', userId)
        .limit(1);

      if (checkErr) throw checkErr;

      if (!existingProfiles || existingProfiles.length === 0) {
        const { error: insertErr } = await supabase
          .from('creator_profiles')
          .insert({
            owner_id: userId,
            display_name: displayName,
            avatar_url: avatarUrl || null,
            is_active: true,
          });
        if (insertErr) throw insertErr;
      } else {
        await supabase
          .from('creator_profiles')
          .update({
            is_active: true,
            ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          })
          .eq('owner_id', userId);
      }

      await fetchUsers();
      showToast(`${displayName} is now a creator ✓`);
    } catch (err: unknown) {
      showToast((err as Error).message ?? 'Failed to promote', false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'fan' })
        .eq('id', userId);
      if (error) throw error;
      await fetchUsers();
      showToast('Creator access revoked');
    } catch (err: unknown) {
      showToast((err as Error).message ?? 'Failed to revoke', false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBan = async (userId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: true })
        .eq('id', userId);
      if (error) throw error;
      await fetchUsers();
      showToast('User banned');
    } catch (err: unknown) {
      showToast((err as Error).message ?? 'Failed to ban', false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnban = async (userId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: false })
        .eq('id', userId);
      if (error) throw error;
      await fetchUsers();
      showToast('User unbanned');
    } catch (err: unknown) {
      showToast((err as Error).message ?? 'Failed to unban', false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // ── Filter ───────────────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const matchRole = filter === 'all' || u.role === filter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      u.username.toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  // ── Stats ────────────────────────────────────────────────────────────────────

  const counts = {
    total:    users.length,
    fans:     users.filter(u => u.role === 'fan').length,
    creators: users.filter(u => u.role === 'creator').length,
    banned:   users.filter(u => u.is_banned).length,
  };

  if (authLoading) return (
    <div className="h-screen bg-[#090909] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#c9a96e] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#090909] text-[#f0ece4] font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#090909]/90 backdrop-blur border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-serif text-lg tracking-[0.2em] text-[#c9a96e]">VELOUR</span>
          <span className="text-[#2a2a2a]">|</span>
          <span className="text-xs font-semibold tracking-widest uppercase text-zinc-500">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 hidden sm:block">
            {profile?.display_name ?? profile?.username}
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-[#f0ece4] transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total users',  value: counts.total },
            { label: 'Fans',         value: counts.fans },
            { label: 'Creators',     value: counts.creators },
            { label: 'Banned',       value: counts.banned },
          ].map(s => (
            <div key={s.label} className="bg-[#101010] border border-[#1a1a1a] rounded-xl px-4 py-4">
              <p className="text-2xl font-semibold text-[#f0ece4]">{s.value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#1c1c1e] text-white rounded-xl py-2 pl-10 pr-9 text-sm focus:outline-none placeholder-zinc-500 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Role filter */}
          <div className="relative">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as FilterRole)}
              className="appearance-none bg-[#101010] border border-[#1a1a1a] rounded-xl px-4 pr-9 py-2.5 text-sm text-[#f0ece4] focus:outline-none focus:border-[#2a2a2a] transition-colors cursor-pointer"
            >
              <option value="all">All roles</option>
              <option value="fan">Fans</option>
              <option value="creator">Creators</option>
              <option value="admin">Admins</option>
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>
        </div>

        {/* ── User list ── */}
        <div className="bg-[#101010] border border-[#1a1a1a] rounded-2xl overflow-hidden">
          {fetching ? (
            <div className="py-16 flex justify-center">
              <div className="w-5 h-5 border-2 border-[#c9a96e] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-zinc-500 text-sm">No users found</p>
            </div>
          ) : (
            filtered.map(u => (
              <UserRow
                key={u.id}
                user={u}
                onPromote={handlePromote}
                onRevoke={handleRevoke}
                onBan={handleBan}
                onUnban={handleUnban}
                loading={actionLoading}
              />
            ))
          )}
        </div>

        <p className="text-center text-xs text-zinc-700 mt-4">
          {filtered.length} of {users.length} users
        </p>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl transition-all ${
          toast.ok
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
