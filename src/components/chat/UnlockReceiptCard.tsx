import React, { useState } from 'react';
import {
  Check,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  ExternalLink,
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

  // The fan MUST NOT see this payment request message. Only the creator sees it.
  if (!isCreator && isMine) {
    return null;
  }

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
      // 1. Send silent real-time unlock confirmation message into chat
      // This is invisible in chat, but triggers instant unblur on the fan's device
      const confirmedPayload: UnlockConfirmedPayload = {
        version: 1,
        type: 'unlock_confirmed',
        attachmentId: request.attachmentId,
        batchId: request.batchId,
        mediaUrls: request.mediaUrls || (request.thumbnailUrl ? [request.thumbnailUrl] : []),
        thumbnailUrl: request.thumbnailUrl,
        fanId: message.sender_id,
        creatorId: user.id,
        amountUsd: request.amountUsd,
        unlockedAt: new Date().toISOString(),
      };

      await supabase.from('messages').insert({
        conversation_id: message.conversation_id,
        sender_id: user.id,
        sender_type: 'creator',
        content: encodeUnlockConfirmedMessage(confirmedPayload),
        message_type: 'system',
      });

      // 2. Update creator total_earned in user_balances
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

      // 3. Update transactions_ledger if table available
      try {
        await supabase
          .from('transactions_ledger')
          .update({ status: 'verified' })
          .eq('user_id', message.sender_id)
          .eq('status', 'pending');
      } catch {}

      // 4. Update attachment_unlocks
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

      // 5. Broadcast local event so creator's screen unblurs immediately too
      window.dispatchEvent(
        new CustomEvent('velour:unlock_verified', {
          detail: {
            attachmentId: request.attachmentId,
            batchId: request.batchId,
            mediaUrl: request.thumbnailUrl,
          },
        })
      );

      setLocalStatus('verified');
      onApproveSuccess?.(request.attachmentId);
    } catch (err) {
      console.error('Failed to approve unlock:', err);
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
      setLocalStatus('rejected');
    } catch (err) {
      console.error('Failed to decline unlock:', err);
    } finally {
      setDeclining(false);
    }
  };

  const methodDisplay =
    request.method === 'crypto'
      ? 'USDT Crypto'
      : request.giftCardType === 'physical_card'
      ? `${request.brand || 'Card'} (Physical)`
      : `${request.brand || 'Card'} (E-Card)`;

  return (
    <>
      <div className="w-full max-w-[300px] sm:max-w-[320px] p-3 rounded-2xl bg-[#1c1c1e] border border-white/10 text-white text-xs select-none space-y-2.5 my-1">
        {/* Simple Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div>
            <span className="font-bold text-sm text-gold font-serif block">
              Unlock Request • ${request.amountUsd}
            </span>
            <span className="text-[11px] text-white/50 block">
              {request.title || 'Exclusive Media'} · {methodDisplay}
            </span>
          </div>

          {isVerified && (
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 size={13} /> Unlocked
            </span>
          )}
          {isRejected && (
            <span className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
              <XCircle size={13} /> Declined
            </span>
          )}
        </div>

        {/* Claim Code (if present) */}
        {request.proof && (
          <div className="space-y-1">
            <span className="text-[10px] text-white/40 uppercase font-semibold">
              {request.method === 'crypto' ? 'TxID' : 'Code / PIN'}
            </span>
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-black/60 border border-white/10">
              <code className="font-mono text-gold-light text-xs truncate select-all">
                {request.proof}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(request.proof)}
                className="shrink-0 p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
                title="Copy"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        )}

        {/* Physical Card Photo (if uploaded) */}
        {request.cardImageUrl && (
          <div className="space-y-1">
            <span className="text-[10px] text-white/40 uppercase font-semibold">
              Card Photo
            </span>
            <div
              onClick={() => setShowPhotoModal(true)}
              className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 cursor-pointer max-h-36 group"
            >
              <img
                src={request.cardImageUrl}
                alt="Card Proof"
                className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[11px] text-white font-medium transition-opacity">
                Tap to expand
              </div>
            </div>
          </div>
        )}

        {/* Direct Action Buttons (pending state) */}
        {isPending && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={approving || declining}
              onClick={handleApprove}
              className="flex-1 py-2 px-3 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {approving ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Unlocking…
                </>
              ) : (
                'Approve & Unlock'
              )}
            </button>
            <button
              type="button"
              disabled={approving || declining}
              onClick={handleDecline}
              className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-red-400 text-xs font-medium transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {declining ? <Loader2 size={13} className="animate-spin" /> : 'Decline'}
            </button>
          </div>
        )}
      </div>

      {/* Full Photo Modal */}
      {showPhotoModal && request.cardImageUrl && (
        <div
          className="fixed inset-0 z-[100000] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setShowPhotoModal(false)}
        >
          <button
            type="button"
            onClick={() => setShowPhotoModal(false)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <X size={18} />
          </button>
          <img
            src={request.cardImageUrl}
            alt="Card Full View"
            className="max-w-full max-h-[85vh] object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
