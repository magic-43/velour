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
import AppleEmoji from '../common/AppleEmoji';

export interface GiftOption {
  id: string;
  name: string;
  emoji: string;
  amount: number;
}

// Lowest gift is strictly $25
export const GIFTS_CATALOG: GiftOption[] = [
  { id: 'heart', name: 'Love Ribbon', emoji: '💖', amount: 25 },
  { id: 'bear', name: 'Teddy Bear', emoji: '🧸', amount: 25 },
  { id: 'box', name: 'Gift Box', emoji: '🎁', amount: 35 },
  { id: 'rose', name: 'Red Rose', emoji: '🌹', amount: 50 },
  { id: 'cake', name: 'Birthday Cake', emoji: '🎂', amount: 75 },
  { id: 'bouquet', name: 'Bouquet', emoji: '💐', amount: 75 },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', amount: 100 },
  { id: 'trophy', name: 'Gold Trophy', emoji: '🏆', amount: 150 },
  { id: 'ring', name: 'Diamond Ring', emoji: '💍', amount: 250 },
  { id: 'car', name: 'Sports Car', emoji: '🏎️', amount: 500 },
  { id: 'crown', name: 'Royal Crown', emoji: '👑', amount: 1000 },
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
  const [selectedGift, setSelectedGift] = useState<GiftOption>(GIFTS_CATALOG[0]);
  const [isCustom, setIsCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState('25');
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

  const parsedCustom = parseFloat(customAmount);
  const effectiveAmount = isCustom ? (isNaN(parsedCustom) ? 25 : Math.max(25, parsedCustom)) : selectedGift.amount;

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

    if (isCustom && (isNaN(parseFloat(customAmount)) || parseFloat(customAmount) < 25)) {
      setError('The minimum gift amount is $25.');
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
        setError('Please upload a screenshot proof of your completed crypto transfer.');
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
      const giftEmoji = isCustom ? '🌟' : selectedGift.emoji;

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

      // 5. In-modal visual confirmation (no audio chime for sender)
      setStep('success');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to send gift. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-end md:items-center justify-center select-none"
      style={{ isolation: 'isolate' }}
    >
      {/* Dark Dim Backdrop */}
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Main Bottom Sheet (Mobile) / Dialog (Desktop) Container */}
      <div className="relative z-10 w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-md bg-[#0e0f12] border-t md:border border-white/10 rounded-t-[32px] md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
        
        {/* Starry Dust Background Effect across Top Header (Rich scattering) */}
        <div className="absolute top-0 inset-x-0 h-56 pointer-events-none overflow-hidden select-none">
          <div className="absolute top-3 left-6 text-gold text-sm animate-pulse">✦</div>
          <div className="absolute top-8 left-14 text-amber-200 text-xs opacity-75">★</div>
          <div className="absolute top-14 left-8 text-yellow-300 text-[10px] animate-pulse">✦</div>
          <div className="absolute top-4 left-1/4 text-amber-400 text-base opacity-90 animate-pulse">✦</div>
          <div className="absolute top-12 left-1/3 text-yellow-100 text-xs opacity-70">★</div>
          <div className="absolute top-6 left-2/5 text-gold text-[10px] animate-pulse">✦</div>
          <div className="absolute top-2 right-1/3 text-amber-300 text-sm animate-pulse">★</div>
          <div className="absolute top-10 right-1/4 text-yellow-200 text-base opacity-90">✦</div>
          <div className="absolute top-16 right-1/5 text-gold text-xs animate-pulse">★</div>
          <div className="absolute top-5 right-12 text-amber-300 text-sm opacity-80 animate-pulse">✦</div>
          <div className="absolute top-14 right-6 text-yellow-100 text-xs opacity-75">★</div>
          <div className="absolute top-20 left-16 text-gold text-xs opacity-60">✦</div>
          <div className="absolute top-24 right-16 text-amber-300 text-[10px] animate-pulse">★</div>
          <div className="absolute top-28 left-1/3 text-yellow-200 text-xs opacity-70 animate-pulse">✦</div>
          <div className="absolute top-28 right-1/3 text-gold text-sm opacity-60">✦</div>
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-yellow-300 text-xs animate-pulse">★</div>
          <div className="absolute top-36 left-8 text-amber-400 text-[10px] opacity-60">✦</div>
          <div className="absolute top-36 right-8 text-gold text-xs opacity-60 animate-pulse">★</div>
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

          {/* Balanced empty spacer (Velour Pay removed) */}
          <div className="w-9" />
        </div>

        {/* Scrollable Content */}
        <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-6 space-y-5 no-scrollbar">
          {step === 'catalog' && (
            <>
              {/* Creator Center Avatar and Header */}
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

                {/* Filter Pills: All Gifts, Custom $ (Collections removed) */}
                <div className="flex items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustom(false);
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      !isCustom
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    All Gifts
                  </button>
                  <button
                    type="button"
                    onClick={() => {
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

              {/* 3-Column Gifts Grid (With Authentic Apple iOS Emojis) */}
              <div className="grid grid-cols-3 gap-3">
                {GIFTS_CATALOG.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectGift(item)}
                    className="flex flex-col items-center justify-between p-3 rounded-2xl bg-[#18191e] hover:bg-[#22242a] border border-white/5 hover:border-gold/30 transition-all cursor-pointer group active:scale-95 aspect-[4/5]"
                  >
                    <div className="flex-1 flex items-center justify-center">
                      <AppleEmoji
                        emoji={item.emoji}
                        size={46}
                        className="group-hover:scale-110 transition-transform"
                      />
                    </div>

                    {/* Dollar Price Badge Pill (With Gold Accent) */}
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
                    <AppleEmoji
                      emoji="🌟"
                      size={46}
                      className="group-hover:scale-110 transition-transform"
                    />
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
                  <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shadow-inner">
                    <AppleEmoji emoji={isCustom ? '🌟' : selectedGift.emoji} size={36} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {isCustom ? 'Custom Amount Gift' : selectedGift.name}
                    </h3>
                    <p className="text-xs text-white/60">
                      To <span className="text-gold font-semibold">{recipientName}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-lg font-extrabold text-gold">
                    ${effectiveAmount}
                  </span>
                  <span className="text-[10px] text-white/50 block">USD</span>
                </div>
              </div>

              {/* Custom Amount Input if Custom Selected */}
              {isCustom && (
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <label className="text-xs font-semibold text-white/80 block">
                    Custom Gift Amount ($ USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gold font-bold text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={25}
                      step={5}
                      value={customAmount}
                      onChange={(e) => {
                        setCustomAmount(e.target.value);
                        setError(null);
                      }}
                      placeholder="25"
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white font-bold text-base focus:outline-none focus:border-gold transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-white/40">Minimum gift amount is $25 USD</p>
                </div>
              )}

              {/* Personal Fan Note (Optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/70 block">
                  Add a personal note <span className="text-white/40 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Say something nice..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-gold transition-colors"
                />
              </div>

              {/* Payment Method Selector Tabs: Gift Card vs Crypto */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-semibold text-white/70 block">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('giftcard');
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      paymentMethod === 'giftcard'
                        ? 'bg-gold/15 border-gold text-gold shadow-sm'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <CreditCard size={15} />
                    <span>Gift Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('crypto');
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      paymentMethod === 'crypto'
                        ? 'bg-gold/15 border-gold text-gold shadow-sm'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <QrCode size={15} />
                    <span>Crypto USDT</span>
                  </button>
                </div>
              </div>

              {/* ── Option A: Gift Card Form ── */}
              {paymentMethod === 'giftcard' && (
                <div className="space-y-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 animate-in fade-in duration-100">
                  {/* Brand Selector: Apple or Razor Gold only */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-white/60 block">
                      Select Card Brand
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {GIFT_CARD_BRANDS.map((brand) => (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => setGiftBrand(brand)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                            giftBrand === brand
                              ? 'bg-white/20 border-white/40 text-white font-bold'
                              : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Format Toggle: E-Gift code vs Physical Card photo */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-white/60 block">
                      Card Format
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGiftCardType('e_card');
                          setError(null);
                        }}
                        className={`py-1.5 px-3 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                          giftCardType === 'e_card'
                            ? 'bg-gold/15 border-gold/50 text-gold'
                            : 'bg-white/5 border-white/10 text-white/60'
                        }`}
                      >
                        E-Gift PIN
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setGiftCardType('physical_card');
                          setError(null);
                        }}
                        className={`py-1.5 px-3 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                          giftCardType === 'physical_card'
                            ? 'bg-gold/15 border-gold/50 text-gold'
                            : 'bg-white/5 border-white/10 text-white/60'
                        }`}
                      >
                        Physical Photo
                      </button>
                    </div>
                  </div>

                  {giftCardType === 'e_card' ? (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/70 block">
                        Enter {giftBrand} Claim Code / PIN
                      </label>
                      <input
                        type="text"
                        value={proof}
                        onChange={(e) => {
                          setProof(e.target.value);
                          setError(null);
                        }}
                        placeholder="e.g. X123-4567-8901"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-xs placeholder:text-white/30 focus:outline-none focus:border-gold"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-white/70 block">
                        Upload Clear Photo of {giftBrand} Card
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleProofImageSelect}
                      />

                      {cardImagePreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-gold/40 aspect-video bg-black flex items-center justify-center">
                          <img
                            src={cardImagePreview}
                            alt="Card"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setCardImageFile(null);
                              setCardImagePreview(null);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-6 rounded-xl border border-dashed border-white/20 hover:border-gold/50 bg-black/30 flex flex-col items-center justify-center gap-2 text-white/60 hover:text-white transition-all cursor-pointer group"
                        >
                          <Camera size={22} className="text-gold group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-medium">Tap to take photo or choose from gallery</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Option B: Crypto USDT (Requires Screenshot Proof) ── */}
              {paymentMethod === 'crypto' && (
                <div className="space-y-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 animate-in fade-in duration-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/60">Network</span>
                    <span className="text-gold font-semibold">{CRYPTO_NETWORK}</span>
                  </div>

                  {/* Wallet Box with Copy */}
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                    <span className="text-[10px] text-white/40 block">Deposit Address</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-white/90 break-all select-all">
                        {CRYPTO_WALLET}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyWallet}
                        className="px-2.5 py-1.5 rounded-lg bg-gold/15 hover:bg-gold/25 border border-gold/30 text-gold text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Required Screenshot Proof Upload */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-white/90 block">
                        Payment Screenshot Proof <span className="text-rose-400 font-bold">*</span>
                      </label>
                      <span className="text-[10px] text-amber-300">Required</span>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProofImageSelect}
                    />

                    {cardImagePreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-gold/40 aspect-video bg-black flex items-center justify-center">
                        <img
                          src={cardImagePreview}
                          alt="Crypto Proof"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCardImageFile(null);
                            setCardImagePreview(null);
                          }}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-5 rounded-xl border border-dashed border-gold/40 hover:border-gold bg-black/40 flex flex-col items-center justify-center gap-1.5 text-white/70 hover:text-white transition-all cursor-pointer group"
                      >
                        <Upload size={22} className="text-gold group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-medium text-white/90">Upload completed transfer screenshot</span>
                        <span className="text-[10px] text-white/40">From your wallet (Binance, Trust, MetaMask)</span>
                      </button>
                    )}
                  </div>

                  {/* Optional TxID */}
                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-medium text-white/50 block">
                      Transaction Hash / TxID <span className="text-white/30">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={proof}
                      onChange={(e) => setProof(e.target.value)}
                      placeholder="0x..."
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-xs placeholder:text-white/30 focus:outline-none focus:border-gold"
                    />
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center font-medium animate-in fade-in">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitGift}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-gold via-amber-400 to-yellow-500 text-ink font-extrabold text-sm shadow-lg hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin text-ink" />
                      <span>Sending Gift…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} className="text-ink" />
                      <span>Send ${effectiveAmount} Gift</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-12 flex flex-col items-center text-center space-y-3 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-3xl shadow-lg">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-xl font-extrabold text-white">Gift Sent!</h2>
              <p className="text-xs text-white/60 max-w-[260px]">
                Your gift of <span className="text-gold font-semibold">${effectiveAmount} USD</span> has been delivered to {recipientName}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
