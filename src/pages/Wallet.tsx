import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  DollarSign,
  CheckCircle2,
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
  TrendingUp,
  PackageCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useBackHandler } from '../lib/backButtonRegistry';
import PullToRefresh from '../components/common/PullToRefresh';
import { isOnline } from '../lib/offline/outboxSync';
import { parseUnlockRequestMessage } from '../lib/unlockRequests';

interface TransactionItem {
  id: string;
  user_id: string;
  creator_id?: string | null;
  type: string;
  amount_usd: number;
  status: 'verified' | 'completed' | string;
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

export default function Wallet() {
  const { user, isCreator, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [totalEarned, setTotalEarned] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Fast path: load cached wallet data immediately (0ms)
  useEffect(() => {
    try {
      const rawEarned = localStorage.getItem('velour:cached-wallet-earned');
      if (rawEarned) setTotalEarned(Number(rawEarned) || 0);
      const rawTxs = localStorage.getItem('velour:cached-wallet-txs');
      if (rawTxs) {
        const parsed = JSON.parse(rawTxs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTransactions(parsed);
          setLoading(false);
        }
      }
      if (!isOnline()) {
        setLoading(false);
      }
    } catch (_) {}
  }, []);

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
    if (!isOnline()) {
      setLoading(false);
      return;
    }

    try {
      // Clean up any stale creator pending local storage
      try {
        localStorage.removeItem(`velour_creator_pending_txs_${user.id}`);
      } catch (_) {}

      // 1. Fetch balance from user_balances
      const { data: balanceData } = await supabase
        .from('user_balances')
        .select('total_earned')
        .eq('user_id', user.id)
        .maybeSingle();

      let dbEarned = balanceData?.total_earned ?? 0;

      // 2. Fetch verified transactions from transactions_ledger
      let rawTxs: any[] = [];
      try {
        const { data: txData, error: txError } = await supabase
          .from('transactions_ledger')
          .select(`
            id,
            user_id,
            type,
            amount_usd,
            status,
            attachment_id,
            reference,
            description,
            created_at,
            fan:profiles!user_id(id, username, display_name, avatar_url)
          `)
          .or(`user_id.eq.${user.id},description.ilike.%${user.id}%`)
          .eq('status', 'verified')
          .order('created_at', { ascending: false });

        if (!txError && txData) {
          rawTxs = txData;
        } else {
          const { data: fallbackTxs } = await supabase
            .from('transactions_ledger')
            .select('*')
            .or(`user_id.eq.${user.id},description.ilike.%${user.id}%`)
            .eq('status', 'verified')
            .order('created_at', { ascending: false });
          if (fallbackTxs) {
            rawTxs = fallbackTxs;
          }
        }
      } catch (e) {
        console.warn('Error fetching transactions_ledger:', e);
      }

      // 3. Query in-chat verified unlock requests from messages
      try {
        const { data: unlockMsgs } = await supabase
          .from('messages')
          .select(`
            id,
            conversation_id,
            sender_id,
            content,
            created_at,
            sender:profiles!sender_id(id, username, display_name, avatar_url)
          `)
          .ilike('content', '%<!--unlock-request:%')
          .order('created_at', { ascending: false });

        if (unlockMsgs && unlockMsgs.length > 0) {
          for (const msg of unlockMsgs) {
            const parsed = parseUnlockRequestMessage(msg.content);
            if (parsed.isUnlockRequest && parsed.request) {
              const req = parsed.request;
              // Only include verified requests for history
              if (req.status === 'verified') {
                const isRelevant = req.creatorId === user.id || msg.sender_id === user.id || !req.creatorId;
                if (isRelevant) {
                  const alreadyExists = rawTxs.some(
                    (t) => (req.attachmentId && t.attachment_id === req.attachmentId) || t.id === msg.id
                  );
                  if (!alreadyExists) {
                    rawTxs.push({
                      id: msg.id,
                      user_id: msg.sender_id,
                      creator_id: req.creatorId || user.id,
                      type: 'attachment_unlock',
                      amount_usd: req.amountUsd,
                      status: 'verified',
                      attachment_id: req.attachmentId,
                      card_type: req.method === 'crypto' ? 'crypto' : req.giftCardType || 'e_card',
                      card_brand: req.brand,
                      card_image_url: req.cardImageUrl,
                      reference: req.proof,
                      description: `In-Chat Unlock Request | $${req.amountUsd} | ${req.brand}: ${req.proof}`,
                      media_url: req.thumbnailUrl,
                      created_at: req.submittedAt || msg.created_at,
                      fan: (msg as any).sender || null,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (msgErr) {
        console.warn('Could not query in-chat unlock requests for wallet:', msgErr);
      }

      // Parse embedded [META:{...}] from description if columns are null
      let fetchedTxs: TransactionItem[] = rawTxs.map((item) => {
        let cardType = item.card_type;
        let cardImageUrl = item.card_image_url;
        let mediaUrl = item.media_url;
        let creatorId = item.creator_id;
        let title = item.title;
        let cardBrand = item.card_brand;

        if (item.description && item.description.includes('[META:')) {
          try {
            const metaStr = item.description.split('[META:')[1].split(']')[0];
            const meta = JSON.parse(metaStr);
            if (!cardType && meta.card_type) cardType = meta.card_type;
            if (!cardImageUrl && meta.card_image_url) cardImageUrl = meta.card_image_url;
            if (!mediaUrl && meta.media_url) mediaUrl = meta.media_url;
            if (!creatorId && meta.creator_id) creatorId = meta.creator_id;
            if (!title && meta.title) title = meta.title;
            if (!cardBrand && meta.brand) cardBrand = meta.brand;
          } catch {}
        }

        return {
          ...item,
          status: 'verified',
          card_type: cardType,
          card_image_url: cardImageUrl,
          media_url: mediaUrl,
          creator_id: creatorId,
          title: title,
          card_brand: cardBrand,
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

      // Filter: only show transactions associated with this creator
      fetchedTxs = fetchedTxs.filter((t) =>
        t.creator_id === user.id ||
        (t.description && t.description.includes(user.id)) ||
        t.user_id === user.id
      );

      // Sort newest first
      fetchedTxs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTransactions(fetchedTxs);

      // Compute total earned if user_balances was empty
      if (!dbEarned) {
        dbEarned = fetchedTxs.reduce((acc, curr) => acc + (curr.amount_usd || 0), 0);
      }
      setTotalEarned(dbEarned);

      try {
        localStorage.setItem('velour:cached-wallet-earned', String(dbEarned));
        localStorage.setItem('velour:cached-wallet-txs', JSON.stringify(fetchedTxs));
      } catch (_) {}
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
    showToast('Code copied to clipboard', true);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (authLoading) return null;
  if (!isCreator) return <Navigate to="/" replace />;

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
            <p className="text-[11px] text-white/50">Creator Monetization History</p>
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
      <PullToRefresh
        onRefresh={fetchWalletData}
        className="flex-1 overflow-y-auto px-4 sm:px-5 pt-4 pb-28 md:pb-12"
      >
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

            {/* Total Verified Transactions Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#1a1a1e] to-[#121214] border border-white/10 relative overflow-hidden shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                  Completed Unlocks
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <PackageCheck size={16} />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-serif font-bold text-paper tracking-tight">
                {transactions.length}
              </div>
              <p className="text-[11px] text-white/50 mt-1">
                Processed in chat
              </p>
            </div>
          </div>

          {/* ── Section Header ────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <h4 className="text-sm sm:text-base font-serif font-bold text-paper">
                Unlock & Earnings History
              </h4>
              <p className="text-[11px] text-white/40">
                Verified unlock transactions approved in chat
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/5 text-white/60 border border-white/10">
              {transactions.length} record{transactions.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* ── History List ──────────────────────────────────────────────── */}
          <div className="space-y-3.5">
            {transactions.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/10">
                <div className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={26} />
                </div>
                <h4 className="text-sm font-semibold text-paper">No Unlock History Yet</h4>
                <p className="text-xs text-white/40 max-w-xs mx-auto mt-1">
                  When fans request to unlock your exclusive media, and you approve them in the chat window, their verified payments will be listed here.
                </p>
              </div>
            ) : (
              transactions.map((tx) => {
                const fanName = tx.fan?.display_name || tx.fan?.username || 'Fan';
                const fanAvatar = tx.fan?.avatar_url;
                const isPhysical = tx.card_type === 'physical_card' || Boolean(tx.card_image_url);
                const isCrypto = tx.card_type === 'crypto' || tx.description?.toLowerCase().includes('crypto');

                return (
                  <div
                    key={tx.id}
                    className="p-4 sm:p-5 rounded-2xl bg-[#141416] border border-white/10 hover:border-gold/30 transition-all shadow-lg space-y-3"
                  >
                    {/* Top Row: Fan Info + Amount */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full bg-zinc-800 border border-white/15 overflow-hidden flex items-center justify-center font-bold text-sm text-gold shrink-0">
                          {fanAvatar ? (
                            <img src={fanAvatar} alt={fanName} className="w-full h-full object-cover" />
                          ) : (
                            <span>{fanName.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-sm font-semibold text-paper truncate">{fanName}</h5>
                          <p className="text-[11px] text-white/40 truncate mt-0.5">
                            {new Date(tx.created_at).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-lg sm:text-xl font-serif font-bold text-emerald-400 block tracking-tight">
                          +${Number(tx.amount_usd).toFixed(2)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full mt-0.5">
                          <Check size={10} strokeWidth={3} /> Verified
                        </span>
                      </div>
                    </div>

                    {/* Middle Details Box */}
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50">Unlocked Item:</span>
                        <span className="font-medium text-white truncate max-w-[200px]">
                          {tx.title || 'Exclusive Media'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50">Payment Method:</span>
                        <span className="font-medium text-white flex items-center gap-1.5">
                          {isCrypto ? (
                            <>
                              <QrCode size={13} className="text-emerald-400" />
                              <span>Crypto USDT</span>
                            </>
                          ) : isPhysical ? (
                            <>
                              <Smartphone size={13} className="text-amber-400" />
                              <span>Physical Card {tx.card_brand ? `(${tx.card_brand})` : ''}</span>
                            </>
                          ) : (
                            <>
                              <CreditCard size={13} className="text-gold" />
                              <span>E-Gift Card {tx.card_brand ? `(${tx.card_brand})` : ''}</span>
                            </>
                          )}
                        </span>
                      </div>

                      {/* Code / Reference with Copy */}
                      {tx.reference && tx.reference !== 'Physical card photo uploaded' && (
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-0.5">
                              Reference / Code
                            </span>
                            <span className="font-mono text-xs text-gold font-bold select-all truncate block">
                              {tx.reference}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(tx.id, tx.reference!)}
                            className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                          >
                            {copiedId === tx.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            <span>{copiedId === tx.id ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      )}

                      {/* Physical Card Photo Preview Trigger */}
                      {isPhysical && tx.card_image_url && (
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                          <span className="text-xs text-white/60">Card Photo Attached</span>
                          <button
                            type="button"
                            onClick={() => setInspectedTx(tx)}
                            className="px-2.5 py-1 rounded-lg bg-gold/15 hover:bg-gold/25 text-gold text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <ZoomIn size={13} />
                            <span>View Card Photo</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PullToRefresh>

      {/* ── Physical Card Inspection Modal ────────────────────────────────── */}
      {inspectedTx && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h4 className="text-base font-semibold text-paper flex items-center gap-2">
                <Smartphone size={18} className="text-gold" />
                <span>Physical Card Inspection</span>
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

          {/* Bottom Info Bar inside Modal */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            {inspectedTx.reference && inspectedTx.reference !== 'Physical card photo uploaded' && (
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                <span className="text-white/50">Fan Provided Code/PIN:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gold font-bold">{inspectedTx.reference}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(inspectedTx.id, inspectedTx.reference!)}
                    className="p-1 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  >
                    {copiedId === inspectedTx.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setInspectedTx(null)}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-paper font-semibold text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
