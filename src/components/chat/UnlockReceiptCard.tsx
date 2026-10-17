import React, { useState, useEffect } from 'react';
import {
  Lock,
  CheckCircle2,
  XCircle,
  CreditCard,
  ChevronRight,
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

  const methodDisplay =
    request.method === 'crypto'
      ? 'USDT'
      : request.brand || 'Gift Card';

  return (
    <>
      {/* Simple, sleek trigger bubble in chat */}
      <div
        onClick={() => setShowReviewModal(true)}
        className="w-full min-w-[240px] max-w-[280px] p-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] active:scale-[0.98] border border-white/10 shadow-sm cursor-pointer transition-all select-none text-white my-0.5 group"
      >
        <div className="flex items-center gap-2.5">
          {/* Thumbnail / Icon */}
          {request.thumbnailUrl ? (
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0 relative">
              <img
                src={request.thumbnailUrl}
                alt=""
                className={`w-full h-full object-cover filter ${!isVerified ? 'blur-[1.5px]' : ''} scale-105`}
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                {isVerified ? (
                  <CheckCircle2 size={15} className="text-emerald-400" />
                ) : (
                  <Lock size={13} className="text-gold" />
                )}
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shrink-0">
              {isVerified ? (
                <CheckCircle2 size={16} className="text-emerald-400" />
              ) : (
                <CreditCard size={16} />
              )}
            </div>
          )}

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-xs text-white truncate group-hover:text-gold transition-colors">
              {request.title || 'Unlock Request'}
            </h4>
            <p className="text-[11px] text-white/50 mt-0.5 truncate">
              ${request.amountUsd.toFixed(2)} · {methodDisplay}
            </p>
          </div>

          {/* Right Status / Review Trigger */}
          <div className="shrink-0 flex items-center gap-1">
            {isPending ? (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold/20 text-gold border border-gold/30">
                Review <ChevronRight size={11} />
              </span>
            ) : isVerified ? (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 size={10} /> Unlocked
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-300 border border-red-500/30">
                <XCircle size={10} /> Declined
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Verification Modal */}
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
