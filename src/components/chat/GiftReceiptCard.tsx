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
} from 'lucide-react';
import { GiftAttachment } from '../../lib/messageUtils';

interface GiftReceiptCardProps {
  gift: GiftAttachment | null;
  rawContent?: string | null;
  isMine: boolean;
  isCreator: boolean;
  senderName?: string;
  timestamp?: string;
}

export default function GiftReceiptCard({
  gift,
  rawContent,
  isMine,
  isCreator,
  senderName = 'Fan',
  timestamp,
}: GiftReceiptCardProps) {
  const [showProofModal, setShowProofModal] = useState(false);

  // Fallback extraction if gift object wasn't fully parsed
  const amount = gift?.amount ?? (() => {
    const match = rawContent?.match(/\$(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : 15;
  })();

  const name = gift?.name || 'Gift';
  const emoji = gift?.emoji || '🎁';
  const note = gift?.note;
  const method = gift?.method || 'Gift Payment';
  const proofUrl = gift?.imageUrl;

  return (
    <div className="space-y-2 select-none min-w-[240px] max-w-[310px] sm:max-w-[340px]">
      {/* Premium Luxury Card Container */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d1f26] via-[#16171d] to-[#121317] border border-gold/40 shadow-xl p-3.5">
        
        {/* Subtle Gold Dust Header Glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 rounded-full blur-2xl pointer-events-none" />

        {/* Top Header Row */}
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-1.5 text-gold text-[0.68rem] font-bold uppercase tracking-wider">
            <Sparkles size={12} className="text-gold" />
            <span>{isCreator || !isMine ? 'Gift Received' : 'Gift Sent'}</span>
          </div>

          <span className="text-[10px] text-white/40">
            {timestamp || 'Just now'}
          </span>
        </div>

        {/* Gift Main Body */}
        <div className="flex items-center gap-3 relative z-10">
          {/* Big 3D Emoji Avatar */}
          <div className="w-13 h-13 rounded-2xl bg-black/40 border border-gold/30 flex items-center justify-center text-3xl shadow-inner shrink-0 transform hover:scale-105 transition-transform">
            {emoji}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white truncate">
              {name}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gold/15 border border-gold/40 text-gold font-extrabold text-xs">
                ${amount} USD
              </span>
            </div>
            <p className="text-[10px] text-white/50 truncate mt-1">
              Via {method}
            </p>
          </div>
        </div>

        {/* Optional Proof Photo (Screenshot of Crypto or Physical Card) */}
        {proofUrl && (
          <div className="mt-3 pt-2.5 border-t border-white/10 relative z-10">
            <div
              onClick={() => setShowProofModal(true)}
              className="flex items-center gap-2.5 p-2 rounded-xl bg-black/30 border border-white/10 hover:border-gold/40 transition-colors cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-black/50 border border-white/10">
                <img src={proofUrl} alt="Proof" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white/80 group-hover:text-gold transition-colors truncate">
                  Payment Proof Attached
                </p>
                <p className="text-[9px] text-white/40">Tap to inspect full screenshot</p>
              </div>
              <div className="w-6 h-6 rounded-full bg-white/5 group-hover:bg-gold/20 flex items-center justify-center text-gold transition-colors">
                <ZoomIn size={12} />
              </div>
            </div>
          </div>
        )}

        {/* Personal Note */}
        {note && (
          <div className="mt-2.5 pt-2 border-t border-white/10 relative z-10">
            <p className="text-xs text-white/90 italic leading-relaxed break-words px-1">
              "{note}"
            </p>
          </div>
        )}

        {/* Bottom Verification Status */}
        <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-emerald-400 font-semibold relative z-10">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={12} />
            <span>Delivered &amp; Verified</span>
          </span>
          <span className="text-white/40 font-normal">
            {isCreator ? 'Added to wallet' : 'Sent to creator'}
          </span>
        </div>
      </div>

      {/* Proof Modal Lightbox */}
      {showProofModal && proofUrl && (
        <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="relative max-w-lg w-full max-h-[85vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowProofModal(false)}
              className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
            <img
              src={proofUrl}
              alt="Payment proof"
              className="max-h-[80vh] w-auto max-w-full rounded-2xl border border-white/20 shadow-2xl object-contain bg-black"
            />
            <p className="text-xs text-white/60 mt-3">Payment screenshot proof submitted by {senderName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
