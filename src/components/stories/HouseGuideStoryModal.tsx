import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Sparkles,
  Camera,
  Lock,
  MessageSquare,
  ShieldCheck,
  ArrowRight,
  Flame,
  Coins,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import { useBackHandler } from '../../lib/backButtonRegistry';

interface HouseGuideStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExploreMore?: () => void;
}

interface GuideSlide {
  tag: string;
  title: string;
  subtitle: string;
  badgeIcon: React.ElementType;
  badgeLabel: string;
  image: string;
  points: { icon: React.ElementType; title: string; desc: string }[];
}

const GUIDE_SLIDES: GuideSlide[] = [
  {
    tag: 'VELOUR GUIDE · 01',
    title: 'Live Moments & Stories',
    subtitle: 'Raw, unscripted 24-hour glimpses into creators’ private lives.',
    badgeIcon: Camera,
    badgeLabel: 'Live Ephemeral Feeds',
    image: '/images/1.jpeg',
    points: [
      {
        icon: Camera,
        title: '24-Hour Ephemeral Stories',
        desc: 'Experience candid photos, video drops, and daily intimate updates that disappear.',
      },
      {
        icon: Flame,
        title: 'Private Whispers & Reactions',
        desc: 'Send discreet heart reactions and whispered replies directly into their chat.',
      },
      {
        icon: MessageSquare,
        title: 'Instant 1-on-1 Reply',
        desc: 'Swipe up or tap the reply box to start an exclusive private conversation.',
      },
    ],
  },
  {
    tag: 'VELOUR GUIDE · 02',
    title: 'Locked Vaults & Drops',
    subtitle: 'Unlock premium high-resolution photosets, cinematic films, and audio secrets.',
    badgeIcon: Lock,
    badgeLabel: 'Exclusive Pay-to-Unlock',
    image: '/images/2.jpeg',
    points: [
      {
        icon: Lock,
        title: 'One-Tap Coin Unlock',
        desc: 'Use Velour Coins to instantly unlock locked photos, albums, and uncensored clips.',
      },
      {
        icon: Sparkles,
        title: 'Permanent Private Vault',
        desc: 'Every unlocked drop is saved permanently to your personal library to enjoy anytime.',
      },
      {
        icon: Flame,
        title: 'Ultra High Definition',
        desc: 'Experience uncompressed fine-art resolution and crystal-clear cinematic audio.',
      },
    ],
  },
  {
    tag: 'VELOUR GUIDE · 03',
    title: 'Private VIP Direct Access',
    subtitle: 'Enter a creator’s private sanctuary for direct, unmoderated conversations.',
    badgeIcon: MessageSquare,
    badgeLabel: 'Direct VIP Chat',
    image: '/images/3.jpeg',
    points: [
      {
        icon: MessageSquare,
        title: 'Confidential Messaging',
        desc: 'Connect one-on-one with verified creators with full discretion and encryption.',
      },
      {
        icon: Coins,
        title: 'Generous Tipping & Gifts',
        desc: 'Stand out from the crowd by sending custom gifts and tips with your messages.',
      },
      {
        icon: Flame,
        title: 'Bespoke Custom Requests',
        desc: 'Ask for personalized photo, video, or audio dedications made uniquely for you.',
      },
    ],
  },
  {
    tag: 'VELOUR GUIDE · 04',
    title: 'Absolute Discretion & Safety',
    subtitle: 'Your identity and transactions are 100% private. Pleasure on your terms.',
    badgeIcon: ShieldCheck,
    badgeLabel: 'Discreet Banking',
    image: '/images/1.jpeg',
    points: [
      {
        icon: ShieldCheck,
        title: 'Discreet Bank Billing',
        desc: 'Credit card and bank statements show generic discreet corporate descriptors.',
      },
      {
        icon: Lock,
        title: 'Zero Real-Name Exposure',
        desc: 'Your real email, legal name, and phone are never disclosed to creators or members.',
      },
      {
        icon: Coins,
        title: 'Instant Safe Coin Wallet',
        desc: 'Top up your Velour wallet effortlessly with Apple Pay, Google Pay, or Card.',
      },
    ],
  },
];

const SLIDE_DURATION_MS = 6500;

export default function HouseGuideStoryModal({
  isOpen,
  onClose,
  onExploreMore,
}: HouseGuideStoryModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const elapsedBeforePauseRef = useRef<number>(0);

  // Android hardware back button handler
  useBackHandler(() => {
    onClose();
    return true;
  }, isOpen, 110);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
      setProgress(0);
      setIsPaused(false);
      elapsedBeforePauseRef.current = 0;
      startTimeRef.current = Date.now();
      triggerHaptic('light');
    }
  }, [isOpen]);

  const handleNextSlide = useCallback(() => {
    triggerHaptic('light');
    if (currentSlide < GUIDE_SLIDES.length - 1) {
      setCurrentSlide((prev) => prev + 1);
      setProgress(0);
      elapsedBeforePauseRef.current = 0;
      startTimeRef.current = Date.now();
    } else {
      // Completed last slide
      onClose();
      if (onExploreMore) onExploreMore();
    }
  }, [currentSlide, onClose, onExploreMore]);

  const handlePrevSlide = useCallback(() => {
    triggerHaptic('light');
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
      setProgress(0);
      elapsedBeforePauseRef.current = 0;
      startTimeRef.current = Date.now();
    } else {
      setProgress(0);
      elapsedBeforePauseRef.current = 0;
      startTimeRef.current = Date.now();
    }
  }, [currentSlide]);

  // Main timer loop for slide auto-advance
  useEffect(() => {
    if (!isOpen || isPaused) return;

    startTimeRef.current = Date.now() - elapsedBeforePauseRef.current;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / SLIDE_DURATION_MS) * 100);
      setProgress(pct);

      if (elapsed >= SLIDE_DURATION_MS) {
        clearInterval(interval);
        handleNextSlide();
      }
    }, 40);

    timerRef.current = interval;
    return () => clearInterval(interval);
  }, [isOpen, isPaused, currentSlide, handleNextSlide]);

  const handlePointerDown = () => {
    setIsPaused(true);
    elapsedBeforePauseRef.current = Date.now() - startTimeRef.current;
  };

  const handlePointerUp = () => {
    setIsPaused(false);
  };

  const handleTapZone = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    // Left 30% taps go backwards, right 70% go forward
    if (clickX < width * 0.3) {
      handlePrevSlide();
    } else {
      handleNextSlide();
    }
  };

  if (!isOpen) return null;

  const slide = GUIDE_SLIDES[currentSlide];
  const BadgeIcon = slide.badgeIcon;
  const isFinalSlide = currentSlide === GUIDE_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[120] bg-black flex items-center justify-center select-none overflow-hidden animate-in fade-in duration-300">
      {/* Background Frame (Desktop constrained column, Mobile full bleed) */}
      <div className="relative w-full h-full md:max-w-[440px] md:h-[92vh] md:rounded-3xl overflow-hidden shadow-2xl bg-[#070707] flex flex-col justify-between">
        {/* Background Visual with Editorial Imagery & Luxury Velvet Vignette */}
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={slide.image}
            alt="Velour Guide"
            className="w-full h-full object-cover transition-opacity duration-700 brightness-[0.38] scale-105"
          />
          {/* Deep Velvet Gradient Masks */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070707] via-[#070707]/75 to-black/80" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(201,169,110,0.18)_0%,rgba(136,19,55,0.18)_50%,transparent_80%)]" />
        </div>

        {/* ── TOP BAR: Progress Bars, Official Avatar, Controls ────────────── */}
        <div className="relative z-30 p-4 sm:p-5 pt-3 space-y-3">
          {/* Segmented Progress Bars */}
          <div className="flex items-center gap-1.5 w-full">
            {GUIDE_SLIDES.map((_, idx) => {
              let fillWidth = '0%';
              if (idx < currentSlide) fillWidth = '100%';
              else if (idx === currentSlide) fillWidth = `${progress}%`;

              return (
                <div
                  key={idx}
                  className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm"
                >
                  <div
                    className="h-full bg-gradient-to-r from-[#faeed7] to-[#c9a96e] rounded-full transition-all duration-75"
                    style={{ width: fillWidth }}
                  />
                </div>
              );
            })}
          </div>

          {/* Official Creator Header Pill */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* Monogram Crest Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2a2415] to-[#070707] border border-gold/60 flex items-center justify-center font-serif text-gold font-bold text-base shadow-[0_0_15px_rgba(201,169,110,0.3)]">
                V
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-serif text-sm font-medium text-paper tracking-wide">
                    Velour House
                  </p>
                  <span className="bg-gold/20 text-gold text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.2 rounded-full border border-gold/40">
                    Official
                  </span>
                </div>
                <p className="text-[11px] text-gold/80 tracking-widest uppercase font-mono">
                  {slide.tag}
                </p>
              </div>
            </div>

            {/* Top Action Buttons (Mute + Close) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMuted((prev) => !prev)}
                className="w-8 h-8 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-paper/80 hover:text-white transition-colors cursor-pointer"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-paper/80 hover:text-white transition-colors cursor-pointer"
                title="Close Guide"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── TAP ZONES (Invisible Left / Right Navigation) ───────────────── */}
        <div
          className="absolute inset-0 z-20 cursor-pointer"
          onMouseDown={handlePointerDown}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchEnd={handlePointerUp}
          onClick={handleTapZone}
        />

        {/* ── CENTER EDITORIAL CONTENT ────────────────────────────────────── */}
        <div className="relative z-30 px-6 sm:px-8 py-4 my-auto pointer-events-none">
          {/* Category Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs font-medium mb-3 shadow-[0_0_20px_rgba(201,169,110,0.2)]">
            <BadgeIcon size={13} />
            <span>{slide.badgeLabel}</span>
          </div>

          {/* Headline */}
          <h2 className="font-serif text-3xl sm:text-4xl font-light text-paper tracking-wide leading-tight mb-2 drop-shadow-md">
            {slide.title}
          </h2>
          <p className="text-muted text-xs sm:text-sm leading-relaxed mb-6 max-w-sm">
            {slide.subtitle}
          </p>

          {/* Three Feature Highlights with Gold Accents */}
          <div className="space-y-3 bg-[#0e0d0c]/70 border border-white/[0.08] backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl">
            {slide.points.map((pt, pIdx) => {
              const PtIcon = pt.icon;
              return (
                <div key={pIdx} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gold/15 border border-gold/30 text-gold flex items-center justify-center shrink-0 mt-0.5">
                    <PtIcon size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-paper/95 leading-tight">
                      {pt.title}
                    </p>
                    <p className="text-[11px] text-muted leading-snug mt-0.5">
                      {pt.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── BOTTOM ACTIONS: Next / Enter Button ─────────────────────────── */}
        <div className="relative z-30 p-5 pb-7 sm:pb-6 bg-gradient-to-t from-black via-black/80 to-transparent">
          {isFinalSlide ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onExploreMore) onExploreMore();
              }}
              className="w-full py-4 px-6 rounded-full bg-gradient-to-r from-[#faeed7] via-[#c9a96e] to-[#9e7638] text-ink font-semibold text-xs tracking-widest uppercase shadow-[0_4px_30px_rgba(201,169,110,0.35)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Enter the House of Desire</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handlePrevSlide}
                disabled={currentSlide === 0}
                className="text-xs text-muted hover:text-paper uppercase tracking-wider transition-colors disabled:opacity-0 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={handleNextSlide}
                className="py-2.5 px-5 rounded-full bg-gold/20 hover:bg-gold/30 border border-gold/40 text-gold text-xs font-medium uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
