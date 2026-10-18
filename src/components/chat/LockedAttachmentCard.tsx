import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Clock, Sparkles, Check, Play, Eye, Loader2 } from 'lucide-react';
import type { VaultMediaPayload } from '../../lib/creatorVault';
import UnlockPaymentModal from '../monetization/UnlockPaymentModal';
import MediaLightbox from './MediaLightbox';
import WhatsAppMediaGrid from './WhatsAppMediaGrid';

interface LockedAttachmentCardProps {
  media: VaultMediaPayload;
  isMine: boolean;
  isCreator: boolean;
  currentUserId?: string;
  isUnlocked?: boolean;
  isPendingVerification?: boolean;
  isSending?: boolean;
  senderName?: string;
  senderAvatar?: string | null;
  timestamp?: string;
  creatorId?: string;
  conversationId?: string;
  onUnlocked?: () => void;
}

export default function LockedAttachmentCard({
  media,
  isMine,
  isCreator,
  currentUserId,
  isUnlocked = false,
  isPendingVerification = false,
  isSending = false,
  senderName,
  senderAvatar,
  timestamp,
  creatorId,
  conversationId,
  onUnlocked,
}: LockedAttachmentCardProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [localPending, setLocalPending] = useState(isPendingVerification);
  const [localUnlocked, setLocalUnlocked] = useState(isUnlocked);

  useEffect(() => {
    if (isUnlocked) setLocalUnlocked(true);
  }, [isUnlocked]);

  const price = media.price || 10;
  const isBatch = Boolean(media.items && media.items.length > 1);
  const items = isBatch ? (media.items || []) : [{
    mediaUrl: media.mediaUrl,
    mediaType: media.mediaType,
    thumbnailUrl: media.thumbnailUrl,
    blurredThumbnailUrl: media.blurredThumbnailUrl,
    title: media.title,
    durationSecs: media.durationSecs,
  }];

  useEffect(() => {
    const matchesTarget = (detail: any) => {
      if (!detail) return false;
      const incoming = [
        detail.attachmentId,
        detail.batchId,
        detail.mediaUrl,
        ...(Array.isArray(detail.mediaUrls) ? detail.mediaUrls : []),
      ].filter(Boolean);

      const targets = [
        media.batchId,
        (media as any).id,
        media.mediaUrl,
        media.thumbnailUrl,
        ...items.map(i => i.mediaUrl),
        ...items.map(i => i.thumbnailUrl),
      ].filter(Boolean);

      return incoming.some(inc => targets.includes(inc));
    };

    const handlePending = (e: any) => {
      if (matchesTarget(e.detail)) {
        setLocalPending(true);
      }
    };
    const handleVerified = (e: any) => {
      if (matchesTarget(e.detail)) {
        setLocalPending(false);
        setLocalUnlocked(true);
        onUnlocked?.();
      }
    };
    window.addEventListener('velour:unlock_pending', handlePending);
    window.addEventListener('velour:unlock_verified', handleVerified);
    return () => {
      window.removeEventListener('velour:unlock_pending', handlePending);
      window.removeEventListener('velour:unlock_verified', handleVerified);
    };
  }, [media.batchId, media.mediaUrl, media.thumbnailUrl, items, onUnlocked]);

  // Check if current user has unlocked the media or is the creator
  const canViewFull = isMine || isUnlocked || localUnlocked;
  const isPending = !canViewFull && (localPending || isPendingVerification);

  const handleMediaClick = (idx: number) => {
    if (isSending) return;
    if (canViewFull) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    } else if (!isPending) {
      setShowPaymentModal(true);
    }
  };

  const handlePaymentSuccess = () => {
    setLocalPending(true);
  };

  return (
    <div data-no-swipe="true" className="space-y-2 max-w-[320px] sm:max-w-[340px] select-none">
      {/* ── Batch bundle layout (2+ items) ─────────────────────────── */}
      {isBatch ? (
        <div className="space-y-2">
          {/* Header indicator */}
          <div className="flex items-center justify-between text-xs px-1">
            <span className="flex items-center gap-1.5 font-medium text-paper/90">
              {isSending ? (
                <span className="text-gold flex items-center gap-1">
                  <Loader2 size={13} className="animate-spin" /> Uploading Bundle…
                </span>
              ) : canViewFull ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Check size={13} strokeWidth={2.5} /> Unlocked Bundle
                </span>
              ) : isPending ? (
                <span className="text-gold flex items-center gap-1 animate-pulse">
                  <Clock size={13} /> Verification Pending
                </span>
              ) : (
                <span className="text-gold flex items-center gap-1">
                  <Lock size={13} /> Exclusive Bundle ({items.length} items)
                </span>
              )}
            </span>
            <span className="text-gold font-bold font-serif">${price}</span>
          </div>

          {/* WhatsApp-style multi-media grid */}
          <WhatsAppMediaGrid
            items={items}
            canViewFull={canViewFull}
            isSending={isSending}
            isPending={isPending}
            onItemClick={handleMediaClick}
          />

          {/* Combined CTA button beneath strip */}
          {!canViewFull && (
            <div>
              {isPending ? (
                <div className="w-full py-2.5 px-3 rounded-xl bg-gold/10 border border-gold/30 text-gold text-xs font-semibold flex items-center justify-center gap-2">
                  <Clock size={14} className="animate-spin" />
                  <span>Payment submitted — unlocking soon</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full py-2.5 px-3 rounded-xl bg-gold hover:bg-gold-light text-ink text-xs font-bold transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles size={14} />
                  <span>Unlock {items.length} items for ${price}</span>
                </button>
              )}
            </div>
          )}

          {/* Creator self-view tag */}
          {isMine && (
            <p className="text-[0.68rem] text-muted text-center pt-0.5">
              You sent this locked batch for ${price}
            </p>
          )}
        </div>
      ) : (
        /* ── Single locked item layout ───────────────────────────── */
        <div className="space-y-2">
          <div
            onClick={() => handleMediaClick(0)}
            className={`relative rounded-2xl overflow-hidden cursor-pointer group transition-all ${
              canViewFull
                ? 'border border-white/10 hover:border-white/20'
                : 'border border-gold/30 hover:border-gold/50 shadow-lg shadow-black/40'
            }`}
          >
            {/* Media thumbnail */}
            <div className="aspect-[4/5] sm:aspect-square max-h-[320px] w-full overflow-hidden relative bg-black">
              <img
                src={
                  canViewFull
                    ? (media.thumbnailUrl || media.mediaUrl)
                    : (media.blurredThumbnailUrl || media.thumbnailUrl || media.mediaUrl)
                }
                alt=""
                className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-102 ${
                  !canViewFull ? 'filter blur-[16px] scale-110' : ''
                }`}
              />

              {/* Creator lock indicator pill (top-right) */}
              {canViewFull && isMine && media.price && (
                <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-gold/40 text-gold text-[10px] font-semibold flex items-center gap-1 shadow">
                  <Lock size={10} />
                  <span>${price}</span>
                </div>
              )}

              {/* Video duration badge (bottom-left) */}
              {media.mediaType === 'video' && media.durationSecs !== undefined && (
                <div className="absolute bottom-2.5 left-2.5 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-white/95 text-[10px] font-medium flex items-center gap-1 shadow">
                  <Play size={8} fill="currentColor" />
                  <span>
                    {Math.floor(media.durationSecs / 60)}:
                    {(media.durationSecs % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              )}

              {/* Sending / uploading overlay */}
              {isSending ? (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-black/80 border border-gold/40 text-gold flex items-center justify-center shadow-2xl mb-2">
                    <Loader2 size={22} className="animate-spin text-gold" />
                  </div>
                  <span className="text-xs font-semibold text-white/90">
                    Uploading media…
                  </span>
                </div>
              ) : !canViewFull ? (
                <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px] flex flex-col items-center justify-center p-4 text-center">
                  <div className="w-13 h-13 rounded-full bg-black/80 border border-gold/50 text-gold flex items-center justify-center shadow-2xl mb-2 group-hover:scale-110 transition-transform">
                    {isPending ? <Clock size={22} className="animate-spin" /> : <Lock size={22} />}
                  </div>

                  <span className="text-xl font-extrabold text-gold font-serif drop-shadow-sm">
                    ${price}
                  </span>
                </div>
              ) : null}

              {/* Play icon for video when unlocked */}
              {canViewFull && media.mediaType === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-sm text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                    <Play size={20} fill="currentColor" />
                  </div>
                </div>
              )}

              {/* Tap to expand badge when unlocked */}
              {canViewFull && (
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-white/80 text-[0.62rem] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Eye size={11} />
                  <span>Expand</span>
                </div>
              )}
            </div>

            {/* Bottom action button only when locked for viewer */}
            {!canViewFull && (
              <div>
                {isPending ? (
                  <div className="w-full py-2.5 px-3 bg-[#18181a] border-t border-white/10 text-gold text-xs font-semibold flex items-center justify-center gap-2">
                    <Clock size={13} className="animate-spin" />
                    <span>Payment submitted — unlocking soon</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPaymentModal(true);
                    }}
                    className="w-full py-2.5 px-3 bg-gold hover:bg-gold-light text-ink text-xs font-bold transition-all shadow-md active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={13} />
                    <span>Unlock for ${price}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox for viewing full unlocked media */}
      <MediaLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        items={items.map((it) => ({
          mediaUrl: it.mediaUrl,
          mediaType: it.mediaType,
          thumbnailUrl: it.thumbnailUrl,
          caption: null,
          senderName: senderName || (isMine ? 'You' : 'Creator'),
          senderAvatar: senderAvatar,
          timestamp: timestamp,
        }))}
        initialIndex={lightboxIndex}
        senderName={senderName || (isMine ? 'You' : 'Creator')}
        senderAvatar={senderAvatar}
        timestamp={timestamp}
        caption={null}
      />

      {/* Unlock payment modal */}
      <UnlockPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        attachmentId={media.batchId || (items[0] && items[0].mediaUrl) || media.mediaUrl}
        creatorId={creatorId}
        conversationId={conversationId}
        amountUsd={price}
        attachmentTitle={media.title}
        batchCount={items.length}
        thumbnailUrl={media.thumbnailUrl || media.mediaUrl}
        mediaUrls={items.map(i => i.mediaUrl).filter(Boolean) as string[]}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
