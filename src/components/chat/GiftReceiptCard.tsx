import React, { useState } from 'react';
import {
  Gift,
  Sparkles,
  CheckCircle2,
  ZoomIn,
  X,
  CreditCard,
  QrCode,
  DollarSign,
  ChevronRight,
  Check,
} from 'lucide-react';
import { GiftAttachment } from '../../lib/messageUtils';
import AppleEmoji from '../common/AppleEmoji';

interface GiftReceiptCardProps {
  gift: GiftAttachment | null;
  rawContent?: string | null;
  isMine: boolean;
  isCreator: boolean;
  senderName?: string;
  timestamp?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

interface GiftColorTheme {
  gradient: string;
  glow: string;
  border: string;
  pillBg: string;
}

/**
 * Maps each gift item to a proportional radiant gradient background
 * matching Telegram's luxury gift cards (Image 3).
 */
export function getGiftColorTheme(emoji: string, name: string): GiftColorTheme {
  const normName = (name || '').toLowerCase();

  // 1. Teddy Bear - Warm Honey & Caramel
  if (emoji === '🧸' || normName.includes('bear')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #63330e 0%, #361a06 52%, #170b02 100%)',
      glow: 'rgba(217, 119, 6, 0.45)',
      border: 'rgba(217, 119, 6, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 2. Love Ribbon / Sparkling Heart - Romantic Rose / Ruby
  if (emoji === '💖' || normName.includes('ribbon') || normName.includes('heart')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #6e1534 0%, #3b0a1a 52%, #17040a 100%)',
      glow: 'rgba(244, 63, 94, 0.45)',
      border: 'rgba(244, 63, 94, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 3. Gift Box / Present - Rich Velvet Red (Image 3)
  if (emoji === '🎁' || normName.includes('box') || normName.includes('gift')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #6a141b 0%, #3a0a0e 52%, #180305 100%)',
      glow: 'rgba(239, 68, 68, 0.5)',
      border: 'rgba(239, 68, 68, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 4. Red Rose - Deep Crimson & Velvet
  if (emoji === '🌹' || normName.includes('rose')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #6b0c24 0%, #390612 52%, #170207 100%)',
      glow: 'rgba(244, 63, 94, 0.45)',
      border: 'rgba(244, 63, 94, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 5. Birthday Cake - Sweet Truffle & Berry
  if (emoji === '🎂' || normName.includes('cake')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #5a1e3d 0%, #310f21 52%, #14050d 100%)',
      glow: 'rgba(217, 70, 239, 0.45)',
      border: 'rgba(217, 70, 239, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 6. Bouquet - Lavender & Botanical Purple
  if (emoji === '💐' || normName.includes('bouquet')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #4f2563 0%, #291234 52%, #110716 100%)',
      glow: 'rgba(168, 85, 247, 0.45)',
      border: 'rgba(168, 85, 247, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 7. Rocket - Deep Space Midnight Blue
  if (emoji === '🚀' || normName.includes('rocket')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #183765 0%, #0d1e37 52%, #050b16 100%)',
      glow: 'rgba(59, 130, 246, 0.5)',
      border: 'rgba(59, 130, 246, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 8. Gold Trophy - Pure Imperial Gold
  if (emoji === '🏆' || normName.includes('trophy')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #634607 0%, #342403 52%, #150f01 100%)',
      glow: 'rgba(245, 158, 11, 0.5)',
      border: 'rgba(245, 158, 11, 0.35)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 9. Diamond Ring - Glacial Cyan / Platinum
  if (emoji === '💍' || normName.includes('ring') || normName.includes('diamond')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #124862 0%, #092634 52%, #040f15 100%)',
      glow: 'rgba(6, 182, 212, 0.5)',
      border: 'rgba(6, 182, 212, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 10. Sports Car - High Octane Italian Racing Red
  if (emoji === '🏎️' || normName.includes('car')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #6b170c 0%, #360a05 52%, #160402 100%)',
      glow: 'rgba(239, 68, 68, 0.5)',
      border: 'rgba(239, 68, 68, 0.3)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 11. Royal Crown - Majestic Royal Gold
  if (emoji === '👑' || normName.includes('crown')) {
    return {
      gradient: 'radial-gradient(circle at 50% 25%, #694505 0%, #362302 52%, #150e01 100%)',
      glow: 'rgba(234, 179, 8, 0.55)',
      border: 'rgba(234, 179, 8, 0.35)',
      pillBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  // 12. Default / Custom Star - Cosmic Violet & Gold
  return {
    gradient: 'radial-gradient(circle at 50% 25%, #4f2168 0%, #2b1139 52%, #120718 100%)',
    glow: 'rgba(168, 85, 247, 0.45)',
    border: 'rgba(168, 85, 247, 0.3)',
    pillBg: 'rgba(255, 255, 255, 0.12)',
  };
}

export default function GiftReceiptCard({
  gift,
  rawContent,
  isMine,
  isCreator,
  senderName = 'Fan',
  timestamp,
  status,
}: GiftReceiptCardProps) {
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showProofLightbox, setShowProofLightbox] = useState(false);

  // Fallback extraction if gift object wasn't fully parsed
  const amount = gift?.amount ?? (() => {
    const match = rawContent?.match(/\$(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : 25;
  })();

  const name = gift?.name || 'Velour Gift';
  const emoji = gift?.emoji || '🎁';
  const note = gift?.note;
  const method = gift?.method || 'Gift Payment';
  const proofUrl = gift?.imageUrl;

  const theme = getGiftColorTheme(emoji, name);

  return (
    <>
      {/* ── Telegram-Style Proportional Gift Card (Image 3) ── */}
      <div
        className="relative select-none w-[220px] sm:w-[240px] rounded-[26px] p-5 flex flex-col items-center text-center shadow-2xl overflow-hidden transition-transform duration-200 hover:scale-[1.01]"
        style={{
          background: theme.gradient,
          border: `1px solid ${theme.border}`,
        }}
      >
        {/* Soft Ambient Radial Glow Behind Gift Emoji */}
        <div
          className="absolute top-6 w-28 h-28 rounded-full blur-2xl pointer-events-none opacity-80"
          style={{ background: theme.glow }}
        />

        {/* Top 3D iOS Gift Emoji */}
        <div className="relative z-10 my-1 flex items-center justify-center transform transition-transform hover:scale-110 duration-200">
          <AppleEmoji emoji={emoji} size={76} />
        </div>

        {/* Gift Title (Bold, Crisp White - matching Image 3) */}
        <h3 className="relative z-10 text-base sm:text-lg font-bold text-white tracking-tight mt-3 leading-tight line-clamp-2">
          {name}
        </h3>

        {/* Subtitle ($ Amount & Sender/Context) */}
        <p className="relative z-10 text-xs text-white/70 mt-1 font-medium tracking-wide">
          ${amount} USD
        </p>

        {/* Optional Fan Note (Displayed like a soft quote) */}
        {note && (
          <p className="relative z-10 text-[11px] text-white/80 italic line-clamp-2 mt-2 px-1 leading-snug">
            "{note}"
          </p>
        )}

        {/* Pill Action Button (Matching "Подробнее" in Image 3) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowDetailsModal(true);
          }}
          className="relative z-10 mt-4 w-full py-2.5 px-4 rounded-full text-xs font-semibold text-white/90 hover:text-white transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5 active:scale-95 border border-white/10"
          style={{ backgroundColor: theme.pillBg }}
        >
          <span>View Details</span>
          <ChevronRight size={13} className="text-white/60" />
        </button>

        {/* Timestamp & Status Indicator in bottom corner */}
        <div className="w-full flex items-center justify-end gap-1 mt-3 pt-1 text-[10px] text-white/40">
          <span>{timestamp || 'Just now'}</span>
          {isMine && (
            <span className="flex items-center text-white/60">
              <Check size={11} className="-mr-1.5" />
              <Check size={11} />
            </span>
          )}
        </div>
      </div>

      {/* ── Full Details Modal (When tapping "View Details") ── */}
      {showDetailsModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setShowDetailsModal(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl bg-[#14151a] border border-white/15 p-6 shadow-2xl flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowDetailsModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            {/* Header with Gift Emoji */}
            <div className="flex flex-col items-center text-center pb-4 border-b border-white/10">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
                style={{ background: theme.gradient, border: `1px solid ${theme.border}` }}
              >
                <AppleEmoji emoji={emoji} size={54} />
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">{name}</h3>
              <div className="inline-flex items-center gap-1 mt-1.5 px-3 py-0.5 rounded-full bg-gold/15 border border-gold/40 text-gold font-extrabold text-sm">
                <span>${amount} USD</span>
              </div>
            </div>

            {/* Transaction Breakdown */}
            <div className="py-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-white/60">
                <span>Payment Method</span>
                <span className="text-white font-medium">{method}</span>
              </div>

              <div className="flex items-center justify-between text-white/60">
                <span>Sender</span>
                <span className="text-white font-medium">{senderName}</span>
              </div>

              <div className="flex items-center justify-between text-white/60">
                <span>Status</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  <span>Delivered &amp; Verified</span>
                </span>
              </div>

              {note && (
                <div className="pt-2 border-t border-white/10">
                  <span className="text-white/50 block mb-1">Fan Note:</span>
                  <p className="text-white/90 italic bg-white/5 p-2.5 rounded-xl border border-white/5">
                    "{note}"
                  </p>
                </div>
              )}

              {/* Payment Proof Screenshot Preview if Attached */}
              {proofUrl && (
                <div className="pt-2 border-t border-white/10">
                  <span className="text-white/50 block mb-1.5">Payment Screenshot Proof:</span>
                  <div
                    onClick={() => setShowProofLightbox(true)}
                    className="relative rounded-xl overflow-hidden border border-white/15 bg-black cursor-pointer group aspect-video max-h-36 flex items-center justify-center"
                  >
                    <img
                      src={proofUrl}
                      alt="Proof"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold">
                      <ZoomIn size={14} />
                      <span>Tap to zoom</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dismiss Button */}
            <button
              type="button"
              onClick={() => setShowDetailsModal(false)}
              className="mt-2 w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Zoomable Lightbox for Screenshot Proof ── */}
      {showProofLightbox && proofUrl && (
        <div
          className="fixed inset-0 z-[100000] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setShowProofLightbox(false)}
        >
          <div className="relative max-w-lg w-full max-h-[85vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowProofLightbox(false)}
              className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
            <img
              src={proofUrl}
              alt="Payment proof full"
              className="max-h-[80vh] w-auto max-w-full rounded-2xl border border-white/20 shadow-2xl object-contain bg-black"
            />
            <p className="text-xs text-white/60 mt-3">Payment screenshot proof submitted by {senderName}</p>
          </div>
        </div>
      )}
    </>
  );
}
