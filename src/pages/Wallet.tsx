import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  CreditCard,
  QrCode,
  Smartphone,
  ZoomIn,
  X,
  Sparkles,
  AlertCircle,
  Loader2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useBackHandler } from '../lib/backButtonRegistry';

interface TransactionItem {
  id: string;
  user_id: string;
  creator_id?: string | null;
  type: string;
  amount_usd: number;
  status: 'pending' | 'verified' | 'rejected' | string;
  attachment_id?: string | null;
  card_type?: 'e_card' | 'physical_card' | 'crypto' | string | null;
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
  title?: string;
  card_brand?: string;
}

type TabType = 'requests' | 'history';

export default function Wallet() {
  const { user, profile, isCreator, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('requests');
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [totalEarned, setTotalEarned] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Physical Card Inspection Modal
  const [inspectedTx, setInspectedTx] = useState<TransactionItem | null>(null);

  // Hardware back button handler for modal
  useBackHandler(() => {
    setInspectedTx(null);
    return true;
  }, inspectedTx !== null, 100);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchWalletData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Fetch balance from user_balances
      const { data: balanceData } = await supabase
        .from('user_balances')
        .select('total_earned')
        .eq('user_id', user.id)
        .maybeSingle();

      let dbEarned = balanceData?.total_earned ?? 0;

      // 2. Fetch transactions for this creator
      let fetchedTxs: TransactionItem[] = [];

      // A. Try security-definer RPC if available
      try {
        const { data: rpcTxs, error: rpcErr } = await supabase.rpc('get_creator_pending_unlocks', {
          p_creator_id: user.id,
        });
        if (!rpcErr && rpcTxs && Array.isArray(rpcTxs) && rpcTxs.length > 0) {
          fetchedTxs = rpcTxs as TransactionItem[];
        }
      } catch {}

      // B. Direct query on transactions_ledger
      if (fetchedTxs.length === 0) {
        let rawTxs: any[] = [];
        // First try with fan profile join
        const { data: txData, error: txError } = await supabase
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
            fan:profiles!user_id(id, username, display_name, avatar_url)
          `)
          .or(`creator_id.eq.${user.id},user_id.eq.${user.id},description.ilike.%${user.id}%`)
          .order('created_at', { ascending: false });

        if (!txError && txData) {
          rawTxs = txData;
        } else {
          // Fallback without join in case relationship is not in schema cache
          const { data: fallbackTxs } = await supabase
            .from('transactions_ledger')
            .select('*')
            .or(`creator_id.eq.${user.id},user_id.eq.${user.id},description.ilike.%${user.id}%`)
            .order('created_at', { ascending: false });
          if (fallbackTxs) {
            rawTxs = fallbackTxs;
          }
        }

        // Parse embedded [META:{...}] from description if columns are null
        fetchedTxs = rawTxs.map((item) => {
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

        // Resolve fan profiles if missing
        const missingFanIds = fetchedTxs.filter((t) => !t.fan && t.user_id).map((t) => t.user_id);
        if (missingFanIds.length > 0) {
          try {
            const { data: fans } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .in('id', Array.from(new Set(missingFanIds)));
            if (fans) {
              const fanMap = new Map(fans.map((f: any) => [f.id, f]));
              fetchedTxs = fetchedTxs.map((t) => ({
                ...t,
                fan: t.fan || (t.user_id ? fanMap.get(t.user_id) : undefined),
              }));
            }
          } catch {}
        }
      }

      // Filter: only show transactions where creator_id is user.id, or description contains user.id, or user_id is user.id
      fetchedTxs = fetchedTxs.filter((t) =>
        t.creator_id === user.id ||
        (t.description && t.description.includes(user.id)) ||
        t.user_id === user.id
      );

      // 3. Merge with local storage pending transactions cache
      let localPending: TransactionItem[] = [];
      try {
        const cKey = `velour_creator_pending_txs_${user.id}`;
        const raw = localStorage.getItem(cKey);
        if (raw) localPending = JSON.parse(raw);
      } catch {}

      // Combine unique by transaction id or reference
      const combined = [...localPending];
      for (const tx of fetchedTxs) {
        if (!combined.some((c) => c.id === tx.id)) {
          combined.push(tx);
        }
      }

      // Sort newest first
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTransactions(combined);

      // Compute total earned if user_balances was empty
      if (!dbEarned) {
        dbEarned = combined
          .filter((t) => t.status === 'verified' && (t.type === 'attachment_unlock' || t.type === 'stars_earned'))
          .reduce((acc, curr) => acc + (curr.amount_usd || 0), 0);
      }
      setTotalEarned(dbEarned);
    } catch (err) {
      console.warn('Error fetching wallet data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Realtime subscription on transactions_ledger
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`wallet_transactions_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions_ledger',
        },
        () => {
          fetchWalletData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchWalletData]);

  // Copy code/reference helper
  const handleCopyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Approve Transaction Handler ───────────────────────────────────────────
  const handleApprove = async (tx: TransactionItem) => {
    if (!user) return;
    setProcessingId(tx.id);

    try {
      // 1. Call verify_unlock RPC
      let verifiedViaRpc = false;
      try {
        const { error: rpcErr } = await supabase.rpc('verify_unlock', {
          p_transaction_id: tx.id,
          p_approver_id: user.id,
        });
        if (!rpcErr) {
          verifiedViaRpc = true;
        }
      } catch {
        verifiedViaRpc = false;
      }

      // 2. Fallback direct update if RPC was not run
      if (!verifiedViaRpc) {
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

        // Increment balance
        await supabase
          .from('user_balances')
          .upsert({
            user_id: user.id,
            total_earned: totalEarned + tx.amount_usd,
            updated_at: new Date().toISOString(),
          });
      }

      // 3. Update local storage caches
      try {
        // Creator pending cache
        const cKey = `velour_creator_pending_txs_${user.id}`;
        const raw = localStorage.getItem(cKey);
        if (raw) {
          const list: TransactionItem[] = JSON.parse(raw);
          const filtered = list.filter((item) => item.id !== tx.id);
          localStorage.setItem(cKey, JSON.stringify(filtered));
        }

        // Admin pending cache
        const aKey = `velour_admin_pending_txs`;
        const aRaw = localStorage.getItem(aKey);
        if (aRaw) {
          const aList: TransactionItem[] = JSON.parse(aRaw);
          localStorage.setItem(aKey, JSON.stringify(aList.filter((item) => item.id !== tx.id)));
        }

        // Fan unlocked media cache
        const fanKey = `velour_unlocked_media_${tx.user_id}`;
        const fanRaw = localStorage.getItem(fanKey);
        if (fanRaw) {
          const fanList = JSON.parse(fanRaw);
          const updatedFanList = fanList.map((item: any) => {
            if (
              item.id === tx.attachment_id ||
              item.mediaUrl === tx.media_url ||
              item.id === tx.id
            ) {
              return { ...item, status: 'verified' };
            }
            return item;
          });
          localStorage.setItem(fanKey, JSON.stringify(updatedFanList));
        }
      } catch {}

      // 4. Dispatch browser event for immediate chat update
      window.dispatchEvent(
        new CustomEvent('velour:unlock_verified', {
          detail: {
            attachmentId: tx.attachment_id,
            mediaUrl: tx.media_url,
            txId: tx.id,
          },
        })
      );

      // 5. Update local state
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'verified' } : item))
      );
      setTotalEarned((prev) => prev + tx.amount_usd);
      if (inspectedTx?.id === tx.id) setInspectedTx(null);

      showToast(`Approved! +$${tx.amount_usd} added to your balance.`);
    } catch (err: any) {
      console.error('Failed to approve unlock:', err);
      showToast(err?.message || 'Failed to approve transaction.', false);
    } finally {
      setProcessingId(null);
    }
  };

  // ─── Reject Transaction Handler ────────────────────────────────────────────
  const handleReject = async (tx: TransactionItem) => {
    if (!user) return;
    setProcessingId(tx.id);

    try {
      // 1. Call reject_unlock RPC
      let rejectedViaRpc = false;
      try {
        const { error: rpcErr } = await supabase.rpc('reject_unlock', {
          p_transaction_id: tx.id,
          p_approver_id: user.id,
          p_reason: 'Invalid card or proof rejected by creator',
        });
        if (!rpcErr) {
          rejectedViaRpc = true;
        }
      } catch {
        rejectedViaRpc = false;
      }

      // 2. Fallback direct update
      if (!rejectedViaRpc) {
        await supabase
          .from('transactions_ledger')
          .update({ status: 'rejected' })
          .eq('id', tx.id);

        if (tx.attachment_id) {
          await supabase
            .from('attachment_unlocks')
            .update({ status: 'rejected' })
            .eq('attachment_id', tx.attachment_id)
            .eq('fan_id', tx.user_id);
        }
      }

      // 3. Update local caches
      try {
        const cKey = `velour_creator_pending_txs_${user.id}`;
        const raw = localStorage.getItem(cKey);
        if (raw) {
          const list: TransactionItem[] = JSON.parse(raw);
          localStorage.setItem(cKey, JSON.stringify(list.filter((i) => i.id !== tx.id)));
        }

        const fanKey = `velour_unlocked_media_${tx.user_id}`;
        const fanRaw = localStorage.getItem(fanKey);
        if (fanRaw) {
          const fanList = JSON.parse(fanRaw);
          const updated = fanList.filter(
            (i: any) => i.id !== tx.attachment_id && i.mediaUrl !== tx.media_url
          );
          localStorage.setItem(fanKey, JSON.stringify(updated));
        }
      } catch {}

      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: 'rejected' } : item))
      );
      if (inspectedTx?.id === tx.id) setInspectedTx(null);

      showToast('Transaction rejected.', true);
    } catch (err: any) {
      console.error('Failed to reject unlock:', err);
      showToast(err?.message || 'Failed to reject transaction.', false);
    } finally {
      setProcessingId(null);
    }
  };

  if (authLoading) return null;
  if (!isCreator) return <Navigate to="/" replace />;

  const pendingRequests = transactions.filter((t) => t.status === 'pending');
  const historyTransactions = transactions.filter((t) => t.status !== 'pending');
  const pendingTotal = pendingRequests.reduce((sum, item) => sum + (item.amount_usd || 0), 0);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-ink select-none font-sans">
      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full text-xs font-semibold shadow-2xl backdrop-blur-md border ${
              toast.ok
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-950/90 text-rose-300 border-rose-500/30'
            }`}
          >
            {toast.ok ? <Check size={14} strokeWidth={2.5} /> : <AlertCircle size={14} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* ── Header Bar ────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 shrink-0 flex items-center justify-between gap-3.5 bg-ink/95 px-4 py-3.5 backdrop-blur-md sm:px-5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (window.history.state && window.history.state.idx > 0) {
                navigate(-1);
              } else {
                navigate('/me');
              }
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-paper hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-base sm:text-lg font-serif font-semibold text-paper tracking-tight">
              Wallet & Earnings
            </h3>
            <p className="text-[11px] text-white/50">Creator Monetization Dashboard</p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchWalletData}
          disabled={loading}
          className="text-xs font-medium text-gold/90 hover:text-gold px-3 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/15 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : null}
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Scrollable Body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 pt-4 pb-28 md:pb-12">
        <div className="max-w-[680px] mx-auto w-full space-y-6">

          {/* ── Balance Overview Bento Cards ──────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Total Balance Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#1a1a1e] to-[#121214] border border-white/10 relative overflow-hidden shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                  Total Earned
                </span>
                <div className="w-8 h-8 rounded-xl bg-gold/15 text-gold flex items-center justify-center">
                  <DollarSign size={16} />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-serif font-bold text-paper tracking-tight">
                ${totalEarned.toFixed(2)}
              </div>
              <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                <TrendingUp size={12} />
                <span>Verified income</span>
              </p>
            </div>

            {/* Pending Requests Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#1a1a1e] to-[#121214] border border-white/10 relative overflow-hidden shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                  Pending Unlocks
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Clock size={16} />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-serif font-bold text-amber-400 tracking-tight">
                ${pendingTotal.toFixed(2)}
              </div>
              <p className="text-[11px] text-white/50 mt-1">
                {pendingRequests.length} request{pendingRequests.length === 1 ? '' : 's'} awaiting approval
              </p>
            </div>
          </div>

          {/* ── Segmented Control Tabs ────────────────────────────────────── */}
          <div className="p-1 rounded-2xl bg-[#1c1c1f] border border-white/10 flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'requests'
                  ? 'bg-gold text-ink shadow-md font-bold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Clock size={15} />
              <span>Unlock Requests</span>
              {pendingRequests.length > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === 'requests' ? 'bg-ink text-gold' : 'bg-gold text-ink'
                  }`}
                >
                  {pendingRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-gold text-ink shadow-md font-bold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <CheckCircle2 size={15} />
              <span>Earnings History</span>
            </button>
          </div>

          {/* ── Tab Content: Unlock Requests ──────────────────────────────── */}
          {activeTab === 'requests' && (
            <div className="space-y-3.5">
              {pendingRequests.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/10">
                  <div className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={26} />
                  </div>
                  <h4 className="text-sm font-semibold text-paper">No Pending Requests</h4>
                  <p className="text-xs text-white/40 max-w-xs mx-auto mt-1">
                    When fans unlock exclusive photos or videos with gift cards or crypto, requests will appear here for your approval.
                  </p>
                </div>
              ) : (
                pendingRequests.map((tx) => {
                  const fanName = tx.fan?.display_name || tx.fan?.username || 'Fan';
                  const fanAvatar = tx.fan?.avatar_url;
                  const isProcessing = processingId === tx.id;
                  const isPhysical = tx.card_type === 'physical_card' || Boolean(tx.card_image_url);
                  const isCrypto = tx.card_type === 'crypto' || tx.description?.toLowerCase().includes('crypto');

                  return (
                    <div
                      key={tx.id}
                      className="p-4 sm:p-5 rounded-2xl bg-[#141416] border border-white/10 hover:border-gold/30 transition-all shadow-lg space-y-4"
                    >
                      {/* Top Row: Fan Info + Amount */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-full bg-zinc-800 border border-white/15 overflow-hidden flex items-center justify-center font-bold text-sm text-gold shrink-0">
                            {fanAvatar ? (
                              <img src={fanAvatar} alt={fanName} className="w-full h-full object-cover" />
                            ) : (
                              fanName.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-paper truncate">{fanName}</h4>
                            <p className="text-xs text-white/40">
                              {new Date(tx.created_at).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-white/40 uppercase tracking-wider block">Unlock Amount</span>
                          <span className="text-xl font-bold font-serif text-gold">${tx.amount_usd}</span>
                        </div>
                      </div>

                      {/* Payment Method Verification Box */}
                      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                            {isPhysical ? (
                              <>
                                <CreditCard size={13} className="text-amber-400" />
                                <span className="text-amber-400">Physical Gift Card</span>
                              </>
                            ) : isCrypto ? (
                              <>
                                <QrCode size={13} className="text-sky-400" />
                                <span className="text-sky-400">USDT Crypto</span>
                              </>
                            ) : (
                              <>
                                <Smartphone size={13} className="text-emerald-400" />
                                <span className="text-emerald-400">Digital E-Card</span>
                              </>
                            )}
                          </span>
                          <span className="text-[11px] text-white/40">
                            {tx.title || 'Exclusive Media'}
                          </span>
                        </div>

                        {/* Physical Card: Photo Preview with Zoom Button */}
                        {isPhysical && tx.card_image_url ? (
                          <div className="flex items-center gap-3">
                            <div
                              onClick={() => setInspectedTx(tx)}
                              className="w-24 h-16 rounded-lg bg-black/60 border border-white/20 overflow-hidden relative group cursor-pointer shrink-0"
                            >
                              <img
                                src={tx.card_image_url}
                                alt="Physical card"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <ZoomIn size={18} />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-white/80 font-medium truncate">
                                Card photo uploaded by fan
                              </p>
                              {tx.reference && tx.reference !== 'Physical card photo uploaded' && (
                                <p className="text-xs text-white/60 font-mono mt-0.5 truncate">
                                  PIN/Ref: {tx.reference}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => setInspectedTx(tx)}
                                className="text-[11px] text-gold hover:underline font-semibold flex items-center gap-1 mt-1 cursor-pointer"
                              >
                                <ZoomIn size={12} />
                                <span>Inspect & Zoom Card</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Digital E-Card Code or Crypto TxID */
                          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-black/40 border border-white/10">
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] text-white/40 block">Claim Code / PIN</span>
                              <span className="font-mono text-xs text-gold font-bold select-all truncate block">
                                {tx.reference || 'No code provided'}
                              </span>
                            </div>
                            {tx.reference && (
                              <button
                                type="button"
                                onClick={() => handleCopyCode(tx.id, tx.reference!)}
                                className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                              >
                                {copiedId === tx.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                <span>{copiedId === tx.id ? 'Copied' : 'Copy'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons: Approve vs Reject */}
                      <div className="flex items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleApprove(tx)}
                          disabled={isProcessing}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-ink font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-40"
                        >
                          {isProcessing ? (
                            <Loader2 size={14} className="animate-spin text-ink" />
                          ) : (
                            <CheckCircle2 size={15} />
                          )}
                          <span>Approve & Credit ${tx.amount_usd}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReject(tx)}
                          disabled={isProcessing}
                          className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 active:scale-95 text-red-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                        >
                          <XCircle size={15} />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Tab Content: History ──────────────────────────────────────── */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {historyTransactions.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/10">
                  <div className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={26} />
                  </div>
                  <h4 className="text-sm font-semibold text-paper">No Transaction History</h4>
                  <p className="text-xs text-white/40 max-w-xs mx-auto mt-1">
                    Your approved and completed unlock transactions will appear here.
                  </p>
                </div>
              ) : (
                historyTransactions.map((tx) => {
                  const fanName = tx.fan?.display_name || tx.fan?.username || 'Fan';
                  const isVerified = tx.status === 'verified';

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 sm:p-4 rounded-xl bg-[#141416] border border-white/[0.06] flex items-center justify-between gap-3 hover:bg-[#18181c] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                            isVerified
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {isVerified ? <Check size={16} strokeWidth={2.5} /> : <X size={16} />}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs sm:text-sm font-semibold text-paper truncate">
                            {tx.title || tx.description || 'Media Unlock'}
                          </h5>
                          <p className="text-[11px] text-white/40 truncate">
                            From {fanName} · {new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-sm sm:text-base font-bold font-serif block ${
                            isVerified ? 'text-emerald-400' : 'text-zinc-500 line-through'
                          }`}
                        >
                          +${tx.amount_usd}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider block ${
                            isVerified ? 'text-emerald-400/80' : 'text-red-400/80'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Physical Gift Card Inspection & Zoom Modal ────────────────────── */}
      {inspectedTx && (
        <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-200">
          {/* Top modal bar */}
          <div className="flex items-center justify-between text-white border-b border-white/10 pb-3">
            <div>
              <h4 className="font-semibold text-sm sm:text-base text-paper">
                Physical Card Inspection
              </h4>
              <p className="text-xs text-white/50">
                Uploaded by {inspectedTx.fan?.display_name || inspectedTx.fan?.username || 'Fan'} · ${inspectedTx.amount_usd}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInspectedTx(null)}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Full High-Res Image View */}
          <div className="flex-1 flex items-center justify-center my-4 overflow-hidden relative">
            {inspectedTx.card_image_url ? (
              <img
                src={inspectedTx.card_image_url}
                alt="Physical Card Inspection"
                className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border border-white/15"
              />
            ) : (
              <div className="text-white/40 text-sm">No photo available</div>
            )}
          </div>

          {/* Bottom Action Bar inside Modal */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            {inspectedTx.reference && inspectedTx.reference !== 'Physical card photo uploaded' && (
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                <span className="text-white/50">Fan Provided Code/PIN:</span>
                <span className="font-mono text-gold font-bold">{inspectedTx.reference}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleApprove(inspectedTx)}
                disabled={processingId === inspectedTx.id}
                className="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-ink font-bold text-sm flex items-center justify-center gap-2 shadow-xl cursor-pointer"
              >
                {processingId === inspectedTx.id ? (
                  <Loader2 size={16} className="animate-spin text-ink" />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                <span>Approve & Credit ${inspectedTx.amount_usd}</span>
              </button>

              <button
                type="button"
                onClick={() => handleReject(inspectedTx)}
                disabled={processingId === inspectedTx.id}
                className="px-5 py-3.5 rounded-xl bg-white/10 hover:bg-red-500/20 text-red-400 border border-white/10 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <XCircle size={17} />
                <span>Reject</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
