import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Lock,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Loader2,
  CreditCard,
  QrCode,
  ZoomIn,
  ShieldCheck,
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

interface UnlockReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: MessageWithSender;
  request: UnlockRequestPayload;
  isMine: boolean;
  isCreator: boolean;
  currentUserId?: string;
  onApproveSuccess?: (attachmentId?: string | null) => void;
}

export default function UnlockReviewModal({
  isOpen,
  onClose,
  message,
  request,
  isMine,
  isCreator,
  currentUserId,
  onApproveSuccess,
}: UnlockReviewModalProps) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showPhotoZoom, setShowPhotoZoom] = useState(false);
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [localStatus, setLocalStatus] = useState<'pending' | 'verified' | 'rejected'>(
    request.status || 'pending'
  );

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const isPending = localStatus === 'pending';
  const isVerified = localStatus === 'verified';
  const isRejected = localStatus === 'rejected';

  // Approver is true if current user is the creator or the recipient of the unlock request
  const isApprover = Boolean(
    user?.id &&
      (!isMine || isCreator) &&
      (request.creatorId === user?.id || isCreator || !isMine)
  );

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
            mediaUrls: request.mediaUrls,
            mediaUrl: request.thumbnailUrl,
          },
        })
      );

      setLocalStatus('verified');
      onApproveSuccess?.(request.attachmentId);
      onClose();
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

      setLocalStatus('rejected');
      onClose();
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
      ? `${request.brand || 'Gift Card'} · Physical Card`
      : `${request.brand || 'Gift Card'} · E-Gift Card`;

  const chatRoot = typeof document !== 'undefined' ? document.getElementById('chat-window-root') : null;
  const portalTarget = chatRoot || (typeof document !== 'undefined' ? document.body : null);
  if (!portalTarget) return null;

  const modalContent = (
    <div className="fixed md:absolute inset-0 z-[99999] pointer-events-auto overflow-hidden">
      {/* Dimmed backdrop - click outside to dismiss */}
      <div
        className="fixed md:absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Apple-style Bottom Sheet - Matching UnlockPaymentModal */}
      <div
        className="fixed md:absolute inset-x-0 bottom-0 z-10 w-full max-h-[92vh] md:max-h-[88%] bg-[#1c1c1e] text-white rounded-t-[32px] md:rounded-t-[28px] md:border-t md:border-white/10 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 font-sans"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 1rem)' }}
      >
        {/* iOS Drag Handle */}
        <div className="shrink-0 pt-3 pb-1.5 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Top Header Bar */}
        <div className="shrink-0 px-6 py-3 flex items-center justify-between border-b border-white/10">
          <div>
            <h3 className="font-semibold text-lg text-white tracking-tight">
              {isApprover ? 'Verify Unlock Request' : 'Unlock Proof Details'}
            </h3>
            <p className="text-xs text-white/50 mt-0.5">
              Submitted at{' '}
              {new Date(request.submittedAt || message.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Apple-style Media & Price Showcase Card */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4">
            {request.thumbnailUrl ? (
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0 relative">
                <img
                  src={request.thumbnailUrl}
                  alt=""
                  className={`w-full h-full object-cover filter ${!isVerified ? 'blur-[2px]' : ''} scale-105`}
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  {isVerified ? (
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  ) : (
                    <Lock size={18} className="text-gold" />
                  )}
                </div>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shrink-0">
                {isVerified ? (
                  <CheckCircle2 size={22} className="text-emerald-400" />
                ) : (
                  <CreditCard size={22} />
                )}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-base text-white truncate">
                {request.title || 'Exclusive Media Content'}
              </h4>
              <p className="text-xs text-white/50 mt-0.5">{methodDisplay}</p>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[11px] text-white/40 uppercase tracking-wider block">Price</span>
              <span className="text-2xl font-bold text-gold tracking-tight">
                ${request.amountUsd.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Status Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-xs text-white/60 font-medium">Request Status</span>
            {isPending ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <Clock size={12} className="animate-spin" /> Pending Review
              </span>
            ) : isVerified ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 size={12} /> Verified & Unlocked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
                <XCircle size={12} /> Declined
              </span>
            )}
          </div>

          {/* Code or PIN Display (if provided) */}
          {request.proof && (
            <div className="space-y-2">
              <label className="text-xs text-white/50 font-medium uppercase tracking-wider block">
                {request.method === 'crypto' ? 'TxID / Transaction Hash' : 'Gift Card Code / PIN'}
              </label>
              <div className="bg-black/60 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <code className="text-sm font-mono text-gold-light select-all truncate break-all">
                  {request.proof}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(request.proof)}
                  className="shrink-0 py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Physical Card Photo Preview (if uploaded) */}
          {request.cardImageUrl && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-white/50 font-medium uppercase tracking-wider">
                  Physical Card Photo Proof
                </label>
                <button
                  type="button"
                  onClick={() => setShowPhotoZoom(true)}
                  className="text-xs text-gold hover:underline flex items-center gap-1"
                >
                  <ZoomIn size={12} /> Full view
                </button>
              </div>
              <div
                onClick={() => setShowPhotoZoom(true)}
                className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/60 cursor-pointer group max-h-56 flex items-center justify-center"
              >
                <img
                  src={request.cardImageUrl}
                  alt="Physical Card Photo"
                  className="w-full max-h-56 object-contain group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-sm text-white font-medium backdrop-blur-[1px]">
                  <ZoomIn size={16} className="text-gold" /> Tap to zoom photo
                </div>
              </div>
            </div>
          )}

          {/* Action / Information Section */}
          {isPending ? (
            isApprover ? (
              <div className="pt-2 space-y-3">
                <div className="p-3 rounded-xl bg-gold/10 border border-gold/20 flex items-start gap-2.5 text-xs text-white/80">
                  <ShieldCheck size={16} className="text-gold shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Verify the code or card image above. Approving will automatically unblur the media
                    for the client and credit <span className="font-bold text-gold">${request.amountUsd.toFixed(2)}</span> to your balance.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={approving || declining}
                    onClick={handleApprove}
                    className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-gold via-gold-light to-gold text-ink font-bold text-sm shadow-lg shadow-gold/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {approving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Approving…
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} /> Approve & Unlock
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={approving || declining}
                    onClick={handleDecline}
                    className="py-3.5 px-5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-sm border border-red-500/20 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    {declining ? <Loader2 size={16} className="animate-spin" /> : 'Decline'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center space-y-1">
                <p className="text-sm font-semibold text-amber-300">
                  Payment Submitted to Creator
                </p>
                <p className="text-xs text-white/60 leading-relaxed">
                  The creator is verifying your proof. The media will automatically unlock in this chat as soon as it is approved.
                </p>
              </div>
            )
          ) : isVerified ? (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-1">
              <div className="flex items-center justify-center gap-2 text-emerald-400 font-semibold text-sm">
                <CheckCircle2 size={18} /> Payment Verified & Content Unlocked
              </div>
              <p className="text-xs text-white/60">
                The content is now unlocked and available in the chat thread.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-1">
              <div className="flex items-center justify-center gap-2 text-red-400 font-semibold text-sm">
                <XCircle size={18} /> Request Declined
              </div>
              <p className="text-xs text-white/60">
                This payment proof was declined by the creator.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* High-Res Photo Zoom Modal */}
      {showPhotoZoom && request.cardImageUrl && (
        <div
          className="fixed inset-0 z-[100000] bg-black/95 flex flex-col items-center justify-center p-4"
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
            alt="Card Full Photo"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-xs text-white/50 mt-3">Tap outside or close to return</p>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, portalTarget);
}
