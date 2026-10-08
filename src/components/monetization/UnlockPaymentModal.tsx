import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Lock,
  Copy,
  Check,
  CreditCard,
  QrCode,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Sparkles,
  Camera,
  Upload,
  Image as ImageIcon,
  Smartphone,
  ZoomIn,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { uploadPublicFile } from '../../lib/r2';

interface UnlockPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amountUsd: number;
  attachmentTitle?: string;
  batchCount?: number;
  thumbnailUrl?: string | null;
  attachmentId?: string;
  creatorId?: string;
  onSuccess?: () => void;
}

type PaymentMethod = 'giftcard' | 'crypto';
type GiftCardType = 'e_card' | 'physical_card';

const GIFT_CARD_BRANDS = ['Razor Gold', 'Apple'];
const CRYPTO_WALLET = '0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7';
const CRYPTO_NETWORK = 'USDT (ERC-20 / TRC-20)';

function getCleanTitle(rawTitle?: string, count: number = 1): string {
  if (!rawTitle) {
    return count > 1 ? `Exclusive Bundle (${count} items)` : 'Exclusive Media';
  }
  // If it's a raw file name, hash, or UUID
  if (
    rawTitle.length > 18 && !rawTitle.includes(' ') ||
    /^03x/i.test(rawTitle) ||
    /^[a-f0-9-]{24,}$/i.test(rawTitle) ||
    /\.(jpg|jpeg|png|webp|mp4|mov)$/i.test(rawTitle)
  ) {
    return count > 1 ? `Exclusive Bundle (${count} items)` : 'Exclusive Media';
  }
  return rawTitle;
}

export default function UnlockPaymentModal({
  isOpen,
  onClose,
  amountUsd,
  attachmentTitle,
  batchCount = 1,
  thumbnailUrl,
  attachmentId,
  creatorId,
  onSuccess,
}: UnlockPaymentModalProps) {
  const { user } = useAuth();
  const [method, setMethod] = useState<PaymentMethod>('giftcard');
  const [giftCardType, setGiftCardType] = useState<GiftCardType>('e_card');
  const [giftBrand, setGiftBrand] = useState(GIFT_CARD_BRANDS[0]);
  const [proof, setProof] = useState('');
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const displayTitle = getCleanTitle(attachmentTitle, batchCount);

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(CRYPTO_WALLET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCardImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCardImageFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setCardImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (method === 'giftcard') {
      if (giftCardType === 'e_card' && !proof.trim()) {
        setError('Please enter your gift card claim code or PIN.');
        return;
      }
      if (giftCardType === 'physical_card' && !cardImageFile && !cardImagePreview) {
        setError('Please upload a clear photo of the physical gift card.');
        return;
      }
    } else {
      if (!proof.trim()) {
        setError('Please enter the transaction hash (TxID).');
        return;
      }
    }

    if (!user) {
      setError('You must be signed in to unlock content.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedCardImageUrl: string | null = null;
      if (method === 'giftcard' && giftCardType === 'physical_card' && cardImageFile) {
        setUploadingImage(true);
        try {
          const key = `giftcards/${user.id}/${Date.now()}_${cardImageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          uploadedCardImageUrl = await uploadPublicFile(cardImageFile, key, { maxWidth: 1920, quality: 0.85 });
        } catch (upErr) {
          console.warn('R2 upload failed, fallback to preview image:', upErr);
          uploadedCardImageUrl = cardImagePreview;
        } finally {
          setUploadingImage(false);
        }
      } else if (cardImagePreview) {
        uploadedCardImageUrl = cardImagePreview;
      }

      const cardType = method === 'crypto' ? 'crypto' : giftCardType;
      const effectiveRef = method === 'giftcard' && giftCardType === 'physical_card'
        ? (proof.trim() ? `Photo + Code: ${proof.trim()}` : 'Physical card photo uploaded')
        : proof.trim();

      const description =
        method === 'crypto'
          ? `Crypto USDT | $${amountUsd} | Tx: ${proof.trim()}`
          : `${giftCardType === 'physical_card' ? 'Physical Card' : 'E-Gift Card'} | $${amountUsd} | ${giftBrand}: ${effectiveRef}`;

      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const safeAttachmentId = attachmentId && UUID_REGEX.test(attachmentId) ? attachmentId : null;

      const metaPayload = {
        creator_id: creatorId || null,
        card_type: cardType,
        card_image_url: uploadedCardImageUrl || null,
        media_url: thumbnailUrl || null,
        raw_attachment_id: attachmentId || null,
        title: displayTitle,
        brand: method === 'crypto' ? 'USDT' : giftBrand,
        proof: effectiveRef,
      };
      const fullDescription = `${description} [META:${JSON.stringify(metaPayload)}]`;

      // 1. Try DB RPC submit_unlock_request if available
      let submittedViaRpc = false;
      let insertedTxId: string | null = null;
      try {
        const { data: rpcRes, error: rpcError } = await supabase.rpc('submit_unlock_request', {
          p_fan_id: user.id,
          p_creator_id: creatorId || null,
          p_amount_usd: amountUsd,
          p_attachment_id: safeAttachmentId,
          p_card_type: cardType,
          p_card_image_url: uploadedCardImageUrl || null,
          p_media_url: thumbnailUrl || null,
          p_reference: effectiveRef,
          p_description: fullDescription,
        });
        if (!rpcError && rpcRes) {
          submittedViaRpc = true;
          insertedTxId = typeof rpcRes === 'string' ? rpcRes : (rpcRes as any)?.id || null;
        }
      } catch {
        submittedViaRpc = false;
      }

      // 2. Resilient insert to transactions_ledger
      if (!submittedViaRpc) {
        // Try extended columns first
        const { data: insertedTx, error: insertError } = await supabase
          .from('transactions_ledger')
          .insert({
            user_id: user.id,
            creator_id: creatorId || null,
            type: 'attachment_unlock',
            amount_usd: amountUsd,
            status: 'pending',
            attachment_id: safeAttachmentId,
            card_type: cardType,
            card_image_url: uploadedCardImageUrl || null,
            media_url: thumbnailUrl || null,
            reference: effectiveRef,
            description: fullDescription,
          })
          .select('id')
          .maybeSingle();

        if (!insertError && insertedTx?.id) {
          insertedTxId = insertedTx.id;
        } else {
          console.warn('Extended columns insert failed, trying base columns fallback:', insertError?.message);
          // Fallback: guaranteed base columns from original schema
          const { data: fallbackTx, error: fallbackError } = await supabase
            .from('transactions_ledger')
            .insert({
              user_id: user.id,
              type: 'attachment_unlock',
              amount_usd: amountUsd,
              status: 'pending',
              attachment_id: safeAttachmentId,
              reference: effectiveRef,
              description: fullDescription,
            })
            .select('id')
            .maybeSingle();

          if (!fallbackError && fallbackTx?.id) {
            insertedTxId = fallbackTx.id;
          } else if (fallbackError) {
            console.error('Base columns fallback insert error:', fallbackError.message);
          }
        }

        if (safeAttachmentId) {
          try {
            await supabase.from('attachment_unlocks').insert({
              attachment_id: safeAttachmentId,
              fan_id: user.id,
              creator_id: creatorId || null,
              amount_usd: amountUsd,
              media_url: thumbnailUrl || null,
              status: 'pending',
            });
          } catch {}
        }
      }

      // 3. Mark in local optimistic storage for user (STRICTLY status: 'pending')
      if (attachmentId || thumbnailUrl) {
        try {
          const key = `velour_unlocked_media_${user.id}`;
          const existing = JSON.parse(localStorage.getItem(key) || '[]');
          const newEntry = {
            id: attachmentId || `unlock_${Date.now()}`,
            mediaUrl: thumbnailUrl || '',
            thumbnailUrl: thumbnailUrl || '',
            mediaType: 'image',
            title: displayTitle,
            amountUsd,
            unlockedAt: new Date().toISOString(),
            status: 'pending',
          };
          localStorage.setItem(key, JSON.stringify([newEntry, ...existing.filter((e: any) => e.id !== newEntry.id)]));
        } catch (storageErr) {
          console.warn('Could not store optimistic unlock:', storageErr);
        }
      }

      // 4. Cache pending request in creator and admin queues for instant dashboard visibility
      const pendingObj = {
        id: insertedTxId || `tx_${Date.now()}`,
        user_id: user.id,
        creator_id: creatorId || null,
        fan_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Fan',
        fan_avatar: user.user_metadata?.avatar_url || null,
        type: 'attachment_unlock',
        amount_usd: amountUsd,
        status: 'pending',
        card_type: cardType,
        card_brand: giftBrand,
        card_image_url: uploadedCardImageUrl,
        reference: effectiveRef,
        media_url: thumbnailUrl,
        title: displayTitle,
        created_at: new Date().toISOString(),
      };

      if (creatorId) {
        try {
          const cKey = `velour_creator_pending_txs_${creatorId}`;
          const cExisting = JSON.parse(localStorage.getItem(cKey) || '[]');
          localStorage.setItem(cKey, JSON.stringify([pendingObj, ...cExisting]));
        } catch {}
      }

      try {
        const aKey = `velour_admin_pending_txs`;
        const aExisting = JSON.parse(localStorage.getItem(aKey) || '[]');
        localStorage.setItem(aKey, JSON.stringify([pendingObj, ...aExisting]));
      } catch {}

      setSubmitted(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1400);
    } catch (err) {
      console.error('Failed to submit unlock payment proof:', err);
      setError('Submission failed. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid =
    method === 'crypto'
      ? Boolean(proof.trim())
      : giftCardType === 'e_card'
      ? Boolean(proof.trim())
      : Boolean(cardImagePreview || cardImageFile);

  const chatRoot = typeof document !== 'undefined' ? document.getElementById('chat-window-root') : null;
  const portalTarget = chatRoot || (typeof document !== 'undefined' ? document.body : null);
  if (!portalTarget) return null;

  const modalContent = (
    <div className="fixed md:absolute inset-0 z-[99999] pointer-events-auto overflow-hidden">
      {/* Dimmed backdrop - click outside to dismiss */}
      <div
        className="fixed md:absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Apple-style Bottom Sheet - Pinned strictly to viewport bottom on mobile, chat window on desktop */}
      <div
        className="fixed md:absolute inset-x-0 bottom-0 z-10 w-full h-[92vh] max-h-[92vh] md:h-[90%] md:max-h-[90%] bg-[#1c1c1e] text-white rounded-t-[32px] md:rounded-t-[28px] md:border-t md:border-white/10 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 font-sans"
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
            <h3 className="font-semibold text-lg text-white tracking-tight">Unlock Exclusive Media</h3>
            <p className="text-xs text-white/50 mt-0.5">
              {batchCount > 1 ? `${batchCount} items bundle` : 'Single exclusive item'} · $1 = 1 Star
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {submitted ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center animate-in zoom-in-75 duration-200">
                <CheckCircle2 size={36} />
              </div>
              <h4 className="font-semibold text-xl text-white">Payment Proof Submitted</h4>
              <p className="text-sm text-white/60 max-w-xs leading-relaxed">
                Your payment is being verified by the creator. Content remains locked until verified and will unlock automatically once approved.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Apple-style Media & Price Showcase Card */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4">
                {thumbnailUrl ? (
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0 relative">
                    <img
                      src={thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover filter blur-[2px] scale-105"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Lock size={18} className="text-gold" />
                    </div>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold shrink-0">
                    <Lock size={22} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-base text-white truncate">
                    {displayTitle}
                  </h4>
                  <p className="text-xs text-white/50 mt-0.5">One-time payment unlock</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] text-white/40 uppercase tracking-wider block">Price</span>
                  <span className="text-2xl font-bold text-gold tracking-tight">${amountUsd}</span>
                </div>
              </div>

              {/* iOS-style Segmented Control */}
              <div className="p-1 rounded-2xl bg-[#2c2c2e] flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMethod('giftcard');
                    setError(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    method === 'giftcard'
                      ? 'bg-[#3a3a3c] text-white shadow-sm font-semibold'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <CreditCard size={16} />
                  <span>Gift Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMethod('crypto');
                    setError(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    method === 'crypto'
                      ? 'bg-[#3a3a3c] text-white shadow-sm font-semibold'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <QrCode size={16} />
                  <span>USDT Crypto</span>
                </button>
              </div>

              {/* Payment Method Details */}
              {method === 'giftcard' ? (
                <div className="space-y-4">
                  {/* Brand Selector Pills */}
                  <div>
                    <label className="text-xs text-white/50 font-medium uppercase tracking-wider block mb-2">
                      Card Brand
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {GIFT_CARD_BRANDS.map((brand) => (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => setGiftBrand(brand)}
                          className={`py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-between border transition-all cursor-pointer ${
                            giftBrand === brand
                              ? 'bg-gold/15 border-gold text-gold shadow-sm'
                              : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span>{brand}</span>
                          {giftBrand === brand && <Check size={16} strokeWidth={2.5} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dual Mode Selector: E-Card vs Physical Card */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/50 font-medium uppercase tracking-wider block mb-2">
                      Card Format
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 border border-white/10 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setGiftCardType('e_card');
                          setError(null);
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          giftCardType === 'e_card'
                            ? 'bg-white/15 text-white shadow-sm'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        <Smartphone size={14} />
                        <span>E-Gift Card</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGiftCardType('physical_card');
                          setError(null);
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          giftCardType === 'physical_card'
                            ? 'bg-white/15 text-white shadow-sm'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        <CreditCard size={14} />
                        <span>Physical Card</span>
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: E-Gift Card (Digital PIN / Code) */}
                  {giftCardType === 'e_card' ? (
                    <div className="space-y-1.5">
                      <label className="text-xs text-white/50 font-medium uppercase tracking-wider block">
                        {giftBrand} PIN / Digital Claim Code
                      </label>
                      <input
                        type="text"
                        value={proof}
                        onChange={(e) => setProof(e.target.value)}
                        placeholder="Enter gift card claim code or PIN"
                        className="w-full px-4 py-3.5 bg-white/5 border border-white/15 rounded-xl text-base text-white placeholder:text-white/30 focus:outline-none focus:border-gold transition-colors"
                      />
                      <p className="text-xs text-white/40">
                        Purchase a ${amountUsd} {giftBrand} e-gift card and paste the claim code above.
                      </p>
                    </div>
                  ) : (
                    /* Mode 2: Physical Gift Card (Image / Photo Upload) */
                    <div className="space-y-3">
                      <label className="text-xs text-white/50 font-medium uppercase tracking-wider block">
                        Upload Card Photo (Front / Back / Receipt)
                      </label>
                      
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleCardImageSelect}
                        className="hidden"
                      />

                      {cardImagePreview ? (
                        <div className="relative rounded-2xl overflow-hidden border border-gold/40 bg-black/40 group">
                          <img
                            src={cardImagePreview}
                            alt="Card preview"
                            className="w-full h-44 object-contain bg-black/60"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-md cursor-pointer transition-colors"
                            >
                              Retake / Change
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCardImageFile(null);
                                setCardImagePreview(null);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-xs font-semibold backdrop-blur-md cursor-pointer transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="p-2.5 bg-black/70 flex items-center justify-between text-xs text-white/80 border-t border-white/10">
                            <span className="flex items-center gap-1.5 text-emerald-400 font-medium truncate">
                              <Check size={13} strokeWidth={2.5} /> Photo ready for inspection
                            </span>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-gold hover:underline text-[11px] cursor-pointer"
                            >
                              Change
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-white/20 hover:border-gold/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-2.5 bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer group"
                        >
                          <div className="w-12 h-12 rounded-full bg-gold/15 text-gold flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Camera size={22} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">Tap to take photo or upload</p>
                            <p className="text-xs text-white/40 mt-0.5">
                              Clear photo of physical {giftBrand} card & PIN
                            </p>
                          </div>
                          <span className="text-[11px] text-gold/90 font-medium px-3 py-1 rounded-full bg-gold/10">
                            Upload Photo
                          </span>
                        </div>
                      )}

                      {/* Optional PIN input alongside photo */}
                      <div className="space-y-1">
                        <label className="text-[11px] text-white/50 block">
                          PIN or Serial code (optional if visible on photo)
                        </label>
                        <input
                          type="text"
                          value={proof}
                          onChange={(e) => setProof(e.target.value)}
                          placeholder="e.g. Card PIN (optional)"
                          className="w-full px-4 py-2.5 bg-white/5 border border-white/15 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-gold transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Wallet Box */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-white/50 font-medium uppercase tracking-wider">
                      <span>USDT Address ({CRYPTO_NETWORK})</span>
                      <span>Send ${amountUsd}</span>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/15 rounded-xl">
                      <span className="font-mono text-xs text-gold truncate flex-1 select-all">
                        {CRYPTO_WALLET}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyWallet}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                      >
                        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* TxID Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/50 font-medium uppercase tracking-wider block">
                      Transaction Hash (TxID)
                    </label>
                    <input
                      type="text"
                      value={proof}
                      onChange={(e) => setProof(e.target.value)}
                      placeholder="Paste USDT transaction hash"
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/15 rounded-xl text-sm font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-gold transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Apple-style Action Button */}
              <button
                type="submit"
                disabled={submitting || !isFormValid}
                className="w-full py-4 rounded-2xl bg-gold hover:bg-gold-light active:scale-[0.99] disabled:opacity-40 disabled:scale-100 text-ink font-bold text-base transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer mt-4"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-ink" />
                    <span>{uploadingImage ? 'Uploading Card Photo…' : 'Submitting Proof…'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>Confirm & Unlock · ${amountUsd}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, portalTarget);
}
