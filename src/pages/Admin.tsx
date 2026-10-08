import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Shield,
  ShieldOff,
  UserCheck,
  UserX,
  LogOut,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  CreditCard,
  QrCode,
  Smartphone,
  ZoomIn,
  DollarSign,
  Users,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import type { Profile } from '../types';
import { useBackHandler } from '../lib/backButtonRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterRole = 'all' | 'fan' | 'creator' | 'admin';
type AdminSection = 'users' | 'transactions';
type TxFilterStatus = 'all' | 'pending' | 'verified' | 'rejected';

interface AdminTxItem {
  id: string;
  user_id: string;
  creator_id?: string | null;
  type: string;
  amount_usd: number;
  status: string;
  attachment_id?: string | null;
  card_type?: string | null;
  card_image_url?: string | null;
  media_url?: string | null;
  reference?: string | null;
  description?: string | null;
  created_at: string;
  fan?: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  creator?: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  title?: string;
}

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

      {user.role !== 'admin' && (
        <div className="flex items-center gap-2 shrink-0">
          {user.role === 'fan' ? (
            <button
              onClick={() => onPromote(user.id, user.display_name ?? user.username, user.avatar_url)}
              disabled={loading}
              title="Promote to creator"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
            >
              <UserCheck size={13} />
              Make Creator
            </button>
          ) : (
            <button
              onClick={() => onRevoke(user.id)}
              disabled={loading}
              title="Revoke creator"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700/30 hover:bg-zinc-700/50 text-zinc-400 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
            >
              <UserX size={13} />
              Revoke
            </button>
          )}

          {user.is_banned ? (
            <button
              onClick={() => onUnban(user.id)}
              disabled={loading}
              title="Unban user"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Shield size={13} />
              Unban
            </button>
          ) : (
            <button
              onClick={() => onBan(user.id)}
              disabled={loading}
              title="Ban user"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
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

  const [section, setSection] = useState<AdminSection>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterRole>('all');
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Transactions State
  const [transactions, setTransactions] = useState<AdminTxItem[]>([]);
  const [txFilter, setTxFilter] = useState<TxFilterStatus>('pending');
  const [txFetching, setTxFetching] = useState(false);
  const [txProcessingId, setTxProcessingId] = useState<string | null>(null);
  const [inspectedTx, setInspectedTx] = useState<AdminTxItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useBackHandler(() => {
    setInspectedTx(null);
    return true;
  }, inspectedTx !== null, 100);

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

  const fetchTransactions = useCallback(async () => {
    setTxFetching(true);
    try {
      let rawData: any[] = [];
      const { data, error } = await supabase
        .from('transactions_ledger')
        .select(`
          id,
          user_id,
          creator_id,
          type,
          amount_usd,
          status,
          attachment_id,
          card_type,
          card_image_url,
          media_url,
          reference,
          description,
          created_at,
          fan:profiles!user_id(id, username, display_name, avatar_url),
          creator:profiles!creator_id(id, username, display_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        rawData = data;
      } else {
        // Fallback: select without joins in case relationships are missing in schema cache
        const { data: fallbackData } = await supabase
          .from('transactions_ledger')
          .select('*')
          .order('created_at', { ascending: false });
        if (fallbackData) rawData = fallbackData;
      }

      // Parse metadata from description
      let list: AdminTxItem[] = rawData.map((item) => {
        let cardType = item.card_type;
        let cardImageUrl = item.card_image_url;
        let mediaUrl = item.media_url;
        let creatorId = item.creator_id;

        if (item.description && item.description.includes('[META:')) {
          try {
            const metaStr = item.description.split('[META:')[1].split(']')[0];
            const meta = JSON.parse(metaStr);
            if (!cardType && meta.card_type) cardType = meta.card_type;
            if (!cardImageUrl && meta.card_image_url) cardImageUrl = meta.card_image_url;
            if (!mediaUrl && meta.media_url) mediaUrl = meta.media_url;
            if (!creatorId && meta.creator_id) creatorId = meta.creator_id;
          } catch {}
        }

        return {
          ...item,
          card_type: cardType,
          card_image_url: cardImageUrl,
          media_url: mediaUrl,
          creator_id: creatorId,
        };
      });

      // Resolve any missing fan or creator profiles in batch
      const userIdsToFetch = new Set<string>();
      list.forEach((it) => {
        if (!it.fan && it.user_id) userIdsToFetch.add(it.user_id);
        if (!it.creator && it.creator_id) userIdsToFetch.add(it.creator_id);
      });

      if (userIdsToFetch.size > 0) {
        try {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', Array.from(userIdsToFetch));

          if (profilesData) {
            const pMap = new Map(profilesData.map((p: any) => [p.id, p]));
            list = list.map((it) => ({
              ...it,
              fan: it.fan || (it.user_id ? pMap.get(it.user_id) : undefined),
              creator: it.creator || (it.creator_id ? pMap.get(it.creator_id) : undefined),
            }));
          }
        } catch {}
      }

      // Merge local admin pending transactions cache
      try {
        const raw = localStorage.getItem('velour_admin_pending_txs');
        if (raw) {
          const localTxs = JSON.parse(raw);
          for (const lt of localTxs) {
            if (!list.some((it) => it.id === lt.id)) {
              list.unshift(lt);
            }
          }
        }
      } catch {}

      setTransactions(list);
    } catch (err) {
      console.warn('Error fetching transactions for admin:', err);
    } finally {
      setTxFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchTransactions();

    const channel = supabase
      .channel('admin_transactions_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions_ledger',
        },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUsers, fetchTransactions]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCopyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Actions: Users ───────────────────────────────────────────────────────────

  const handlePromote = async (userId: string, displayName: string, avatarUrl?: string | null) => {
    setActionLoading(true);
    try {
      const { error: roleErr } = await supabase
        .from('profiles')
        .update({ role: 'creator' })
        .eq('id', userId);
      if (roleErr) throw roleErr;

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
      const { error: roleErr } = await supabase
        .from('profiles')
        .update({ role: 'fan' })
        .eq('id', userId);
      if (roleErr) throw roleErr;

      await supabase
        .from('creator_profiles')
        .update({ is_active: false })
        .eq('owner_id', userId);

      await fetchUsers();
      showToast('Creator privileges revoked ✓');
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
      showToast('User banned ✓');
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
      showToast('User unbanned ✓');
    } catch (err: unknown) {
      showToast((err as Error).message ?? 'Failed to unban', false);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Actions: Transactions ────────────────────────────────────────────────────

  const handleAdminApprove = async (tx: AdminTxItem) => {
    if (!profile?.id) return;
    setTxProcessingId(tx.id);
    try {
      let rpcSuccess = false;
      try {
        const { error: rpcErr } = await supabase.rpc('verify_unlock', {
          p_transaction_id: tx.id,
          p_approver_id: profile.id,
        });
        if (!rpcErr) rpcSuccess = true;
      } catch {
        rpcSuccess = false;
      }

      if (!rpcSuccess) {
        await supabase
          .from('transactions_ledger')
          .update({ status: 'verified' })
          .eq('id', tx.id);

        if (tx.attachment_id) {
          try {
            await supabase
              .from('attachment_unlocks')
              .update({ status: 'verified' })
              .eq('attachment_id', tx.attachment_id)
              .eq('fan_id', tx.user_id);
          } catch {}
        }

        if (tx.media_url) {
          try {
            await supabase
              .from('attachment_unlocks')
              .update({ status: 'verified' })
              .eq('media_url', tx.media_url)
              .eq('fan_id', tx.user_id);
          } catch {}
        }
      }

      // Update local storage caches
      try {
        const aRaw = localStorage.getItem('velour_admin_pending_txs');
        if (aRaw) {
          const aList: AdminTxItem[] = JSON.parse(aRaw);
          localStorage.setItem('velour_admin_pending_txs', JSON.stringify(aList.filter((it) => it.id !== tx.id)));
        }

        const fanKey = `velour_unlocked_media_${tx.user_id}`;
        const fanRaw = localStorage.getItem(fanKey);
        if (fanRaw) {
          const fanList = JSON.parse(fanRaw);
          const updated = fanList.map((item: any) => {
            if (item.id === tx.attachment_id || item.mediaUrl === tx.media_url || item.id === tx.id) {
              return { ...item, status: 'verified' };
            }
            return item;
          });
          localStorage.setItem(fanKey, JSON.stringify(updated));
        }
      } catch {}

      window.dispatchEvent(
        new CustomEvent('velour:unlock_verified', {
          detail: { attachmentId: tx.attachment_id, mediaUrl: tx.media_url, txId: tx.id },
        })
      );

      setTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, status: 'verified' } : t))
      );
      if (inspectedTx?.id === tx.id) setInspectedTx(null);
      showToast(`Transaction approved and unlocked ✓`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to approve', false);
    } finally {
      setTxProcessingId(null);
    }
  };

  const handleAdminReject = async (tx: AdminTxItem) => {
    if (!profile?.id) return;
    setTxProcessingId(tx.id);
    try {
      let rpcSuccess = false;
      try {
        const { error: rpcErr } = await supabase.rpc('reject_unlock', {
          p_transaction_id: tx.id,
          p_approver_id: profile.id,
          p_reason: 'Rejected by administrator',
        });
        if (!rpcErr) rpcSuccess = true;
      } catch {
        rpcSuccess = false;
      }

      if (!rpcSuccess) {
        await supabase
          .from('transactions_ledger')
          .update({ status: 'rejected' })
          .eq('id', tx.id);
      }

      try {
        const aRaw = localStorage.getItem('velour_admin_pending_txs');
        if (aRaw) {
          const aList: AdminTxItem[] = JSON.parse(aRaw);
          localStorage.setItem('velour_admin_pending_txs', JSON.stringify(aList.filter((it) => it.id !== tx.id)));
        }
      } catch {}

      setTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, status: 'rejected' } : t))
      );
      if (inspectedTx?.id === tx.id) setInspectedTx(null);
      showToast('Transaction rejected');
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject', false);
    } finally {
      setTxProcessingId(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // ── Filters & Counts ─────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchRole = filter === 'all' || u.role === filter;
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        u.username.toLowerCase().includes(q) ||
        (u.display_name?.toLowerCase().includes(q) ?? false);
      return matchRole && matchSearch;
    });
  }, [users, filter, search]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (txFilter === 'all') return true;
      return tx.status === txFilter;
    });
  }, [transactions, txFilter]);

  const counts = {
    total: users.length,
    fans: users.filter((u) => u.role === 'fan').length,
    creators: users.filter((u) => u.role === 'creator').length,
    banned: users.filter((u) => u.is_banned).length,
    pendingTxs: transactions.filter((t) => t.status === 'pending').length,
  };

  return (
    <div className="min-h-screen bg-[#090909] text-[#f0ece4] font-sans">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-40 bg-[#090909]/95 backdrop-blur border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-serif text-lg tracking-[0.2em] text-[#c9a96e]">VELOUR</span>
          <span className="text-[#2a2a2a]">|</span>
          <span className="text-xs font-semibold tracking-widest uppercase text-zinc-500">Admin Control</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 hidden sm:block">
            {profile?.display_name ?? profile?.username}
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-[#f0ece4] transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Section Navigation Tabs ── */}
        <div className="p-1 rounded-2xl bg-[#141416] border border-white/10 flex gap-1">
          <button
            type="button"
            onClick={() => setSection('users')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              section === 'users'
                ? 'bg-gold text-ink shadow-md font-bold'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Users size={15} />
            <span>Users Management</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10">
              {counts.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSection('transactions')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              section === 'transactions'
                ? 'bg-gold text-ink shadow-md font-bold'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <DollarSign size={15} />
            <span>Unlock Transactions</span>
            {counts.pendingTxs > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  section === 'transactions' ? 'bg-ink text-gold' : 'bg-gold text-ink'
                }`}
              >
                {counts.pendingTxs}
              </span>
            )}
          </button>
        </div>

        {/* ── SECTION: USERS ───────────────────────────────────────────────── */}
        {section === 'users' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total users', value: counts.total },
                { label: 'Fans', value: counts.fans },
                { label: 'Creators', value: counts.creators },
                { label: 'Banned', value: counts.banned },
              ].map((s) => (
                <div key={s.label} className="bg-[#101010] border border-[#1a1a1a] rounded-xl px-4 py-4">
                  <p className="text-2xl font-semibold text-[#f0ece4]">{s.value}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                  type="text"
                  placeholder="Search user..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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

              <div className="relative">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as FilterRole)}
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

            {/* User List */}
            <div className="bg-[#101010] border border-[#1a1a1a] rounded-2xl overflow-hidden">
              {fetching ? (
                <div className="py-16 flex justify-center">
                  <div className="w-5 h-5 border-2 border-[#c9a96e] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-zinc-500 text-sm">No users found</p>
                </div>
              ) : (
                filteredUsers.map((u) => (
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

            <p className="text-center text-xs text-zinc-700">
              {filteredUsers.length} of {users.length} users
            </p>
          </div>
        )}

        {/* ── SECTION: TRANSACTIONS ────────────────────────────────────────── */}
        {section === 'transactions' && (
          <div className="space-y-6">
            {/* Status Filter Toolbar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1.5 p-1 bg-[#101010] border border-[#1a1a1a] rounded-xl">
                {(['pending', 'verified', 'rejected', 'all'] as TxFilterStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTxFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                      txFilter === st
                        ? 'bg-gold/20 text-gold border border-gold/40'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={fetchTransactions}
                disabled={txFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/80 transition-colors cursor-pointer"
              >
                <RefreshCw size={12} className={txFetching ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Transactions List */}
            <div className="space-y-3">
              {txFetching && transactions.length === 0 ? (
                <div className="py-16 flex justify-center">
                  <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/10">
                  <CheckCircle2 size={24} className="text-zinc-600 mx-auto mb-2" />
                  <p className="text-zinc-400 text-sm">No transactions in this category</p>
                </div>
              ) : (
                filteredTransactions.map((tx) => {
                  const fanName = tx.fan?.display_name || tx.fan?.username || 'Fan';
                  const creatorName = tx.creator?.display_name || tx.creator?.username || 'Creator';
                  const isPending = tx.status === 'pending';
                  const isPhysical = tx.card_type === 'physical_card' || Boolean(tx.card_image_url);
                  const isCrypto = tx.card_type === 'crypto';

                  return (
                    <div
                      key={tx.id}
                      className="p-4 sm:p-5 rounded-2xl bg-[#121214] border border-white/10 hover:border-gold/30 transition-all shadow-md space-y-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-paper">
                              Fan: <span className="text-gold">{fanName}</span>
                            </span>
                            <span className="text-white/30">→</span>
                            <span className="text-xs font-semibold text-paper">
                              Creator: <span className="text-purple-400">{creatorName}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-white/40 mt-0.5">
                            {new Date(tx.created_at).toLocaleString()} · {tx.title || 'Media Unlock'}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-base font-bold font-serif text-gold">
                            ${tx.amount_usd}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider block ${
                              tx.status === 'verified'
                                ? 'text-emerald-400'
                                : tx.status === 'pending'
                                ? 'text-amber-400'
                                : 'text-red-400'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </div>
                      </div>

                      {/* Payment Proof Box */}
                      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isPhysical ? (
                            <CreditCard size={15} className="text-amber-400 shrink-0" />
                          ) : isCrypto ? (
                            <QrCode size={15} className="text-sky-400 shrink-0" />
                          ) : (
                            <Smartphone size={15} className="text-emerald-400 shrink-0" />
                          )}
                          <span className="text-xs font-medium text-white/80 truncate">
                            {tx.description || tx.reference || 'Proof provided'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isPhysical && tx.card_image_url && (
                            <button
                              type="button"
                              onClick={() => setInspectedTx(tx)}
                              className="px-2.5 py-1 rounded-md bg-gold/15 text-gold hover:bg-gold/25 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <ZoomIn size={12} />
                              <span>Inspect Photo</span>
                            </button>
                          )}

                          {tx.reference && !isPhysical && (
                            <button
                              type="button"
                              onClick={() => handleCopyCode(tx.id, tx.reference!)}
                              className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs text-white flex items-center gap-1 cursor-pointer"
                            >
                              {copiedId === tx.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              <span>{copiedId === tx.id ? 'Copied' : 'Copy Code'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Admin Approve / Reject actions for pending */}
                      {isPending && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAdminApprove(tx)}
                            disabled={txProcessingId === tx.id}
                            className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-ink font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-40"
                          >
                            {txProcessingId === tx.id ? (
                              <Loader2 size={13} className="animate-spin text-ink" />
                            ) : (
                              <CheckCircle2 size={14} />
                            )}
                            <span>Admin Approve</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAdminReject(tx)}
                            disabled={txProcessingId === tx.id}
                            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-red-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                          >
                            <XCircle size={14} />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Photo Inspection Modal for Physical Cards ── */}
      {inspectedTx && (
        <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-white border-b border-white/10 pb-3">
            <div>
              <h4 className="font-semibold text-sm sm:text-base text-paper">
                Admin Card Inspection
              </h4>
              <p className="text-xs text-white/50">
                Fan: {inspectedTx.fan?.display_name || inspectedTx.fan?.username} · ${inspectedTx.amount_usd}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInspectedTx(null)}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center my-4 overflow-hidden">
            {inspectedTx.card_image_url ? (
              <img
                src={inspectedTx.card_image_url}
                alt="Card inspection"
                className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border border-white/15"
              />
            ) : (
              <p className="text-zinc-500 text-sm">No photo available</p>
            )}
          </div>

          {inspectedTx.status === 'pending' && (
            <div className="flex items-center gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleAdminApprove(inspectedTx)}
                disabled={txProcessingId === inspectedTx.id}
                className="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-ink font-bold text-sm flex items-center justify-center gap-2 shadow-xl cursor-pointer"
              >
                <CheckCircle2 size={16} />
                <span>Admin Approve (${inspectedTx.amount_usd})</span>
              </button>

              <button
                type="button"
                onClick={() => handleAdminReject(inspectedTx)}
                disabled={txProcessingId === inspectedTx.id}
                className="px-5 py-3.5 rounded-xl bg-white/10 hover:bg-red-500/20 text-red-400 border border-white/10 text-sm font-semibold cursor-pointer"
              >
                <XCircle size={16} />
                <span>Reject</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl transition-all ${
            toast.ok
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
