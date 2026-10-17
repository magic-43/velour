import React, { useState, useEffect } from 'react';
import {
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import { UnlockRequestPayload } from '../../lib/unlockRequests';
import { useAuth } from '../../lib/AuthContext';
import UnlockReviewModal from './UnlockReviewModal';

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
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [localStatus, setLocalStatus] = useState<'pending' | 'verified' | 'rejected'>(
    request.status || 'pending'
  );

  // Sync if message content changes remotely
  useEffect(() => {
    if (request.status) {
      setLocalStatus(request.status);
    }
  }, [request.status]);

  const isPending = localStatus === 'pending';
  const isVerified = localStatus === 'verified';
  const isRejected = localStatus === 'rejected';

  // Approver is true if current user is the creator or the recipient of the unlock request
  const isApprover = Boolean(
    user?.id &&
      (!isMine || isCreator) &&
      (request.creatorId === user?.id || isCreator || !isMine)
  );

  const methodDisplay =
    request.method === 'crypto'
      ? 'USDT Crypto'
      : request.brand
      ? `${request.brand} Card`
      : 'Gift Card';

  return (
    <>
      <div
        onClick={() => setShowReviewModal(true)}
        className="w-full min-w-[270px] max-w-[320px] sm:max-w-[340px] p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 active:border-gold/40 shadow-md cursor-pointer transition-all select-none group text-white my-0.5"
      >
        {/* Top Row: Thumbnail + Title + Price */}
        <div className="flex items-center gap-3">
          {/* Media Thumbnail or Icon */}
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

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-xs text-white truncate group-hover:text-gold transition-colors">
              {request.title || 'Exclusive Media'}
            </h4>
            <p className="text-[11px] text-white/50 mt-0.5 flex items-center gap-1.5 truncate">
              <span>{methodDisplay}</span>
            </p>
          </div>

          {/* Price Tag */}
          <div className="text-right shrink-0">
            <span className="text-[10px] text-white/40 block leading-tight">Price</span>
            <span className="text-sm font-bold text-gold font-serif">
              ${request.amountUsd.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Subtle Divider */}
        <div className="h-px bg-white/5 my-2.5" />

        {/* Bottom Row: Status / Action on Left, space for Timestamp on Right */}
        <div className="flex items-center justify-between pr-14">
          <div className="flex items-center gap-1.5">
            {isPending ? (
              isApprover ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-gold text-ink shadow-sm group-hover:brightness-110 active:scale-95 transition-all">
                  <ShieldCheck size={12} strokeWidth={2.4} /> Review Proof
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <Clock size={10} className="animate-spin" /> Pending Review
                </span>
              )
            ) : isVerified ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 size={10} /> Unlocked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-300 border border-red-500/30">
                <XCircle size={10} /> Declined
              </span>
            )}
          </div>

          {/* Details chevron */}
          <span className="text-[10px] text-white/40 group-hover:text-white/70 flex items-center gap-0.5 transition-colors">
            Details <ChevronRight size={11} />
          </span>
        </div>
      </div>

      {/* Verification Modal Sheet */}
      <UnlockReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        message={message}
        request={{ ...request, status: localStatus }}
        isMine={isMine}
        isCreator={isCreator}
        currentUserId={currentUserId}
        onApproveSuccess={(attId) => {
          setLocalStatus('verified');
          onApproveSuccess?.(attId);
        }}
      />
    </>
  );
}
