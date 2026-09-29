import React, { useState } from 'react';
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
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

interface UnlockPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amountUsd: number;
  attachmentTitle?: string;
  batchCount?: number;
  thumbnailUrl?: string | null;
  attachmentId?: string;
  onSuccess?: () => void;
}

type PaymentMethod = 'giftcard' | 'crypto';

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
  onSuccess,
}: UnlockPaymentModalProps) {
  const { user } = useAuth();
  const [method, setMethod] = useState<PaymentMethod>('giftcard');
  const [giftBrand, setGiftBrand] = useState(GIFT_CARD_BRANDS[0]);
  const [proof, setProof] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const displayTitle = getCleanTitle(attachmentTitle, batchCount);

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(CRYPTO_WALLET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proof.trim()) {
      setError(
        method === 'giftcard'
          ? 'Please enter your gift card code or PIN.'
          : 'Please enter the transaction hash (TxID).'
      );
      return;
    }

    if (!user) {
      setError('You must be signed in to unlock content.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const description =
      method === 'crypto'
        ? `Crypto USDT | $${amountUsd} | Tx: ${proof.trim()}`
        : `Gift Card | $${amountUsd} | ${giftBrand}: ${proof.trim()}`;

    try {
      // 1. Try DB RPC submit_unlock_payment if available
      let submittedViaRpc = false;
      if (attachmentId) {
        try {
          const { error: rpcError } = await supabase.rpc('submit_unlock_payment', {
            p_fan_id: user.id,
            p_attachment_id: attachmentId,
            p_amount_usd: amountUsd,
            p_method: method === 'crypto' ? 'USDT Crypto' : `${giftBrand} Gift Card`,
            p_reference: proof.trim(),
          });
          if (!rpcError) {
            submittedViaRpc = true;
          }
        } catch {
          submittedViaRpc = false;
        }
      }

      // 2. Direct fallback insert to transactions_ledger if RPC was not executed
      if (!submittedViaRpc) {
        await supabase.from('transactions_ledger').insert({
          user_id: user.id,
          type: 'attachment_unlock',
          amount_usd: amountUsd,
          status: 'pending',
          attachment_id: attachmentId || null,
          reference: proof.trim(),
          description,
        });

        if (attachmentId) {
          await supabase.from('attachment_unlocks').insert({
            attachment_id: attachmentId,
            fan_id: user.id,
            amount_usd: amountUsd,
            status: 'pending',
          });
        }
      }

      // 3. Mark in local optimistic storage so card turns to "Pending"
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
          localStorage.setItem(key, JSON.stringify([newEntry, ...existing]));
        } catch (storageErr) {
          console.warn('Could not store optimistic unlock:', storageErr);
        }
      }

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

  const modalContent = (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      {/* Dimmed backdrop - click outside to dismiss */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Apple-style Bottom Sheet - Pinned strictly to viewport bottom */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 w-full h-[90vh] max-h-[90vh] bg-[#1c1c1e] text-white rounded-t-[32px] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 font-sans"
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
                Your payment is being verified. Content will unlock automatically once confirmed.
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

                  {/* Card Code Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/50 font-medium uppercase tracking-wider block">
                      {giftBrand} PIN / Code
                    </label>
                    <input
                      type="text"
                      value={proof}
                      onChange={(e) => setProof(e.target.value)}
                      placeholder="Enter gift card redemption code"
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/15 rounded-xl text-base text-white placeholder:text-white/30 focus:outline-none focus:border-gold transition-colors"
                    />
                    <p className="text-xs text-white/40">
                      Purchase a ${amountUsd} {giftBrand} card and paste the code above.
                    </p>
                  </div>
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
                disabled={submitting || !proof.trim()}
                className="w-full py-4 rounded-2xl bg-gold hover:bg-gold-light active:scale-[0.99] disabled:opacity-40 disabled:scale-100 text-ink font-bold text-base transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer mt-4"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-ink" />
                    <span>Submitting Proof…</span>
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

  return createPortal(modalContent, document.body);
}
