import React, { useState } from 'react';
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
  onUnlocked,
}: LockedAttachmentCardProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [localPending, setLocalPending] = useState(isPendingVerification);

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

  // Check if current user has unlocked the media or is the creator
  const canViewFull = isMine || isUnlocked;
  const isPending = localPending || isPendingVerification;

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
    onUnlocked?.();
  };

  return (
    <div className="space-y-2 max-w-[320px] sm:max-w-[340px] select-none">
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
            className={`relative rounded-xl overflow-hidden cursor-pointer group transition-all ${
              canViewFull
                ? 'border border-white/5 hover:border-white/15'
                : 'border border-gold/20 hover:border-gold/30 shadow-md shadow-black/30'
            }`}
          >
            {/* Media thumbnail */}
            <div className="aspect-[4/5] sm:aspect-square max-h-[300px] w-full overflow-hidden relative">
              <img
                src={
                  canViewFull
                    ? (media.thumbnailUrl || media.mediaUrl)
                    : (media.blurredThumbnailUrl || media.thumbnailUrl || media.mediaUrl)
                }
                alt=""
                className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                  !canViewFull ? 'filter blur-[14px] scale-110' : ''
                }`}
              />

              {/* Sending / uploading overlay */}
              {isSending ? (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
                  <div className="w-13 h-13 rounded-full bg-black/80 border border-gold/40 text-gold flex items-center justify-center shadow-2xl mb-2">
                    <Loader2 size={24} className="animate-spin text-gold" />
                  </div>
                  <span className="text-xs font-semibold text-white/90">
                    Uploading media…
                  </span>
                </div>
              ) : !canViewFull ? (
                <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px] flex flex-col items-center justify-center p-4 text-center">
                  <div className="w-13 h-13 rounded-full bg-black/75 border border-gold/40 text-gold flex items-center justify-center shadow-2xl mb-2 group-hover:scale-110 transition-transform">
                    {isPending ? <Clock size={24} className="animate-spin" /> : <Lock size={24} />}
                  </div>

                  <span className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    {media.mediaType === 'video' ? 'Locked Video' : 'Locked Photo'}
                  </span>

                  <span className="text-xl font-extrabold text-gold font-serif">
                    ${price}
                  </span>
                </div>
              ) : null}

              {/* Play icon for video when unlocked */}
              {canViewFull && media.mediaType === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-black/65 backdrop-blur text-white flex items-center justify-center shadow-xl">
                    <Play size={20} fill="currentColor" />
                  </div>
                </div>
              )}

              {/* Tap to expand badge when unlocked */}
              {canViewFull && (
                <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full bg-black/60 backdrop-blur text-white/80 text-[0.62rem] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Eye size={11} />
                  <span>View</span>
                </div>
              )}
            </div>

            {/* Bottom action bar */}
            <div className="p-3 bg-[#18181a]/95 border-t border-white/10 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-paper truncate">
                  {media.title || (media.mediaType === 'video' ? 'Exclusive Video' : 'Exclusive Photo')}
                </p>
                <p className="text-[0.68rem] text-muted">
                  {canViewFull ? (
                    <span className="text-emerald-400 font-medium">Unlocked content</span>
                  ) : (
                    <span>One-time unlock • $1 = 1 Star</span>
                  )}
                </p>
              </div>

              {!canViewFull && !isPending && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPaymentModal(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-gold hover:bg-gold-light text-ink font-bold text-xs shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
                >
                  Unlock ${price}
                </button>
              )}

              {isPending && (
                <div className="px-2.5 py-1 rounded-lg bg-gold/15 text-gold text-[0.68rem] font-medium flex items-center gap-1 shrink-0">
                  <Clock size={11} className="animate-spin" />
                  <span>Pending</span>
                </div>
              )}

              {isMine && (
                <span className="text-[0.68rem] text-gold font-medium px-2 py-0.5 rounded-md bg-gold/10 shrink-0">
                  Locked (${price})
                </span>
              )}
            </div>
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
          title: it.title,
          caption: it.title || null,
          senderName: senderName || (isMine ? 'You' : 'Creator'),
          senderAvatar: senderAvatar,
          timestamp: timestamp,
        }))}
        initialIndex={lightboxIndex}
        senderName={senderName || (isMine ? 'You' : 'Creator')}
        senderAvatar={senderAvatar}
        timestamp={timestamp}
        caption={media.title || null}
      />

      {/* Unlock payment modal */}
      <UnlockPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        amountUsd={price}
        attachmentTitle={media.title}
        batchCount={items.length}
        thumbnailUrl={media.thumbnailUrl || media.mediaUrl}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
