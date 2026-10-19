import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Gift,
  X,
  ChevronLeft,
  Sparkles,
  Check,
  Copy,
  CreditCard,
  QrCode,
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  DollarSign,
  Heart,
  Send,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useBackHandler } from '../../lib/backButtonRegistry';
import { supabase } from '../../lib/supabase';
import { uploadPublicFile } from '../../lib/r2';

export interface GiftOption {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  description: string;
  color: string;
  bgGradient: string;
}

export const GIFTS_CATALOG: GiftOption[] = [
  { id: 'rose', name: 'Rose', emoji: '🌹', amount: 2, description: 'A sweet gesture', color: '#f43f5e', bgGradient: 'from-rose-500/20 to-rose-500/5' },
  { id: 'coffee', name: 'Coffee', emoji: '☕', amount: 5, description: 'Fuel for creativity', color: '#d97706', bgGradient: 'from-amber-500/20 to-amber-500/5' },
  { id: 'heart', name: 'Heart', emoji: '💖', amount: 10, description: 'Sending pure love', color: '#ec4899', bgGradient: 'from-pink-500/20 to-pink-500/5' },
  { id: 'champagne', name: 'Champagne', emoji: '🍾', amount: 25, description: 'Celebrate in style', color: '#eab308', bgGradient: 'from-yellow-500/20 to-yellow-500/5' },
  { id: 'diamond', name: 'Diamond', emoji: '💎', amount: 50, description: 'You are priceless', color: '#06b6d4', bgGradient: 'from-cyan-500/20 to-cyan-500/5' },
  { id: 'crown', name: 'Crown', emoji: '👑', amount: 100, description: 'Royalty treatment', color: '#d4af37', bgGradient: 'from-amber-400/25 to-yellow-600/10' },
  { id: 'supercar', name: 'Supercar', emoji: '🏎️', amount: 250, description: 'VIP high roller', color: '#ef4444', bgGradient: 'from-red-500/20 to-red-500/5' },
  { id: 'yacht', name: 'Yacht', emoji: '🛥️', amount: 500, description: 'Ultimate luxury patron', color: '#3b82f6', bgGradient: 'from-blue-500/20 to-blue-500/5' },
];

const GIFT_CARD_BRANDS = ['Razor Gold', 'Apple', 'Steam'];
const CRYPTO_WALLET = '0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7';
const CRYPTO_NETWORK = 'USDT (ERC-20 / TRC-20)';

interface SendGiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientName?: string;
  recipientId?: string;
  conversationId?: string;
  onSendGift: (messageContent: string) => void;
}

type PaymentMethod = 'instant' | 'giftcard' | 'crypto';
type GiftCardType = 'e_card' | 'physical_card';

export default function SendGiftModal({
  isOpen,
  onClose,
  recipientName,
  recipientId,
  conversationId,
  onSendGift,
}: SendGiftModalProps) {
  const { user } = useAuth();

  const [step, setStep] = useState<'select' | 'payment' | 'success'>('select');
  const [selectedGift, setSelectedGift] = useState<GiftOption>(GIFTS_CATALOG[2]); // Default Heart ($10)
  const [isCustom, setIsCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState('15');
  const [note, setNote] = useState('');

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('instant');
  const [giftCardType, setGiftCardType] = useState<GiftCardType>('e_card');
  const [giftBrand, setGiftBrand] = useState(GIFT_CARD_BRANDS[0]);
  const [proof, setProof] = useState('');
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Android hardware back button
  useBackHandler(() => {
    if (step === 'payment') {
      setStep('select');
      return true;
    }
    onClose();
    return true;
  }, isOpen, 115);

  if (!isOpen) return null;

  const effectiveAmount = isCustom ? Math.max(1, parseFloat(customAmount) || 1) : selectedGift.amount;

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(CRYPTO_WALLET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCardImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCardImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setCardImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmitGift = async () => {
    if (!user) {
      setError('Please sign in to send gifts.');
      return;
    }

    if (paymentMethod === 'giftcard') {
      if (giftCardType === 'e_card' && !proof.trim()) {
        setError('Please enter the gift card claim code or PIN.');
        return;
      }
      if (giftCardType === 'physical_card' && !cardImageFile && !cardImagePreview) {
        setError('Please upload a clear photo of the physical gift card.');
        return;
      }
    } else if (paymentMethod === 'crypto') {
      if (!proof.trim()) {
        setError('Please enter the USDT transaction hash (TxID).');
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedCardUrl: string | null = null;
      if (paymentMethod === 'giftcard' && giftCardType === 'physical_card' && cardImageFile) {
        try {
          const key = `gifts/${user.id}/${Date.now()}_${cardImageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          uploadedCardUrl = await uploadPublicFile(cardImageFile, key, { maxWidth: 1920, quality: 0.85 });
        } catch {
          uploadedCardUrl = cardImagePreview;
        }
      }

      const effectiveRef =
        paymentMethod === 'crypto'
          ? `TxID: ${proof.trim()}`
          : paymentMethod === 'giftcard'
          ? giftCardType === 'physical_card'
            ? `Physical Card (${giftBrand}): ${proof.trim() || 'Photo attached'}`
            : `E-Card (${giftBrand}): ${proof.trim()}`
          : 'Direct Gift Tip';

      const giftName = isCustom ? 'Custom Gift' : selectedGift.name;
      const giftEmoji = isCustom ? '🎁' : selectedGift.emoji;

      // 1. Record in transactions ledger
      try {
        await supabase.from('transactions_ledger').insert({
          user_id: user.id,
          type: 'gift',
          amount_usd: effectiveAmount,
          status: 'completed',
          reference: effectiveRef,
          description: `Gift: ${giftName} | $${effectiveAmount} | To: ${recipientName || 'Creator'}`,
        });
      } catch (err) {
        console.warn('transactions_ledger insert error:', err);
      }

      // 2. Cache in creator's pending/earnings queue for real-time wallet reflection
      if (recipientId) {
        try {
          const cKey = `velour_creator_pending_txs_${recipientId}`;
          const cExisting = JSON.parse(localStorage.getItem(cKey) || '[]');
          const newTx = {
            id: `gift_${Date.now()}`,
            user_id: user.id,
            creator_id: recipientId,
            fan_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Fan',
            fan_avatar: user.user_metadata?.avatar_url || null,
            type: 'gift',
            amount_usd: effectiveAmount,
            status: 'completed',
            reference: effectiveRef,
            title: `Gift: ${giftEmoji} ${giftName}`,
            created_at: new Date().toISOString(),
          };
          localStorage.setItem(cKey, JSON.stringify([newTx, ...cExisting]));
        } catch {}
      }

      // 3. Format message content for chat
      const notePart = note.trim() ? `\n"${note.trim()}"` : '';
      const giftPayload = JSON.stringify({
        type: 'gift',
        giftId: isCustom ? 'custom' : selectedGift.id,
        name: giftName,
        emoji: giftEmoji,
        amount: effectiveAmount,
        note: note.trim() || null,
        method: paymentMethod,
        ref: effectiveRef,
        imageUrl: uploadedCardUrl || null,
        sentAt: new Date().toISOString(),
      });

      const messageContent = `🎁 Sent ${giftEmoji} ${giftName} ($${effectiveAmount})!${notePart}\n<!--gift:${giftPayload}-->`;

      // 4. Send into chat
      onSendGift(messageContent);

      setStep('success');
      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('Failed to send gift:', err);
      setError('Failed to send gift. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end md:justify-center md:items-center">
      {/* Blurred Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-200 animate-in fade-in"
        onClick={() => {
          if (step !== 'success' && !submitting) onClose();
        }}
      />

      {/* Responsive Modal Container:
          - Mobile (< md): Full screen bottom sheet (h-[100dvh], rounded-t-[28px])
          - Desktop (>= md): Centered pop-up dialog (max-w-lg, rounded-3xl, border)
      */}
      <div className="relative z-10 w-full h-[100dvh] md:h-auto md:max-h-[88vh] md:max-w-lg bg-[#141519] border-t md:border border-white/10 rounded-t-[28px] md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            {step === 'payment' && (
              <button
                type="button"
                onClick={() => setStep('select')}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-paper transition-colors cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-500/20 to-gold/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <Gift size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-paper flex items-center gap-1.5">
                Send a Gift
                <Sparkles size={14} className="text-gold" />
              </h2>
              <p className="text-[0.72rem] text-muted truncate max-w-[220px]">
                Support {recipientName || 'the creator'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-paper transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 no-scrollbar">
          {step === 'select' && (
            <>
              {/* Gift Catalog Grid */}
              <div>
                <p className="text-xs font-semibold text-paper/80 uppercase tracking-wider mb-3">
                  Choose a Gift
                </p>
                <div className="grid grid-cols-4 gap-2.5">
                  {GIFTS_CATALOG.map((item) => {
                    const isSelected = !isCustom && selectedGift.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setIsCustom(false);
                          setSelectedGift(item);
                        }}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'bg-white/10 border-gold shadow-[0_0_16px_rgba(212,175,55,0.25)] scale-[1.02]'
                            : 'bg-[#1e2026] hover:bg-[#252830] border-white/5 hover:border-white/15'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold text-ink flex items-center justify-center shadow">
                            <Check size={10} strokeWidth={3} />
                          </div>
                        )}
                        <span className="text-3xl mb-1 select-none transform hover:scale-110 transition-transform">
                          {item.emoji}
                        </span>
                        <span className="text-xs font-semibold text-paper truncate w-full text-center">
                          {item.name}
                        </span>
                        <span className="text-[0.7rem] font-bold text-gold mt-0.5">
                          ${item.amount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Amount Option */}
              <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gold/15 text-gold flex items-center justify-center font-bold text-sm">
                      $
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-paper">Custom Amount</p>
                      <p className="text-[0.68rem] text-muted">Enter any dollar value</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCustom(!isCustom)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isCustom
                        ? 'bg-gold text-ink font-bold'
                        : 'bg-white/5 text-paper hover:bg-white/10'
                    }`}
                  >
                    {isCustom ? 'Active' : 'Custom'}
                  </button>
                </div>

                {isCustom && (
                  <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                    <span className="text-gold font-bold text-lg">$</span>
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="Amount in USD"
                      className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-paper text-sm focus:outline-none focus:border-gold/50"
                    />
                  </div>
                )}
              </div>

              {/* Personal Note */}
              <div>
                <label className="block text-xs font-semibold text-paper/80 uppercase tracking-wider mb-2">
                  Personal Note (Optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a sweet message for the creator..."
                  rows={2}
                  maxLength={200}
                  className="w-full bg-[#1a1c22] border border-white/10 rounded-2xl p-3 text-sm text-paper placeholder:text-neutral-500 focus:outline-none focus:border-gold/50 resize-none leading-relaxed"
                />
              </div>
            </>
          )}

          {step === 'payment' && (
            <>
              {/* Selected Gift Summary Banner */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-gold/10 border border-gold/30">
                <div className="flex items-center gap-3">
                  <span className="text-3xl select-none">
                    {isCustom ? '🎁' : selectedGift.emoji}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-paper">
                      {isCustom ? 'Custom Gift' : selectedGift.name}
                    </h3>
                    <p className="text-xs text-gold font-semibold">
                      ${effectiveAmount} USD
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('select')}
                  className="text-xs text-muted hover:text-paper underline cursor-pointer"
                >
                  Change
                </button>
              </div>

              {/* Payment Method Selector */}
              <div>
                <p className="text-xs font-semibold text-paper/80 uppercase tracking-wider mb-2.5">
                  Choose Payment Method
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('instant')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      paymentMethod === 'instant'
                        ? 'bg-gold/15 border-gold text-gold font-semibold'
                        : 'bg-[#1a1c22] border-white/5 text-muted hover:text-paper'
                    }`}
                  >
                    <Send size={18} className="mx-auto mb-1 text-gold" />
                    <span className="text-[0.72rem] block font-medium">Quick Tip</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('giftcard')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      paymentMethod === 'giftcard'
                        ? 'bg-gold/15 border-gold text-gold font-semibold'
                        : 'bg-[#1a1c22] border-white/5 text-muted hover:text-paper'
                    }`}
                  >
                    <CreditCard size={18} className="mx-auto mb-1 text-gold" />
                    <span className="text-[0.72rem] block font-medium">Gift Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('crypto')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      paymentMethod === 'crypto'
                        ? 'bg-gold/15 border-gold text-gold font-semibold'
                        : 'bg-[#1a1c22] border-white/5 text-muted hover:text-paper'
                    }`}
                  >
                    <QrCode size={18} className="mx-auto mb-1 text-gold" />
                    <span className="text-[0.72rem] block font-medium">Crypto USDT</span>
                  </button>
                </div>
              </div>

              {/* Method Details */}
              {paymentMethod === 'instant' && (
                <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-4 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-gold/10 text-gold mx-auto flex items-center justify-center">
                    <Sparkles size={22} />
                  </div>
                  <h4 className="text-sm font-semibold text-paper">Instant Direct Gift</h4>
                  <p className="text-xs text-muted leading-relaxed">
                    Instantly delivers your gift of <span className="text-gold font-bold">${effectiveAmount}</span> directly to {recipientName || 'the creator'} in this chat.
                  </p>
                </div>
              )}

              {paymentMethod === 'giftcard' && (
                <div className="space-y-3.5 bg-[#1a1c22] border border-white/5 rounded-2xl p-4">
                  {/* Brand select */}
                  <div>
                    <label className="block text-[0.7rem] font-semibold text-muted mb-1.5 uppercase">
                      Gift Card Brand
                    </label>
                    <div className="flex gap-2">
                      {GIFT_CARD_BRANDS.map((brand) => (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => setGiftBrand(brand)}
                          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                            giftBrand === brand
                              ? 'bg-gold text-ink border-gold'
                              : 'bg-white/5 text-paper border-white/5 hover:bg-white/10'
                          }`}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Type select */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGiftCardType('e_card')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        giftCardType === 'e_card'
                          ? 'bg-white/15 text-paper border-white/20'
                          : 'bg-transparent text-muted border-white/5'
                      }`}
                    >
                      E-Gift Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setGiftCardType('physical_card')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        giftCardType === 'physical_card'
                          ? 'bg-white/15 text-paper border-white/20'
                          : 'bg-transparent text-muted border-white/5'
                      }`}
                    >
                      Physical Card Photo
                    </button>
                  </div>

                  {giftCardType === 'e_card' ? (
                    <div>
                      <input
                        type="text"
                        value={proof}
                        onChange={(e) => setProof(e.target.value)}
                        placeholder="Enter gift card claim code or PIN"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-paper focus:outline-none focus:border-gold/50"
                      />
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleCardImageSelect}
                        className="hidden"
                      />
                      {cardImagePreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-white/10 h-32 bg-black/40 flex items-center justify-center">
                          <img src={cardImagePreview} alt="Card preview" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              setCardImageFile(null);
                              setCardImagePreview(null);
                            }}
                            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-white/15 hover:border-gold/40 rounded-xl p-4 text-center transition-colors cursor-pointer flex flex-col items-center gap-1.5"
                        >
                          <Camera size={22} className="text-gold" />
                          <span className="text-xs text-paper font-medium">Upload photo of physical card</span>
                          <span className="text-[0.68rem] text-muted">Ensure PIN / code is clearly visible</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'crypto' && (
                <div className="space-y-3 bg-[#1a1c22] border border-white/5 rounded-2xl p-4">
                  <div className="text-center">
                    <p className="text-[0.72rem] text-gold font-semibold uppercase tracking-wider">
                      {CRYPTO_NETWORK}
                    </p>
                    <p className="text-[0.68rem] text-muted mt-0.5">Send ${effectiveAmount} USDT</p>
                  </div>

                  <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                    <span className="text-[0.72rem] font-mono text-paper truncate">{CRYPTO_WALLET}</span>
                    <button
                      type="button"
                      onClick={handleCopyWallet}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-gold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    placeholder="Enter transaction hash (TxID)"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-paper focus:outline-none focus:border-gold/50"
                  />
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs">
                  {error}
                </div>
              )}
            </>
          )}

          {step === 'success' && (
            <div className="py-12 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-pink-500/20 via-gold/20 to-purple-500/20 border border-gold/40 flex items-center justify-center text-4xl shadow-[0_0_24px_rgba(212,175,55,0.3)]">
                {isCustom ? '🎁' : selectedGift.emoji}
              </div>
              <div>
                <h3 className="text-lg font-bold text-paper">Gift Sent Successfully!</h3>
                <p className="text-xs text-muted mt-1">
                  You sent a <span className="text-gold font-semibold">${effectiveAmount}</span> gift to {recipientName || 'the creator'}.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-gold text-xs font-semibold pt-2">
                <CheckCircle2 size={16} />
                <span>Delivered to chat</span>
              </div>
            </div>
          )}
        </div>

        {/* Pinned Bottom Action Button */}
        {step !== 'success' && (
          <div className="p-4 border-t border-white/10 bg-[#141519] shrink-0 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
            {step === 'select' ? (
              <button
                type="button"
                onClick={() => setStep('payment')}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-gold via-gold-light to-gold text-ink font-bold text-sm shadow-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Continue • ${effectiveAmount}</span>
                <Sparkles size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitGift}
                disabled={submitting}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-gold text-white font-bold text-sm shadow-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Sending Gift…</span>
                  </>
                ) : (
                  <>
                    <Gift size={18} />
                    <span>Send {isCustom ? 'Gift' : selectedGift.name} (${effectiveAmount})</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    portalTarget
  );
}
