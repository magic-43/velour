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
  Star,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useBackHandler } from '../../lib/backButtonRegistry';
import { supabase } from '../../lib/supabase';
import { uploadPublicFile } from '../../lib/r2';
import { triggerNotificationFeedback } from '../../lib/soundNotification';

export interface GiftOption {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  category: 'all' | 'collectibles';
}

export const GIFTS_CATALOG: GiftOption[] = [
  { id: 'heart', name: 'Love Ribbon', emoji: '💖', amount: 15, category: 'all' },
  { id: 'bear', name: 'Teddy Bear', emoji: '🧸', amount: 15, category: 'all' },
  { id: 'box', name: 'Gift Box', emoji: '🎁', amount: 25, category: 'all' },
  { id: 'rose', name: 'Red Rose', emoji: '🌹', amount: 25, category: 'all' },
  { id: 'cake', name: 'Birthday Cake', emoji: '🎂', amount: 50, category: 'all' },
  { id: 'bouquet', name: 'Bouquet', emoji: '💐', amount: 50, category: 'all' },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', amount: 50, category: 'collectibles' },
  { id: 'trophy', name: 'Gold Trophy', emoji: '🏆', amount: 100, category: 'collectibles' },
  { id: 'ring', name: 'Diamond Ring', emoji: '💍', amount: 100, category: 'collectibles' },
  { id: 'car', name: 'Sports Car', emoji: '🏎️', amount: 250, category: 'collectibles' },
  { id: 'crown', name: 'Royal Crown', emoji: '👑', amount: 500, category: 'collectibles' },
];

const GIFT_CARD_BRANDS = ['Razor Gold', 'Apple'];
const CRYPTO_WALLET = '0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7';
const CRYPTO_NETWORK = 'USDT (ERC-20 / TRC-20)';

interface SendGiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientName?: string;
  recipientId?: string;
  recipientAvatar?: string | null;
  conversationId?: string;
  onSendGift: (messageContent: string) => void;
}

type PaymentMethod = 'giftcard' | 'crypto';
type GiftCardType = 'e_card' | 'physical_card';

export default function SendGiftModal({
  isOpen,
  onClose,
  recipientName = 'the creator',
  recipientId,
  recipientAvatar,
  conversationId,
  onSendGift,
}: SendGiftModalProps) {
  const { user } = useAuth();

  const [step, setStep] = useState<'catalog' | 'payment' | 'success'>('catalog');
  const [activeCategory, setActiveCategory] = useState<'all' | 'collectibles' | 'custom'>('all');
  const [selectedGift, setSelectedGift] = useState<GiftOption>(GIFTS_CATALOG[0]);
  const [isCustom, setIsCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState('20');
  const [note, setNote] = useState('');

  // Payment state: only Gift Card and Crypto (No quick tip)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('giftcard');
  const [giftBrand, setGiftBrand] = useState(GIFT_CARD_BRANDS[0]);
  const [giftCardType, setGiftCardType] = useState<GiftCardType>('e_card');
  const [proof, setProof] = useState('');
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hardware back button support
  useBackHandler(() => {
    if (step === 'payment') {
      setStep('catalog');
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

  const handleProofImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCardImageFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setCardImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectGift = (gift: GiftOption) => {
    setIsCustom(false);
    setSelectedGift(gift);
    setError(null);
    setStep('payment');
  };

  const handleSelectCustom = () => {
    setIsCustom(true);
    setError(null);
    setStep('payment');
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
    } else {
      // Crypto requires screenshot proof
      if (!cardImageFile && !cardImagePreview) {
        setError('Please upload a screenshot proof of your crypto transfer.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedProofUrl: string | null = null;
      if (cardImageFile) {
        try {
          const folder = paymentMethod === 'crypto' ? 'crypto_proofs' : 'giftcards';
          const key = `${folder}/${user.id}/${Date.now()}_${cardImageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          uploadedProofUrl = await uploadPublicFile(cardImageFile, key, { maxWidth: 1920, quality: 0.85 });
        } catch {
          uploadedProofUrl = cardImagePreview;
        }
      } else if (cardImagePreview) {
        uploadedProofUrl = cardImagePreview;
      }

      const giftName = isCustom ? 'Custom Gift' : selectedGift.name;
      const giftEmoji = isCustom ? '🎁' : selectedGift.emoji;

      const effectiveRef =
        paymentMethod === 'crypto'
          ? (proof.trim() ? `Crypto Screenshot + TxID: ${proof.trim()}` : 'Crypto payment screenshot attached')
          : giftCardType === 'physical_card'
          ? (proof.trim() ? `${giftBrand} Photo + PIN: ${proof.trim()}` : `${giftBrand} physical card photo attached`)
          : `${giftBrand} E-Card: ${proof.trim()}`;

      // 1. Record in transactions ledger
      try {
        await supabase.from('transactions_ledger').insert({
          user_id: user.id,
          type: 'gift',
          amount_usd: effectiveAmount,
          status: 'completed',
          reference: effectiveRef,
          description: `Gift: ${giftName} | $${effectiveAmount} | To: ${recipientName}`,
        });
      } catch (err) {
        console.warn('transactions_ledger insert error:', err);
      }

      // 2. Cache in creator's pending/earnings queue
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

      // 3. Format message payload for chat
      const notePart = note.trim() ? `\n"${note.trim()}"` : '';
      const giftPayload = JSON.stringify({
        type: 'gift',
        giftId: isCustom ? 'custom' : selectedGift.id,
        name: giftName,
        emoji: giftEmoji,
        amount: effectiveAmount,
        note: note.trim() || null,
        method: paymentMethod === 'crypto' ? 'USDT Crypto' : `${giftBrand} ${giftCardType === 'physical_card' ? 'Physical Card' : 'E-Card'}`,
        ref: effectiveRef,
        imageUrl: uploadedProofUrl || null,
        sentAt: new Date().toISOString(),
      });

      const messageContent = `🎁 Sent ${giftEmoji} ${giftName} ($${effectiveAmount})!${notePart}\n<!--gift:${giftPayload}-->`;

      // 4. Send into chat
      onSendGift(messageContent);

      // 5. Trigger celebration feedback sound and event
      triggerNotificationFeedback().catch(() => {});
      window.dispatchEvent(
        new CustomEvent('velour:gift_received', {
          detail: {
            recipientId,
            amount: effectiveAmount,
            giftName,
            giftEmoji,
          },
        })
      );

      setStep('success');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to send gift:', err);
      setError('Failed to send gift. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  const filteredGifts = activeCategory === 'all'
    ? GIFTS_CATALOG
    : GIFTS_CATALOG.filter((g) => g.category === activeCategory);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end md:justify-center md:items-center">
      {/* Blurred Backdrop */}
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-200 animate-in fade-in"
        onClick={() => {
          if (step !== 'success' && !submitting) onClose();
        }}
      />

      {/* Modal Container: Full Screen Bottom Sheet on Mobile (< md), Centered Dialog on Desktop (>= md) */}
      <div className="relative z-10 w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-md bg-[#0e0f12] border-t md:border border-white/10 rounded-t-[32px] md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
        
        {/* Starry Dust Background Effect across Top Header */}
        <div className="absolute top-0 inset-x-0 h-44 pointer-events-none overflow-hidden select-none opacity-40">
          <div className="absolute top-4 left-6 text-gold text-xs animate-pulse">✦</div>
          <div className="absolute top-10 right-10 text-gold text-sm animate-pulse">★</div>
          <div className="absolute top-8 left-1/3 text-amber-300 text-xs">✨</div>
          <div className="absolute top-16 right-1/4 text-gold text-xs animate-pulse">✦</div>
          <div className="absolute top-2 left-2/3 text-yellow-200 text-sm">★</div>
        </div>

        {/* Top Control Bar */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          {step === 'payment' ? (
            <button
              type="button"
              onClick={() => setStep('catalog')}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white transition-colors cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          )}

          {/* Right Indicator (Balance / Support) */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">
            <span>Velour Pay</span>
            <Sparkles size={13} className="text-gold" />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-6 space-y-5 no-scrollbar">
          {step === 'catalog' && (
            <>
              {/* Creator Center Avatar and Header (Exactly matching Image 1) */}
              <div className="flex flex-col items-center text-center pt-1 pb-1">
                <div className="w-20 h-20 rounded-full border-2 border-white/20 shadow-2xl overflow-hidden mb-3 bg-[#1e2026] flex items-center justify-center">
                  {recipientAvatar ? (
                    <img src={recipientAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-pink-500/20 via-purple-500/20 to-gold/20 flex items-center justify-center text-2xl font-bold text-white uppercase">
                      {recipientName.slice(0, 2)}
                    </div>
                  )}
                </div>

                <h1 className="text-2xl font-extrabold text-white tracking-tight">
                  Send a Gift
                </h1>
                <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-[280px] leading-relaxed">
                  Select a gift to show appreciation for <span className="text-white font-semibold">{recipientName}</span>.
                </p>

                {/* Filter Pills: All Gifts, Collectibles, Custom */}
                <div className="flex items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('all');
                      setIsCustom(false);
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      activeCategory === 'all' && !isCustom
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    All Gifts
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('collectibles');
                      setIsCustom(false);
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      activeCategory === 'collectibles' && !isCustom
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Collectibles
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('custom');
                      handleSelectCustom();
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      isCustom
                        ? 'bg-gold text-ink font-bold shadow-sm'
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Custom $
                  </button>
                </div>
              </div>

              {/* 3-Column Gifts Grid (Matching Image 1) */}
              <div className="grid grid-cols-3 gap-3">
                {filteredGifts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectGift(item)}
                    className="flex flex-col items-center justify-between p-3 rounded-2xl bg-[#18191e] hover:bg-[#22242a] border border-white/5 hover:border-gold/30 transition-all cursor-pointer group active:scale-95 aspect-[4/5]"
                  >
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-4xl group-hover:scale-110 transition-transform select-none">
                        {item.emoji}
                      </span>
                    </div>

                    {/* Dollar Price Badge Pill (Matching Image 1 style but with $) */}
                    <div className="w-full flex items-center justify-center">
                      <div className="px-3 py-0.5 rounded-full bg-[#272115] border border-[#59461d] flex items-center gap-1 shadow-sm">
                        <span className="text-[10px] text-gold">✦</span>
                        <span className="text-xs font-extrabold text-gold tracking-tight">
                          ${item.amount}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Custom Amount Card in Grid */}
                <button
                  type="button"
                  onClick={handleSelectCustom}
                  className="flex flex-col items-center justify-between p-3 rounded-2xl bg-[#18191e] hover:bg-[#22242a] border border-dashed border-gold/30 hover:border-gold transition-all cursor-pointer group active:scale-95 aspect-[4/5]"
                >
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-4xl group-hover:scale-110 transition-transform select-none">
                      🌟
                    </span>
                  </div>
                  <div className="w-full flex items-center justify-center">
                    <div className="px-3 py-0.5 rounded-full bg-gold/15 border border-gold/30 flex items-center gap-1 shadow-sm">
                      <span className="text-xs font-extrabold text-gold">Custom $</span>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'payment' && (
            <div className="space-y-4 pt-1 animate-in fade-in duration-150">
              {/* Selected Gift Summary Banner */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-pink-500/15 via-purple-500/10 to-gold/15 border border-gold/30">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-3xl">
                    {isCustom ? '🎁' : selectedGift.emoji}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {isCustom ? 'Custom Gift' : selectedGift.name}
                    </h3>
                    <p className="text-xs text-gold font-bold">
                      ${effectiveAmount} USD
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('catalog')}
                  className="text-xs text-white/50 hover:text-white underline cursor-pointer"
                >
                  Change
                </button>
              </div>

              {/* Custom Amount Input (If Custom selected) */}
              {isCustom && (
                <div className="bg-[#18191e] border border-white/10 rounded-2xl p-3.5 space-y-2">
                  <label className="text-[11px] font-semibold text-white/60 uppercase tracking-wider block">
                    Enter Dollar Amount
                  </label>
                  <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2">
                    <span className="text-gold font-bold text-base">$</span>
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="Amount in USD"
                      className="flex-1 bg-transparent text-white font-semibold text-sm focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Payment Method Tabs (Apple & Razor Gift Card vs Crypto USDT) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider block">
                  Select Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('giftcard');
                      setError(null);
                    }}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      paymentMethod === 'giftcard'
                        ? 'bg-gold/15 border-gold text-gold font-semibold shadow-sm'
                        : 'bg-[#18191e] border-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    <CreditCard size={18} />
                    <span className="text-xs">Gift Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('crypto');
                      setError(null);
                    }}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      paymentMethod === 'crypto'
                        ? 'bg-gold/15 border-gold text-gold font-semibold shadow-sm'
                        : 'bg-[#18191e] border-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    <QrCode size={18} />
                    <span className="text-xs">Crypto (USDT)</span>
                  </button>
                </div>
              </div>

              {/* Hidden File Input for Proofs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProofImageSelect}
                className="hidden"
              />

              {/* Method 1: Gift Cards (Only Apple & Razor Gold) */}
              {paymentMethod === 'giftcard' && (
                <div className="space-y-3.5 bg-[#18191e] border border-white/5 rounded-2xl p-4">
                  {/* Brand select */}
                  <div>
                    <label className="block text-[10px] font-semibold text-white/50 mb-1.5 uppercase tracking-wider">
                      Card Brand
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {GIFT_CARD_BRANDS.map((brand) => (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => setGiftBrand(brand)}
                          className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-between ${
                            giftBrand === brand
                              ? 'bg-gold/20 text-gold border-gold'
                              : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                          }`}
                        >
                          <span>{brand}</span>
                          {giftBrand === brand && <Check size={14} strokeWidth={2.5} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mode select: E-Code vs Physical Card */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGiftCardType('e_card')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        giftCardType === 'e_card'
                          ? 'bg-white/15 text-white border-white/20 font-semibold'
                          : 'bg-transparent text-white/50 border-white/5'
                      }`}
                    >
                      E-Gift Code / PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => setGiftCardType('physical_card')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        giftCardType === 'physical_card'
                          ? 'bg-white/15 text-white border-white/20 font-semibold'
                          : 'bg-transparent text-white/50 border-white/5'
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
                        placeholder={`Enter ${giftBrand} claim code or PIN`}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-gold"
                      />
                    </div>
                  ) : (
                    <div>
                      {cardImagePreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-gold/40 h-36 bg-black/40 flex items-center justify-center">
                          <img src={cardImagePreview} alt="" className="h-full w-full object-contain" />
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
                          <span className="text-xs text-white font-medium">Upload photo of physical card</span>
                          <span className="text-[10px] text-white/40">Ensure code & PIN are visible</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Method 2: Crypto USDT (Requires Screenshot Proof) */}
              {paymentMethod === 'crypto' && (
                <div className="space-y-3.5 bg-[#18191e] border border-white/5 rounded-2xl p-4">
                  <div className="text-center">
                    <p className="text-[11px] text-gold font-bold uppercase tracking-wider">
                      {CRYPTO_NETWORK}
                    </p>
                    <p className="text-[10px] text-white/50 mt-0.5">Send ${effectiveAmount} USDT</p>
                  </div>

                  <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-white truncate">{CRYPTO_WALLET}</span>
                    <button
                      type="button"
                      onClick={handleCopyWallet}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-gold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {/* Screenshot Proof Upload (Required) */}
                  <div>
                    <label className="block text-[10px] font-semibold text-white/50 mb-1.5 uppercase tracking-wider">
                      Upload Screenshot Proof (Required)
                    </label>
                    {cardImagePreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-gold/40 h-36 bg-black/40 flex items-center justify-center">
                        <img src={cardImagePreview} alt="" className="h-full w-full object-contain" />
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
                        <Upload size={22} className="text-gold" />
                        <span className="text-xs text-white font-medium">Upload wallet transfer screenshot</span>
                        <span className="text-[10px] text-white/40">Proof of completed USDT transaction</span>
                      </button>
                    )}
                  </div>

                  {/* Optional TxID input */}
                  <div>
                    <input
                      type="text"
                      value={proof}
                      onChange={(e) => setProof(e.target.value)}
                      placeholder="Transaction hash / TxID (optional)"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-gold"
                    />
                  </div>
                </div>
              )}

              {/* Optional Personal Note */}
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                  Personal Note (Optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a sweet message with your gift..."
                  rows={2}
                  maxLength={200}
                  className="w-full bg-[#18191e] border border-white/10 rounded-2xl p-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-gold/50 resize-none leading-relaxed"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="py-16 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-pink-500/20 via-gold/20 to-purple-500/20 border border-gold/40 flex items-center justify-center text-4xl shadow-[0_0_24px_rgba(212,175,55,0.3)]">
                {isCustom ? '🎁' : selectedGift.emoji}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Gift Sent Successfully!</h3>
                <p className="text-xs text-white/60 mt-1">
                  You sent a <span className="text-gold font-bold">${effectiveAmount}</span> gift to {recipientName}.
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
        {step === 'payment' && (
          <div className="p-4 border-t border-white/10 bg-[#0e0f12] shrink-0 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={handleSubmitGift}
              disabled={submitting}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-gold via-gold-light to-gold text-ink font-extrabold text-sm shadow-xl hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Processing Gift…</span>
                </>
              ) : (
                <>
                  <Gift size={18} />
                  <span>Send {isCustom ? 'Gift' : selectedGift.name} (${effectiveAmount})</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    portalTarget
  );
}
