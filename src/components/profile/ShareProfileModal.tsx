import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Copy,
  Check,
  Share2,
  QrCode,
  ExternalLink,
  Download,
  Send,
  MessageCircle,
  CheckCircle,
} from 'lucide-react';
import type { Profile, CreatorProfile } from '../../types';

interface ShareProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  creatorProfile?: CreatorProfile | null;
}

export default function ShareProfileModal({
  isOpen,
  onClose,
  profile,
  creatorProfile,
}: ShareProfileModalProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!isOpen) return null;

  const displayName = creatorProfile?.display_name || profile.display_name || profile.username;
  const username = profile.username;
  const avatarUrl = creatorProfile?.avatar_url || profile.avatar_url;
  const category = creatorProfile?.category || 'Creator';
  const isVerified = creatorProfile?.is_verified ?? true;

  // Canonical public profile URL
  const shareUrl = `${window.location.origin}/profile/${username}`;

  // Robust clipboard copy with fallback
  const handleCopyLink = async () => {
    let success = false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        success = true;
      } catch {
        success = false;
      }
    }

    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error('Failed to copy to clipboard', err);
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Quick social share handlers
  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`Check out ${displayName}'s profile on Velour: ${shareUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(`Check out ${displayName} on Velour`);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareTelegram = () => {
    const url = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(`Check out ${displayName} on Velour`);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: displayName,
          text: `Check out ${displayName}'s profile on Velour`,
          url: shareUrl,
        });
      } catch {
        // User dismissed native share sheet
      }
    } else {
      handleCopyLink();
    }
  };

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
    shareUrl
  )}&bgcolor=14-14-16&color=d4af37&margin=12`;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#161618] border-t sm:border border-white/10 p-5 sm:p-6 shadow-2xl relative max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/10 shrink-0">
          <div>
            <h3 className="font-semibold text-base sm:text-lg text-paper tracking-tight">
              Share Profile
            </h3>
            <p className="text-[11px] text-muted mt-0.5">
              Share your public profile link with fans & subscribers
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-paper p-1.5 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 space-y-4 overflow-y-auto flex-1">
          {/* Creator Mini Preview Card */}
          <div className="p-3.5 rounded-2xl bg-[#121214] border border-white/[0.06] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-ink-light ring-2 ring-gold/40 shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-serif text-lg text-gold select-none">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-sm text-paper truncate">
                    {displayName}
                  </h4>
                  {isVerified && (
                    <CheckCircle size={14} className="text-gold fill-gold/20 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted truncate">
                  @{username} · <span className="text-gold/90">{category}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/profile/${username}`);
              }}
              title="Preview public profile"
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
            >
              <span>Preview</span>
              <ExternalLink size={11} />
            </button>
          </div>

          {/* Copy Profile Link Field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
              Profile Link
            </label>
            <div className="p-1.5 pl-3.5 rounded-2xl bg-[#101012] border border-white/10 flex items-center justify-between gap-2 shadow-inner focus-within:border-gold/50 transition-colors">
              <span className="text-xs text-white/80 font-mono truncate select-all">
                {shareUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer shrink-0 shadow-md ${
                  copied
                    ? 'bg-emerald-500 text-ink scale-[1.02]'
                    : 'bg-gold hover:bg-gold-light active:scale-95 text-ink'
                }`}
              >
                {copied ? (
                  <>
                    <Check size={14} strokeWidth={2.5} />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
            {copied && (
              <p className="text-[11px] text-emerald-400 font-medium px-1 flex items-center gap-1 animate-in fade-in duration-150">
                <Check size={12} />
                <span>Link copied to clipboard ready to paste</span>
              </p>
            )}
          </div>

          {/* Quick Share Targets */}
          <div className="space-y-2 pt-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block">
              Quick Share Options
            </label>

            <div className="grid grid-cols-4 gap-2">
              {/* WhatsApp */}
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] hover:border-emerald-500/40 text-center transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-1.5 group-hover:scale-105 group-hover:bg-emerald-500/25 transition-all">
                  <MessageCircle size={18} />
                </div>
                <span className="text-[11px] text-white/80 group-hover:text-white font-medium">
                  WhatsApp
                </span>
              </button>

              {/* X / Twitter */}
              <button
                type="button"
                onClick={handleShareTwitter}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] hover:border-white/30 text-center transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center mb-1.5 group-hover:scale-105 group-hover:bg-white/20 transition-all font-bold text-sm">
                  𝕏
                </div>
                <span className="text-[11px] text-white/80 group-hover:text-white font-medium">
                  Post on 𝕏
                </span>
              </button>

              {/* Telegram */}
              <button
                type="button"
                onClick={handleShareTelegram}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] hover:border-sky-500/40 text-center transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-sky-500/15 text-sky-400 flex items-center justify-center mb-1.5 group-hover:scale-105 group-hover:bg-sky-500/25 transition-all">
                  <Send size={18} />
                </div>
                <span className="text-[11px] text-white/80 group-hover:text-white font-medium">
                  Telegram
                </span>
              </button>

              {/* QR Code */}
              <button
                type="button"
                onClick={() => setShowQr((prev) => !prev)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all group cursor-pointer ${
                  showQr
                    ? 'bg-gold/15 border-gold/50 text-gold'
                    : 'bg-[#121214] hover:bg-[#18181c] border-white/[0.04] hover:border-gold/40'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-1.5 group-hover:scale-105 transition-all ${
                    showQr
                      ? 'bg-gold text-ink'
                      : 'bg-gold/15 text-gold group-hover:bg-gold/25'
                  }`}
                >
                  <QrCode size={18} />
                </div>
                <span className="text-[11px] text-white/80 group-hover:text-white font-medium">
                  {showQr ? 'Hide QR' : 'QR Code'}
                </span>
              </button>
            </div>
          </div>

          {/* QR Code Expandable Card */}
          {showQr && (
            <div className="p-4 rounded-2xl bg-[#121214] border border-gold/30 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-150">
              <div className="p-3 bg-[#141416] rounded-2xl border border-white/10 shadow-lg mb-3">
                <img
                  src={qrImageUrl}
                  alt="Profile QR Code"
                  className="w-48 h-48 rounded-xl object-contain"
                />
              </div>
              <p className="text-xs font-semibold text-white">
                Scan with any mobile camera
              </p>
              <p className="text-[11px] text-muted mt-0.5 mb-3">
                Instantly opens @{username}&apos;s profile on Velour
              </p>
              <a
                href={qrImageUrl}
                target="_blank"
                rel="noreferrer"
                download={`velour-${username}-qr.png`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors"
              >
                <Download size={13} />
                <span>Open / Save QR Image</span>
              </a>
            </div>
          )}

          {/* System Native Share Button (if supported) */}
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full py-2.5 rounded-2xl bg-[#121214] hover:bg-[#18181c] border border-white/[0.04] hover:border-white/15 text-white/80 hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Share2 size={14} className="text-purple-400" />
              <span>More Sharing Options (AirDrop, Messages, etc.)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
