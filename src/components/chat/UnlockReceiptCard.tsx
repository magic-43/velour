import React, { useState, useEffect } from 'react';
import {
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  Copy,
  Check,
  ZoomIn,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import {
  UnlockRequestPayload,
  UnlockConfirmedPayload,
  encodeUnlockConfirmedMessage,
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
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [showPhotoZoom, setShowPhotoZoom] = useState(false);

  // Initialize status from request or local persistence
  const [localStatus, setLocalStatus] = useState<'pending' | 'verified' | 'rejected'>(() => {
    if (request.status && request.status !== 'pending') return request.status;
    try {
      const cached = localStorage.getItem(`velour_receipt_${message.id}`);
      if (cached === 'verified' || cached === 'rejected') return cached;
    } catch {}
    return 'pending';
  });

  // Sync if remote request status updates
  useEffect(() => {
    if (request.status && request.status !== 'pending') {
      setLocalStatus(request.status);
    }
  }, [request.status]);

  const isPending = localStatus === 'pending';
  const isVerified = localStatus === 'verified';
  const isRejected = localStatus === 'rejected';

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApprove = async () => {
    if (!user || approving) return;
    setApproving(true);

    try {
      // 1. Deliver real-time unlock signal by INSERTING an invisible unlock_confirmed message
      // The creator is the sender, so RLS always permits this INSERT.
      const targetBatchId = request.batchId || request.attachmentId || null;
      const targetUrls = request.mediaUrls && request.mediaUrls.length > 0
        ? request.mediaUrls
        : (request.thumbnailUrl ? [request.thumbnailUrl] : []);

      const confirmedPayload: UnlockConfirmedPayload = {
        version: 1,
        type: 'unlock_confirmed',
        fanId: request.fanId || message.sender_id,
        batchId: targetBatchId,
        attachmentId: request.attachmentId,
        mediaUrls: targetUrls,
        thumbnailUrl: request.thumbnailUrl,
        title: request.title,
        amountUsd: request.amountUsd,
        confirmedAt: new Date().toISOString(),
      };

      await supabase.from('messages').insert({
        conversation_id: message.conversation_id,
        sender_id: user.id,
        sender_type: 'creator',
        content: encodeUnlockConfirmedMessage(confirmedPayload),
        message_type: 'unlock_confirmed',
      });

      // 2. Update transactions_ledger to verified
      try {
        await supabase
          .from('transactions_ledger')
          .update({ status: 'verified' })
          .eq('user_id', message.sender_id)
          .eq('status', 'pending');
      } catch (e) {
        console.warn('transactions_ledger update error:', e);
      }

      // 3. Update attachment_unlocks if valid UUID
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

      // 4. Update creator balance
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
      } catch (e) {
        console.warn('user_balances update error:', e);
      }

      // 5. Fire local event so UI unlocks immediately on creator's device too
      window.dispatchEvent(
        new CustomEvent('velour:unlock_verified', {
          detail: {
            attachmentId: targetBatchId,
            batchId: targetBatchId,
            mediaUrls: targetUrls,
            mediaUrl: request.thumbnailUrl,
          },
        })
      );

      // 6. Save state locally and notify caller
      try {
        localStorage.setItem(`velour_receipt_${message.id}`, 'verified');
      } catch {}

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
      try {
        await supabase
          .from('transactions_ledger')
          .update({ status: 'rejected' })
          .eq('user_id', message.sender_id)
          .eq('status', 'pending');
      } catch {}

      try {
        localStorage.setItem(`velour_receipt_${message.id}`, 'rejected');
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
      ? 'USDT'
      : request.giftCardType === 'physical_card'
      ? `${request.brand || 'Card'} (Physical)`
      : `${request.brand || 'Card'} (E-Code)`;

  return (
    <>
      <div className="w-full min-w-[270px] max-w-[320px] p-3.5 rounded-2xl bg-[#1c1c1e] border border-white/10 shadow-lg text-white my-1 select-none font-sans">
        {/* Top Header: Thumbnail + Title + Price */}
        <div className="flex items-center gap-3">
          {request.thumbnailUrl ? (
            <div className="w-11 h-11 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0 relative">
              <img
                src={request.thumbnailUrl}
                alt=""
                className={`w-full h-full object-cover filter ${!isVerified ? 'blur-[1.5px]' : ''} scale-105`}
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                {isVerified ? (
                  <CheckCircle2 size={16} className="text-emerald-400" />
                ) : (
                  <Lock size={14} className="text-gold" />
                )}
              </div>
            </div>
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shrink-0">
              {isVerified ? (
                <CheckCircle2 size={18} className="text-emerald-400" />
              ) : (
                <CreditCard size={18} />
              )}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-xs text-white truncate">
              {request.title || 'Exclusive Media'}
            </h4>
            <p className="text-[11px] text-white/50 mt-0.5 truncate">
              {methodDisplay}
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[10px] text-white/40 block leading-tight">Price</span>
            <span className="text-sm font-bold text-gold font-serif">
              ${request.amountUsd.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Proof Section (Code / TxID) */}
        {request.proof && (
          <div className="mt-2.5 bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase font-bold text-white/40 shrink-0">
              {request.method === 'crypto' ? 'TxID' : 'Code'}:
            </span>
            <code className="text-xs font-mono text-gold-light truncate select-all flex-1">
              {request.proof}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(request.proof)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Copy code"
            >
              {copied ? (
                <Check size={13} className="text-emerald-400" />
              ) : (
                <Copy size={13} />
              )}
            </button>
          </div>
        )}

        {/* Optional Physical Card Photo */}
        {request.cardImageUrl && (
          <div className="mt-2">
            <div
              onClick={() => setShowPhotoZoom(true)}
              className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 h-24 flex items-center justify-center cursor-pointer group"
            >
              <img
                src={request.cardImageUrl}
                alt="Card proof"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-xs text-white transition-opacity">
                <ZoomIn size={14} className="text-gold" /> Tap to zoom
              </div>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/5 my-2.5" />

        {/* Bottom Action / Status */}
        <div className="flex items-center justify-between gap-2">
          {isPending ? (
            <div className="w-full flex items-center gap-2">
              <button
                type="button"
                disabled={approving || declining}
                onClick={handleApprove}
                className="flex-1 py-2 px-3 rounded-xl bg-gold text-ink font-bold text-xs shadow-md shadow-gold/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                className="py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-xs border border-red-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {declining ? <Loader2 size={13} className="animate-spin" /> : 'Decline'}
              </button>
            </div>
          ) : isVerified ? (
            <div className="w-full flex items-center justify-center py-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 size={12} /> Unlocked
              </span>
            </div>
          ) : (
            <div className="w-full flex items-center justify-center py-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
                <XCircle size={12} /> Declined
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Photo Zoom Modal */}
      {showPhotoZoom && request.cardImageUrl && (
        <div
          className="fixed inset-0 z-[100000] bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowPhotoZoom(false)}
        >
          <button
            type="button"
            onClick={() => setShowPhotoZoom(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
          >
            <X size={20} />
          </button>
          <img
            src={request.cardImageUrl}
            alt="Card proof enlarged"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-xs text-white/50 mt-3">Tap outside to close</p>
        </div>
      )}
    </>
  );
}
