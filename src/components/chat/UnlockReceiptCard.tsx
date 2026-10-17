import React, { useState } from 'react';
import {
  Lock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import type { MessageWithSender } from '../../lib/hooks/useMessages';
import { UnlockRequestPayload } from '../../lib/unlockRequests';
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
  const [showReviewModal, setShowReviewModal] = useState(false);
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

  const methodDisplay =
    request.method === 'crypto'
      ? 'USDT Crypto'
      : request.giftCardType === 'physical_card'
      ? `${request.brand || 'Card'} (Physical)`
      : `${request.brand || 'Card'} (E-Card)`;

  return (
    <>
      <div
        onClick={() => isPending && setShowReviewModal(true)}
        className="w-full max-w-[310px] sm:max-w-[330px] p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 active:scale-[0.98] transition-all cursor-pointer select-none text-white my-1 group"
      >
        <div className="flex items-center gap-3">
          {/* Thumbnail with lock */}
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0 relative">
            {request.thumbnailUrl ? (
              <img
                src={request.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover filter blur-[2px] scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gold bg-gold/10">
                <Lock size={18} />
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              {isVerified ? (
                <CheckCircle2 size={16} className="text-emerald-400" />
              ) : isRejected ? (
                <XCircle size={16} className="text-red-400" />
              ) : (
                <Lock size={15} className="text-gold" />
              )}
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-xs text-white truncate group-hover:text-gold transition-colors">
              {request.title || 'Exclusive Media'}
            </h4>
            <p className="text-[11px] text-white/50 truncate mt-0.5">
              {methodDisplay}
            </p>
            {isPending ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-gold font-medium mt-1">
                <ShieldCheck size={11} /> Tap to review & unlock →
              </span>
            ) : isVerified ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium mt-1">
                <CheckCircle2 size={11} /> Unlocked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-medium mt-1">
                <XCircle size={11} /> Declined
              </span>
            )}
          </div>

          {/* Price */}
          <div className="text-right shrink-0">
            <span className="text-[10px] text-white/40 block leading-tight">Price</span>
            <span className="text-base font-bold text-gold font-serif">
              ${request.amountUsd}
            </span>
          </div>
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
