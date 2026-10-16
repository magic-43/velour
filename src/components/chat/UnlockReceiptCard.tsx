import React, { useState } from 'react';
import {
  Ticket,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ZoomIn,
  Sparkles,
  Loader2,
  X,
  CreditCard,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import {
  UnlockRequestPayload,
  updateUnlockRequestContentStatus,
} from '../../lib/unlockRequests';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

interface UnlockReceiptCardProps {
  message: MessageWithSender;
  request: UnlockRequestPayload;
  isMine: boolean;
  isCreator: boolean;
  currentUserId?: string;
  onApproveSuccess?: (attachmentId?: string | null) => void;
}

export default function UnlockReceiptCard({
  message,
  request,
  isMine,
  isCreator,
  currentUserId,
  onApproveSuccess,
}: UnlockReceiptCardProps) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [localStatus, setLocalStatus] = useState<'pending' | 'verified' | 'rejected'>(
    request.status || 'pending'
  );

  const isPending = localStatus === 'pending';
  const isVerified = localStatus === 'verified';
  const isRejected = localStatus === 'rejected';

  // Can the current user act as approver?
  // Approver is true if the current user is a creator OR if current user is the recipient of the unlock request (i.e. not the fan who sent it)
  const isApprover =
    Boolean(user?.id && (!isMine || isCreator) && (request.creatorId === user?.id || isCreator || !isMine));

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApprove = async () => {
    if (!user || approving) return;
    setApproving(true);

    try {
      // 1. Update message content in database
      const newContent = updateUnlockRequestContentStatus(message.content || '', 'verified');
      await supabase
        .from('messages')
        .update({ content: newContent })
        .eq('id', message.id);

      // 2. Update attachment_unlocks
      if (request.attachmentId) {
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (UUID_REGEX.test(request.attachmentId)) {
          try {
            await supabase
              .from('attachment_unlocks')
              .update({ status: 'verified' })
              .eq('attachment_id', request.attachmentId)
              .eq('fan_id', message.sender_id);
          } catch {}
        }
      }

      // 3. Update transactions_ledger
      try {
        await supabase
          .from('transactions_ledger')
          .update({ status: 'verified' })
          .eq('user_id', message.sender_id)
          .eq('status', 'pending');
      } catch {}

      // 4. Update creator total_earned in user_balances
      try {
        const { data: curBal } = await supabase
          .from('user_balances')
          .select('total_earned')
          .eq('user_id', user.id)
          .maybeSingle();

        const currentEarned = curBal?.total_earned ?? 0;
        await supabase
          .from('user_balances')
          .upsert({
            user_id: user.id,
            total_earned: currentEarned + request.amountUsd,
            updated_at: new Date().toISOString(),
          });
      } catch {}

      // 5. Post in-chat confirmation message
      try {
        await supabase.from('messages').insert({
          conversation_id: message.conversation_id,
          sender_id: user.id,
          sender_type: 'creator',
          content: `🎉 Payment verified! Unlocked "${request.title || 'Exclusive Media'}" for you. Enjoy!`,
          message_type: 'text',
          reply_to_id: message.id,
        });
      } catch {}

      // 6. Broadcast local custom event so locked media unblurs immediately across all open components
      window.dispatchEvent(
        new CustomEvent('velour:unlock_verified', {
          detail: {
            attachmentId: request.attachmentId,
            mediaUrl: request.thumbnailUrl,
          },
        })
      );

      setLocalStatus('verified');
      onApproveSuccess?.(request.attachmentId);
    } catch (err) {
      console.error('Failed to approve unlock request:', err);
    } finally {
      setApproving(false);
    }
  };

  const handleDecline = async () => {
    if (!user || declining) return;
    setDeclining(true);

    try {
      const newContent = updateUnlockRequestContentStatus(message.content || '', 'rejected');
      await supabase
        .from('messages')
        .update({ content: newContent })
        .eq('id', message.id);

      try {
        await supabase
          .from('transactions_ledger')
          .update({ status: 'rejected' })
          .eq('user_id', message.sender_id)
          .eq('status', 'pending');
      } catch {}

      setLocalStatus('rejected');
    } catch (err) {
      console.error('Failed to decline unlock request:', err);
    } finally {
      setDeclining(false);
    }
  };

  const methodDisplay =
    request.method === 'crypto'
      ? 'USDT Crypto Transfer'
      : request.giftCardType === 'physical_card'
      ? `${request.brand} Physical Card`
      : `${request.brand} E-Gift Card`;

  return (
    <div className="w-full max-w-[340px] sm:max-w-[360px] rounded-2xl overflow-hidden bg-ink/90 border border-gold/30 shadow-2xl backdrop-blur-md select-none text-paper my-1">
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-gold/20 via-gold/10 to-transparent px-3.5 py-2.5 border-b border-gold/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gold/20 border border-gold/40 flex items-center justify-center text-gold">
            <Ticket size={15} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gold tracking-wide uppercase font-serif">
              Unlock Receipt
            </h4>
            <p className="text-[10px] text-muted leading-tight">
              {new Date(request.submittedAt || message.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        {isPending ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
            <Clock size={11} className="animate-spin" /> Pending Review
          </span>
        ) : isVerified ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 size={11} /> Unlocked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
            <XCircle size={11} /> Declined
          </span>
        )}
      </div>

      {/* ── Main Receipt Body ──────────────────────────────────────── */}
      <div className="p-3.5 space-y-3">
        {/* Media & Price Strip */}
        <div className="flex items-center gap-3 bg-white/[0.03] p-2 rounded-xl border border-white/5">
          {request.thumbnailUrl ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-neutral-900 border border-white/10 shrink-0 relative">
              <img
                src={request.thumbnailUrl}
                alt="Item"
                className={`w-full h-full object-cover ${!isVerified ? 'blur-[1.5px]' : ''}`}
              />
              {!isVerified && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Clock size={14} className="text-gold" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center text-gold shrink-0">
              <CreditCard size={20} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-paper/90 truncate">
              {request.title || 'Exclusive Media Content'}
            </p>
            <p className="text-[11px] text-muted flex items-center gap-1">
              <span>{methodDisplay}</span>
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xs text-muted block text-[10px]">Amount</span>
            <span className="text-base font-bold text-gold font-serif">
              ${request.amountUsd.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Proof / Code / TxID Box */}
        {request.proof && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
              {request.method === 'crypto' ? 'TxID / Hash' : 'Gift Card Code / PIN'}
            </span>
            <div className="bg-black/60 border border-white/10 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-gold-light select-all truncate">
                {request.proof}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(request.proof)}
                className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-muted hover:text-paper transition-all cursor-pointer active:scale-90"
                title="Copy code"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        )}

        {/* Physical Gift Card Photo Preview (if uploaded) */}
        {request.cardImageUrl && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
              Physical Card Photo
            </span>
            <div
              onClick={() => setShowPhotoModal(true)}
              className="relative rounded-xl overflow-hidden border border-gold/30 bg-black/60 cursor-pointer group max-h-36"
            >
              <img
                src={request.cardImageUrl}
                alt="Gift Card Photo"
                className="w-full h-32 object-cover object-center group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs text-paper font-medium">
                <ZoomIn size={14} className="text-gold" /> Tap to inspect full photo
              </div>
            </div>
          </div>
        )}

        {/* ── Action / Status Footer ─────────────────────────────────── */}
        {isPending ? (
          isApprover ? (
            <div className="pt-1 space-y-2">
              <p className="text-[10.5px] text-muted text-center leading-tight">
                Review this payment proof. Verify the code or photo, then approve to unlock.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={approving || declining}
                  onClick={handleApprove}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-gold via-gold-light to-gold text-ink text-xs font-bold shadow-md shadow-gold/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {approving ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Approving…
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} /> Approve & Unlock
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={approving || declining}
                  onClick={handleDecline}
                  className="py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/20 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  {declining ? <Loader2 size={13} className="animate-spin" /> : 'Decline'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-center">
              <p className="text-xs text-amber-300 font-medium">
                Payment submitted to creator
              </p>
              <p className="text-[10.5px] text-muted mt-0.5">
                The content will automatically unlock here once the creator verifies your proof.
              </p>
            </div>
          )
        ) : isVerified ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 text-center flex items-center justify-center gap-2 text-emerald-300 text-xs font-semibold">
            <ShieldCheck size={16} />
            <span>Payment Verified — Media Unlocked</span>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 text-center text-red-300 text-xs font-medium">
            This unlock request was declined.
          </div>
        )}
      </div>

      {/* ── Fullscreen Card Photo Modal ────────────────────────────── */}
      {showPhotoModal && request.cardImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setShowPhotoModal(false)}
        >
          <div className="relative max-w-lg w-full bg-ink-dark border border-gold/40 rounded-2xl overflow-hidden shadow-2xl p-2">
            <div className="flex items-center justify-between p-2 border-b border-white/10">
              <span className="text-xs font-bold text-gold uppercase tracking-wider">
                Full Physical Card Photo
              </span>
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-paper transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-2 max-h-[75vh] overflow-auto flex items-center justify-center">
              <img
                src={request.cardImageUrl}
                alt="Enlarged Card Proof"
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
